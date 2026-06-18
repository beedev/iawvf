import { request } from './client';
import type {
  ApproveRequest,
  CreateRuleRequest,
  CreateVocabularySubjectRequest,
  DryRunResponse,
  EvaluateRequest,
  EvaluateResponse,
  InterpretRequest,
  InterpretResponse,
  LintReport,
  LoginRequest,
  LoginResponse,
  ParaphraseResponse,
  RuleDetail,
  RuleJson,
  RuleMutationResponse,
  RuleSummary,
  VocabularyAdminList,
  VocabularyImpact,
  VocabularyResponse,
  VocabularySubject,
} from '../types/api';

// ── Auth ──────────────────────────────────────────────────────────────────────────────────────

export function login(body: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', { method: 'POST', body, anonymous: true });
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

// ── Vocabulary administration (Admin-only) ──────────────────────────────────────────────────────
//
// Subject paths contain dots and may end in `[]`, which are awkward (and lossy) inside a route segment.
// The controller accepts a `?path=` query override that wins over the route segment, so we pass the path
// as a query parameter and use a stable `current` placeholder for the route segment — unambiguous and
// avoiding any double-encoding pitfalls.

const PATH_SEGMENT_PLACEHOLDER = 'current';

/** Lists ALL governed subjects (including deprecated), grouped object → properties. Admin only. */
export function getVocabularyAdmin(signal?: AbortSignal): Promise<VocabularyAdminList> {
  return request<VocabularyAdminList>('/api/vocabulary', { signal });
}

/** Creates a new Active governed subject. 201 on success; 409 if the path exists; 400 on invalid input. */
export function createVocabularySubject(
  body: CreateVocabularySubjectRequest,
): Promise<VocabularySubject> {
  return request<VocabularySubject>('/api/vocabulary', { method: 'POST', body });
}

/** Returns the active rules that reference a subject path (impact analysis). */
export function getVocabularyImpact(
  path: string,
  signal?: AbortSignal,
): Promise<VocabularyImpact> {
  return request<VocabularyImpact>(`/api/vocabulary/${PATH_SEGMENT_PLACEHOLDER}/impact`, {
    query: { path },
    signal,
  });
}

/** Deprecates a subject (still resolvable, hidden from new authoring). Returns the impact list. */
export function deprecateVocabularySubject(path: string): Promise<VocabularyImpact> {
  return request<VocabularyImpact>(`/api/vocabulary/${PATH_SEGMENT_PLACEHOLDER}/deprecate`, {
    method: 'POST',
    query: { path },
  });
}

/**
 * Retires (deletes) a deprecated, unreferenced subject. 204 on success; 409 with `referencingRules`
 * when still referenced or not yet deprecated (surface those on {@link ApiError.referencingRules}).
 */
export function retireVocabularySubject(path: string): Promise<void> {
  return request<void>(`/api/vocabulary/${PATH_SEGMENT_PLACEHOLDER}`, {
    method: 'DELETE',
    query: { path },
  });
}

/** Manually rebuilds the live catalog cache from the DB. */
export function refreshVocabularyCatalog(): Promise<void> {
  return request<void>('/api/vocabulary/refresh', { method: 'POST' });
}
