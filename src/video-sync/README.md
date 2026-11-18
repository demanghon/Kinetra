# `video-sync` — Single-Smartphone Video Session, Spatial Calibration & Millisecond Sync

- **Normative Specification:** [02-video-sync-calibration.md](../../specs/02-video-sync-calibration.md)
- **Data Contracts:** [video-sync-session.schema.json](../../schemas/video-sync-session.schema.json)
- **Requirements Owned:** `REQ-SYNC-001` through `REQ-SYNC-006`
- **Status:** Complete & Verified (Ticket `05` resolved — `node --test src/video-sync/video-sync.test.ts` 3/3 PASS)

## Public Seams (`src/video-sync/index.ts`)

- `validateSpatialCalibrationAndStreams` — Validates virtual spirit level ($|\text{roll}| \le 1.0^\circ$, $|\text{pitch}| \le 3.0^\circ$), ground target line lock, and $\ge 60\text{ FPS}$ capture rate.
- `computeImpactSyncAnchor` — Aligns the $1000\text{ Hz}$ IMU timeline and smartphone audio/video timeline to $\le \pm 1.5\text{ ms}$ by subtracting temperature-compensated acoustic time-of-flight $d_{\text{cam}}/c_{\text{air}}(T_{\text{amb}})$, with *Low Point* fallback on `Dry Swing`.
- `buildSynchronizedVideoSession` — Builds schema-compliant `VideoSyncSession` documents for v1 `dtl` / `face_on` and v2 `dual_camera`.
