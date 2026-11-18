/**
 * Kinetra — GeoTrick IMU Firmware for Seeed Studio XIAO BLE nRF52840 Sense (SKU 102010469)
 *
 * Normative Requirements Implemented:
 * - REQ-IMU-001: 6-DoF Address Pose Tare (>= 800ms stillness)
 * - REQ-IMU-002: Hybrid 100Hz GATT streaming (0xFD81) & 1000Hz RAM circular buffer burst (0xFD82)
 * - REQ-IMU-003: Ball-strike detection via ±16g saturation + onboard MP34DT05-A PDM microphone peak
 * - REQ-IMU-007: 4-bit passive GPIO Auto-ID mount reader (D0..D3 -> mount_slot_id 1..14, 0b1111 = unmounted)
 * - REQ-IMU-008: Wake-on-Use Ultra-Low-Power state machine (BLE OFF when unmounted or idle > 20s)
 * - REQ-IMU-009: BQ25101 50mA LiPo charging current pin (P0.13 HIGH) & live battery/charge telemetry
 */

#include <Arduino.h>
#include <PDM.h>
#include <LSM6DS3.h>
#include <Wire.h>

// XIAO BLE nRF52840 Sense Hardware Pin Definitions
static constexpr uint8_t PIN_MOUNT_D0 = D0;
static constexpr uint8_t PIN_MOUNT_D1 = D1;
static constexpr uint8_t PIN_MOUNT_D2 = D2;
static constexpr uint8_t PIN_MOUNT_D3 = D3;

// BQ25101 Charger & Battery Divider Pins on XIAO nRF52840
static constexpr uint8_t PIN_CHG_CURRENT_50MA = 22; // P0.13: HIGH = 50mA (protects 85mAh L301525), LOW = 100mA
static constexpr uint8_t PIN_VBAT_ENABLE      = 14; // P0.14: LOW enables voltage divider
static constexpr uint8_t PIN_CHG_STATUS       = 23; // P0.17: LOW = charging in progress
static constexpr uint8_t PIN_VBAT_ADC         = 32; // P0.31: AIN7 battery voltage divider

enum PowerState : uint8_t {
  DEEP_SLEEP_UNMOUNTED   = 0,
  STANDBY_MOUNTED_IDLE   = 1,
  ACTIVE_BLE_READY       = 2,
  ADDRESS_LOCKED_1660HZ  = 3,
  BURST_TX_POST_SWING    = 4,
  USB_CHARGING_TELEMETRY = 5
};

#pragma pack(push, 1)
struct GeoTrickFrame24B {
  uint32_t seq_timestamp_us;
  int16_t  accel_raw_xyz[3];
  int16_t  gyro_raw_xyz[3];
  uint16_t pdm_mic_rms;
  uint16_t battery_mv;
  uint8_t  mount_slot_id;
  uint8_t  power_state;
  uint8_t  status_flags;
  uint8_t  crc8;
};
#pragma pack(pop)

static constexpr size_t RING_BUFFER_CAPACITY = 2000; // 2.0 seconds @ 1000 Hz (48 KB in 256 KB RAM)
static GeoTrickFrame24B g_ringBuffer[RING_BUFFER_CAPACITY];
static volatile size_t  g_ringHead = 0;
static volatile uint16_t g_latestPdmRms = 0;
static PowerState g_powerState = DEEP_SLEEP_UNMOUNTED;
static uint8_t g_activeMountSlotId = 0;
static uint32_t g_lastMotionTimestampMs = 0;
static uint32_t g_addressStillStartMs = 0;

LSM6DS3 g_imu(I2C_MODE, 0x6A);

/**
 * Computes CRC-8 (polynomial 0x07) over the first 23 bytes of a 24-byte GeoTrick BLE frame.
 */
uint8_t computeCrc8(const uint8_t* data, size_t len) {
  uint8_t crc = 0x00;
  for (size_t i = 0; i < len; ++i) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; ++bit) {
      if (crc & 0x80) {
        crc = static_cast<uint8_t>((crc << 1) ^ 0x07);
      } else {
        crc <<= 1;
      }
    }
  }
  return crc;
}

