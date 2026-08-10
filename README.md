# CBRE Market Atlas

Interactive market-intelligence dashboard for exploring the CBRE research catalog by location, property type, and reporting period.

**Live site:** [coolgithub1.github.io/cbre-market-atlas](https://coolgithub1.github.io/cbre-market-atlas/)

## What it does

- Maps report activity as interactive market signals on a dark, vector-style world map.
- Filters by region, property type, month, saved views, and search term.
- Uses a quarter-based timeline; report volume controls the timeline-marker glow.
- Opens a signal dock with report tabs, extracted figures, source-page links, market pulse, a volume trend, and market comparison.
- Keeps the report dock visibly scrollable when a figure-rich report or comparison needs more room.

## Run locally

```powershell
npm ci
npm run dev
```

Open the local Vite URL shown in the terminal. To make a production build:

```powershell
npm run build
```

## Public app data

The deployed frontend reads these versioned static files:

| File | Purpose |
| --- | --- |
| `public/data/catalog.json` | Report metadata, filters, dates, and market coordinates. |
| `public/data/observations.json` | Extracted, source-cited market observations used in report previews. |

The app uses Vite's `BASE_URL`, so it works both locally and from the GitHub Pages project path.

## Refreshing the data locally

The raw PDF collection, local working data, logs, and API credentials are intentionally excluded from Git.

1. Place the local report index and PDF archive in the expected workspace locations.
2. Rebuild the public catalog:

   ```powershell
   npm run catalog
   ```

3. To extract figures, install the Python dependencies and set `GEMINI_API_KEY` in a local `.env` file:

   ```powershell
   python -m pip install pypdf google-genai
   npm run extract -- --visual
   npm run observations
   ```

The extraction process is resumable. It writes local artifacts under `data/extractions/`; `npm run observations` converts completed extracts into the public observation payload.

## Privacy and data handling

- `.env` and every `.env.*` variant are ignored; API keys are never sent to the browser.
- The 2,155 original CBRE PDFs, local extraction cache, and logs are not committed or published.
- Every displayed direct figure retains its source page. Reports without a completed extraction show an explicit pending state rather than fabricated metrics.
- Confirm your organization has authorization before sending a report to an external extraction model.

## Deployment

Pushing to `main` runs [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). The workflow builds the static Vite app with the correct repository base path and deploys the `dist/` artifact to GitHub Pages.
