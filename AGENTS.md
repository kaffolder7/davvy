## Review guidelines

Review this codebase as if you are a senior engineer.

This is a Laravel + React application with:
- Laravel backend
- React + Vite frontend
- built-in SabreDAV CalDAV/CardDAV behavior
- Docker-oriented deployment
- backup and restore capabilities
- compatibility mode support for DAV clients

Focus on high-signal, evidence-backed findings only.

## Review scope

- If a PR/diff is available, review changed files plus directly related context.
- If no diff is provided, run a risk-based audit focused on: `routes/`, `app/Http`, `app/Models`, `database/migrations`, `config/`, `resources/js/`, backup/restore logic, scheduler behavior, and DAV compatibility mode.
- Do not perform a generic formatting or style sweep.

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

Ignore:
- formatting/style nits
- lockfile churn
- docs wording
- speculative micro-optimizations
- issues already fully covered by formatter/linter unless there is real runtime risk

## Findings bar

- Prefer no finding over a weak finding.
- Prioritize findings supported by both the diff and related context.
- Include a confidence level for each finding: `high`, `medium`, or `low`.
- Do not log PII.

## Severity definitions

- `P0`: critical security, data-loss, or production outage risk.
- `P1`: high-impact correctness or auth/authz issue likely to affect users.
- `P2`: moderate-risk bug, edge-case breakage, or contract mismatch.
- `P3`: low-risk maintainability issue with plausible future failure impact.

## Required finding format

For every finding, include:
- severity: `P0`, `P1`, `P2`, or `P3`
- confidence: `high`, `medium`, or `low`
- location: file path with line number(s)
- evidence: concrete behavior/path from code
- impact: what can break or be exploited, and by whom
- recommendation: a concrete fix or mitigation
- tests: exact test(s) to add or update

Keep findings evidence-based and tied to the diff (if applicable) plus nearby context.

## Output order

1. Findings (sorted by severity, then confidence).
2. If there are no high-signal issues, explicitly state: `No high-signal findings.`
3. Residual risks or testing gaps that still exist (for example, missing coverage, unverified migration behavior, or untested client compatibility paths).
4. Optional non-blocking improvements (clearly labeled, only if evidence-backed and useful).

## Minimum test expectation for risky changes

When changes touch risky areas (such as `routes/`, `app/Http`, `app/Models`, `database/migrations`, `config/`, `resources/js/`, backup/restore logic, scheduler behavior, or DAV compatibility mode), expect corresponding test coverage in `tests/`.

If risky behavior changes without meaningful test updates, raise a finding unless there is a clear, low-risk reason not to.

Prefer test guidance aligned to the change:
- Laravel feature tests for auth/authz, routing, and API contracts
- unit/integration tests for service logic and data transformations
- migration/data-integrity coverage (including rollback safety when relevant)
- frontend tests for state/effect/data-fetching and API error handling
- DAV/backup/restore regression coverage (automated where practical, otherwise explicit manual verification steps)

## Helpful Tooling

If the local development environment does not have `php` or `npm` installed and you are trying to run tests, try using DDEV instead. Some commands that might be helpful:
- `ddev php artisan test` (for running PHPUnit tests)
- `ddev composer test` (for running PHPUnit tests)
- `ddev pint` (for formatting)
- `ddev npm test` (for running frontend tests)

## Optional non-blocking improvements

When appropriate, include concise, evidence-based suggestions for:
1. Logical mistakes that could cause errors.
2. Unaccounted-for edge cases.
3. Naming/structure clarity issues that materially affect maintainability.
4. Performance issues with likely real-world impact.
5. Security hardening opportunities.
6. Ambiguous code paths that need documentation.
7. Debugging code that should be removed before production.
8. Other improvements to quality, readability, performance, security, scalability, or maintainability.