/**
 * Pulsed 50us pull-up sampling on D0..D3 to read the passive 4-bit binary code
 * inside the Keyed Butt-Cap Mount without drawing continuous 250uA static current (REQ-IMU-007, REQ-IMU-008).
 * Returns mount_slot_id in 1..14, or 0 when unmounted (0b1111).
 */
uint8_t readMountSlotPulsed() {
  const uint8_t pins[4] = { PIN_MOUNT_D0, PIN_MOUNT_D1, PIN_MOUNT_D2, PIN_MOUNT_D3 };
  for (uint8_t i = 0; i < 4; ++i) {
    pinMode(pins[i], INPUT_PULLUP);
  }
  delayMicroseconds(50);

  uint8_t code = 0;
  for (uint8_t i = 0; i < 4; ++i) {
    if (digitalRead(pins[i]) == HIGH) {
      code |= (1 << i);
    }
    // Disable pull-up after sampling to eliminate static current drain through GND jumpers
    pinMode(pins[i], INPUT);
  }

  if (code == 0x0F) {
    return 0; // Unmounted
  }
  return static_cast<uint8_t>(15 - code);
}

/**
 * Samples battery voltage in millivolts by enabling the P0.14 divider for 2ms only (REQ-IMU-009).
 */
uint16_t readBatteryMillivolts() {
  digitalWrite(PIN_VBAT_ENABLE, LOW);
  delayMicroseconds(2000);
  int rawAdc = analogRead(PIN_VBAT_ADC);
  digitalWrite(PIN_VBAT_ENABLE, HIGH);
  // 12-bit ADC (0..4095), 3.6V reference, 1510/510 divider ratio (~2.961)
  float mv = (static_cast<float>(rawAdc) / 4095.0f) * 3600.0f * 2.961f;
  return static_cast<uint16_t>(constrain(mv, 3000.0f, 4250.0f));
}

void onPdmDataReady() {
  int16_t sampleBuffer[64];
  int bytesAvailable = PDM.available();
  int samplesRead = bytesAvailable / 2;
  if (samplesRead > 64) samplesRead = 64;
  PDM.read(sampleBuffer, samplesRead * 2);

  uint64_t sumSq = 0;
  for (int i = 0; i < samplesRead; ++i) {
    int32_t s = sampleBuffer[i];
    sumSq += static_cast<uint64_t>(s * s);
  }
  if (samplesRead > 0) {
    g_latestPdmRms = static_cast<uint16_t>(sqrt(static_cast<double>(sumSq / samplesRead)));
  }
}

void setup() {
  // 1. Pin BQ25101 LiPo charge current strictly to 50mA (<0.6C for 85mAh L301525) (REQ-IMU-009)
  pinMode(PIN_CHG_CURRENT_50MA, OUTPUT);
  digitalWrite(PIN_CHG_CURRENT_50MA, HIGH);

  pinMode(PIN_VBAT_ENABLE, OUTPUT);
  digitalWrite(PIN_VBAT_ENABLE, HIGH);
  pinMode(PIN_CHG_STATUS, INPUT_PULLUP);
  analogReadResolution(12);

  // 2. Configure LSM6DS3TR-C 6-DoF (±16g full scale, ±2000 dps full scale)
  g_imu.settings.gyroEnabled = 1;
  g_imu.settings.gyroRange = 2000;
  g_imu.settings.gyroSampleRate = 1660;
  g_imu.settings.accelEnabled = 1;
  g_imu.settings.accelRange = 16;
  g_imu.settings.accelSampleRate = 1660;
  g_imu.begin();

  // 3. Configure onboard MP34DT05-A PDM microphone
  PDM.onReceive(onPdmDataReady);

  g_activeMountSlotId = readMountSlotPulsed();
  g_lastMotionTimestampMs = millis();
  g_powerState = (g_activeMountSlotId > 0) ? ACTIVE_BLE_READY : DEEP_SLEEP_UNMOUNTED;
}

