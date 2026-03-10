# Davvy Code Review Guide for Gemini

Focus on high-signal findings first.

## Severity and Signal

- Flag only issues that are likely to cause broken behavior, security risk,
  data loss, or maintainability regressions.
- Avoid low-value comments on naming, formatting, or personal style if CI tools
  already enforce them.
- Prefer fewer, higher-confidence comments over broad speculative feedback.

## Backend (Laravel/PHP)

- Treat authorization and ownership checks as critical, especially for shared
  resources and admin-only settings.
- Watch for migration/runtime mismatches that can break deploys.
- Call out missing validation/sanitization only when exploitability or data
  corruption risk is realistic.
- Prefer recommendations that fit the existing architecture and feature flags.

## Frontend (React/Vite)

- Prioritize user-facing regressions, API contract mismatches, and accessibility
  issues.
- Avoid aesthetic preference feedback unless the change harms usability.

## Tests and CI

- Suggest tests when a concrete behavior changed without coverage.
- For workflow changes, prioritize permission scoping and reproducibility.

## Documentation

- Focus on incorrect commands, wrong paths, and stale references.
- Avoid rewriting tone unless wording is ambiguous or misleading.
