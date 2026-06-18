/**
 * Assembles the LLM {@link GroundingVocabulary} from the LIVE sources of truth.
 *
 * Subjects come from the N3 {@link VocabularyProjectionService} (registry-projected
 * Active `entity.field` paths + types + allowedValues). Operators and outcomes are
 * the engine's static closed enums (mirrors the serializer). Reference keys come from
 * the DB-backed reference provider. This is the single seam that guarantees the model
 * is grounded in exactly what the deterministic gate will later validate against.
 */

import { Injectable } from '@nestjs/common';

import { GroundingVocabulary } from './interpreter';

import { DbReferenceDataLoader } from '../../rules/db-reference-data.provider';
import { VocabularyProjectionService } from '../../rules/vocabulary-projection.service';
import { OperatorKind, OutcomeType } from '../../vdf/types';

/** The engine's closed operator vocabulary (mirrors {@link OperatorKind}). */
const OPERATORS: readonly OperatorKind[] = [
  'IsPresent',
  'IsAbsent',
  'Equals',
  'NotEquals',
  'InSet',
  'NotInSet',
  'GreaterThan',
  'LessThan',
  'GreaterOrEqual',
  'LessOrEqual',
  'WithinRange',
  'Matches',
  'IsCompatibleWith',
  'IsEligibleFor',
  'Exists',
];

/** The engine's closed outcome vocabulary (mirrors {@link OutcomeType}). */
const OUTCOMES: readonly OutcomeType[] = [
  'Continue',
  'Suppressed',
  'CompleteHold',
  'PartialHold',
  'Warning',
  'ComplianceAlert',
  'RouteToReview',
  'RouteToQueue',
  'Escalate',
  'SetValue',
  'ApplyDefault',
  'CalculateValue',
  'CreatePlaceholder',
  'CreateIncident',
  'CreateTask',
  'PreventAction',
  'AllowAction',
];

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
    return {
      subjects: projection.subjects,
      operators: OPERATORS,
      outcomes: OUTCOMES,
      references: references.referenceKeys(),
    };
  }
}
