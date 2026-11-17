import fs from "node:fs";
import path from "node:path";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errorCode?: "ERR_SCHEMA_VALIDATION_FAILED";
  errors: ValidationIssue[];
}

export interface JsonSchemaNode {
  $schema?: string;
  $id?: string;
  $ref?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  oneOf?: JsonSchemaNode[];
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchemaNode>;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchemaNode;
}

export class SchemaRegistry {
  private readonly schemasById = new Map<string, JsonSchemaNode>();

  public static fromDirectory(schemasDir: string): SchemaRegistry {
    const registry = new SchemaRegistry();
    const files = fs
      .readdirSync(schemasDir)
      .filter((file) => file.endsWith(".schema.json"))
      .sort();

    for (const file of files) {
      const fullPath = path.join(schemasDir, file);
      const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as JsonSchemaNode;
      if (!raw.$id) {
        throw new Error(`Schema file ${file} is missing required $id`);
      }
      registry.schemasById.set(raw.$id, raw);
    }
    return registry;
  }

  public count(): number {
    return this.schemasById.size;
  }

  public validate(schemaId: string, payload: unknown): ValidationResult {
    const rootSchema = this.schemasById.get(schemaId);
    if (!rootSchema) {
      return {
        valid: false,
        errorCode: "ERR_SCHEMA_VALIDATION_FAILED",
        errors: [{ path: "$", message: `Unknown schema $id: ${schemaId}` }],
      };
    }

    const errors: ValidationIssue[] = [];
    this.validateNode(rootSchema, payload, "$", errors);

    if (errors.length > 0) {
      return {
        valid: false,
        errorCode: "ERR_SCHEMA_VALIDATION_FAILED",
        errors,
      };
    }
    return { valid: true, errors: [] };
  }

  private validateNode(
    schema: JsonSchemaNode,
    value: unknown,
    currentPath: string,
    errors: ValidationIssue[]
  ): void {
    if (schema.$ref) {
      const target = this.schemasById.get(schema.$ref);
      if (!target) {
        errors.push({ path: currentPath, message: `Unresolved $ref: ${schema.$ref}` });
        return;
      }
      this.validateNode(target, value, currentPath, errors);
      return;
    }

    if (schema.oneOf) {
      const matches = schema.oneOf.filter((branch) => {
        const branchErrors: ValidationIssue[] = [];
        this.validateNode(branch, value, currentPath, branchErrors);
        return branchErrors.length === 0;
      });
      if (matches.length !== 1) {
        errors.push({
          path: currentPath,
          message: `Value did not match exactly one branch of oneOf (matched ${matches.length})`,
        });
      }
      return;
    }

    if (schema.const !== undefined && value !== schema.const) {
      errors.push({
        path: currentPath,
        message: `Expected constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`,
      });
    }

    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      errors.push({
        path: currentPath,
        message: `Value ${JSON.stringify(value)} is not in enum ${JSON.stringify(schema.enum)}`,
      });
    }

    if (schema.type !== undefined) {
      const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
      const matchesType = allowedTypes.some((t) => this.matchesJsonType(t, value));
      if (!matchesType) {
        errors.push({
          path: currentPath,
          message: `Expected type ${JSON.stringify(schema.type)}, got ${this.describeType(value)}`,
        });
        return;
      }
    }

    if (typeof value === "string") {
      if (schema.pattern !== undefined) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          errors.push({
            path: currentPath,
            message: `String "${value}" does not match pattern ${schema.pattern}`,
          });
        }
      }
    }

    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          path: currentPath,
          message: `Number ${value} is less than minimum ${schema.minimum}`,
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          path: currentPath,
          message: `Number ${value} is greater than maximum ${schema.maximum}`,
        });
      }
    }

    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push({
          path: currentPath,
          message: `Array length ${value.length} is less than minItems ${schema.minItems}`,
        });
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({
          path: currentPath,
          message: `Array length ${value.length} is greater than maxItems ${schema.maxItems}`,
        });
      }
      if (schema.items) {
        value.forEach((item, index) => {
          this.validateNode(schema.items!, item, `${currentPath}[${index}]`, errors);
        });
      }
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (schema.required) {
        for (const reqKey of schema.required) {
          if (!(reqKey in record)) {
            errors.push({
              path: `${currentPath}.${reqKey}`,
              message: `Missing required property "${reqKey}"`,
            });
          }
        }
      }

      if (schema.additionalProperties === false && schema.properties) {
        for (const key of Object.keys(record)) {
          if (!(key in schema.properties)) {
            errors.push({
              path: `${currentPath}.${key}`,
              message: `Additional property "${key}" is not allowed`,
            });
          }
        }
      }

      if (schema.properties) {
        for (const [propKey, propSchema] of Object.entries(schema.properties)) {
          if (propKey in record) {
            this.validateNode(propSchema, record[propKey], `${currentPath}.${propKey}`, errors);
          }
        }
      }
    }
  }

  private matchesJsonType(expectedType: string, value: unknown): boolean {
    switch (expectedType) {
      case "null":
        return value === null;
      case "boolean":
        return typeof value === "boolean";
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "integer":
        return typeof value === "number" && Number.isInteger(value);
      case "array":
        return Array.isArray(value);
      case "object":
        return value !== null && typeof value === "object" && !Array.isArray(value);
      default:
        return false;
    }
  }

  private describeType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }
}

