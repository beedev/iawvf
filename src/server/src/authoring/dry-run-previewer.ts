/**
 * Read-only dry-run preview of a CANDIDATE rule over a fixtures corpus.
 *
 * A faithful port of {@link ../../backend/IAW.Vdf.Authoring/DryRun/DryRunPreviewer.cs}:
 * the candidate is the ONLY rule in a throwaway engine, every produced outcome is
 * routed to a collecting (no-op) handler, and the engine already clones the facts —
 * so previewing has zero side effects on persisted state or the caller's input.
 * Each fixture yields a hit: did the rule apply, what did it produce, and why.
 */

import * as fs from 'fs';
import * as path from 'path';

import { FixedClock } from '../vdf/clock';
import { VdfEngine, OutcomeHandler } from '../vdf/engine';
import { ReferenceDataProvider } from '../vdf/reference-data';
import { JsonObject, Outcome, OutcomeType, RuleDefinition } from '../vdf/types';

/** The fixed instant a preview runs at (the corpus parity oracle's "now"). */
const PREVIEW_NOW = '2026-06-17T12:00:00+00:00';

/** The result of running the candidate rule against a single fixture. */
export interface DryRunHit {
  /** The fixture file name (without extension). */
  fixtureName: string;
  /** Whether the rule's AppliesWhen guard held (the rule was evaluated). */
  applied: boolean;
  /** The outcome type produced, if the rule produced one. */
  produced: OutcomeType | null;
  /** The reason string from the produced outcome, if any. */
  reason: string | null;
}

/** Summary of a dry-run preview over a fixtures corpus. */
export interface DryRunResult {
  /** Total fixtures evaluated. */
  evaluated: number;
  /** Per-fixture hit records. */
  hits: DryRunHit[];
}

/**
 * A no-op {@link OutcomeHandler} that records nothing externally — it exists only
 * to satisfy the engine's dispatch loop without mutating any state, guaranteeing
 * the preview is side-effect free.
 */
class CollectingOutcomeHandler implements OutcomeHandler {
  canHandle(): boolean {
    return true;
  }
  handle(): void {
    // Intentionally empty: a dry run produces no real-world effects.
  }
}

/** Evaluates a candidate rule against fact fixtures in a no-side-effects sandbox. */
export class DryRunPreviewer {
  constructor(private readonly references: ReferenceDataProvider) {}

  /**
   * Runs the candidate against each named fixture and returns per-fixture hits.
   * The engine clones each fact document, so inputs are never mutated.
   */
  preview(
    candidate: RuleDefinition,
    fixtures: ReadonlyArray<{ name: string; facts: JsonObject }>,
  ): DryRunResult {
    const engine = new VdfEngine(
      [candidate],
      this.references,
      new FixedClock(PREVIEW_NOW),
      [new CollectingOutcomeHandler()],
    );

    const hits: DryRunHit[] = fixtures.map(({ name, facts }) => {
      const result = engine.evaluate({ facts, asOf: PREVIEW_NOW });
      const trace = result.trace.find((t) => t.ruleKey === candidate.key);
      if (trace === undefined) {
        return {
          fixtureName: name,
          applied: false,
          produced: null,
          reason: null,
        };
      }
      const produced: Outcome | null = trace.produced;
      return {
        fixtureName: name,
        applied: trace.applied,
        produced: produced?.type ?? null,
        reason: produced?.reason ?? null,
      };
    });

    return { evaluated: hits.length, hits };
  }

  /**
   * Loads every `*.json` fixture from a directory (skipping `reference-data.json`)
   * and previews the candidate against them, ordered deterministically by name.
   */
  previewFromDirectory(
    candidate: RuleDefinition,
    fixturesDirectory: string,
  ): DryRunResult {
    const fixtures = fs
      .readdirSync(fixturesDirectory)
      .filter(
        (f) => f.endsWith('.json') && f.toLowerCase() !== 'reference-data.json',
      )
      .sort((a, b) => a.localeCompare(b))
      .map((file) => {
        const raw = fs.readFileSync(path.join(fixturesDirectory, file), 'utf8');
        return {
          name: path.basename(file, '.json'),
          facts: JSON.parse(raw) as JsonObject,
        };
      });

    return this.preview(candidate, fixtures);
  }

  /**
   * Locates the repository's `fixtures/` directory by walking up from this module
   * and previews the candidate against all fixtures.
   */
  previewFromRepoFixtures(candidate: RuleDefinition): DryRunResult {
    return this.previewFromDirectory(candidate, findFixturesDir());
  }
}

/** Walks up from this module to find the repo-root `fixtures/` directory. */
function findFixturesDir(): string {
  let dir: string | undefined = __dirname;
  while (dir !== undefined) {
    const candidate = path.join(dir, 'fixtures');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    dir = parent === dir ? undefined : parent;
  }
  const abs = '/Users/bharath/Desktop/NeoGenomics/IAW/fixtures';
  if (fs.existsSync(abs)) {
    return abs;
  }
  throw new Error("Could not locate the 'fixtures' directory.");
}
