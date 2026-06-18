/**
 * The engine's CLOSED operator and outcome vocabularies, as flat string lists.
 *
 * These mirror {@link OperatorKind} and {@link OutcomeType} in {@link ./types}
 * name-for-name and are the single source of truth for the authoring vocabulary
 * tree (N6 `/api/authoring/vocabulary`) and the LLM grounding prompt (N5). Keeping
 * them here — adjacent to the engine types they enumerate — avoids duplicating the
 * lists across the projection service and the grounding service.
 */

import { OperatorKind, OutcomeType } from './types';

/** The engine's closed operator vocabulary (mirrors {@link OperatorKind}). */
export const OPERATORS: readonly OperatorKind[] = [
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
export const OUTCOMES: readonly OutcomeType[] = [
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
