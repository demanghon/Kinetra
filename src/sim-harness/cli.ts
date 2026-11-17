import path from "node:path";
import process from "node:process";
import { runSimulationSuite } from "./index.ts";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const SCHEMAS_DIR = path.join(ROOT_DIR, "schemas");
const FIXTURES_DIR = path.join(ROOT_DIR, "fixtures", "simulation");

const report = runSimulationSuite({
  schemasDir: SCHEMAS_DIR,
  fixturesDir: FIXTURES_DIR,
});

console.log(
  `[Kinetra sim-harness] Loaded ${report.totalSchemasLoaded} schemas and ${report.scenarios.length} deterministic scenarios.`
);

for (const scenario of report.scenarios) {
  const status = scenario.schemaValid && scenario.tolerancesPassed ? "PASS" : "FAIL";
  console.log(
    `  [${status}] ${scenario.scenarioId} — ${scenario.title} (${scenario.verifiedRequirements.join(", ")})`
  );
  for (const err of scenario.schemaErrors) {
    console.error(`    Schema Error at ${err.path}: ${err.message}`);
  }
  for (const fail of scenario.toleranceFailures) {
    console.error(
      `    Tolerance Drift on ${fail.metric}: expected=${fail.expected}, actual=${fail.actual} (maxAllowed=${fail.maxAllowedError ?? 0})`
    );
  }
}

if (!report.passed) {
  process.exit(1);
}
