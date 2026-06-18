/**
 * Test-only helpers for locating and loading the shared rule corpus and fixtures
 * from disk. Walks up from this file to the repo root (the directory containing
 * `rules/` and `fixtures/`), mirroring CorpusRegressionTests.FindDir.
 */

import * as fs from 'fs';
import * as path from 'path';

import { JsonObject } from '../types';

function findDir(name: string): string {
  let dir: string | undefined = __dirname;
  while (dir !== undefined) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    dir = parent === dir ? undefined : parent;
  }
  throw new Error(
    `Could not locate '${name}' directory by walking up from ${__dirname}.`,
  );
}

export const RULES_DIR = findDir('rules');
export const FIXTURES_DIR = findDir('fixtures');
export const REFERENCE_DATA_PATH = path.join(RULES_DIR, 'reference-data.json');

/** The fixed clock instant used by the .NET parity oracle. */
export const FIXED_NOW = '2026-06-17T12:00:00+00:00';

/** Reads a rule file's raw JSON. */
export function readRuleJson(key: string): string {
  return fs.readFileSync(path.join(RULES_DIR, `${key}.json`), 'utf8');
}

/** Reads a fixture's parsed fact object. */
export function loadFixture(name: string): JsonObject {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
  return JSON.parse(raw) as JsonObject;
}

/** Reads the reference-data JSON string. */
export function readReferenceDataJson(): string {
  return fs.readFileSync(REFERENCE_DATA_PATH, 'utf8');
}
