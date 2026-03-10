## Review guidelines

You are reviewing a pull request for Davvy, a Laravel + React application with:
- Laravel backend
- React + Vite frontend
- built-in SabreDAV CalDAV/CardDAV behavior
- Docker-oriented deployment
- backup and restore capabilities
- compatibility mode support for DAV clients

Focus on high-signal findings only.

Prioritize:
- Laravel auth/authz issues, policy/gate omissions, mass assignment, validation gaps
- route/controller/service bugs
- migration/data integrity risks
- config/env/runtime regressions
- backup/restore or scheduler regressions
- React state/effect/data-fetching bugs
- backend/frontend API contract mismatches
- DAV interoperability or compatibility-mode regressions
- missing tests for risky backend, frontend, routing, migration, or config changes
- Don't log PII.

Ignore:
- formatting/style nits
- lockfile churn
- docs wording
- speculative micro-optimizations
- issues already fully covered by formatter/linter unless there is real runtime risk

Extra guidance:
- be especially suspicious when changes touch routes/, app/Http, app/Models, database/migrations, config/, or resources/js/ without corresponding tests/
- prefer no finding over a weak finding
- prioritize findings supported by both the diff and related context

## Review output format

For every finding, include:
- severity: `P0`, `P1`, `P2`, or `P3`
- location: file path with line number(s)
- impact: what can break or be exploited, and by whom
- recommendation: a concrete fix or mitigation

Keep findings evidence-based and tied to the diff plus nearby context.

## No-findings rule

If there are no high-signal issues, explicitly state: `No high-signal findings.`

Then include any residual risk or testing gaps that still exist (for example, missing coverage, unverified migration behavior, or untested client compatibility paths).

## Minimum test expectation for risky changes

When changes touch risky areas (such as `routes/`, `app/Http`, `app/Models`, `database/migrations`, `config/`, `resources/js/`, backup/restore logic, scheduler behavior, or DAV compatibility mode), expect corresponding test coverage in `tests/`.

If risky behavior changes without meaningful test updates, raise a finding unless there is a clear, low-risk reason not to.

Prefer test guidance aligned to the change:
- Laravel feature tests for auth/authz, routing, and API contracts
- unit/integration tests for service logic and data transformations
- migration/data-integrity coverage (including rollback safety when relevant)
- frontend tests for state/effect/data-fetching and API error handling
- DAV/backup/restore regression coverage (automated where practical, otherwise explicit manual verification steps)
