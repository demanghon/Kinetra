# 02: GeoTrick IMU Decoder, 4-Bit Auto-ID Mount, 6-DoF Tare & ±16g Impact Clipping Signature (`imu-engine` Part 1)

**What to build:** The first vertical slice of `src/imu-engine` (Rust native & WebAssembly) that decodes the 24-byte XIAO BLE nRF52840 Sense frame (`LSM6DS3TR-C` 6-DoF + `MP34DT05-A` PDM microphone RMS + `BQ25101` battery/charge telemetry), resolves the active club automatically from the 4-bit GPIO `mount_slot_id` (`1..14`), computes the 6-DoF gravity-based `Address Pose Tare` ($\ge 800\text{ ms}$ dwell without magnetometer), classifies `ball_strike` vs `dry_swing` using the $\pm 16\,g$ saturation ceiling + PDM peak, and localizes horizontal clubface impact (`toe`, `center`, `heel`) from the axial gyroscope torsional impulse ($\Delta \omega_z$) and post-impact flexural ring-down energy.

**Blocked by:** 01: Simulation Harness & JSON Schema Draft 2020-12 Contract Validator (`sim-harness`)

**Status:** resolved

- [x] Decodes 24-byte BLE burst frames with CRC-8 verification, extracting `mount_slot_id` (`1..14`), `power_telemetry` (`50 mA` charge state, `battery_mv`, `battery_percent`, `estimated_minutes_to_full`), and 1000 Hz 6-DoF + PDM samples (`REQ-IMU-002`, `REQ-IMU-007`, `REQ-IMU-009`).
- [x] Computes the 6-DoF `Address Pose Tare` quaternion after $\ge 800\text{ ms}$ of stillness (`REQ-IMU-001`).
- [x] Distinguishes `ball_strike` from `dry_swing` via $\pm 16\,g$ clipping + `pdm_mic_rms` peak and subtracts shaft acoustic wave propagation time $\Delta t_{\text{wave}}$ (`REQ-IMU-003`, `REQ-IMU-004`).
- [x] Localizes horizontal face strike (`toe`, `center`, `heel`) and `estimated_horizontal_impact_mm` within $\pm 3.5\text{ mm}$ across all 4 simulation scenarios (`REQ-IMU-005`).
