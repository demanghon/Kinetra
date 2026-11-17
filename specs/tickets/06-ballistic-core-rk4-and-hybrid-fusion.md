# 06: 3D Ballistic Integrator (RK4 6-DOF Magnus), Hybrid Fusion, `tour_ball` vs `range_ball` & `Dry Swing` (`ballistic-core`)

**What to build:** The `src/ballistic-core` Rust/WASM engine that fuses compensated IMU impact kinematics (including off-center `toe`/`center`/`heel` gear effect and smash factor penalty) with `DTL Launch Window` measurements in `dtl` mode (or runs autonomously from IMU in `face_on` mode), integrates the 6-DOF aerodynamic flight via fixed-step RK4 ($\Delta t = 1\text{ ms}$) with Magnus lift, drag, 3D wind, and bounce/roll, models `tour_ball` vs `range_ball` (including `tour_ball_equivalent_carry_m`), and supports `Dry Swing` virtual ball simulation.

**Blocked by:** 03: Shaft Elastodynamic Solver (Steel vs Graphite) & Compensated Clubface Orientation (`imu-engine` Part 2), 05: Single-Smartphone Video Session (`dtl` / `face_on`), Spatial Calibration & Millisecond `Impact Sync Anchor` (`video-sync`)

**Status:** ready-for-agent

- [ ] Implements hybrid IMU + DTL launch fusion (`REQ-BAL-001`) and autonomous `face_on` IMU launch calculation (`REQ-BAL-002`).
- [ ] Integrates 3D ball flight via RK4 ($\Delta t = 1\text{ ms}$) with `tour_ball` and `range_ball` profiles, computing `tour_ball_equivalent_carry_m` (`REQ-BAL-003`, `REQ-BAL-004`).
- [ ] Handles `dry_swing` without missing-impact errors and computes virtual sweet-spot flight when `simulate_virtual_ball_on_dry_swing` is enabled (`REQ-BAL-005`).
- [ ] Passes all 4 end-to-end reference scenarios in `sim-harness` within numerical tolerances (`REQ-SIM-003`).