export interface ExpectedTolerances {
  max_sync_offset_error_ms: number;
  max_face_angle_error_deg: number;
  max_dynamic_loft_error_deg: number;
  max_impact_location_error_mm: number;
  max_carry_distance_error_m: number;
  max_lateral_offline_error_m: number;
}

export interface SimulationManifest {
  scenario_id: string;
  title: string;
  verified_requirements: string[];
  expected_tolerances: ExpectedTolerances;
  [key: string]: unknown;
}

export interface ImuFixturePayload {
  impact_clipping_signature: {
    estimated_horizontal_impact_mm: number;
    strike_zone: string;
  };
  compensated_clubhead_at_impact: {
    compensated_face_angle_deg: number;
    compensated_dynamic_loft_deg: number;
  };
  [key: string]: unknown;
}

export interface SyncFixturePayload {
  impact_sync_anchor: {
    aligned_sync_offset_ms: number;
  };
  [key: string]: unknown;
}

export interface BallisticsFixturePayload {
  flight_summary: {
    carry_distance_m: number;
    lateral_offline_carry_m: number;
  } | null;
  [key: string]: unknown;
}

export interface ToleranceFailure {
  metric: string;
  expected: number | string;
  actual: number | string;
  absError?: number;
  maxAllowedError?: number;
}

export interface ToleranceEvaluationReport {
  passed: boolean;
  failures: ToleranceFailure[];
}

export interface EvaluateScenarioTolerancesInput {
  manifest: SimulationManifest;
  referenceImu: ImuFixturePayload;
  actualImu: ImuFixturePayload;
  referenceSync: SyncFixturePayload;
  actualSync: SyncFixturePayload;
  expectedBallistics: BallisticsFixturePayload;
  actualBallistics: BallisticsFixturePayload;
}

