/**
 * Schema validation for rule JSON against `rule.schema.json` (JSON Schema
 * draft-2020-12), using the same Ajv2020 stack N1 uses for fact validation.
 *
 * A faithful port of {@link ../../backend/IAW.Vdf.Authoring/schema/SchemaValidator.cs}:
 * malformed JSON is caught and surfaced as a single error rather than throwing,
 * and structural violations are flattened into `{ path, message }` records keyed
 * by the offending instance location. This is the structural gate authoring runs
 * BEFORE deserialization, so authors get precise feedback on wire-shape mistakes.
 */

import * as fs from 'fs';
import * as path from 'path';

import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

/** A single schema-validation error at a given instance path. */
export interface SchemaError {
  /** The JSON-Pointer instance path to the offending node ("" for the root). */
  path: string;
  /** A human-readable description of the violation. */
  message: string;
}

/** The result of validating a rule's JSON. */
export interface SchemaValidationResult {
  /** True when the JSON parses and satisfies the schema. */
  valid: boolean;
  /** All violations; empty when {@link valid} is true. */
  errors: SchemaError[];
}

/**
 * Locates `rule.schema.json` by walking up from this module's directory. Works
 * under both ts-jest (running from `src/`) and the compiled `dist/` build, since
 * the schema sits in a sibling `schema/` directory in both trees. Falls back to
 * the repo source path so the validator never silently loses its schema.
 */
function loadSchemaText(): string {
  const candidates: string[] = [];
  let dir: string | undefined = __dirname;
  while (dir !== undefined) {
    candidates.push(path.join(dir, 'schema', 'rule.schema.json'));
    candidates.push(path.join(dir, 'authoring', 'schema', 'rule.schema.json'));
    const parent = path.dirname(dir);
    dir = parent === dir ? undefined : parent;
  }
  candidates.push(
    '/Users/bharath/Desktop/NeoGenomics/IAW/src/server/src/authoring/schema/rule.schema.json',
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }
  throw new Error('Could not locate rule.schema.json for the SchemaValidator.');
}

/**
 * Validates a rule's JSON wire form against `rule.schema.json`. Stateless and
 * deterministic: the schema is compiled once on construction and reused.
 */
export class SchemaValidator {
  private readonly validate: ValidateFunction;

  constructor() {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const schema = JSON.parse(loadSchemaText()) as Record<string, unknown>;
    this.validate = ajv.compile(schema);
  }

  /**
   * Parses then validates the supplied JSON string against the rule schema.
   * Malformed JSON yields a single root-level error rather than throwing.
   */
  validateRule(json: string): SchemaValidationResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        errors: [{ path: '', message: `Invalid JSON: ${message}` }],
      };
    }

    const ok = this.validate(parsed);
    if (ok) {
      return { valid: true, errors: [] };
    }

    const errors = (this.validate.errors ?? []).map(toSchemaError);
    return { valid: false, errors };
  }
}

/** Flattens an Ajv {@link ErrorObject} into a `{ path, message }` record. */
function toSchemaError(error: ErrorObject): SchemaError {
  const instancePath = error.instancePath || '';
  const detail = error.message ?? 'is invalid';
  // Surface the missing/extra property name so the message is self-describing.
  const params = error.params as Record<string, unknown>;
  const property =
    typeof params.missingProperty === 'string'
      ? ` '${params.missingProperty}'`
      : typeof params.additionalProperty === 'string'
        ? ` '${params.additionalProperty}'`
        : '';
  return {
    path: instancePath,
    message: `${error.keyword}: ${detail}${property}`.trim(),
  };
}
