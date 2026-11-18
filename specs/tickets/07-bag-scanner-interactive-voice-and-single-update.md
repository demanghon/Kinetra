# 07: On-Device Vision (`YOLOv11n` + `PaddleOCR-v4` + `MobileNetV3`) & Local Neural TTS (`Piper / Kokoro`) Bag Scanner + Single-Club Update (`bag-scanner`)

**What to build:** The `src/bag-scanner` onboarding and club management module supporting both `FULL_BAG_ONBOARDING` and post-hoc `SINGLE_CLUB_UPDATE` (updating a single club without rescanning the bag). It drives a unidirectional local neural TTS state machine (`Sherpa-ONNX` + `Piper fr_FR-siwis-medium` / `Kokoro-82M` — zero STT required in v1, with 1-tap touch buttons for fallback confirmation) over continuous video using 3 specialized on-device vision models (`YOLOv11n int8` ROI detector with Laplacian sharpness gate $\ge 0.70$, `PaddleOCR-v4 Mobile` for engraved head numbers & longitudinal shaft labels, and `MobileNetV3-Small` specularity classifier for `steel` vs `graphite`), binds the club to its hardware `mount_slot_id` (`1..14`) when the golfer clips the GeoTrick sensor onto the grip, and resolves mechanical constants from `ClubPhysicsCatalog`.

**Blocked by:** 01: Simulation Harness & JSON Schema Draft 2020-12 Contract Validator (`sim-harness`)

**Status:** resolved

- [x] Drives the interactive local neural TTS (`Piper / Kokoro` via `Sherpa-ONNX`) + continuous video state machine (`WAIT_CLUB_HEAD` $\rightarrow$ `WAIT_SHAFT_LABEL` $\rightarrow$ `WAIT_MOUNT_CLIP` $\rightarrow$ `CLUB_SAVED`) in both `FULL_BAG_ONBOARDING` and `SINGLE_CLUB_UPDATE` modes (`REQ-BAG-001`, `REQ-BAG-007`).
- [x] Executes the 3-stage on-device vision pipeline (`YOLOv11n` ROI + Laplacian sharpness $\ge 0.70$, `PaddleOCR-v4`, `MobileNetV3-Small` `steel` vs `graphite`), triggers spoken guidance + 1-tap touch confirmation when any attribute confidence is $< 0.85$, binds the BLE `mount_slot_id` (`1..14`), and enriches the resulting `ClubProfile` via `ClubPhysicsCatalog` (`REQ-BAG-002` through `REQ-BAG-006`).
