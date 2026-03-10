# Contributing to Davvy

Thanks for contributing. This project accepts issues and pull requests.

## Development Setup

Use the setup steps in [README.md](README.md) and run tests before opening a PR.

## Pull Request Expectations

1. Keep changes focused and clearly scoped.
2. Include tests when behavior changes.
3. Update docs when APIs, behavior, or configuration changes.
4. Use clear commit and PR descriptions.

## Optional AI PR Review (Gemini Code Assist)

This repository includes optional Gemini review configuration in `.gemini/`.

To enable Gemini PR reviews:

1. Install the [Gemini Code Assist](https://github.com/apps/gemini-code-assist) GitHub App on this repository.
2. Open a pull request and confirm Gemini posts review feedback.
3. Use `/gemini review` in a PR comment when you want an extra review pass.

Recommended usage:

1. Keep Gemini as advisory (non-blocking) alongside required CI checks.
2. Treat security, data integrity, and test-gap findings as highest priority.
3. Re-run `/gemini review` after major updates to a PR.

## Legal Terms for Contributions

By submitting a contribution, You agree to [CLA.md](CLA.md).

In particular:

1. You keep copyright in Your contribution.
2. You grant the Maintainer broad rights to use, sublicense, and relicense
   contributions under other terms, including proprietary/commercial terms.

If You are contributing as part of Your employment, make sure Your employer
approves Your submission.
