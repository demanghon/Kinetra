# `bag-scanner` — On-Device Vision & Local Neural TTS Bag Onboarding + Single-Club Update

- **Normative Specification:** [03-bag-scanner-ai.md](../../specs/03-bag-scanner-ai.md)
- **Data Contracts:** [bag-scanner.schema.json](../../schemas/bag-scanner.schema.json), [club-profile.schema.json](../../schemas/club-profile.schema.json)
- **Requirements Owned:** `REQ-BAG-001` through `REQ-BAG-007`
- **Status:** Complete & Verified (Ticket `07` resolved — `node --test src/bag-scanner/bag-scanner.test.ts` 2/2 PASS)

## Public Seams (`src/bag-scanner/index.ts`)

- `BagScannerSession` — State machine driving `FULL_BAG_ONBOARDING` and `SINGLE_CLUB_UPDATE` with local French neural TTS utterances (`Piper / Kokoro` via `Sherpa-ONNX`), Laplacian sharpness gating ($\ge 0.70$), 1-tap touch fallback when confidence $< 0.85$, and automatic 4-bit `mount_slot_id` (`1..14`) binding.
- `classifyShaftMaterialFromVisionAndOcr` — Fuses `PaddleOCR-v4` text and `MobileNetV3-Small` metallic specularity score to classify `steel` vs `graphite` and `flex_rating` (`L/A/R/S/X`).
- `resolveClubProfileFromCatalog` — Enriches validated club attributes with full elastodynamic parameters ($EI, GJ, \kappa_{\text{aniso}}, c_{\text{shaft}}$) from `ClubPhysicsCatalog`.
