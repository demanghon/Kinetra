# `imu-engine` — GeoTrick IMU 6-DoF Engine (Rust Native & WebAssembly)

- **Normative Specification:** [01-hardware-imu-shaft.md](../../specs/01-hardware-imu-shaft.md)
- **Data Contracts:** [imu-telemetry.schema.json](../../schemas/imu-telemetry.schema.json), [club-profile.schema.json](../../schemas/club-profile.schema.json)
- **Requirements Owned:** `REQ-IMU-001` through `REQ-IMU-009`
- **Status:** Part 1 Implemented & Verified (Ticket `02`: 24-byte XIAO BLE decoder, 4-bit Auto-ID mount resolver, `BQ25101` $50\text{ mA}$ battery/charge telemetry, 6-DoF gravity tare, and $\pm 16\,g$ `Impact Clipping Signature` analyzer). Part 2 (Ticket `03`: Shaft elastodynamic solver) next.

## Public Seams (`src/imu-engine/src/lib.rs`)

- `decode_geotrick_frame` / `encode_geotrick_frame` / `decode_gpio_mount_slot` — 24-byte BLE burst frame codec with CRC-8 (`0x07`) and 4-bit `D0..D3` club slot identification (`1..14`, `0b1111` unmounted).
- `evaluate_battery_telemetry` — `L301525` ($85\text{ mAh}$) state-of-charge & `BQ25101` $50\text{ mA}$ charging progress evaluator with `SWITCH_OFF_DURING_CHARGE_WARNING` detection.
- `compute_address_pose_tare` — 6-DoF gravity-based address tare ($\ge 800\text{ ms}$ stillness without magnetometer).
- `analyze_impact_clipping_signature` — Classifies `ball_strike` vs `dry_swing` via $\pm 16\,g$ saturation + onboard `MP34DT05-A` PDM microphone peak, and localizes horizontal clubface strike (`toe`, `center`, `heel`) from axial gyroscope twist impulse $\Delta \omega_z$ and post-impact ring-down energy.
