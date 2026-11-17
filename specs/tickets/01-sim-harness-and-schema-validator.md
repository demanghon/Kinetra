# 01: Simulation Harness & JSON Schema Draft 2020-12 Contract Validator (`sim-harness`)

**What to build:** A deterministic offline CLI runner and library (`src/sim-harness`) that loads all 7 formal schemas in `schemas/*.schema.json` and the 4 reference scenarios in `fixtures/simulation/*`, validates every fixture payload against its JSON Schema Draft 2020-12 contract (resolving cross-schema `$ref` links such as `club-profile.schema.json` and `ball-profile.schema.json`), executes the simulation pipeline verification loop, and evaluates numerical tolerances (`max_sync_offset_error_ms`, `max_face_angle_error_deg`, `max_dynamic_loft_error_deg`, `max_impact_location_error_mm`, `max_carry_distance_error_m`, `max_lateral_offline_error_m`) against `expected_outcomes.json`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Validates all 7 schemas in `schemas/*.schema.json` and all 16 JSON files across the 4 reference scenarios in `fixtures/simulation/` (`REQ-ARCH-003`, `REQ-SIM-002`).
- [ ] Rejects malformed payloads (e.g., invalid 4-bit GPIO mount code `1111` in a locked `ClubProfile`, out-of-range $\pm 16\,g$ accelerometer value, or invalid `charging_state`) with structured `ERR_SCHEMA_VALIDATION_FAILED` diagnostics (`REQ-API-001`).
- [ ] Evaluates numerical tolerances between computed pipeline outputs and `expected_outcomes.json`, exiting with code `0` when all metrics are within tolerance and non-zero with a detailed diff report when any metric drifts beyond its bound (`REQ-SIM-001`, `REQ-SIM-003`).
