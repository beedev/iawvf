# Security — IAW VDF Node Backend (`src/server`)

This document records the security posture of the **Node/NestJS** VDF backend: the
code-level review findings (with their fixes), the dependency-audit status, and the
**deployment-posture** controls the operating team must apply for a production
(especially PHI) deployment.

The VDF backend is a standalone, deterministic decision framework. Most production
security controls (TLS termination, secrets manager, network policy, real identity
provider) live at the deployment boundary, not in this code. The items below separate
*what the code already enforces* from *what the deployer must still do*.

---

## 1. Security review (OWASP Top 10 + project G2)

Reviewed scope: all of `src/server/src` — controllers, guards, DTOs, the LLM
interpreter, persistence, logging, and error handling.

### Findings & fixes (this pass)

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| N7-1 | Medium | No explicit request body-size limit (relied on framework default). Oversized fact/rule payloads could be a DoS lever. | **Fixed** — explicit `1mb` limit on the JSON + urlencoded body parsers in `main.ts` (`useBodyParser`). Oversized bodies are rejected at the parser (413) before validation. |
| N7-2 | Low/Med | `CreateRuleRequestDto.authorNl` (free-text natural-language provenance) and `interpreterVersion` were unbounded strings — stored verbatim. | **Fixed** — `@MaxLength(4000)` on `authorNl` (parity with the interpret NL cap) and `@MaxLength(128)` on `interpreterVersion`. |

### Verified-secure controls (no change needed)

- **A01 Broken Access Control** — A global `JwtAuthGuard` authenticates every request;
  `@Public()` is applied **only** to `POST /api/auth/login` and `GET /health` (and the
  Swagger UI at `/swagger`, which serves no data). A second global `RolesGuard` enforces
  `@Roles(...)`. Every **mutating** route carries an explicit role:
  - Rules: create / add-version require `Author`; approve requires `Reviewer`; promote /
    disable require `Admin`.
  - Registry: all create / add-field / deprecate / retire mutations require `Admin`.
  - Authoring: interpret / lint / paraphrase / dry-run require `Author`; the vocabulary
    read is open to any authenticated principal (scope-picker source).
  - Evaluate: open to any authenticated principal (read-only decision; no persistence of PHI).
  No accidentally-public mutating route exists. **Audit integrity:** rule approval records
  the *authenticated principal* as approver, never the request body (`approver` is a
  display hint only).
- **A02 Cryptographic Failures** — JWT secret is read from `JWT_SECRET` env only; in
  production it is **required and must be ≥16 chars** (`env.validation.ts` fails the boot
  otherwise). The dev fallback secret is never used in production. Dev credentials are
  stored as SHA-256 digests and compared in constant time (`timingSafeEqual`) with a dummy
  hash for unknown users to avoid timing-based user enumeration.
- **A03 Injection** — All database access goes through Prisma (parameterized). There is **no**
  `$queryRawUnsafe` / `$executeRawUnsafe` / string-interpolated SQL anywhere; the only raw
  query is the health probe's tagged-template `` $queryRaw`SELECT 1` `` (no user input). All
  fact / rule JSON is parsed with `JSON.parse` inside `try/catch` and then run through a
  strict deserializer (`ruleFromObject`) or Ajv schema validation — malformed input becomes a
  400/422, never an unhandled throw.
- **A04 Insecure Design** — The LLM is **never** in the runtime decision path. The
  interpreter is a compile-time "front-end": its output is always a *proposal* validated by a
  deterministic gate (schema + registry-grounded lint) before anything is stored. Runtime
  evaluation is a pure function over governed, versioned rules.
- **A05 Security Misconfiguration** — CORS is scoped to the configured `CORS_ORIGINS`
  (defaults to `http://localhost:5173`), **not** a wildcard, while `credentials: true` —
  a wildcard-with-credentials combination is impossible by construction. The method and
  header allowlists are explicit.
- **A07 Identification & Auth Failures** — Generic `401 Invalid credentials.` on any login
  failure (no user enumeration). Invalid/expired tokens yield a generic `401` with no
  verification-error detail.
- **A08 Software & Data Integrity** — Rules are versioned and effective-dated; the active
  version is resolved by the repository, and decision traces are persisted append-only.
- **A09 Logging Failures** — Structured pino logging **redacts** `authorization`, `cookie`,
  `set-cookie`, and any `*.password`, `*.accessToken`, `*.apiKey`, `*.secret` path. Request
  bodies are **not** auto-serialized, so fact payloads / patient data never reach the logs.
  Audit logs record only counts, rule keys, the actor, and a correlation id — **never the
  facts**. The OpenAI API key is never logged or surfaced in an error message (the SDK error
  text is sanitized into `OpenAI request failed: <message>`).
