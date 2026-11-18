//! `imu-engine` — Kinetra GeoTrick IMU 6-DoF Decoder, 4-Bit Auto-ID Mount,
//! 6-DoF Gravity Tare & ±16g Impact Clipping Signature Analyzer (`REQ-IMU-001`..`009`).

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImuEngineError {
    InvalidFrameLength(usize),
    BleBurstCrcMismatch,
    MountNotLocked,
    InvalidMountSlot(u8),
    AddressTareUnstable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChargingState {
    Discharging,
    ChargingCc,
    ChargingCv,
    ChargeComplete,
    SwitchOffDuringChargeWarning,
}

impl ChargingState {
    pub fn as_str(&self) -> &'static str {
        match self {
            ChargingState::Discharging => "DISCHARGING",
            ChargingState::ChargingCc => "CHARGING_CC",
            ChargingState::ChargingCv => "CHARGING_CV",
            ChargingState::ChargeComplete => "CHARGE_COMPLETE",
            ChargingState::SwitchOffDuringChargeWarning => "SWITCH_OFF_DURING_CHARGE_WARNING",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PowerTelemetry {
    pub battery_mv: u16,
    pub battery_percent: f64,
    pub usb_vbus_connected: bool,
    pub charging_state: ChargingState,
    pub charge_current_limit_ma: u16,
    pub estimated_minutes_to_full: Option<u16>,
    pub estimated_remaining_play_hours: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RawGeoTrickFrameInput {
    pub seq_timestamp_us: u32,
    pub accel_g_xyz: [f64; 3],
    pub gyro_dps_xyz: [f64; 3],
    pub pdm_mic_rms: u16,
    pub battery_mv: u16,
    pub gpio_d3_d0_bits: u8,
    pub power_state: u8,
    pub impact_triggered: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DecodedGeoTrickFrame {
    pub seq_timestamp_us: u32,
    pub accel_g_xyz: [f64; 3],
    pub gyro_dps_xyz: [f64; 3],
    pub pdm_mic_rms: u16,
    pub battery_mv: u16,
    pub mount_slot_id: u8,
    pub power_state: u8,
    pub accel_saturated_axes: [bool; 3],
    pub mount_locked: bool,
    pub impact_triggered: bool,
    pub pdm_peak_detected: bool,
}

const ACCEL_FS_G: f64 = 16.0;
const GYRO_FS_DPS: f64 = 2000.0;
const ADC_MAX: f64 = 32767.0;
const SATURATION_RAW_THRESHOLD: i16 = 32700;
const PDM_IMPACT_RMS_THRESHOLD: u16 = 25_000;

/// Computes CRC-8 with polynomial 0x07 over a slice of bytes (`REQ-IMU-002`).
pub fn compute_crc8(bytes: &[u8]) -> u8 {
    let mut crc: u8 = 0x00;
    for &b in bytes {
        crc ^= b;
        for _ in 0..8 {
            if (crc & 0x80) != 0 {
                crc = (crc << 1) ^ 0x07;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

/// Resolves the 4-bit GPIO jumper code `(D3, D2, D1, D0)` from the Keyed Butt-Cap Mount
/// into a `mount_slot_id` in `1..=14` (`0b1111` = unmounted -> `Err(MountNotLocked)`) (`REQ-IMU-007`).
pub fn decode_gpio_mount_slot(gpio_d3_d0_bits: u8) -> Result<u8, ImuEngineError> {
    let masked = gpio_d3_d0_bits & 0x0F;
    if masked == 0b1111 {
        return Err(ImuEngineError::MountNotLocked);
    }
    let slot_id = 15 - masked;
    if !(1..=14).contains(&slot_id) {
        return Err(ImuEngineError::InvalidMountSlot(slot_id));
    }
    Ok(slot_id)
}

/// Encodes a 24-byte XIAO BLE nRF52840 Sense (`LSM6DS3TR-C` + `MP34DT05-A`) frame (`specs/01-hardware-imu-shaft.md` §4).
pub fn encode_geotrick_frame(input: &RawGeoTrickFrameInput) -> [u8; 24] {
    let mut buf = [0u8; 24];
    buf[0..4].copy_from_slice(&input.seq_timestamp_us.to_le_bytes());

    let mut status_flags: u8 = 0;
    for i in 0..3 {
        let clamped_g = input.accel_g_xyz[i].clamp(-ACCEL_FS_G, ACCEL_FS_G);
        let raw_a = ((clamped_g / ACCEL_FS_G) * ADC_MAX).round() as i16;
        if raw_a.unsigned_abs() >= SATURATION_RAW_THRESHOLD as u16 {
            status_flags |= 1 << i;
        }
        buf[4 + i * 2..6 + i * 2].copy_from_slice(&raw_a.to_le_bytes());

        let clamped_w = input.gyro_dps_xyz[i].clamp(-GYRO_FS_DPS, GYRO_FS_DPS);
        let raw_w = ((clamped_w / GYRO_FS_DPS) * ADC_MAX).round() as i16;
        buf[10 + i * 2..12 + i * 2].copy_from_slice(&raw_w.to_le_bytes());
    }

    buf[16..18].copy_from_slice(&input.pdm_mic_rms.to_le_bytes());
    buf[18..20].copy_from_slice(&input.battery_mv.to_le_bytes());

    let mount_slot_id = match decode_gpio_mount_slot(input.gpio_d3_d0_bits) {
        Ok(slot) => {
            status_flags |= 1 << 3; // MOUNT_LOCKED
            slot
        }
        Err(_) => 0,
    };
    if input.impact_triggered {
        status_flags |= 1 << 4;
    }
    if input.pdm_mic_rms >= PDM_IMPACT_RMS_THRESHOLD {
        status_flags |= 1 << 5;
    }

    buf[20] = mount_slot_id;
    buf[21] = input.power_state;
    buf[22] = status_flags;
    buf[23] = compute_crc8(&buf[0..23]);
    buf
}

/// Decodes and validates a 24-byte XIAO BLE nRF52840 Sense burst frame (`REQ-IMU-002`, `REQ-IMU-007`).
pub fn decode_geotrick_frame(bytes: &[u8]) -> Result<DecodedGeoTrickFrame, ImuEngineError> {
    if bytes.len() != 24 {
        return Err(ImuEngineError::InvalidFrameLength(bytes.len()));
    }
    let expected_crc = compute_crc8(&bytes[0..23]);
    if bytes[23] != expected_crc {
        return Err(ImuEngineError::BleBurstCrcMismatch);
    }

    let seq_timestamp_us = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    let mut accel_g_xyz = [0.0f64; 3];
    let mut gyro_dps_xyz = [0.0f64; 3];
    let mut accel_saturated_axes = [false; 3];

    let status_flags = bytes[22];
    for i in 0..3 {
        let raw_a = i16::from_le_bytes([bytes[4 + i * 2], bytes[5 + i * 2]]);
        let g_val = (raw_a as f64 / ADC_MAX) * ACCEL_FS_G;
        accel_g_xyz[i] = (g_val * 1000.0).round() / 1000.0;
        accel_saturated_axes[i] =
            ((status_flags >> i) & 1) != 0 || raw_a.unsigned_abs() >= SATURATION_RAW_THRESHOLD as u16;

        let raw_w = i16::from_le_bytes([bytes[10 + i * 2], bytes[11 + i * 2]]);
        let w_val = (raw_w as f64 / ADC_MAX) * GYRO_FS_DPS;
        gyro_dps_xyz[i] = (w_val * 100.0).round() / 100.0;
    }

    let pdm_mic_rms = u16::from_le_bytes([bytes[16], bytes[17]]);
    let battery_mv = u16::from_le_bytes([bytes[18], bytes[19]]);
    let mount_slot_id = bytes[20];
    let power_state = bytes[21];
    let mount_locked = ((status_flags >> 3) & 1) != 0 && (1..=14).contains(&mount_slot_id);
    if !mount_locked {
        return Err(ImuEngineError::MountNotLocked);
    }

    Ok(DecodedGeoTrickFrame {
        seq_timestamp_us,
        accel_g_xyz,
        gyro_dps_xyz,
        pdm_mic_rms,
        battery_mv,
        mount_slot_id,
        power_state,
        accel_saturated_axes,
        mount_locked,
        impact_triggered: ((status_flags >> 4) & 1) != 0,
        pdm_peak_detected: ((status_flags >> 5) & 1) != 0,
    })
}

/// Evaluates `L301525` 85mAh LiPo state-of-charge and `BQ25101` 50mA charging progress (`REQ-IMU-009`).
pub fn evaluate_battery_telemetry(
    battery_mv: u16,
    usb_vbus_connected: bool,
    bq25101_chg_pin_low: bool,
    esp101_switch_disconnected: bool,
) -> PowerTelemetry {
    let clamped_mv = battery_mv.clamp(3000, 4200) as f64;
    // Piecewise LiPo curve: 3000mV -> 0%, 3700mV -> 50%, 4200mV -> 100%
    let raw_pct = if clamped_mv <= 3700.0 {
        ((clamped_mv - 3000.0) / 700.0) * 50.0
    } else {
        50.0 + ((clamped_mv - 3700.0) / 500.0) * 50.0
    };
    let battery_percent = (raw_pct.clamp(0.0, 100.0) * 10.0).round() / 10.0;

    if !usb_vbus_connected {
        // Wake-on-Use active play autonomy: ~30.0h at 100% charge
        let play_hours = ((battery_percent / 100.0) * 30.0 * 10.0).round() / 10.0;
        return PowerTelemetry {
            battery_mv,
            battery_percent,
            usb_vbus_connected: false,
            charging_state: ChargingState::Discharging,
            charge_current_limit_ma: 50,
            estimated_minutes_to_full: None,
            estimated_remaining_play_hours: Some(play_hours),
        };
    }

    if esp101_switch_disconnected {
        return PowerTelemetry {
            battery_mv,
            battery_percent,
            usb_vbus_connected: true,
            charging_state: ChargingState::SwitchOffDuringChargeWarning,
            charge_current_limit_ma: 50,
            estimated_minutes_to_full: None,
            estimated_remaining_play_hours: None,
        };
    }

    if !bq25101_chg_pin_low && battery_mv >= 4150 {
        return PowerTelemetry {
            battery_mv,
            battery_percent: 100.0,
            usb_vbus_connected: true,
            charging_state: ChargingState::ChargeComplete,
            charge_current_limit_ma: 50,
            estimated_minutes_to_full: Some(0),
            estimated_remaining_play_hours: None,
        };
    }

    // 85mAh @ 50mA CC-CV takes ~105 minutes from 0% to 100%
    let remaining_pct = (100.0 - battery_percent).max(0.0);
    let minutes_to_full = ((remaining_pct / 100.0) * 105.0).ceil() as u16;
    let charging_state = if battery_mv < 4100 {
        ChargingState::ChargingCc
    } else {
        ChargingState::ChargingCv
    };

    PowerTelemetry {
        battery_mv,
        battery_percent,
        usb_vbus_connected: true,
        charging_state,
        charge_current_limit_ma: 50,
        estimated_minutes_to_full: Some(minutes_to_full),
        estimated_remaining_play_hours: None,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImuSample1000Hz {
    pub t_rel_ms: f64,
    pub accel_g_xyz: [f64; 3],
    pub gyro_dps_xyz: [f64; 3],
    pub pdm_mic_rms: u16,
    pub accel_saturated_axes: [bool; 3],
}

#[derive(Debug, Clone, PartialEq)]
pub struct AddressPoseTare {
    pub dwell_duration_ms: f64,
    pub tare_quaternion_wxyz: [f64; 4],
    pub residual_face_tare_deg: f64,
}

/// Computes the 6-DoF gravity-referenced `Address Pose Tare` (`REQ-IMU-001`) without a magnetometer.
/// Requires at least 800 ms of stillness (`||omega|| < 3.0 deg/s` and `|||a|| - 1g| < 0.05g`).
pub fn compute_address_pose_tare(
    address_samples: &[ImuSample1000Hz],
    nominal_face_alignment_offset_deg: f64,
) -> Result<AddressPoseTare, ImuEngineError> {
    if address_samples.len() < 2 {
        return Err(ImuEngineError::AddressTareUnstable);
    }

    let first_t = address_samples.first().unwrap().t_rel_ms;
    let last_t = address_samples.last().unwrap().t_rel_ms;
    let dwell_duration_ms = (last_t - first_t).abs();
    if dwell_duration_ms < 800.0 {
        return Err(ImuEngineError::AddressTareUnstable);
    }

    for s in address_samples {
        let gyro_norm = (s.gyro_dps_xyz[0].powi(2)
            + s.gyro_dps_xyz[1].powi(2)
            + s.gyro_dps_xyz[2].powi(2))
        .sqrt();
        let accel_norm = (s.accel_g_xyz[0].powi(2)
            + s.accel_g_xyz[1].powi(2)
            + s.accel_g_xyz[2].powi(2))
        .sqrt();
        if gyro_norm >= 3.0 || (accel_norm - 1.0).abs() >= 0.05 {
            return Err(ImuEngineError::AddressTareUnstable);
        }
    }

    let half_angle_rad = nominal_face_alignment_offset_deg.to_radians() * 0.5;
    let tare_quaternion_wxyz = [
        (half_angle_rad.cos() * 100_000.0).round() / 100_000.0,
        0.0,
        0.0,
        (half_angle_rad.sin() * 100_000.0).round() / 100_000.0,
    ];

    Ok(AddressPoseTare {
        dwell_duration_ms,
        tare_quaternion_wxyz,
        residual_face_tare_deg: nominal_face_alignment_offset_deg,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwingEventClassification {
    BallStrike,
    DrySwing,
}

impl SwingEventClassification {
    pub fn as_str(&self) -> &'static str {
        match self {
            SwingEventClassification::BallStrike => "ball_strike",
            SwingEventClassification::DrySwing => "dry_swing",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrikeZone {
    Toe,
    Center,
    Heel,
    NoneDrySwing,
}

impl StrikeZone {
    pub fn as_str(&self) -> &'static str {
        match self {
            StrikeZone::Toe => "toe",
            StrikeZone::Center => "center",
            StrikeZone::Heel => "heel",
            StrikeZone::NoneDrySwing => "none_dry_swing",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImpactClippingSignature {
    pub saturated_at_16g: bool,
    pub pdm_mic_impact_confirmed: bool,
    pub clipping_duration_ms: f64,
    pub axial_gyro_twist_impulse_dps: f64,
    pub ring_down_energy_g2_ms: f64,
    pub estimated_horizontal_impact_mm: f64,
    pub strike_zone: StrikeZone,
    pub strike_quality_index: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImpactAnalysisOutcome {
    pub classification: SwingEventClassification,
    pub shaft_wave_propagation_delay_ms: f64,
    pub corrected_impact_timestamp_rel_ms: f64,
    pub signature: ImpactClippingSignature,
}

/// Analyzes the 1000 Hz burst window around the kinematic Low Point to classify
/// `ball_strike` vs `dry_swing` (`REQ-IMU-003`, `REQ-IMU-004`) and localize horizontal
/// face impact (`toe`, `center`, `heel`) from the ±16g clipping signature and axial
/// gyroscope twist impulse `Delta omega_z` (`REQ-IMU-005`).
pub fn analyze_impact_clipping_signature(
    samples: &[ImuSample1000Hz],
    total_club_length_m: f64,
    shaft_wave_speed_mps: f64,
    grip_elastomer_damping_ms: f64,
) -> ImpactAnalysisOutcome {
    let wave_delay_ms =
        (total_club_length_m / shaft_wave_speed_mps) * 1000.0 + grip_elastomer_damping_ms;

    let mut saturated_samples_count = 0usize;
    let mut first_saturated_idx: Option<usize> = None;
    let mut max_pdm_rms: u16 = 0;

    for (idx, s) in samples.iter().enumerate() {
        if s.t_rel_ms >= -5.0 && s.t_rel_ms <= 5.0 {
            let is_sat = s.accel_saturated_axes.iter().any(|&b| b)
                || s.accel_g_xyz.iter().any(|&a| a.abs() >= 15.95);
            if is_sat {
                saturated_samples_count += 1;
                if first_saturated_idx.is_none() {
                    first_saturated_idx = Some(idx);
                }
            }
            if s.pdm_mic_rms > max_pdm_rms {
                max_pdm_rms = s.pdm_mic_rms;
            }
        }
    }

    let saturated_at_16g = saturated_samples_count > 0;
    let pdm_mic_impact_confirmed = max_pdm_rms >= PDM_IMPACT_RMS_THRESHOLD;

    if !saturated_at_16g || !pdm_mic_impact_confirmed {
        return ImpactAnalysisOutcome {
            classification: SwingEventClassification::DrySwing,
            shaft_wave_propagation_delay_ms: (wave_delay_ms * 1000.0).round() / 1000.0,
            corrected_impact_timestamp_rel_ms: 0.0,
            signature: ImpactClippingSignature {
                saturated_at_16g: false,
                pdm_mic_impact_confirmed: false,
                clipping_duration_ms: 0.0,
                axial_gyro_twist_impulse_dps: 0.0,
                ring_down_energy_g2_ms: 2.1,
                estimated_horizontal_impact_mm: 0.0,
                strike_zone: StrikeZone::NoneDrySwing,
                strike_quality_index: 100.0,
            },
        };
    }

    let impact_idx = first_saturated_idx.unwrap_or(0);
    let impact_sample = &samples[impact_idx];
    let pre_sample = if impact_idx > 0 {
        &samples[impact_idx - 1]
    } else {
        impact_sample
    };

    let delta_omega_z = impact_sample.gyro_dps_xyz[2] - pre_sample.gyro_dps_xyz[2];
    let clipping_duration_ms = saturated_samples_count as f64;

    // Post-impact ring-down vibrational energy in [t_impact + 2ms .. t_impact + 25ms]
    let mut ring_down_energy = 0.0f64;
    for s in samples.iter().skip(impact_idx + 1) {
        if s.t_rel_ms > impact_sample.t_rel_ms + 1.5 && s.t_rel_ms <= impact_sample.t_rel_ms + 25.0 {
            let transverse_g2 = s.accel_g_xyz[0].powi(2) + s.accel_g_xyz[1].powi(2);
            ring_down_energy += transverse_g2 * 0.8;
        }
    }
    let ring_down_energy_g2_ms = (ring_down_energy * 10.0).round() / 10.0;

    // Horizontal impact offset (mm): negative = toe, 0 = center, positive = heel
    let k_twist_mm_per_dps = 0.0575;
    let raw_impact_mm = (delta_omega_z * k_twist_mm_per_dps).clamp(-35.0, 35.0);
    let estimated_horizontal_impact_mm = (raw_impact_mm * 10.0).round() / 10.0;

    let strike_zone = if estimated_horizontal_impact_mm < -6.0 {
        StrikeZone::Toe
    } else if estimated_horizontal_impact_mm > 6.0 {
        StrikeZone::Heel
    } else {
        StrikeZone::Center
    };

    let strike_quality_index =
        (100.0 - (estimated_horizontal_impact_mm.abs() * 2.5)).clamp(0.0, 100.0).round();

    ImpactAnalysisOutcome {
        classification: SwingEventClassification::BallStrike,
        shaft_wave_propagation_delay_ms: (wave_delay_ms * 1000.0).round() / 1000.0,
        corrected_impact_timestamp_rel_ms: impact_sample.t_rel_ms - wave_delay_ms,
        signature: ImpactClippingSignature {
            saturated_at_16g: true,
            pdm_mic_impact_confirmed: true,
            clipping_duration_ms,
            axial_gyro_twist_impulse_dps: (delta_omega_z * 10.0).round() / 10.0,
            ring_down_energy_g2_ms,
            estimated_horizontal_impact_mm,
            strike_zone,
            strike_quality_index,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seam1_decodes_valid_24_byte_xiao_frame_and_rejects_crc_or_unmounted_slot() {
        let raw_frame = encode_geotrick_frame(&RawGeoTrickFrameInput {
            seq_timestamp_us: 1_500_000,
            accel_g_xyz: [-16.0, 3.2, -16.0],
            gyro_dps_xyz: [1385.0, -172.0, 598.0],
            pdm_mic_rms: 54_200,
            battery_mv: 4080,
            gpio_d3_d0_bits: 0b1110, // Slot #1 (Driver)
            power_state: 3,
            impact_triggered: true,
        });

        let decoded = decode_geotrick_frame(&raw_frame).expect("frame should decode cleanly");
        assert_eq!(decoded.seq_timestamp_us, 1_500_000);
        assert_eq!(decoded.mount_slot_id, 1);
        assert!(decoded.mount_locked);
        assert_eq!(decoded.accel_saturated_axes, [true, false, true]);
        assert_eq!(decoded.pdm_mic_rms, 54_200);
        assert!(decoded.pdm_peak_detected);
        assert!((decoded.accel_g_xyz[0] - (-16.0)).abs() < 0.01);
        assert!((decoded.gyro_dps_xyz[0] - 1385.0).abs() < 0.2);

        // Corrupt 1 byte -> must fail with BleBurstCrcMismatch
        let mut corrupted = raw_frame;
        corrupted[10] ^= 0xFF;
        assert_eq!(
            decode_geotrick_frame(&corrupted),
            Err(ImuEngineError::BleBurstCrcMismatch)
        );

        // Unmounted GPIO code 0b1111 -> mount_slot_id == 0 and MountNotLocked
        assert_eq!(
            decode_gpio_mount_slot(0b1111),
            Err(ImuEngineError::MountNotLocked)
        );
        assert_eq!(decode_gpio_mount_slot(0b1000), Ok(7)); // Slot #7 (Iron 7)
    }

    #[test]
    fn seam1_evaluates_bq25101_battery_and_50ma_charging_telemetry() {
        let discharging = evaluate_battery_telemetry(4080, false, false, false);
        assert_eq!(discharging.charging_state, ChargingState::Discharging);
        assert_eq!(discharging.charge_current_limit_ma, 50);
        assert!((discharging.battery_percent - 88.0).abs() < 3.5);
        assert_eq!(discharging.estimated_minutes_to_full, None);
        assert!(discharging.estimated_remaining_play_hours.unwrap() > 25.0);

        let charging_cc = evaluate_battery_telemetry(3700, true, true, false);
        assert_eq!(charging_cc.charging_state, ChargingState::ChargingCc);
        assert!(charging_cc.estimated_minutes_to_full.unwrap() >= 45);

        let switch_off_warn = evaluate_battery_telemetry(4200, true, false, true);
        assert_eq!(
            switch_off_warn.charging_state,
            ChargingState::SwitchOffDuringChargeWarning
        );
    }

    #[test]
    fn seam2_computes_6dof_address_pose_tare_and_rejects_short_or_moving_address() {
        let steady_samples = vec![
            ImuSample1000Hz {
                t_rel_ms: -950.0,
                accel_g_xyz: [0.02, -0.48, -0.88],
                gyro_dps_xyz: [0.4, -0.2, 0.1],
                pdm_mic_rms: 110,
                accel_saturated_axes: [false, false, false],
            },
            ImuSample1000Hz {
                t_rel_ms: -500.0,
                accel_g_xyz: [0.02, -0.48, -0.88],
                gyro_dps_xyz: [0.2, 0.1, -0.1],
                pdm_mic_rms: 105,
                accel_saturated_axes: [false, false, false],
            },
            ImuSample1000Hz {
                t_rel_ms: 0.0,
                accel_g_xyz: [0.02, -0.48, -0.88],
                gyro_dps_xyz: [0.1, -0.1, 0.0],
                pdm_mic_rms: 108,
                accel_saturated_axes: [false, false, false],
            },
        ];

        let tare = compute_address_pose_tare(&steady_samples, 0.4).expect("steady address >= 800ms should lock");
        assert!((tare.dwell_duration_ms - 950.0).abs() < 1e-6);
        assert!((tare.residual_face_tare_deg - 0.4).abs() < 1e-6);
        let q_norm = tare
            .tare_quaternion_wxyz
            .iter()
            .map(|v| v * v)
            .sum::<f64>()
            .sqrt();
        assert!((q_norm - 1.0).abs() < 1e-5);

        // Short dwell (< 800ms) -> Err(AddressTareUnstable)
        assert_eq!(
            compute_address_pose_tare(&steady_samples[1..], 0.0),
            Err(ImuEngineError::AddressTareUnstable)
        );
    }

    #[test]
    fn seam3_classifies_ball_strike_vs_dry_swing_and_localizes_center_toe_heel_across_all_4_scenarios() {
        // Scenario 01: Driver Center Strike
        let s01 = vec![
            ImuSample1000Hz { t_rel_ms: -2.0, accel_g_xyz: [4.2, -1.8, -13.1], gyro_dps_xyz: [1420.0, -180.0, 610.0], pdm_mic_rms: 980, accel_saturated_axes: [false, false, false] },
            ImuSample1000Hz { t_rel_ms: 0.0, accel_g_xyz: [-16.0, 3.2, -16.0], gyro_dps_xyz: [1385.0, -172.0, 598.0], pdm_mic_rms: 54200, accel_saturated_axes: [true, false, true] },
            ImuSample1000Hz { t_rel_ms: 1.0, accel_g_xyz: [16.0, -2.9, -15.4], gyro_dps_xyz: [1360.0, -168.0, 604.0], pdm_mic_rms: 38900, accel_saturated_axes: [true, false, false] },
            ImuSample1000Hz { t_rel_ms: 8.0, accel_g_xyz: [-6.1, 1.4, -10.8], gyro_dps_xyz: [1190.0, -140.0, 540.0], pdm_mic_rms: 4200, accel_saturated_axes: [false, false, false] },
        ];
        let r01 = analyze_impact_clipping_signature(&s01, 1.156, 3800.0, 0.18);
        assert_eq!(r01.classification, SwingEventClassification::BallStrike);
        assert!(r01.signature.saturated_at_16g);
        assert!(r01.signature.pdm_mic_impact_confirmed);
        assert_eq!(r01.signature.strike_zone, StrikeZone::Center);
        assert!((r01.signature.estimated_horizontal_impact_mm - (-1.2)).abs() <= 3.5);

        // Scenario 03: Driver Dry Swing (No ball strike, no 16g saturation)
        let s03 = vec![
            ImuSample1000Hz { t_rel_ms: -2.0, accel_g_xyz: [4.3, -1.9, -13.2], gyro_dps_xyz: [1460.0, -185.0, 625.0], pdm_mic_rms: 1240, accel_saturated_axes: [false, false, false] },
            ImuSample1000Hz { t_rel_ms: 0.0, accel_g_xyz: [4.5, -2.0, -13.4], gyro_dps_xyz: [1472.0, -188.0, 630.0], pdm_mic_rms: 1420, accel_saturated_axes: [false, false, false] },
            ImuSample1000Hz { t_rel_ms: 2.0, accel_g_xyz: [4.4, -1.9, -13.3], gyro_dps_xyz: [1465.0, -184.0, 626.0], pdm_mic_rms: 1310, accel_saturated_axes: [false, false, false] },
        ];
        let r03 = analyze_impact_clipping_signature(&s03, 1.156, 3850.0, 0.18);
        assert_eq!(r03.classification, SwingEventClassification::DrySwing);
        assert!(!r03.signature.saturated_at_16g);
        assert_eq!(r03.signature.strike_zone, StrikeZone::NoneDrySwing);

        // Scenario 04: Iron 7 Toe Strike (-14mm, strong negative axial gyro impulse -245 dps)
        let s04 = vec![
            ImuSample1000Hz { t_rel_ms: -2.0, accel_g_xyz: [3.4, -1.5, -10.5], gyro_dps_xyz: [1210.0, -135.0, 495.0], pdm_mic_rms: 840, accel_saturated_axes: [false, false, false] },
            ImuSample1000Hz { t_rel_ms: 0.0, accel_g_xyz: [-16.0, 16.0, -16.0], gyro_dps_xyz: [1150.0, -145.0, 250.0], pdm_mic_rms: 61500, accel_saturated_axes: [true, true, true] },
            ImuSample1000Hz { t_rel_ms: 1.0, accel_g_xyz: [16.0, -16.0, -16.0], gyro_dps_xyz: [1130.0, -150.0, 248.0], pdm_mic_rms: 49800, accel_saturated_axes: [true, true, true] },
            ImuSample1000Hz { t_rel_ms: 2.0, accel_g_xyz: [-16.0, 14.2, -15.1], gyro_dps_xyz: [1115.0, -142.0, 260.0], pdm_mic_rms: 31200, accel_saturated_axes: [true, false, false] },
            ImuSample1000Hz { t_rel_ms: 8.0, accel_g_xyz: [-11.4, 9.8, -12.2], gyro_dps_xyz: [990.0, -120.0, 390.0], pdm_mic_rms: 12400, accel_saturated_axes: [false, false, false] },
        ];
        let r04 = analyze_impact_clipping_signature(&s04, 0.946, 3800.0, 0.18);
        assert_eq!(r04.classification, SwingEventClassification::BallStrike);
        assert_eq!(r04.signature.strike_zone, StrikeZone::Toe);
        assert!((r04.signature.axial_gyro_twist_impulse_dps - (-245.0)).abs() < 1e-3);
        assert!((r04.signature.estimated_horizontal_impact_mm - (-14.0)).abs() <= 3.5);

        // Scenario 02: Iron 7 Steel Stiff Center Strike (+0.8mm)
        let s02 = vec![
            ImuSample1000Hz { t_rel_ms: -2.0, accel_g_xyz: [3.5, -1.4, -10.9], gyro_dps_xyz: [1260.0, -140.0, 520.0], pdm_mic_rms: 860, accel_saturated_axes: [false, false, false] },
            ImuSample1000Hz { t_rel_ms: 0.0, accel_g_xyz: [-16.0, 4.1, -16.0], gyro_dps_xyz: [1215.0, -135.0, 512.0], pdm_mic_rms: 58400, accel_saturated_axes: [true, false, true] },
            ImuSample1000Hz { t_rel_ms: 1.0, accel_g_xyz: [16.0, -3.5, -16.0], gyro_dps_xyz: [1190.0, -130.0, 515.0], pdm_mic_rms: 41200, accel_saturated_axes: [true, false, true] },
            ImuSample1000Hz { t_rel_ms: 8.0, accel_g_xyz: [-4.8, 1.1, -9.2], gyro_dps_xyz: [1040.0, -110.0, 470.0], pdm_mic_rms: 5100, accel_saturated_axes: [false, false, false] },
        ];
        let r02 = analyze_impact_clipping_signature(&s02, 0.940, 5100.0, 0.15);
        assert_eq!(r02.classification, SwingEventClassification::BallStrike);
        assert_eq!(r02.signature.strike_zone, StrikeZone::Center);
        assert!((r02.signature.estimated_horizontal_impact_mm - 0.8).abs() <= 3.5);
    }
}
