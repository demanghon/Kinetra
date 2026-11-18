# 0005 — React Native (New Architecture JSI + Skia 120Hz) & 100% On-Device Edge AI (Vision & Voice) for Android and iOS

We replace the initial Angular/Highcharts WebView stack for `client-app` with **React Native (New Architecture JSI / Bridgeless + TypeScript)** targeting Android first and iOS from a single codebase, executing all AI models (swing vision/pose + OCR + conversational voice STT/TTS) and Rust physics crates (`imu-engine`, `ballistic-core`) **100% locally on the smartphone (On-Device Edge AI)**.

## Context & Trade-offs

1. **Zero-copy camera & 120Hz live UX**: Golf capture requires $60\text{–}240\text{ FPS}$ video with manual fast shutter speed ($\le 1/1000\text{ s}$) and live skeletal/calibration overlays. `react-native-vision-camera` v4 (C++ JSI Frame Processors) paired with `@shopify/react-native-skia`, `Reanimated v3`, and `Victory Native XL` enables zero-copy GPU frame processing and $120\text{ Hz}$ telemetry scrubbing that a hybrid WebView (Angular/Capacitor) cannot achieve.
2. **On-Device Vision & Voice AI (Offline-First on Driving Ranges)**: Driving ranges and golf courses frequently suffer from poor cellular connectivity and high ambient noise. Running **MediaPipe Pose Landmarker 3D / LiteRT** (GPU/NPU delegate) for swing/club recognition and **Sherpa-ONNX / Whisper.rn + Piper Neural TTS** (`int8` quantized models) directly on the phone's processor delivers $<150\text{ ms}$ conversational voice guidance and real-time pose tracking without any backend server dependency.
3. **Native ARM64 Rust FFI**: Our Rust crates (`imu-engine`, `ballistic-core`) compile directly to native Android NDK (`.so`) and iOS (`.a`) libraries called synchronously via C-ABI / JSI in $<0.5\text{ ms}$.
