import type { LintReport, ProblemDetails, ReferencingRule } from '../types/api';

/** The configured API base URL (no trailing slash), from Vite env with a sane default. */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5044'
).replace(/\/$/, '');

/**
 * A structured API error. Carries the HTTP status, the parsed RFC-7807 ProblemDetails (when present),
 * the {@link LintReport} for 422 lint rejections, and — for vocabulary 409 conflicts — the
 * {@link ReferencingRule referencing rules} the server attached so the UI can explain what is blocking.
 *
 * IMPORTANT: never stringify the request that produced this; tokens and PHI must not be logged.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;
  readonly lintReport: LintReport | null;

  constructor(
    message: string,
    status: number,
    problem: ProblemDetails | null = null,
    lintReport: LintReport | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
    this.lintReport = lintReport;
  }

  /** True when this is a 422 lint rejection carrying a report. */
  get isLintRejection(): boolean {
    return this.status === 422 && this.lintReport !== null;
  }

  /** True when the session is unauthenticated / expired. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /**
   * The active rules the server reported as referencing a vocabulary subject, surfaced via the
   * ProblemDetails `referencingRules` extension on a 409 (e.g. a retire blocked by live usage).
   * Empty when the error carries no such extension.
   */
  get referencingRules(): ReferencingRule[] {
    const raw = this.problem?.['referencingRules'];
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (r): r is ReferencingRule =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as { key?: unknown }).key === 'string' &&
        typeof (r as { name?: unknown }).name === 'string',
    );
  }
}

/** Supplies the current bearer token (or null). Set once by the auth provider. */
export type TokenProvider = () => string | null;

/** Called when any request returns 401, so the app can prompt re-login. */
export type UnauthorizedHandler = () => void;

let tokenProvider: TokenProvider = () => null;
let unauthorizedHandler: UnauthorizedHandler = () => {};

export function configureApi(options: {
  getToken: TokenProvider;
  onUnauthorized: UnauthorizedHandler;
}): void {
  tokenProvider = options.getToken;
  unauthorizedHandler = options.onUnauthorized;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** Skip Authorization header (e.g. for the login call). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function looksLikeLintReport(value: unknown): value is LintReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isValid' in value &&
    'findings' in value &&
    Array.isArray((value as { findings: unknown }).findings)
  );
}

/**
 * The single typed fetch entry point. Injects the bearer token, parses JSON, and converts non-2xx
 * responses into a structured {@link ApiError}. A 401 also triggers the unauthorized handler so the
 * app can route to re-login.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, anonymous = false, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = tokenProvider();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    // Network / CORS / API-down: present a graceful, non-leaky message.
    throw new ApiError(
      'Could not reach the VDF API. Confirm the service is running and reachable.',
      0,
      null,
      null,
    );
  }

  if (response.status === 401) {
    unauthorizedHandler();
  }

  // 204 No Content.
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json') || contentType.includes('+json');
  const payload: unknown = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const lintReport = looksLikeLintReport(payload) ? payload : null;
    const problem =
      payload && typeof payload === 'object' && !lintReport ? (payload as ProblemDetails) : null;
    const title =
      problem?.title ??
      problem?.detail ??
      (lintReport ? 'The rule did not pass validation.' : `Request failed (${response.status}).`);
    throw new ApiError(title, response.status, problem, lintReport);
  }

  return payload as T;
}
