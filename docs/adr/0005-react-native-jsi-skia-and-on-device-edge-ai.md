# 0005 — React Native (New Architecture JSI + Skia 120Hz) & 100% On-Device Edge AI (Vision & Neural TTS Coach) for Android and iOS

We replace the initial Angular/Highcharts WebView stack for `client-app` with **React Native (New Architecture JSI / Bridgeless + TypeScript)** targeting Android first and iOS from a single codebase, executing all vision models, local neural Text-To-Speech (`VocalCoachService`), and Rust physics crates (`imu-engine`, `ballistic-core`) **100% locally on the smartphone (On-Device Edge AI)**.

## Context & Trade-offs

1. **Zero-copy camera & 120Hz live UX**: Golf capture requires $60\text{–}240\text{ FPS}$ video with manual fast shutter speed ($\le 1/1000\text{ s}$) and live skeletal/calibration overlays. `react-native-vision-camera` v4 (C++ JSI Frame Processors) paired with `@shopify/react-native-skia`, `Reanimated v3`, and `Victory Native XL` enables zero-copy GPU frame processing and $120\text{ Hz}$ telemetry scrubbing that a hybrid WebView cannot achieve.
2. **Unidirectional On-Device Neural TTS (`Sherpa-ONNX` + `Piper / Kokoro-82M` — Zero STT in v1)**: Rather than running heavy continuous speech-to-text (STT) in v1, Kinetra focuses on **natural local voice output (TTS)** via **`Sherpa-ONNX`** running **`Piper Neural TTS` (`fr_FR-siwis-medium`, $\sim 35\text{ MB}$, $<40\text{ ms}$ latency)** or **`Kokoro-82M` (`ff_siwis`, $\sim 85\text{ MB}$)**. This single local voice engine powers both:
   - **Step-by-step spoken instructions during `bag-scanner`** (with large one-tap touch buttons on screen when manual confirmation is needed).
   - **Real-time post-swing training tips (`VocalCoachService`)** synthesized locally after each swing from the biomechanical and ballistic analysis (e.g., clubhead speed, face angle, toe/heel impact location, and shaft deflection). Two-way conversational STT is deferred to v2+.
3. **Specialized On-Device Vision Models (`LiteRT / ONNX Runtime Mobile`, $<25\text{ MB}$ total)**:
   - **Bag Scanner Vision Stack (3 micro-models)**:
     1. `YOLOv11n` (`int8`, $\sim 3.2\text{ MB}$) real-time bounding-box detector for `club_head`, `shaft_tube`, and `shaft_label` + Laplacian sharpness gate ($\ge 0.70$).
     2. `PaddleOCR-v4 Mobile` (ONNX `int8`, $\sim 8\text{ MB}$) + native `ML Kit / Apple Vision` for engraved club numbers/lofts and longitudinal shaft text.
     3. `MobileNetV3-Small` (`int8`, $\sim 2.5\text{ MB}$) optical surface specularity classifier distinguishing `steel` (stepped chrome specular reflections) from `graphite` (matte/satin carbon weave) even when labels are worn.
   - **Swing & Ball Launch Vision Stack**:
     1. `MediaPipe Pose Landmarker 3D` ($\sim 9\text{ MB}$ GPU/NPU delegate) for 33-keypoint 3D body kinematics.
     2. `YOLOv11n Ball & Clubhead Tracker` for swing plane and `DTL Launch Window` tracking.
4. **Native ARM64 Rust FFI**: Our Rust crates (`imu-engine`, `ballistic-core`) compile directly to native Android NDK (`.so`) and iOS (`.a`) libraries called synchronously via C-ABI / JSI in $<0.5\text{ ms}$.
