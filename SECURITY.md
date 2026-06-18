# Security

This document tracks **deployment-posture** security items for the IAW VDF backend.
These are *not* code defects in this standalone framework — they are operational controls
that the deploying team must apply for a production (especially PHI) deployment. The code-level
findings from the security review have already been fixed in source; the items below are the
remaining items to verify per environment.

Code-level fixes already applied (for reference): H1 audit-identity from JWT, H3 regex match
timeout, H4 connection-string fail-fast outside Development, M1 503 detail no longer leaks
exception text, M2 value-suppressed `/health` body, M3 LLM input length cap, M4 CORS method
allowlist.

---

## Deployment-Posture Checklist

### Secret management
- [ ] `OPENAI_API_KEY` is provided via a **gitignored `.env`** for local dev only (project choice).
      The `.env` is gitignored and was **never committed**.
- [ ] **Production must use a secrets manager** — Azure Key Vault / AWS Secrets Manager /
      `dotnet user-secrets` — never a plaintext file on the host.
- [ ] Rotate API keys and DB credentials on a regular schedule and on suspected exposure.
- [ ] Do not store any secret in plaintext config files in production.

### TLS / HSTS (M5)
- [ ] Enforce HTTPS at the reverse proxy / load balancer.
- [ ] Enable `UseHttpsRedirection()` and `UseHsts()` in non-Development environments.

### PHI in evaluate response (H2)
- [ ] `EvaluateResponse.FactsAfter` and `ConditionTrace.ResolvedLeft` / `ResolvedRight` expose
      raw fact **values** for explainability.
- [ ] In a PHI deployment, gate the **full-trace** variant behind an `Admin` policy, or return a
      **value-suppressed trace** to lower roles. Do not return raw fact values to roles that should
      not see PHI.

### Dev auth (L2)
- [ ] Replace `DevUserDirectory` with the **enterprise IdP** (OIDC / SAML).
- [ ] Add **rate limiting** and **account lockout** on `POST /api/auth/login` to deter
      credential-stuffing / brute force.

### AllowedHosts (L1)
- [ ] Set `AllowedHosts` to the **specific served hostname(s)** in production (not `*`).

### Design-time factory (L3)
- [ ] Move EF Core migrations to a **separate project**, or exclude the design-time
      `DbContext` factory from `publish`, so design-time tooling is not shipped to production.

---

## Notes
- CORS is restricted to `GET, POST, OPTIONS` and to the configured `Cors:AllowedOrigins`
  (defaults to `http://localhost:5173` for dev). Set production origins via configuration.
- The `/health` endpoint is anonymous and now returns only `{ status, checks:[{name,status}] }` —
  no exception text or descriptions.
- JWT signing key and DB connection string both **fail fast at startup** outside Development when
  absent, rather than degrading to insecure defaults.
