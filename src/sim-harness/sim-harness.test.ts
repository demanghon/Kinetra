import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { SchemaRegistry, evaluateScenarioTolerances, runSimulationSuite } from "./index.ts";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const SCHEMAS_DIR = path.join(ROOT_DIR, "schemas");
const FIXTURES_DIR = path.join(ROOT_DIR, "fixtures", "simulation");

describe("Seam 1 — JSON Schema Draft 2020-12 Contract Validator (REQ-ARCH-003, REQ-SIM-002, REQ-API-001)", () => {
  it("loads all 7 canonical schemas and validates a compliant SimulationFixture manifest with cross-schema $ref resolution", () => {
    const registry = SchemaRegistry.fromDirectory(SCHEMAS_DIR);
    assert.equal(registry.count(), 7);

    const manifest01 = JSON.parse(
      fs.readFileSync(
        path.join(FIXTURES_DIR, "01-driver-graphite-regular-tour-ball", "manifest.json"),
        "utf-8"
      )
    );
    const result = registry.validate(
      "https://kinetra.golf/schemas/simulation-fixture.schema.json",
      manifest01
    );
    assert.equal(result.valid, true, `Expected valid manifest, got: ${JSON.stringify(result.errors)}`);
  });

  it("rejects a ClubProfile whose 4-bit GPIO mount code is '1111' (reserved for UNMOUNTED state) or has undeclared properties", () => {
    const registry = SchemaRegistry.fromDirectory(SCHEMAS_DIR);
    const manifest01 = JSON.parse(
      fs.readFileSync(
        path.join(FIXTURES_DIR, "01-driver-graphite-regular-tour-ball", "manifest.json"),
        "utf-8"
      )
    );
    const invalidClub = structuredClone(manifest01.club_profile);
    invalidClub.butt_cap_mount.gpio_binary_code_d3_d0 = "1111";
    invalidClub.unexpected_field = true;

    const result = registry.validate(
      "https://kinetra.golf/schemas/club-profile.schema.json",
      invalidClub
    );
    assert.equal(result.valid, false);
    assert.equal(result.errorCode, "ERR_SCHEMA_VALIDATION_FAILED");
    assert.ok(result.errors.some((e: { path: string }) => e.path.includes("gpio_binary_code_d3_d0")));
    assert.ok(result.errors.some((e: { path: string }) => e.path.includes("unexpected_field")));
  });

  it("rejects an ImuTelemetry payload when an accelerometer sample exceeds the ±16g hardware ceiling or has an invalid charging_state", () => {
    const registry = SchemaRegistry.fromDirectory(SCHEMAS_DIR);
    const imu01 = JSON.parse(
      fs.readFileSync(
        path.join(FIXTURES_DIR, "01-driver-graphite-regular-tour-ball", "imu_burst_1000hz.json"),
        "utf-8"
      )
    );
    const invalidImu = structuredClone(imu01);
    invalidImu.raw_burst_1000hz.samples[0].accel_g_xyz[0] = 18.5;
    invalidImu.power_telemetry.charging_state = "OVERCURRENT_100MA";

    const result = registry.validate(
      "https://kinetra.golf/schemas/imu-telemetry.schema.json",
      invalidImu
    );
    assert.equal(result.valid, false);
    assert.equal(result.errorCode, "ERR_SCHEMA_VALIDATION_FAILED");
    assert.ok(result.errors.some((e: { path: string }) => e.path.includes("accel_g_xyz")));
    assert.ok(result.errors.some((e: { path: string }) => e.path.includes("charging_state")));
  });
});

describe("Seam 2 — Numerical Tolerance Evaluator (REQ-SIM-003)", () => {
  it("passes when computed metrics stay within scenario expected_tolerances and fails with exact diffs when carry or face angle drifts", () => {
    const scenarioDir = path.join(FIXTURES_DIR, "01-driver-graphite-regular-tour-ball");
    const manifest = JSON.parse(fs.readFileSync(path.join(scenarioDir, "manifest.json"), "utf-8"));
    const imu = JSON.parse(fs.readFileSync(path.join(scenarioDir, "imu_burst_1000hz.json"), "utf-8"));
    const sync = JSON.parse(fs.readFileSync(path.join(scenarioDir, "sync_audio_video.json"), "utf-8"));
    const expected = JSON.parse(fs.readFileSync(path.join(scenarioDir, "expected_outcomes.json"), "utf-8"));

    const passingReport = evaluateScenarioTolerances({
      manifest,
      referenceImu: imu,
      actualImu: imu,
      referenceSync: sync,
      actualSync: sync,
      expectedBallistics: expected,
      actualBallistics: expected,
    });
    assert.equal(passingReport.passed, true);
    assert.equal(passingReport.failures.length, 0);

    const driftedImu = structuredClone(imu);
    driftedImu.compensated_clubhead_at_impact.compensated_face_angle_deg += 0.75; // exceeds ±0.30°
    driftedImu.impact_clipping_signature.strike_zone = "toe"; // expected "center"

    const driftedBallistics = structuredClone(expected);
    driftedBallistics.flight_summary.carry_distance_m += 1.4; // exceeds ±0.50 m

    const failingReport = evaluateScenarioTolerances({
      manifest,
      referenceImu: imu,
      actualImu: driftedImu,
      referenceSync: sync,
      actualSync: sync,
      expectedBallistics: expected,
      actualBallistics: driftedBallistics,
    });
    assert.equal(failingReport.passed, false);
    assert.ok(failingReport.failures.some((f: { metric: string }) => f.metric === "compensated_face_angle_deg"));
    assert.ok(failingReport.failures.some((f: { metric: string }) => f.metric === "strike_zone"));
    assert.ok(failingReport.failures.some((f: { metric: string }) => f.metric === "carry_distance_m"));
  });
});

describe("Seam 3 — End-to-End Offline Simulation Suite Runner (REQ-SIM-001, REQ-SIM-002, REQ-SIM-003)", () => {
  it("executes all 4 normative scenarios in fixtures/simulation/ offline with 100% schema and tolerance pass", () => {
    const suiteReport = runSimulationSuite({
      schemasDir: SCHEMAS_DIR,
      fixturesDir: FIXTURES_DIR,
    });
    assert.equal(suiteReport.passed, true);
    assert.equal(suiteReport.scenarios.length, 4);
    for (const scenario of suiteReport.scenarios) {
      assert.equal(scenario.schemaValid, true, `Scenario ${scenario.scenarioId} failed schema validation`);
      assert.equal(scenario.tolerancesPassed, true, `Scenario ${scenario.scenarioId} failed tolerances`);
    }
  });
});

