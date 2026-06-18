import type { CreateVocabularySubjectRequest, SubjectDataType } from '../../lib/types/api';

/** The raw, possibly-untrimmed fields the Add-property form holds. */
export interface AddPropertyFormState {
  path: string;
  dataType: SubjectDataType;
  label: string;
  description: string;
}

/**
 * Builds the {@link CreateVocabularySubjectRequest} POST payload from the Add-property form. Trims all
 * text, sends `path`/`dataType` always, and OMITS optional `label`/`description` when blank (so the
 * server derives the label) rather than sending empty strings. Pure + side-effect-free for testability.
 */
export function buildCreatePayload(form: AddPropertyFormState): CreateVocabularySubjectRequest {
  const path = form.path.trim();
  const label = form.label.trim();
  const description = form.description.trim();

  const payload: CreateVocabularySubjectRequest = {
    path,
    dataType: form.dataType,
  };
  if (label.length > 0) payload.label = label;
  if (description.length > 0) payload.description = description;
  return payload;
}