- **A10 SSRF** — `OPENAI_BASE_URL` is operator-configured (not user-supplied); no
  user-controlled URL is fetched server-side.

### Error responses (RFC 7807)

All errors are normalized to `application/problem+json` by `ProblemDetailsFilter`.
5xx responses return a generic `"An unexpected error occurred."` detail — **no stack
traces, secrets, or internal messages** leave the process; the full detail is logged
server-side correlated by `traceId`. 4xx responses surface the safe, developer-authored
validation message. (One deliberate carve-out: a 422 lint-rejection body
`{ isValid, findings }` is returned verbatim as `application/json` so the UI can render
findings — it contains no PHI or secrets.)

### Input validation

A global `ValidationPipe` runs with `whitelist: true`, `forbidNonWhitelisted: true`, and
`transform: true` — unknown properties are stripped/rejected and types coerced. Every DTO
is annotated with `class-validator` constraints, including size bounds:
`naturalLanguage` ≤ 4000 chars (with a defence-in-depth re-check in the interpreter),
`authorNl` ≤ 4000, login fields ≤ 128/256, entity keys/labels/descriptions bounded,
and array fields capped with `@ArrayMaxSize`. Combined with the `1mb` body limit, oversized
or malformed payloads are rejected early.

---

## 2. Dependency audit

`npm audit --audit-level=high` → **0 high, 0 critical.** ✅ (gate met)

Moderate advisories: a single root advisory — **js-yaml quadratic-complexity DoS in
merge-key handling (`<=4.1.1`)**.

- **Runtime path fixed.** `@nestjs/swagger` previously pinned the vulnerable `js-yaml@4.1.1`.
  An `overrides` entry (`"js-yaml@4.1.1": "4.2.0"`) bumps it to the patched `4.2.0` without a
  breaking change (4.x is API-compatible). Build and Swagger generation verified green.
- **Remaining moderates are build/test-only and not runtime-exploitable.** They come from the
  Jest / Babel coverage toolchain — specifically `babel-plugin-istanbul` →
  `@istanbuljs/load-nyc-config` → `js-yaml@3.14.2`, reached **only** when running
  `jest --coverage` to parse a local `.nycrc` YAML config. This code never executes in the
  running server and processes no untrusted input. Forcing it to `js-yaml@4.x` would break
  istanbul (incompatible 3.x → 4.x API), so it is left pinned and documented here rather than
  "resolved" by a breaking change. These advisories are accepted as dev-tooling risk.

---

## 3. Deployment-posture checklist (operator responsibilities)

These are **not** code defects — they are operational controls for a production / PHI
deployment.

### Secrets management
- [ ] `JWT_SECRET`, `OPENAI_API_KEY`, and `DATABASE_URL` are supplied via a **gitignored
      `.env` for local dev only**. The `.env` files are gitignored (repo-root + `src/server`)
      and were never committed.
- [ ] **Production must use a secrets manager** (AWS Secrets Manager / Azure Key Vault /
      Kubernetes secrets) — never a plaintext file on the host.
- [ ] Rotate the JWT secret, DB credentials, and OpenAI key on a schedule and on suspected
      exposure.

### TLS / HSTS
- [ ] Terminate **HTTPS at the reverse proxy / load balancer** and enforce HSTS there. The
      Node app is intended to sit behind such a proxy; do not expose it directly.

### PHI in the evaluation response
- [ ] `EvaluateResponse.factsAfter` and the `ConditionTrace.resolvedLeft/resolvedRight` fields
      expose raw fact **values** for explainability. In a PHI deployment, gate the full-trace
      response behind an `Admin`-equivalent role or return a value-suppressed trace to lower
      roles. Do not return raw fact values to principals who must not see PHI.

### Authentication (replace dev scaffolding)
- [ ] Replace the in-memory `dev-users` store with the **enterprise identity provider**
      (OIDC / SAML). The dev store ships only for local development.
- [ ] Add **rate limiting and account lockout** on `POST /api/auth/login` to deter
      credential-stuffing / brute force (e.g. `@nestjs/throttler` or a proxy-level limit).
      This is intentionally out of scope for the standalone framework.

### Network / host
- [ ] Restrict the served origin(s) via `CORS_ORIGINS` to the real UI hostname(s) in
      production (never leave dev defaults).
- [ ] Run the container as a non-root user; keep the base image patched.

---

## Notes
- `JWT_SECRET` (prod) and `DATABASE_URL` both **fail fast at startup** when missing/weak,
  rather than degrading to insecure defaults.
- `/health` is anonymous and returns only `{ status, checks: [{ name, status }] }` — no
  exception text.
- The `_probe` controller is **dev-only scaffolding** for exercising the auth/RBAC guards;
  it is authenticated (and its `/admin` route role-gated) and should be removed before a
  production cut.
