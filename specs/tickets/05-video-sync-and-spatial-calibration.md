# 05: Single-Smartphone Video Session (`dtl` / `face_on`), Spatial Calibration & Millisecond `Impact Sync Anchor` (`video-sync`)

**What to build:** The `src/video-sync` module managing v1 single-smartphone capture (`dtl` default or `face_on`, extensible to v2 `dual_camera`), enforcing `Spatial Calibration Frame` constraints (virtual spirit level roll/pitch and ground target line), aligning the IMU $1000\text{ Hz}$ timeline and smartphone audio/video timeline to $\le \pm 2.0\text{ ms}$ at $t = 0$ (`Impact Sync Anchor`) with acoustic time-of-flight correction $d_{\text{cam}}/c_{\text{air}}$ (and kinematic *Low Point* fallback on `Dry Swing`), and extracting the `DTL Launch Window` and 3D pose summary.

**Blocked by:** 02: GeoTrick IMU Decoder, 4-Bit Auto-ID Mount, 6-DoF Tare & ±16g Impact Clipping Signature (`imu-engine` Part 1)

**Status:** ready-for-agent

- [ ] Enforces virtual spirit level ($|\text{roll}| \le 1.0^\circ$, $|\text{pitch}| \le 3.0^\circ$) and target-line lock before enabling swing capture (`REQ-SYNC-001`, `REQ-SYNC-002`).
- [ ] Aligns `ball_strike` captures to $t = 0$ within $\pm 1.5\text{ ms}$ by subtracting acoustic time-of-flight $d_{\text{cam}}/c_{\text{air}}$, and aligns `dry_swing` captures via *Low Point* angular velocity correlation within $\pm 6.0\text{ ms}$ (`REQ-SYNC-003`, `REQ-SYNC-004`).
- [ ] Outputs validated `VideoSyncSession` payloads including `dtl_launch_window` (in `dtl` mode) and `pose_kinematics_summary` (`REQ-SYNC-005`, `REQ-SYNC-006`).
