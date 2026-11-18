# `ballistic-core` — 3D Aerodynamic Ballistic Engine (Rust Native & WebAssembly)

- **Normative Specification:** [04-ballistic-engine.md](../../specs/04-ballistic-engine.md)
- **Data Contracts:** [ballistic-trajectory.schema.json](../../schemas/ballistic-trajectory.schema.json), [ball-profile.schema.json](../../schemas/ball-profile.schema.json)
- **Requirements Owned:** `REQ-BAL-001` through `REQ-BAL-005`, `REQ-SIM-003`
- **Status:** Complete & Verified (Ticket `06` resolved — `cargo test` PASS across all 4 reference simulation scenarios)

## Public Seams (`src/ballistic-core/src/lib.rs`)

- `compute_launch_conditions` — Bayesian hybrid fusion of compensated IMU kinematics (`CompensatedClubheadAtImpact` + `ImpactClippingSignature` off-center gear effect/smash factor) with `DtlLaunchMeasurement` in `dtl` mode (`HYBRID_IMU_AND_DTL_VIDEO`), autonomous IMU mode in `face_on` (`AUTONOMOUS_IMU_FACE_ON`), and `Dry Swing` (`DRY_SWING_VIRTUAL_BALL` / `DRY_SWING_KINEMATICS_ONLY`).
- `simulate_ballistic_flight` — Fixed-step ($\Delta t = 1\text{ ms}$) 6-DOF RK4 aerodynamic flight integrator with Magnus lift, drag, exponential spin decay, 3D wind, bounce/roll, and `tour_ball` vs `range_ball` conversion (`tour_ball_equivalent_carry_m`).
