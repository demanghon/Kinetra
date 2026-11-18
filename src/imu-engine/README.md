# `imu-engine` — GeoTrick IMU 6-DoF & Shaft Elastodynamics Engine (Rust Native & WebAssembly)

- **Normative Specification:** [01-hardware-imu-shaft.md](../../specs/01-hardware-imu-shaft.md)
- **Data Contracts:** [imu-telemetry.schema.json](../../schemas/imu-telemetry.schema.json), [club-profile.schema.json](../../schemas/club-profile.schema.json)
- **Requirements Owned:** `REQ-IMU-001` through `REQ-IMU-009`, `REQ-ARCH-002`
- **Status:** Complete & Verified (Ticket `02` & Ticket `03` resolved — `cargo test` 5/5 PASS)

## Public Seams (`src/imu-engine/src/lib.rs`)

- `decode_geotrick_frame` / `encode_geotrick_frame` / `decode_gpio_mount_slot` — 24-byte BLE burst frame codec with CRC-8 (`0x07`) and 4-bit `D0..D3` club slot identification (`1..14`, `0b1111` unmounted).
- `evaluate_battery_telemetry` — `L301525` ($85\text{ mAh}$) state-of-charge & `BQ25101` $50\text{ mA}$ charging progress evaluator with `SWITCH_OFF_DURING_CHARGE_WARNING` detection.
- `compute_address_pose_tare` — 6-DoF gravity-based address tare ($\ge 800\text{ ms}$ stillness without magnetometer).
- `analyze_impact_clipping_signature` — Classifies `ball_strike` vs `dry_swing` via $\pm 16\,g$ saturation + onboard `MP34DT05-A` PDM microphone peak, and localizes horizontal clubface strike (`toe`, `center`, `heel`) from axial gyroscope twist impulse $\Delta \omega_z$ and post-impact ring-down energy.
- `solve_shaft_deflection_and_compensate_clubhead` — Euler-Bernoulli beam bending + torsional twist solver over free shaft length $L_{\text{free}} = L_{\text{club}} - d_{\text{hands}}$ (`steel` vs `graphite`, flex `L/A/R/S/X`) computing `CompensatedClubheadAtImpact` within $\pm 0.30^\circ$ face angle and $\pm 0.40^\circ$ dynamic loft across all 4 reference simulation scenarios.
