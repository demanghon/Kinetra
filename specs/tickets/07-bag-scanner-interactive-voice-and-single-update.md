# 07: Interactive Voice (TTS) & Video Bag Scanner, Auto-ID Mount Binding & Single-Club Update (`bag-scanner`)

**What to build:** The `src/bag-scanner` interactive onboarding assistant supporting both `FULL_BAG_ONBOARDING` and post-hoc `SINGLE_CLUB_UPDATE` (updating a single club without rescanning the bag), driving a spoken French TTS state machine over continuous video with Laplacian sharpness filtering, extracting head and shaft attributes (`steel` vs `graphite`, flex `L/A/R/S/X`), binding the club to its hardware `mount_slot_id` (`1..14`) when the golfer clips the GeoTrick sensor onto the grip, and resolving mechanical constants from `ClubPhysicsCatalog`.

**Blocked by:** 01: Simulation Harness & JSON Schema Draft 2020-12 Contract Validator (`sim-harness`)

**Status:** ready-for-agent

- [ ] Drives the interactive TTS + video state machine (`WAIT_CLUB_HEAD` $\rightarrow$ `WAIT_SHAFT_LABEL` $\rightarrow$ `WAIT_MOUNT_CLIP` $\rightarrow$ `CLUB_SAVED`) in both `FULL_BAG_ONBOARDING` and `SINGLE_CLUB_UPDATE` modes (`REQ-BAG-001`, `REQ-BAG-007`).
- [ ] Filters blurry frames (`sharpness_score >= 0.70`), triggers interactive voice/UI confirmation when any attribute confidence is $< 0.85$, binds the BLE `mount_slot_id` (`1..14`), and enriches the resulting `ClubProfile` via `ClubPhysicsCatalog` (`REQ-BAG-002` through `REQ-BAG-006`).
