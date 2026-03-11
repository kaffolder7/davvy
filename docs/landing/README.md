# Davvy Landing Site (Static)

This directory contains a GitHub Pages-friendly landing site for Davvy.

## Files

- `index.html`: Main landing page
- `features.html`: Feature deep-dive page
- `styles.css`: Shared styling (aligned with Davvy app tokens)
- `script.js`: Shared theme toggle logic (same `davvy-theme` key)
- `favicon.svg`: Brand icon
- `SpaceGrotesk-VariableFont_wght.(ttf/woff2)`: Local font asset

## GitHub Pages Options

1. Publish from `/docs`
- In GitHub repo settings, set Pages source to `Deploy from a branch`.
- Select branch `main` and folder `/docs`.
- Landing page URL will be `https://<user>.github.io/<repo>/landing/`.

2. Publish only this folder with Actions
- Use `.github/workflows/pages-landing.yml`, which uploads `docs/landing` as the artifact.
- In GitHub repo settings, set Pages source to `GitHub Actions`.
- This workflow deploys only on pushes to `main` that modify `docs/landing/**` (or manual dispatch).

## Local Preview

From repo root:

```bash
npx serve docs/landing
```

Then open the printed local URL.
