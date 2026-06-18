# IAW · Decision Framework — Rule Authoring UI (M6)

A React 18-class (React 19 runtime) + TypeScript + Vite + Fluent UI v9 web app for clinical-lab
operations staff to author validation rules in natural language and govern them. This is the
showcase surface of the IAW Validation & Decision Framework (VDF).

## Design system

- **Aesthetic**: "clinical precision / editorial" — refined, calm, trustworthy. A custom Fluent v9
  brand ramp (clinical teal-slate), never default-Fluent purple.
- **Type**: Fraunces (display/headings/brand), Public Sans (body/UI), JetBrains Mono (JSON/traces),
  all self-hosted via `@fontsource`.
- **Theme**: custom teal brand ramp (`src/theme/brand.ts`) feeding `createLightTheme` /
  `createDarkTheme`, with slate-tinted neutrals (`src/theme/index.ts`). Light + dark, default light,
  AA contrast. Toggle in the top bar; preference persists in localStorage.
- **Motion**: one orchestrated page-load (staggered reveals) plus micro-interactions, all honoring
  `prefers-reduced-motion`.

## Routes

| Route          | Purpose                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `/authoring`   | Hero workspace: NL input → interpret → confidence + structured rule → paraphrase / lint / dry-run → save. |
| `/rules`       | Rule repository browser (filter/search, status).                           |
| `/rules/:key`  | Rule detail: definition, paraphrase, governance (approve/promote/disable), provenance. |
| `/evaluate`    | Facts playground: facts JSON → outcomes (grouped) + decision trace + derived facts. |

Unauthenticated users see the login screen; routes are gated behind in-memory auth.

## Auth & API client

- Dev login via `POST /api/auth/login`. The JWT is held **in memory only** (a React ref — never
  localStorage/cookies, never logged) and injected as `Authorization: Bearer …` on every call.
- A **role switcher** in the top bar re-authenticates as any dev user (Author / Reviewer / Admin /
  Lead) to exercise role-gated capabilities.
- The typed fetch client (`src/lib/api/client.ts`) converts non-2xx into a structured `ApiError`
  that carries the RFC-7807 ProblemDetails and, for `422`, the `LintReport` (inline lint rejection).
  A `401` clears the session and prompts re-login. API-down is reported gracefully (no leak).
- TanStack Query manages server state; 4xx are never retried.

## Getting started

```bash
npm install
cp .env.example .env          # VITE_API_BASE_URL defaults to http://localhost:5044
npm run dev                   # http://localhost:5173 (CORS allowed by the API)
```

## Scripts

| Script               | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Vite dev server on :5173                     |
| `npm run build`      | `tsc -b && vite build` (0 errors)            |
| `npm run lint`       | ESLint (clean)                               |
| `npm run format`     | Prettier write                               |
| `npm run test`       | Vitest component tests                       |
| `npm run preview`    | Preview the production build                 |

## Project structure

```
src/
  app/         shell (AppShell, LoginScreen), providers (theme, query), routing
  components/  shared UI (JsonView, ConfidenceMeter, LintFindings, StatusBadge, Panel, States, …)
  features/
    authoring/ AuthoringPage, SaveRuleDialog, DryRunResults, examples
    rules/     RulesPage, RuleDetailPage
    evaluate/  EvaluatePage, OutcomesPanel, DecisionTracePanel
  lib/
    api/       typed fetch client + endpoints
    auth/      in-memory auth context + dev users
    types/     API DTO mirrors (InterpretationResult, LintReport, DryRunResult, Outcome, …)
    hooks/     useReducedMotion
    utils/     json helpers
  theme/       brand ramp, light/dark themes, tokens, font imports
  test/        Vitest setup + render helper
```

## Accessibility (WCAG 2.1 AA)

- Semantic landmarks (`header`, `nav`, `main`), a skip link, `main` focus target.
- Labelled controls and regions; `aria-live` on async results; `role="meter"`/`alert`/`status`.
- Visible `:focus-visible` rings; full keyboard operability (incl. table rows).
- Status is never color-only (badges pair color with a dot + text).
- `prefers-reduced-motion` disables animation globally and per-component.

## Tests

Vitest + Testing Library cover the rule JSON renderer/tokenizer, the lint findings severity
rendering/ordering, and the confidence meter (ARIA + banding + clamping). Run `npm run test`.

### Optional Playwright E2E

Not included by default (keeps the dependency surface lean). To add a live-API smoke test:

```bash
npm i -D @playwright/test && npx playwright install chromium
```

Then write a spec that starts the VDF API on :5044, runs `npm run dev`, signs in as `lead`,
interprets an example prompt, and asserts the structured rule + confidence render. Run with
`npx playwright test`.
