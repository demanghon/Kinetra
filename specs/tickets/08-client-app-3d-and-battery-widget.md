# 08: Mobile/Web Client Application: Live Battery/Charge Widget, Auto-Club Selection & Synchronized 3D/Telemetry Replay (`client-app`)

**What to build:** The user-facing application (`src/client-app` — technology stack to be reviewed and confirmed with the user after Ticket 01 before implementation starts) integrating the WebAssembly physics engines, live BLE battery & charge progress widget (`charging_state`, `estimated_minutes_to_full`, `SWITCH_OFF_DURING_CHARGE_WARNING`), automatic club switching on `mount_slot_id` change, guided spatial calibration, interactive voice/video bag onboarding, and synchronized frame-by-frame video + telemetry charts (`Impact Clipping Signature` zoom + `Toe/Center/Heel` face map) + 3D trajectory rendering.

**Blocked by:** 06: 3D Ballistic Integrator (RK4 6-DOF Magnus), Hybrid Fusion, `tour_ball` vs `range_ball` & `Dry Swing` (`ballistic-core`), 07: Interactive Voice (TTS) & Video Bag Scanner, Auto-ID Mount Binding & Single-Club Update (`bag-scanner`)

**Status:** needs-info

- [ ] Technology stack for the mobile application reviewed and confirmed with the user before starting implementation.
- [ ] Displays real-time sensor battery level, remaining play hours, live charging progress (`0%` to `100%` with `estimated_minutes_to_full`), and `SWITCH_OFF_DURING_CHARGE_WARNING` alert (`REQ-API-003`).
- [ ] Synchronizes the video player, telemetry curves (speed, shaft deflection, $\pm 16\,g$ clipping & $\Delta \omega_z$ face strike map), and 3D flight scene within $\le 1\text{ frame}$ around $t = 0$ (`REQ-API-002`).