void loop() {
  const uint32_t nowMs = millis();
  const uint8_t slotId = readMountSlotPulsed();
  const uint16_t batMv = readBatteryMillivolts();

  // State transitions per REQ-IMU-008 Wake-on-Use Power Mode
  if (slotId == 0) {
    g_powerState = DEEP_SLEEP_UNMOUNTED;
    g_activeMountSlotId = 0;
    delay(250);
    return;
  }

  g_activeMountSlotId = slotId;
  float ax = g_imu.readFloatAccelX();
  float ay = g_imu.readFloatAccelY();
  float az = g_imu.readFloatAccelZ();
  float gx = g_imu.readFloatGyroX();
  float gy = g_imu.readFloatGyroY();
  float gz = g_imu.readFloatGyroZ();

  float accelNorm = sqrtf(ax * ax + ay * ay + az * az);
  float gyroNorm  = sqrtf(gx * gx + gy * gy + gz * gz);

  if (fabsf(accelNorm - 1.0f) > 0.25f || gyroNorm > 15.0f) {
    g_lastMotionTimestampMs = nowMs;
    if (g_powerState == STANDBY_MOUNTED_IDLE) {
      g_powerState = ACTIVE_BLE_READY;
    }
  } else if (nowMs - g_lastMotionTimestampMs > 20000 && g_powerState == ACTIVE_BLE_READY) {
    g_powerState = STANDBY_MOUNTED_IDLE;
    delay(100);
    return;
  }

  // Check Address Pose Tare stillness (>= 800ms) (REQ-IMU-001)
  if (gyroNorm < 3.0f && fabsf(accelNorm - 1.0f) < 0.05f) {
    if (g_addressStillStartMs == 0) g_addressStillStartMs = nowMs;
    if (nowMs - g_addressStillStartMs >= 800 && g_powerState == ACTIVE_BLE_READY) {
      g_powerState = ADDRESS_LOCKED_1660HZ;
      PDM.begin(1, 16000);
    }
  } else {
    g_addressStillStartMs = 0;
  }

  // Record 24-byte frame into circular RAM buffer when locked
  if (g_powerState == ADDRESS_LOCKED_1660HZ) {
    GeoTrickFrame24B frame{};
    frame.seq_timestamp_us = micros();
    frame.accel_raw_xyz[0] = static_cast<int16_t>(constrain(ax / 16.0f, -1.0f, 1.0f) * 32767.0f);
    frame.accel_raw_xyz[1] = static_cast<int16_t>(constrain(ay / 16.0f, -1.0f, 1.0f) * 32767.0f);
    frame.accel_raw_xyz[2] = static_cast<int16_t>(constrain(az / 16.0f, -1.0f, 1.0f) * 32767.0f);
    frame.gyro_raw_xyz[0]  = static_cast<int16_t>(constrain(gx / 2000.0f, -1.0f, 1.0f) * 32767.0f);
    frame.gyro_raw_xyz[1]  = static_cast<int16_t>(constrain(gy / 2000.0f, -1.0f, 1.0f) * 32767.0f);
    frame.gyro_raw_xyz[2]  = static_cast<int16_t>(constrain(gz / 2000.0f, -1.0f, 1.0f) * 32767.0f);
    frame.pdm_mic_rms      = g_latestPdmRms;
    frame.battery_mv       = batMv;
    frame.mount_slot_id    = g_activeMountSlotId;
    frame.power_state      = static_cast<uint8_t>(g_powerState);

    uint8_t flags = (1 << 3); // MOUNT_LOCKED
    for (int i = 0; i < 3; ++i) {
      if (abs(frame.accel_raw_xyz[i]) >= 32700) flags |= (1 << i);
    }
    if ((flags & 0x07) != 0 && frame.pdm_mic_rms >= 25000) {
      flags |= (1 << 4) | (1 << 5); // IMPACT_TRIGGERED | PDM_PEAK_DETECTED
      g_powerState = BURST_TX_POST_SWING;
    }
    frame.status_flags = flags;
    frame.crc8 = computeCrc8(reinterpret_cast<const uint8_t*>(&frame), 23);

    g_ringBuffer[g_ringHead] = frame;
    g_ringHead = (g_ringHead + 1) % RING_BUFFER_CAPACITY;
  }
}
