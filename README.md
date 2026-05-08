# Street Tree Explorer

Ask plain-English questions about Portland's 252,180 street trees and watch the map filter live.

Built for **killtimber.com** — ultra-modern, dark, Portland-vibe map UI with an AI chat sidebar.

```
public/        Static site (deploys to Cloudflare Pages)
worker/        Cloudflare Worker — proxies chat requests to Anthropic
pipeline/      Weekly data refresh script
.github/       GitHub Actions workflow for automated updates
```

## Run locally (no setup)

```bash
cd public
python -m http.server 8080
```

Open http://localhost:8080. The map loads live data straight from Portland's ArcGIS FeatureServer. Chat works in **offline mode** with simple keyword filters until you deploy the Worker.

## Deploy

### 1. Cloudflare Pages (the site)
- Push this repo to GitHub.
- In Cloudflare → Pages → Connect to Git → pick the repo.
- Build output directory: `public`. No build command needed.
- Add a custom domain: `killtimber.com` (or a subdomain like `trees.killtimber.com`).

### 2. Cloudflare Worker (the AI chat proxy)
```bash
npm install -g wrangler
cd worker
wrangler login
wrangler secret put ANTHROPIC_API_KEY    # paste your key from console.anthropic.com
wrangler deploy
```
After deploying, copy the Worker URL and update `CHAT_API` in `public/app.js` (or route `/api/chat` to the Worker via Pages Functions / a Cloudflare route).

### 3. GitHub Actions (the auto-refresh)
The workflow in `.github/workflows/update-data.yml` runs every Monday and rebuilds the data files. It commits straight back to the repo, which triggers a Pages redeploy — so the site auto-refreshes weekly.

To swap to the Parquet pipeline (recommended once your dataset stabilizes), edit `public/app.js` to read from `./data/trees.parquet` via `duckdb-wasm` instead of the live FeatureServer.

## Adding the canopy dataset later

When you locate the recently-published canopy data, add a second source to `pipeline/build_data.py`:

```python
SOURCES = {
    "trees": { ... },
    "canopy": {
        "url": "<the new feature server URL>",
        "fields": "...",
    },
}
```

Then add a canopy layer to `public/app.js` that reads `./data/canopy.geojson` (or a hosted PMTiles file).

## Costs at 30 active users
About **$5–10 / month**, almost all of it Anthropic API usage. Hosting + data pipeline are free.

## Stack

- **MapLibre GL** — vector map rendering
- **Cloudflare Pages** — static hosting
- **Cloudflare Workers** — Anthropic API proxy (keeps your key server-side)
- **Anthropic Claude (Haiku 4.5)** — natural-language → JSON filter
- **DuckDB + spatial** — data conversion in the GH Action
- **GitHub Actions** — weekly cron refresh

## Data source

City of Portland — Street Tree Inventory (Active Records), via the [Portland Open Data Portal](https://gis-pdx.opendata.arcgis.com/).
