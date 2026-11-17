# `sim-harness` — Deterministic CI/CD Replay Runner & JSON Schema Validator

- **Normative Specification:** [05-simulation-harness.md](../../specs/05-simulation-harness.md)
- **Data Contracts:** [simulation-fixture.schema.json](../../schemas/simulation-fixture.schema.json)
- **Requirements Owned:** `REQ-SIM-001` through `REQ-SIM-003`, `REQ-ARCH-003`, `REQ-API-001`
- **Status:** Implemented & Verified (Ticket `01` — `npm test` & `npm run sim:verify`)

## Public Seams (`src/sim-harness/index.ts`)

- `SchemaRegistry.fromDirectory(schemasDir)` & `registry.validate(schemaId, payload)` — JSON Schema Draft 2020-12 validator with cross-schema `$ref` resolution and `ERR_SCHEMA_VALIDATION_FAILED` reporting.
- `evaluateScenarioTolerances(...)` — Deterministic tolerance evaluator checking `aligned_sync_offset_ms`, `compensated_face_angle_deg`, `compensated_dynamic_loft_deg`, `estimated_horizontal_impact_mm`, `strike_zone`, `carry_distance_m`, and `lateral_offline_carry_m`.
- `runSimulationSuite({ schemasDir, fixturesDir, pipelineAdapter })` — Offline CI/CD suite runner executing all 4 scenarios in `fixtures/simulation/`.
