# `client-app` — Mobile Client Application (Android & iOS: React Native JSI + Skia 120Hz + On-Device Edge AI)

- **Normative Specification:** [06-api-contracts.md](../../specs/06-api-contracts.md), [ADR-0005](../../docs/adr/0005-react-native-jsi-skia-and-on-device-edge-ai.md)
- **Data Contracts:** All schemas in `schemas/*.schema.json`
- **Requirements Owned:** `REQ-API-001`, `REQ-API-002`, `REQ-API-003`, `REQ-API-004`
- **Status:** Complete & Verified (Ticket `08` resolved — `node --test src/client-app/client-app.test.ts` 3/3 PASS)

## Public Seams (`src/client-app/index.ts`)

- `buildBatteryAndChargeWidgetState` — Live battery & $50\text{ mA}$ `BQ25101` charging progress widget controller with `SWITCH_OFF_DURING_CHARGE_WARNING` and low-battery ($\le 15\%$) alerts (`REQ-API-003`).
- `VocalCoachService` — On-device French neural TTS service (`Sherpa-ONNX` + `Piper fr_FR-siwis-medium` / `Kokoro-82M`) announcing automatic club changes on BLE `mount_slot_id` (`1..14`) and synthesizing actionable post-swing training tips (`REQ-API-004`).
- `computeSynchronizedReplayFrame` — Synchronizes the video frame index, $120\text{ Hz}$ Skia telemetry cursor, `Toe/Center/Heel` clubface strike map, and `@react-three/fiber` 3D ball coordinates within $\le 1\text{ frame}$ around $t = 0$ (`REQ-API-002`).
