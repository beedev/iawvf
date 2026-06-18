/**
 * N4 — Authoring tooling, exposed as an injectable NestJS service.
 *
 * Wraps the four pure authoring capabilities and grounds the registry-aware ones
 * (the linter) on the LIVE registry projection + DB reference data, so authors are
 * always validated against the current source of truth. The HTTP surface arrives
 * in N6; this service is the seam those endpoints will call.
 */

import { Injectable } from '@nestjs/common';

import { DbReferenceDataLoader } from '../rules/db-reference-data.provider';
import { VocabularyProjectionService } from '../rules/vocabulary-projection.service';
import { deserializeRule } from '../vdf/serializer';
import { RuleDefinition } from '../vdf/types';

import { DryRunPreviewer, DryRunResult } from './dry-run-previewer';
import { RoundTripParaphraser } from './round-trip-paraphraser';
import { SchemaValidator, SchemaValidationResult } from './schema-validator';
import { LintReport, VocabularyLinter } from './vocabulary-linter';

@Injectable()
export class AuthoringService {
  private readonly schemaValidator = new SchemaValidator();
  private readonly paraphraser = new RoundTripParaphraser();

  constructor(
    private readonly vocabulary: VocabularyProjectionService,
    private readonly referenceLoader: DbReferenceDataLoader,
  ) {}

  /** Validates a rule's JSON wire form against `rule.schema.json`. */
  validateSchema(json: string): SchemaValidationResult {
    return this.schemaValidator.validateRule(json);
  }

  /** Lints an already-deserialized rule against the live registry vocabulary. */
  async lint(rule: RuleDefinition): Promise<LintReport> {
    const linter = await this.buildLinter();
    return linter.lint(rule);
  }

  /** Deserializes the JSON then lints against the live registry vocabulary. */
  async lintJson(ruleJson: string): Promise<LintReport> {
    const linter = await this.buildLinter();
    return linter.lintJson(ruleJson);
  }

  /** Back-translates a rule to a deterministic English sentence. */
  paraphrase(rule: RuleDefinition): string {
    return this.paraphraser.paraphrase(rule);
  }

  /** Back-translates a rule's JSON to a deterministic English sentence. */
  paraphraseJson(ruleJson: string): string {
    return this.paraphraser.paraphrase(deserializeRule(ruleJson));
  }

  /** Dry-runs a candidate rule over the repo fixtures corpus (read-only). */
  async previewFromRepoFixtures(rule: RuleDefinition): Promise<DryRunResult> {
    const references = await this.referenceLoader.load();
    return new DryRunPreviewer(references).previewFromRepoFixtures(rule);
  }

  /** Builds a linter grounded on the current registry projection + DB references. */
  private async buildLinter(): Promise<VocabularyLinter> {
    const [vocabulary, references] = await Promise.all([
      this.vocabulary.project(),
      this.referenceLoader.load(),
    ]);
    return new VocabularyLinter(vocabulary.subjects, references);
  }
}
