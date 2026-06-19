import type {
  AddFieldRequest,
  CreateEntityRequest,
  FieldDataType,
  TermProposal,
} from '../../lib/types/api';

/**
 * The editable form state a {@link TermProposal} card holds. Seeded from the proposal, then tweaked by
 * the Admin before the term is added. The entity/field IDENTITY (which entity, which field name) is
 * fixed by the proposal and is NOT user-editable here — only the type and the allowed-value set are —
 * so the proposed `entity.field` path remains the thing the now-grounded rule will resolve against.
 */
export interface TermProposalFormState {
  dataType: FieldDataType;
  /** The closed value set entered as tags (may be empty = any value of the data type). */
  allowedValues: string[];
}

/**
 * Seeds the editable form from a proposal: the interpreter's inferred data type and any inferred
 * allowed values (de-duplicated, blanks dropped, order preserved). Pure + side-effect-free.
 */
export function initialTermForm(proposal: TermProposal): TermProposalFormState {
  return {
    dataType: proposal.dataType,
    allowedValues: normalizeAllowedValues(proposal.allowedValues ?? []),
  };
}

/**
 * Builds the {@link CreateEntityRequest} for a proposal whose entity does NOT yet exist. The proposal's
 * `entity` is the canonical key; we omit `label`/`description` so the server derives the label and the
 * rationale is not persisted as a description (it is interpreter context, not governance metadata).
 * Pure + side-effect-free.
 */
export function buildCreateEntityPayload(proposal: TermProposal): CreateEntityRequest {
  return { key: proposal.entity.trim() };
}

/**
 * Builds the {@link AddFieldRequest} for a proposal, applying the Admin's edits. The entity is supplied
 * SEPARATELY (the route segment) and is intentionally NOT part of this body. The field name comes from
 * the proposal (fixed identity); the data type and allowed values come from the (possibly edited) form.
 * Allowed values are normalized (trim, drop blanks, de-duplicate, preserve order) and an empty set is
 * omitted. Pure + side-effect-free.
 */
export function buildAddFieldPayload(
  proposal: TermProposal,
  form: TermProposalFormState,
): AddFieldRequest {
  const allowedValues = normalizeAllowedValues(form.allowedValues);
  const payload: AddFieldRequest = { name: proposal.field.trim(), dataType: form.dataType };
  if (allowedValues.length > 0) payload.allowedValues = allowedValues;
  return payload;
}

/** Trim, drop blanks, de-duplicate, preserve first-seen order. */
function normalizeAllowedValues(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)));
}
