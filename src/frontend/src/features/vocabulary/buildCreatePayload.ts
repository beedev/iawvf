import type { AddFieldRequest, CreateEntityRequest, FieldDataType } from '../../lib/types/api';

/** The raw, possibly-untrimmed fields the Add-entity form holds. */
export interface AddEntityFormState {
  key: string;
  label: string;
  description: string;
}

/** The raw, possibly-untrimmed fields the Add-field form holds. */
export interface AddFieldFormState {
  /** The entity SELECTED from the dropdown (canonical key), never free-typed. */
  entityKey: string;
  name: string;
  dataType: FieldDataType;
  /** A list of allowed (enum) values entered as tags. */
  allowedValues: string[];
  description: string;
}

/**
 * Builds the {@link CreateEntityRequest} POST payload from the Add-entity form. Trims all text, sends
 * `key` always, and OMITS optional `label`/`description` when blank so the server derives the label.
 * Pure + side-effect-free for testability.
 */
export function buildCreateEntityPayload(form: AddEntityFormState): CreateEntityRequest {
  const key = form.key.trim();
  const label = form.label.trim();
  const description = form.description.trim();

  const payload: CreateEntityRequest = { key };
  if (label.length > 0) payload.label = label;
  if (description.length > 0) payload.description = description;
  return payload;
}

/**
 * Builds the {@link AddFieldRequest} POST body from the Add-field form. The entity is supplied
 * SEPARATELY (the route segment) and is intentionally NOT part of this body. Trims the name, includes
 * `dataType` always, normalizes allowed values (trim, drop blanks, de-duplicate, preserving order),
 * omits an empty `allowedValues` array and a blank description. Pure + side-effect-free.
 */
export function buildAddFieldPayload(form: AddFieldFormState): AddFieldRequest {
  const name = form.name.trim();
  const description = form.description.trim();

  const allowedValues = Array.from(
    new Set(form.allowedValues.map((v) => v.trim()).filter((v) => v.length > 0)),
  );

  const payload: AddFieldRequest = { name, dataType: form.dataType };
  if (allowedValues.length > 0) payload.allowedValues = allowedValues;
  if (description.length > 0) payload.description = description;
  return payload;
}
