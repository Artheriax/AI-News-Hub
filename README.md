# AI News Hub

A public AI news aggregator that collects and categorizes AI updates from selected YouTube channels and RSS feeds into one static timeline. It also publishes its own [RSS feed](data/feed.xml) and [JSON Feed](data/feed.json).

## Sources

Configured in [`sources.yaml`](sources.yaml):

| Source | Type |
| --- | --- |
| AI Search, AI Explained, Fireship, Two Minute Papers, Bijan Bowen, World of AI | YouTube channel RSS (no API key) |
| Google DeepMind, Google AI Blog, The Decoder, TechCrunch AI, MIT Technology Review AI | RSS |
| The Batch | HTML listing (`type: batch`) |
| Hugging Face Papers | Daily Papers API → top by upvotes over the last 7 days |
| Artificial Analysis | 13 leaderboards (editing, text-to-image, text-to-video, music, models, TTS — incl. open-weights / no-audio variants) → top 10 each |
| [ai-search.io](https://ai-search.io) | Featured link |

The fetcher requests each source **sequentially with a delay** (`delay_seconds`, currently 1s) to avoid rate limits. HTTP requests retry automatically with backoff for 429/5xx responses.

A failing source keeps its previous items. A source that responds successfully but returns **zero usable items** is also treated as a failure, so a feed-parser breakage cannot silently wipe the timeline. Items older than `max_age_days` (default: 30 days) are excluded (leaderboard snapshots are replaced on each successful fetch). Sources removed from `sources.yaml` are pruned from the data and health rows on the next run.

Items without a publication date keep their previous date when possible; genuinely new undated items use the fetch time. Future-dated items are clamped so they cannot pin the top of the feed indefinitely. All URLs are restricted to `http(s)`.

## Local usage

```bash
pip install -r requirements.txt
python fetch.py          # writes data/items.json + data/feed.xml + data/feed.json
python -m http.server 8000
```

Open http://localhost:8000

Options:

```bash
python fetch.py --only Fireship   # only sources whose name contains "Fireship"
python fetch.py --config path/to/sources.yaml
```

Tests and linting:

```bash
pip install -r requirements-dev.txt
ruff check .
pytest -q
```

## Site

Static site (no framework): [`index.html`](index.html), [`app.js`](app.js), [`styles.css`](styles.css).

- Dark (#161616/#222) + light themes, **Lexend** typeface, yellow/magenta/cyan accents
- Animated particle background (canvas; static frame when reduced motion is requested) + smooth load/scroll reveals
- Unified timeline (videos, articles, papers, newsletter issues) — 12 items per page with Prev/Next
- Source & category filters, search, dark mode; press `/` anywhere to jump to search
- Saved items (localStorage, shareable `?saved=1` view)
- Shareable state: `?q=`, `?category=`, `?source=`, `?saved=`, and `?page=` are synced to the URL; the structured-data search action works
- YouTube thumbnails, source badges, vote counts for papers, relative timestamps
- **New data** pill when a newer `items.json` appears while the tab is open
- Artificial Analysis leaderboard cards (top 10 per board) with per-board “as of” times and rank movement (▲/▼) between snapshots
- **Best picks** (`Use model X for Y` per task, Closed/Open toggle) from curated [`data/tasks.yaml`](data/tasks.yaml); benchmark-task winners cite AI Release Tracker with canonical links, while media winners are refreshed from our own boards on every fetch
- **Compare** (up to 3 models side-by-side across all boards, shareable `#compare?m=` links, winner highlights only when ≥2 picks score)
- **New** badges for items since your last visit (auto-clear), loading skeletons, stale-data pill (>2h)
- **PWA** (installable, offline shell) · SEO/OG tags · `sitemap.xml`/`robots.txt` · `404.html` · per-source **health chips** in the footer (including consecutive-failure streaks)
- **RSS + JSON Feed** generated on every fetch from the latest 60 items

## Data

`data/items.json` has `schema_version: 1` and contains:

- `generated_at`, `items`, `featured`, `leaderboards`, `best_picks`, `health`
- Items: `id`, `title`, `url`, `source`, `category`, `published`, `summary`, `thumbnail`, plus `kind`/`channel`/`upvotes` where relevant
- Leaderboards: `id`, `label`, `group`, `variant`, `note`, `url`, `score_label`, `fetched_at`, and `entries` with `rank`, `previous_rank`, `rank_delta`, `name`, `creator`, `score`, `meta`
- Health: per-source `ok`, `items`, `error`, `checked_at`, `failed_streak`, `last_ok_at`

Writes are atomic (temp file + replace), so an interrupted run cannot leave a truncated JSON file.

## Best picks & attribution

- Edit [`data/tasks.yaml`](data/tasks.yaml) to update a benchmark task winner (`closed_winner` / `open_winner` + `benchmark_url` + `released`).
- Media tasks (`image`, `video`, `speech`) declare `board_closed` / `board_open`; `fetch.py` auto-fills their winner and runner-up from the matching Artificial Analysis boards, so they cannot drift from the displayed leaderboards.
- Benchmark taxonomy and top scores are snapshots inspired by [AI Release Tracker /benchmark](https://aireleasetracker.com/benchmark) (e.g. [SWE-Bench Pro](https://aireleasetracker.com/benchmark/swe-bench-pro), [Terminal-Bench 4.0](https://aireleasetracker.com/benchmark/terminal-bench-4.0), [OSWorld 2.1](https://aireleasetracker.com/benchmark/osworld-2.1)) plus [Compare](https://aireleasetracker.com/compare) for the interaction pattern. Scores © their labs/sources — each pick links to its canonical benchmark page.
- Open vs closed classification uses `open_patterns` in `tasks.yaml` plus membership in the open-weights boards.
- `data/tasks.yaml` is merged into `data/items.json` as `best_picks` (no network needed for tasks; the previous snapshot is reused if the file is missing).

## Updates

[`.github/workflows/update.yml`](.github/workflows/update.yml):

- **Every 30 minutes:** `*/30 * * * *` UTC — avoids GitHub's top-of-hour schedule congestion, which can drop scheduled runs
- **Manual:** Actions → *Update and deploy* → *Run workflow* (optional `only` source filter)

The workflow runs `fetch.py`, commits changed `data/items.json`, and deploys the site to **GitHub Pages** (first run enables Pages automatically; if not, set *Settings → Pages → Source: GitHub Actions*). Generated feeds and `sitemap.xml`/`robots.txt` are copied into the Pages artifact; `data/feed.*` is intentionally gitignored.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `ruff`, `pytest`, and JavaScript syntax checks on pushes and pull requests.

## Adding a source

Edit `sources.yaml`:

```yaml
  - name: Example Blog
    type: rss            # youtube | rss | batch | papers
    url: https://example.com/feed.xml
    category: news       # videos | news | papers | newsletter
```

Removing a source from `sources.yaml` prunes its items and health rows from `data/items.json` on the next run. Set `enabled: false` to skip fetching while leaving its configuration in place.

For YouTube use `type: youtube` and `channel_id: <channel id>` (from the channel page URL or `feed/videos.xml`).
