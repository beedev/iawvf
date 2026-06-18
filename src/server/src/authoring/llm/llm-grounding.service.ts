/**
 * Assembles the LLM {@link GroundingVocabulary} from the LIVE sources of truth.
 *
 * Subjects come from the N3 {@link VocabularyProjectionService} (registry-projected
 * Active `entity.field` paths + types + allowedValues). Operators and outcomes are
 * the engine's static closed enums ({@link OPERATORS} / {@link OUTCOMES}). Reference
 * keys come from the DB-backed reference provider. This is the single seam that
 * guarantees the model is grounded in exactly what the deterministic gate will later
 * validate against.
 */

import { Injectable } from '@nestjs/common';

import { GroundingVocabulary } from './interpreter';

import { DbReferenceDataLoader } from '../../rules/db-reference-data.provider';
import {
  GroundedSubject,
  VocabularyProjectionService,
} from '../../rules/vocabulary-projection.service';
import { OPERATORS, OUTCOMES } from '../../vdf/vocabulary.constants';

@Injectable()
export class LlmGroundingService {
  constructor(
    private readonly vocabulary: VocabularyProjectionService,
    private readonly referenceLoader: DbReferenceDataLoader,
  ) {}

  /** Builds the closed grounding vocabulary from the current live registry + references. */
  async build(): Promise<GroundingVocabulary> {
    const [projection, references] = await Promise.all([
      this.vocabulary.project(),
      this.referenceLoader.load(),
    ]);
    return this.assemble(projection.subjects, references.referenceKeys());
  }

  /**
   * Builds a grounding vocabulary narrowed to {@link subjects} (a registry-projected
   * subset). Operators, outcomes, and reference keys remain the full engine set —
   * only the SUBJECT surface is scoped (mirrors the .NET scoped-interpret semantics).
   */
  async buildScoped(
    subjects: readonly GroundedSubject[],
  ): Promise<GroundingVocabulary> {
    const references = await this.referenceLoader.load();
    return this.assemble(subjects, references.referenceKeys());
  }

  private assemble(
    subjects: readonly GroundedSubject[],
    references: readonly string[],
  ): GroundingVocabulary {
    return {
      subjects,
      operators: OPERATORS,
      outcomes: OUTCOMES,
      references,
    };
  }
}
