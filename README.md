# AI News Hub

A public AI news aggregator that collects and categorizes AI updates from selected YouTube channels and RSS feeds into one static timeline.

## Sources

Configured in [`sources.yaml`](sources.yaml):

| Source | Type |
| --- | --- |
| AI Search, AI Explained, Matthew Berman, Two Minute Papers, Bijan Bowen | YouTube channel RSS (no API key) |
| Ars Technica AI | RSS |
| DeepLearning.AI The Batch | HTML scrape of weekly issues |
| Hugging Face Papers | Daily Papers API → top by upvotes over the last 7 days |
| Artificial Analysis | 13 leaderboards (editing, text-to-image, text-to-video, music, models, TTS — incl. open-weights / no-audio variants) → top 10 each |
| [ai-search.io](https://ai-search.io) | Featured link |

The fetcher requests each source **sequentially with a delay** (`delay_seconds`, default 3s) to avoid rate limits. A failing source keeps its previous items instead of wiping the feed. Items older than `max_age_days` (default: 30 days / one month) are excluded from `data/items.json` (leaderboard snapshots are exempt — they are replaced on each successful fetch).

## Local usage

```bash
pip install -r requirements.txt
python fetch.py          # writes data/items.json
python -m http.server 8000
```

Open http://localhost:8000

Options:

```bash
python fetch.py --only youtube   # only sources whose name contains "youtube"
python fetch.py --config path/to/sources.yaml
```

## Site

Static site (no framework): [`index.html`](index.html), [`app.js`](app.js), [`styles.css`](styles.css).

- Dark (#161616/#222) + light themes, **Lexend** typeface, yellow/magenta/cyan accents
- Animated particle background (canvas, respects reduced-motion) + smooth load/scroll reveals
- Unified timeline (videos, articles, papers, newsletter issues) — 12 items per page with Prev/Next
- Source & category filters, search, dark mode
- YouTube thumbnails, source badges, vote counts for papers
- Artificial Analysis leaderboard cards (top 10 per board, open-weights & no-audio variants)
- **New** badges for items since your last visit (auto-clear), loading skeletons, stale-data pill (>2h)
- **PWA** (installable, offline shell via service worker) · SEO/OG tags · `404.html` · per-source **health chips** in the footer

## Updates

[`.github/workflows/update.yml`](.github/workflows/update.yml):

- **Hourly:** every hour at :17 UTC (`17 * * * *`) — offset off `:00` to avoid GitHub's top-of-hour schedule congestion, which can drop scheduled runs
- **Manual:** Actions → *Update and deploy* → *Run workflow*

The workflow runs `fetch.py`, commits changed `data/items.json`, and deploys the site to **GitHub Pages** (first run enables Pages automatically; if not, set *Settings → Pages → Source: GitHub Actions*).

## Adding a source

Edit `sources.yaml`:

```yaml
  - name: Example Blog
    type: rss            # youtube | rss | batch | papers
    url: https://example.com/feed.xml
    category: news       # videos | news | papers | newsletter
```

For YouTube use `type: youtube` and `channel_id: <channel id>` (from the channel page URL or `feed/videos.xml`).
