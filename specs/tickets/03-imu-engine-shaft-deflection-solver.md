# 03: Shaft Elastodynamic Solver (Steel vs Graphite) & Compensated Clubface Orientation (`imu-engine` Part 2)

**What to build:** The Euler-Bernoulli beam bending + torsional twist solver in `src/imu-engine` operating over the free shaft length $L_{\text{free}} = L_{\text{club}} - d_{\text{hands}}$, taking the auto-selected `ClubProfile` (`steel` vs `graphite`, flex `L/A/R/S/X`, `ei_lead_lag_nm2`, `ei_droop_nm2`, `gj_torsion_nm2`, `anisotropic_coupling_kappa`) to transform the butt-cap IMU orientation into the true `Compensated Clubface Orientation` ($\theta_{\text{face,comp}}, \theta_{\text{loft,comp}}, \theta_{\text{lie,comp}}$) and clubhead speed $V_{\text{head}}$ at impact.

**Blocked by:** 02: GeoTrick IMU Decoder, 4-Bit Auto-ID Mount, 6-DoF Tare & ±16g Impact Clipping Signature (`imu-engine` Part 1)

**Status:** ready-for-agent

- [ ] Computes `lead_deflection_mm`, `toe_down_droop_mm`, `dynamic_loft_addition_deg`, `torsional_twist_deg`, and `kick_velocity_mps` from the `ClubProfile` physics parameters (`REQ-IMU-006`).
- [ ] Produces `compensated_face_angle_deg` within $\pm 0.30^\circ$ and `compensated_dynamic_loft_deg` within $\pm 0.40^\circ$ across all 4 reference simulation fixtures (`REQ-ARCH-002`, `REQ-IMU-006`).
