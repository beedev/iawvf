import { request } from './client';
import type {
  ApproveRequest,
  CreateRuleRequest,
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
} from '../types/api';

// ── Auth ──────────────────────────────────────────────────────────────────────────────────────

export function login(body: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', { method: 'POST', body, anonymous: true });
}

// ── Authoring ─────────────────────────────────────────────────────────────────────────────────

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