export function evaluateScenarioTolerances(
  input: EvaluateScenarioTolerancesInput
): ToleranceEvaluationReport {
  const {
    manifest,
    referenceImu,
    actualImu,
    referenceSync,
    actualSync,
    expectedBallistics,
    actualBallistics,
  } = input;
  const tol = manifest.expected_tolerances;
  const failures: ToleranceFailure[] = [];

  const checkNumeric = (
    metric: string,
    expected: number,
    actual: number,
    maxAllowedError: number
  ): void => {
    const absError = Math.abs(actual - expected);
    if (absError > maxAllowedError + 1e-9) {
      failures.push({
        metric,
        expected,
        actual,
        absError: Number(absError.toFixed(6)),
        maxAllowedError,
      });
    }
  };

  checkNumeric(
    "aligned_sync_offset_ms",
    referenceSync.impact_sync_anchor.aligned_sync_offset_ms,
    actualSync.impact_sync_anchor.aligned_sync_offset_ms,
    tol.max_sync_offset_error_ms
  );

  checkNumeric(
    "compensated_face_angle_deg",
    referenceImu.compensated_clubhead_at_impact.compensated_face_angle_deg,
    actualImu.compensated_clubhead_at_impact.compensated_face_angle_deg,
    tol.max_face_angle_error_deg
  );

  checkNumeric(
    "compensated_dynamic_loft_deg",
    referenceImu.compensated_clubhead_at_impact.compensated_dynamic_loft_deg,
    actualImu.compensated_clubhead_at_impact.compensated_dynamic_loft_deg,
    tol.max_dynamic_loft_error_deg
  );

  checkNumeric(
    "estimated_horizontal_impact_mm",
    referenceImu.impact_clipping_signature.estimated_horizontal_impact_mm,
    actualImu.impact_clipping_signature.estimated_horizontal_impact_mm,
    tol.max_impact_location_error_mm
  );

  if (
    referenceImu.impact_clipping_signature.strike_zone !==
    actualImu.impact_clipping_signature.strike_zone
  ) {
    failures.push({
      metric: "strike_zone",
      expected: referenceImu.impact_clipping_signature.strike_zone,
      actual: actualImu.impact_clipping_signature.strike_zone,
    });
  }

  if (expectedBallistics.flight_summary && actualBallistics.flight_summary) {
    checkNumeric(
      "carry_distance_m",
      expectedBallistics.flight_summary.carry_distance_m,
      actualBallistics.flight_summary.carry_distance_m,
      tol.max_carry_distance_error_m
    );

    checkNumeric(
      "lateral_offline_carry_m",
      expectedBallistics.flight_summary.lateral_offline_carry_m,
      actualBallistics.flight_summary.lateral_offline_carry_m,
      tol.max_lateral_offline_error_m
    );
  } else if (expectedBallistics.flight_summary !== actualBallistics.flight_summary) {
    failures.push({
      metric: "flight_summary",
      expected: expectedBallistics.flight_summary ? "non-null" : "null",
      actual: actualBallistics.flight_summary ? "non-null" : "null",
    });
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export interface ScenarioExecutionInput {
  manifest: SimulationManifest;
  imu: ImuFixturePayload;
  sync: SyncFixturePayload;
  expectedBallistics: BallisticsFixturePayload;
}

export interface ScenarioExecutionOutput {
  actualImu: ImuFixturePayload;
  actualSync: SyncFixturePayload;
  actualBallistics: BallisticsFixturePayload;
}

export type SimulationPipelineAdapter = (
  input: ScenarioExecutionInput
) => ScenarioExecutionOutput;

export interface ScenarioRunReport {
  scenarioId: string;
  title: string;
  verifiedRequirements: string[];
  schemaValid: boolean;
  schemaErrors: ValidationIssue[];
  tolerancesPassed: boolean;
  toleranceFailures: ToleranceFailure[];
}

export interface SimulationSuiteReport {
  passed: boolean;
  totalSchemasLoaded: number;
  scenarios: ScenarioRunReport[];
}

export interface RunSimulationSuiteOptions {
  schemasDir: string;
  fixturesDir: string;
  pipelineAdapter?: SimulationPipelineAdapter;
}

const CANONICAL_SCHEMAS = {
  manifest: "https://kinetra.golf/schemas/simulation-fixture.schema.json",
  imu: "https://kinetra.golf/schemas/imu-telemetry.schema.json",
  sync: "https://kinetra.golf/schemas/video-sync-session.schema.json",
  ballistics: "https://kinetra.golf/schemas/ballistic-trajectory.schema.json",
} as const;

export function runSimulationSuite(
  options: RunSimulationSuiteOptions
): SimulationSuiteReport {
  const registry = SchemaRegistry.fromDirectory(options.schemasDir);
  const scenarioDirs = fs
    .readdirSync(options.fixturesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const adapter: SimulationPipelineAdapter =
    options.pipelineAdapter ??
    ((input) => ({
      actualImu: input.imu,
      actualSync: input.sync,
      actualBallistics: input.expectedBallistics,
    }));

  const scenarios: ScenarioRunReport[] = [];

  for (const dirName of scenarioDirs) {
    const scenarioPath = path.join(options.fixturesDir, dirName);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(scenarioPath, "manifest.json"), "utf-8")
    ) as SimulationManifest;
    const imu = JSON.parse(
      fs.readFileSync(path.join(scenarioPath, "imu_burst_1000hz.json"), "utf-8")
    ) as ImuFixturePayload;
    const sync = JSON.parse(
      fs.readFileSync(path.join(scenarioPath, "sync_audio_video.json"), "utf-8")
    ) as SyncFixturePayload;
    const expectedBallistics = JSON.parse(
      fs.readFileSync(path.join(scenarioPath, "expected_outcomes.json"), "utf-8")
    ) as BallisticsFixturePayload;

    const schemaChecks = [
      registry.validate(CANONICAL_SCHEMAS.manifest, manifest),
      registry.validate(CANONICAL_SCHEMAS.imu, imu),
      registry.validate(CANONICAL_SCHEMAS.sync, sync),
      registry.validate(CANONICAL_SCHEMAS.ballistics, expectedBallistics),
    ];

    const schemaErrors = schemaChecks.flatMap((check) => check.errors);
    const schemaValid = schemaErrors.length === 0;

    let tolerancesPassed = false;
    let toleranceFailures: ToleranceFailure[] = [];

    if (schemaValid) {
      const executed = adapter({ manifest, imu, sync, expectedBallistics });
      const outputChecks = [
        registry.validate(CANONICAL_SCHEMAS.imu, executed.actualImu),
        registry.validate(CANONICAL_SCHEMAS.sync, executed.actualSync),
        registry.validate(CANONICAL_SCHEMAS.ballistics, executed.actualBallistics),
      ];
      const outputErrors = outputChecks.flatMap((check) => check.errors);
      if (outputErrors.length > 0) {
        schemaErrors.push(...outputErrors);
      } else {
        const tolReport = evaluateScenarioTolerances({
          manifest,
          referenceImu: imu,
          actualImu: executed.actualImu,
          referenceSync: sync,
          actualSync: executed.actualSync,
          expectedBallistics,
          actualBallistics: executed.actualBallistics,
        });
        tolerancesPassed = tolReport.passed;
        toleranceFailures = tolReport.failures;
      }
    }

    scenarios.push({
      scenarioId: manifest.scenario_id,
      title: manifest.title,
      verifiedRequirements: manifest.verified_requirements,
      schemaValid: schemaErrors.length === 0,
      schemaErrors,
      tolerancesPassed,
      toleranceFailures,
    });
  }

  const passed =
    scenarios.length > 0 &&
    scenarios.every((s) => s.schemaValid && s.tolerancesPassed);

  return {
    passed,
    totalSchemasLoaded: registry.count(),
    scenarios,
  };
}

