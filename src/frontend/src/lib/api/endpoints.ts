import { request } from './client';
import type {
  AddFieldRequest,
  ApproveRequest,
  CreateEntityRequest,
  CreateRuleRequest,
  DryRunResponse,
  EvaluateRequest,
  EvaluateResponse,
  FactValidationResult,
  InterpretRequest,
  InterpretResponse,
  LintReport,
  LoginRequest,
  LoginResponse,
  LoginResponseWire,
  ParaphraseResponse,
  RegistryEntity,
  RegistryField,
  RuleDetail,
  RuleJson,
  RuleMutationResponse,
  RuleSummary,
  ValidateFactsRequest,
  VocabularyResponse,
} from '../types/api';

// ── Auth ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Authenticate against the Node API and NORMALIZE its response. The server returns
 * `{ accessToken, expiresIn (seconds), roles }`; the auth layer wants `{ token, expiresAt, roles }`,
 * so we map the token field and derive an absolute expiry from the lifetime at receipt time.
 */
export async function login(body: LoginRequest): Promise<LoginResponse> {
  const wire = await request<LoginResponseWire>('/api/auth/login', {
    method: 'POST',
    body,
    anonymous: true,
  });
  const expiresAt = new Date(Date.now() + wire.expiresIn * 1000).toISOString();
  return { token: wire.accessToken, expiresAt, roles: wire.roles };
}

// ── Authoring ─────────────────────────────────────────────────────────────────────────────────

/** The controlled authoring vocabulary (objects, properties, operators, outcomes). Any role. */
export function getVocabulary(signal?: AbortSignal): Promise<VocabularyResponse> {
  return request<VocabularyResponse>('/api/authoring/vocabulary', { signal });
}

export function interpret(
  body: InterpretRequest,
  signal?: AbortSignal,
): Promise<InterpretResponse> {
  return request<InterpretResponse>('/api/authoring/interpret', { method: 'POST', body, signal });
}

export function lint(ruleJson: RuleJson, signal?: AbortSignal): Promise<LintReport> {
  return request<LintReport>('/api/authoring/lint', { method: 'POST', body: { ruleJson }, signal });
}

export function paraphrase(ruleJson: RuleJson, signal?: AbortSignal): Promise<ParaphraseResponse> {
  return request<ParaphraseResponse>('/api/authoring/paraphrase', {
    method: 'POST',
    body: { ruleJson },
    signal,
  });
}

export function dryRun(ruleJson: RuleJson, signal?: AbortSignal): Promise<DryRunResponse> {
  return request<DryRunResponse>('/api/authoring/dry-run', {
    method: 'POST',
    body: { ruleJson },
    signal,
  });
}

// ── Rules repository ──────────────────────────────────────────────────────────────────────────

export function listRules(ruleSet?: string, signal?: AbortSignal): Promise<RuleSummary[]> {
  return request<RuleSummary[]>('/api/rules', { query: { ruleSet }, signal });
}

export function getRule(key: string, signal?: AbortSignal): Promise<RuleDetail> {
  return request<RuleDetail>(`/api/rules/${encodeURIComponent(key)}`, { signal });
}

export function createRule(body: CreateRuleRequest): Promise<RuleMutationResponse> {
  return request<RuleMutationResponse>('/api/rules', { method: 'POST', body });
}

export function approveRule(key: string, body: ApproveRequest): Promise<RuleMutationResponse> {
  return request<RuleMutationResponse>(`/api/rules/${encodeURIComponent(key)}/approve`, {
    method: 'POST',
    body,
  });
}

export function promoteRule(key: string): Promise<RuleMutationResponse> {
  return request<RuleMutationResponse>(`/api/rules/${encodeURIComponent(key)}/promote`, {
    method: 'POST',
  });
}

export function disableRule(key: string): Promise<RuleMutationResponse> {
  return request<RuleMutationResponse>(`/api/rules/${encodeURIComponent(key)}/disable`, {
    method: 'POST',
  });
}

// ── Evaluation ────────────────────────────────────────────────────────────────────────────────

export function evaluate(body: EvaluateRequest): Promise<EvaluateResponse> {
  return request<EvaluateResponse>('/api/evaluate', { method: 'POST', body });
}

// ── Entity registry (Admin-only vocabulary administration) ───────────────────────────────────────
//
// The registry models the controlled vocabulary as ENTITIES (top-level fact objects) that own FIELDS
// (their addressable properties). Reads are open to any authenticated principal; mutations require the
// Admin role (the API 403s otherwise). Field creation REQUIRES an existing entity (selected, not typed)
// — adding a field to a missing entity is a 404, which is the structural fix for free-text path drift.

/** Lists ALL entities (any status) with their fields. Used by the Vocabulary admin screen. */
export function listEntities(signal?: AbortSignal): Promise<RegistryEntity[]> {
  return request<RegistryEntity[]>('/api/registry/entities', { signal });
}

/** Creates a new entity. 201 on success; 409 on a case-insensitive duplicate key; 400 on invalid key. */
export function createEntity(body: CreateEntityRequest): Promise<RegistryEntity> {
  return request<RegistryEntity>('/api/registry/entities', { method: 'POST', body });
}

/** Adds a field to an EXISTING entity (selected by key). 201; 404 if the entity is gone; 409 on dup field. */
export function addField(entityKey: string, body: AddFieldRequest): Promise<RegistryField> {
  return request<RegistryField>(
    `/api/registry/entities/${encodeURIComponent(entityKey)}/fields`,
    { method: 'POST', body },
  );
}

/** Deprecates an entity (kept resolvable so live rules don't break). */
export function deprecateEntity(entityKey: string): Promise<RegistryEntity> {
  return request<RegistryEntity>(
    `/api/registry/entities/${encodeURIComponent(entityKey)}/deprecate`,
    { method: 'POST' },
  );
}

/** Deprecates a single field on an entity (kept resolvable). */
export function deprecateField(entityKey: string, name: string): Promise<RegistryField> {
  return request<RegistryField>(
    `/api/registry/entities/${encodeURIComponent(entityKey)}/fields/${encodeURIComponent(name)}/deprecate`,
    { method: 'POST' },
  );
}

/**
 * Retires (deletes) a DEPRECATED, unreferenced entity. 204 on success; 422 when not yet deprecated;
 * 409 when still referenced (the conflict detail explains the block).
 */
export function retireEntity(entityKey: string): Promise<void> {
  return request<void>(`/api/registry/entities/${encodeURIComponent(entityKey)}`, {
    method: 'DELETE',
  });
}

/** Retires (deletes) a DEPRECATED, unreferenced field. Same gates as entity retirement. */
export function retireField(entityKey: string, name: string): Promise<void> {
  return request<void>(
    `/api/registry/entities/${encodeURIComponent(entityKey)}/fields/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  );
}

/** Validates a fact document against the registry schema. Demonstrates the typed registry. */
export function validateFacts(body: ValidateFactsRequest): Promise<FactValidationResult> {
  return request<FactValidationResult>('/api/registry/validate', { method: 'POST', body });
}
