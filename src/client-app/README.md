# `client-app` — Mobile Client Application (Android & iOS: React Native JSI + Skia 120Hz + On-Device Edge AI)

- **Normative Specification:** [06-api-contracts.md](../../specs/06-api-contracts.md), [ADR-0005](../../docs/adr/0005-react-native-jsi-skia-and-on-device-edge-ai.md)
- **Data Contracts:** All schemas in `schemas/*.schema.json`
- **Requirements Owned:** `REQ-API-001`, `REQ-API-002`, `REQ-API-003`
- **Technology Stack:** React Native (New Architecture JSI / TypeScript), `react-native-vision-camera` v4 ($60\text{–}240\text{ FPS}$ + MediaPipe/LiteRT On-Device Pose), `@shopify/react-native-skia` + `Victory Native XL` ($120\text{ Hz}$ overlays & telemetry), `@react-three/fiber` + `expo-gl` (3D flight & swing plane), `sherpa-onnx` / `whisper.rn` + `Piper TTS` (On-Device Voice Interaction), `react-native-ble-plx` (XIAO BLE 5.0), and native ARM64 Rust FFI (`imu-engine`, `ballistic-core`).
- **Status:** Ticket `08` (`ready-for-agent`, blocked by Tickets `06` and `07`).
