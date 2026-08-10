# CBRE Market Atlas

An interactive globe and timeline for the supplied CBRE market-report library. It begins with the 2,223-report CSV catalog and adds page-cited numeric observations through a resumable Gemini extraction process.

## Run the atlas

```powershell
npm install
npm run catalog
npm run dev
```

Open the local URL shown by Vite. `npm run build` produces the deployable client in `dist/`.

The globe uses NASA Earth Observatory's Blue Marble Next Generation topography/bathymetry texture at 5400 × 2700, with a local relief map. Credit: NASA Earth Observatory.

## Data ingestion

`npm run catalog` produces `public/data/catalog.json` from the supplied CSV. It keeps report metadata, source links, period, local PDF matching, property types, and geographic anchors. It does not duplicate PDF contents into the browser bundle.

For structured market observations, install the Python dependencies once:

```powershell
python -m pip install pypdf google-genai
```

The existing `.env` is read locally and is never served to the browser. Start with a single, diagram-aware report:

```powershell
npm run extract -- --limit 1 --visual
```

Then process the complete archive resumably:

```powershell
npm run extract -- --visual
npm run observations
```

Each completed report is written under `data/extractions/` with its original filename, source hash, model, extraction time, page number, source label, unit/currency, and confidence. `npm run observations` publishes those completed observations into the Atlas detail panel. Re-running skips completed files; add `--force` only to reprocess them.

## Production integration next

Load `data/extractions/*.json` into Postgres/PostGIS as `observations` linked to `reports`. The UI should query that API for metric values and historical series; it already exposes the catalog, filters, timeline, source-report handoff, and geography. Keep both original and normalized metric names so any cross-market comparison remains auditable.

## Important safeguards

- The visual mode transmits each original PDF to Gemini so it can interpret charts and diagrams. Confirm CBRE’s authorization and expected API spend before launching the full 2,155-file run.
- Treat values under low confidence or with conflicting source-page evidence as a review queue, not published facts.
- `source_page` and the CBRE report URL are required for every displayed numeric observation.
