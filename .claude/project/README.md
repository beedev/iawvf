# Project Memory — IAW (Intelligent Accessioning Workbench)

This directory is the project's persistent memory across all `/orchestrate` sessions.

## Files
- **manifest.json** — ground truth. What this project is, the mandatory goals (G1–G3), and the 13 features (MVPs) with their `passes` state.
- **bootstrap.sh** — get a dev environment running. Run before any work.
- **progress.log** — append-only session log. Don't edit retroactively.
- **README.md** — this file.

## Mandatory goals (apply to every feature)
- **G1 — Enterprise quality:** Clean Architecture, full typing, structured logging, graceful errors, observability, documented APIs.
- **G2 — Security & vulnerability verified:** RBAC on every endpoint, OWASP Top 10 review, dependency scans (dotnet/npm), no PHI in logs, secrets out of code, SAST sign-off. **Security findings block closure.**
- **G3 — Rich UI/UX:** screens designed via stitch / frontend-design skill, Fluent UI v9 design system, WCAG 2.1 AA.

## Contract
- A feature's `passes` flips `false → true` **only** after: tests green + security review (G2) + (if UI) design/visual review (G3).
- Never delete features — add a `"deleted": true` tombstone instead.
- Schema locked at v1.

## How to use
```bash
./.claude/project/bootstrap.sh                                   # env up
jq '.features[] | select(.passes == false)' .claude/project/manifest.json   # what's pending
```
