#!/usr/bin/env python3
"""Fetch AI news sources and write data/items.json for the static site."""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import feedparser
import requests
import yaml

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "items.json"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36 AI-NewsHub/1.0"
)
session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


def http_get(url: str, **kwargs) -> requests.Response:
    resp = session.get(url, timeout=30, **kwargs)
    resp.raise_for_status()
    return resp


def entry_datetime(entry) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    return datetime.fromtimestamp(
        __import__("calendar").timegm(parsed), tz=timezone.utc
    )


def strip_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    return html_lib.unescape(re.sub(r"\s+", " ", text)).strip()


def make_item(
    *,
    item_id: str,
    title: str,
    url: str,
    source: str,
    category: str,
    published: datetime | None,
    summary: str = "",
    thumbnail: str | None = None,
    extra: dict | None = None,
) -> dict:
    item = {
        "id": item_id,
        "title": html_lib.unescape(title).strip(),
        "url": url,
        "source": source,
        "category": category,
        "published": (published or datetime.now(timezone.utc)).isoformat(),
        "summary": summary,
        "thumbnail": thumbnail,
    }
    if extra:
        item.update(extra)
    return item


def fetch_youtube(src: dict, limit: int) -> list[dict]:
    feed_url = (
        f"https://www.youtube.com/feeds/videos.xml?channel_id={src['channel_id']}"
    )
    resp = http_get(feed_url)
    feed = feedparser.parse(resp.content)
    items = []
    for entry in feed.entries[:limit]:
        video_id = entry.get("yt_videoid")
        thumb = None
        if entry.get("media_thumbnail"):
            thumb = entry.media_thumbnail[0].get("url")
        elif video_id:
            thumb = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
        link = entry.get("link") or (
            f"https://www.youtube.com/watch?v={video_id}" if video_id else None
        )
        if not link:
            continue
        items.append(
            make_item(
                item_id=f"yt:{video_id or link}",
                title=entry.get("title") or "(untitled)",
                url=link,
                source=src["name"],
                category=src.get("category", "videos"),
                published=entry_datetime(entry),
                summary=strip_html(entry.get("summary", ""))[:300],
                thumbnail=thumb,
                extra={"kind": "video", "channel": entry.get("author", src["name"])},
            )
        )
    return items


def fetch_rss(src: dict, limit: int) -> list[dict]:
    resp = http_get(src["url"])
    feed = feedparser.parse(resp.content)
    items = []
    for entry in feed.entries[:limit]:
        link = entry.get("link")
        if not link:
            continue
        thumb = None
        if entry.get("media_thumbnail"):
            thumb = entry.media_thumbnail[0].get("url")
        elif entry.get("enclosures"):
            href = entry.enclosures[0].get("href")
            if href and any(
                href.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")
            ):
                thumb = href
        items.append(
            make_item(
                item_id=f"rss:{link}",
                title=entry.get("title") or "(untitled)",
                url=link,
                source=src["name"],
                category=src.get("category", "news"),
                published=entry_datetime(entry),
                summary=strip_html(entry.get("summary", ""))[:300],
                thumbnail=thumb,
                extra={"kind": "article"},
            )
        )
    return items


def _batch_image(img_src: str) -> str | None:
    if not img_src:
        return None
    if img_src.startswith("/_next/image"):
        qs = parse_qs(urlparse(img_src).query)
        url = qs.get("url", [None])[0]
        return unquote(url) if url else None
    if img_src.startswith("http"):
        return img_src
    return None


def fetch_batch(src: dict, limit: int) -> list[dict]:
    resp = http_get(src["url"])
    cards = re.findall(r'<article class="card.*?</article>', resp.text, re.S)
    items = []
    date_re = re.compile(
        r">((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4})<"
    )
    for card in cards:
        date_m = date_re.search(card)
        link_m = re.search(
            r'aria-label="([^"]+)"\s+href="(/the-batch/[^"]+)"', card
        ) or re.search(
            r'href="(/the-batch/[^"]+)"[^>]*aria-label="([^"]+)"', card
        )
        if not link_m:
            continue
        if link_m.lastindex == 1:
            path, title = link_m.group(1), ""
        else:
            first, second = link_m.group(1), link_m.group(2)
            if first.startswith("/"):
                path, title = first, second
            else:
                title, path = first, second
        if "/tag/" in path or path.rstrip("/").endswith("/the-batch"):
            continue
        if not date_m:
            continue
        if not title:
            h2 = re.search(r"<h2[^>]*>(.*?)</h2>", card, re.S)
            title = strip_html(h2.group(1)) if h2 else path.rsplit("/", 1)[-1]
        img_m = re.search(r'src="([^"]+)"', card)
        published = None
        try:
            published = datetime.strptime(date_m.group(1), "%b %d, %Y").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            pass
        url = f"https://www.deeplearning.ai{path}"
        items.append(
            make_item(
                item_id=f"batch:{path}",
                title=title,
                url=url,
                source=src["name"],
                category=src.get("category", "newsletter"),
                published=published,
                summary="",
                thumbnail=_batch_image(img_m.group(1)) if img_m else None,
                extra={"kind": "newsletter"},
            )
        )
        if len(items) >= limit:
            break
    return items


def fetch_papers(src: dict, limit: int) -> list[dict]:
    days = int(src.get("days", 7))
    top_n = int(src.get("top_n", limit))
    resp = http_get(
        "https://huggingface.co/api/daily_papers",
        params={"sort": "publishedAt", "direction": "-1", "limit": 100},
    )
    payload = resp.json()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    papers = []
    for row in payload:
        paper = row.get("paper") or {}
        raw_date = paper.get("publishedAt")
        if not raw_date:
            continue
        published = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        if published < cutoff:
            continue
        papers.append((published, paper))
    papers.sort(key=lambda pair: (pair[1].get("upvotes") or 0), reverse=True)
    items = []
    for published, paper in papers[:top_n]:
        paper_id = paper.get("id")
        if not paper_id:
            continue
        items.append(
            make_item(
                item_id=f"paper:{paper_id}",
                title=paper.get("title") or paper_id,
                url=f"https://huggingface.co/papers/{paper_id}",
                source=src["name"],
                category=src.get("category", "papers"),
                published=published,
                summary=strip_html(paper.get("summary", ""))[:400],
                thumbnail=None,
                extra={
                    "kind": "paper",
                    "upvotes": paper.get("upvotes") or 0,
                    "arxiv_id": paper_id,
                },
            )
        )
    return items


FETCHERS = {
    "youtube": fetch_youtube,
    "rss": fetch_rss,
    "batch": fetch_batch,
    "papers": fetch_papers,
}

AA_BASE = "https://artificialanalysis.ai"


def _strip_cell(cell_html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", cell_html)
    return html_lib.unescape(re.sub(r"\s+", " ", text)).strip()


def _parse_score(raw: str | None) -> float | None:
    if raw is None:
        return None
    cleaned = raw.replace("*", "").replace(",", "").strip()
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    return float(match.group(0))


def _table_parts(page_html: str) -> tuple[list[str], list[list[str]]]:
    heads: list[str] = []
    thead_m = re.search(r"<thead.*?</thead>", page_html, re.S)
    if thead_m:
        heads = [
            _strip_cell(cell)
            for cell in re.findall(r"<th[^>]*>(.*?)</th>", thead_m.group(0), re.S)
        ]
    tbody_m = re.search(r"<tbody.*?</tbody>", page_html, re.S)
    if not tbody_m:
        raise ValueError("no leaderboard table found")
    rows: list[list[str]] = []
    for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", tbody_m.group(0), re.S):
        cells = [
            _strip_cell(cell)
            for cell in re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S)
        ]
        if cells:
            rows.append(cells)
    if not rows:
        raise ValueError("leaderboard table has no rows")
    return heads, rows


def _col(heads: list[str], *names: str, default: int | None = None) -> int | None:
    for name in names:
        for index, head in enumerate(heads):
            if head == name or head.startswith(name):
                return index
    return default


def _arena_entry(
    row: list[str],
    *,
    rank: int,
    i_creator: int | None,
    i_name: int,
    i_score: int | None,
    i_released: int | None,
    i_pricing: int | None,
) -> dict | None:
    if len(row) <= i_name:
        return None
    name = row[i_name]
    if not name:
        return None
    meta_bits = []
    if i_released is not None and i_released < len(row) and row[i_released]:
        meta_bits.append(row[i_released])
    if i_pricing is not None and i_pricing < len(row) and row[i_pricing]:
        meta_bits.append(row[i_pricing])
    return {
        "rank": rank,
        "name": name,
        "creator": (
            row[i_creator]
            if i_creator is not None and i_creator < len(row)
            else ""
        ),
        "score": _parse_score(row[i_score])
        if i_score is not None and i_score < len(row)
        else None,
        "meta": " · ".join(meta_bits),
    }


def parse_lb_table(page_html: str, top_n: int) -> list[dict]:
    heads, rows = _table_parts(page_html)
    i_creator = _col(heads, "Creator", default=2)
    i_name = _col(heads, "Model", default=3)
    i_score = _col(heads, "Elo", default=4)
    i_released = _col(heads, "Released")
    i_pricing = _col(heads, "API Pricing", "Pricing")
    entries: list[dict] = []
    for row in rows:
        entry = _arena_entry(
            row,
            rank=len(entries) + 1,
            i_creator=i_creator,
            i_name=i_name,
            i_score=i_score,
            i_released=i_released,
            i_pricing=i_pricing,
        )
        if entry:
            entries.append(entry)
        if len(entries) >= top_n:
            break
    if not entries:
        raise ValueError("no entries parsed from leaderboard table")
    return entries


def parse_lb_models_table(page_html: str, top_n: int) -> list[dict]:
    return parse_models_rows(page_html, top_n=top_n)


def parse_models_rows(
    page_html: str, top_n: int | None = None, open_only: bool = False
) -> list[dict]:
    _, rows = _table_parts(page_html)
    flags = _model_open_flags(page_html) if open_only else {}
    entries: list[dict] = []
    for row in rows:
        if len(row) < 4:
            continue
        name = row[0]
        if not name:
            continue
        if open_only:
            is_open = flags.get(name)
            if is_open is None:
                for key, value in flags.items():
                    if name.startswith(key) or key.startswith(name):
                        is_open = value
                        break
            if not is_open:
                continue
        meta_bits = []
        if row[1]:
            meta_bits.append(f"{row[1]} ctx")
        entries.append(
            {
                "rank": len(entries) + 1,
                "name": name,
                "creator": row[2],
                "score": _parse_score(row[3]),
                "meta": " · ".join(meta_bits),
            }
        )
        if top_n and len(entries) >= top_n:
            break
    if not entries:
        raise ValueError("no entries parsed from models table")
    return entries


def parse_lb_models_open(page_html: str, top_n: int) -> list[dict]:
    return parse_models_rows(page_html, top_n=top_n, open_only=True)


def _model_open_flags(page_html: str) -> dict[str, bool]:
    flags: dict[str, bool] = {}
    pattern = re.compile(
        r'shortName\\":\\"([^\\"]{1,100})\\"'
        r'.{0,800}?isOpenWeights\\":(true|false)',
        re.S,
    )
    for match in pattern.finditer(page_html):
        flags.setdefault(match.group(1), match.group(2) == "true")
    return flags


_ARENA_ARRAY_START_RE = re.compile(
    r'\[null,\[\{\\"formatted\\":\{\\"rank\\":1'
)
_ARENA_ENTRY_RE = re.compile(
    r'\\"formatted\\":\{\\"rank\\":(\d+),\\"elo\\":\\"(\d+)\\"'
    r'.{0,300}?\\"name\\":\\"([^\\"]+)\\"'
    r'.{0,500}?\\"creator\\":\{[^}]*?\\"name\\":\\"([^\\"]+)\\"',
    re.S,
)


def _arena_boards(page_html: str) -> list[list[dict]]:
    boards: list[list[dict]] = []
    for match in _ARENA_ARRAY_START_RE.finditer(page_html):
        start = match.start()
        end = page_html.find("]]", start)
        window = (
            page_html[start : end + 2]
            if end > start
            else page_html[start : start + 200_000]
        )
        entries = [
            {
                "rank": int(m.group(1)),
                "score": float(m.group(2)),
                "name": m.group(3),
                "creator": m.group(4),
                "meta": "",
            }
            for m in _ARENA_ENTRY_RE.finditer(window)
        ]
        if len(entries) < 10:
            continue
        entries.sort(key=lambda e: e["rank"])
        for index, entry in enumerate(entries, start=1):
            entry["rank"] = index
        boards.append(entries)
    return boards


def _norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def parse_lb_flight_no_audio(page_html: str, top_n: int) -> list[dict]:
    heads, rows = _table_parts(page_html)
    i_name = _col(heads, "Model", default=3)
    ssr_top = rows[0][i_name] if rows and len(rows[0]) > i_name else ""

    expected: tuple[str, float] | None = None
    faq = re.search(
        r"models without audio by Elo rating are:\s*1\.\s*(.+?)\s*\(Elo\s+(\d+)\)",
        page_html,
    )
    if faq:
        expected = (faq.group(1).strip(), float(faq.group(2)))

    boards = _arena_boards(page_html)
    if not boards:
        raise ValueError("no alternate (no-audio) ranking embedded in page")

    if expected:
        exp_name, exp_elo = expected
        for entries in boards:
            top = entries[0]
            if _norm_name(top["name"]) == _norm_name(exp_name) and top["score"] == exp_elo:
                return entries[:top_n]

    for entries in boards:
        if _norm_name(entries[0]["name"]) != _norm_name(ssr_top):
            return entries[:top_n]
    raise ValueError("no alternate (no-audio) ranking embedded in page")


LB_PARSERS = {
    "table": parse_lb_table,
    "models-table": parse_lb_models_table,
    "models-open": parse_lb_models_open,
    "flight-no-audio": parse_lb_flight_no_audio,
}

LB_SCORE_LABELS = {
    "table": "Elo",
    "models-table": "Intelligence Index",
    "models-open": "Intelligence Index",
    "flight-no-audio": "Elo",
}


def fetch_leaderboards(
    lb_defs: list[dict],
    delay: float,
    top_n: int,
    only: str | None = None,
    previous: list[dict] | None = None,
) -> tuple[list[dict], int, int]:
    prev_by_id = {
        lb.get("id"): lb for lb in (previous or []) if lb.get("id")
    }
    if only:
        key = only.lower()

        def matches(lb: dict) -> bool:
            haystack = " ".join(
                str(lb.get(field) or "")
                for field in ("id", "label", "group", "variant", "page")
            ).lower()
            return key in haystack

        selected = [lb for lb in lb_defs if matches(lb)]
        if not selected:
            print("skip  leaderboards (no match for --only)")
            return list(previous or []), 0, 0
    else:
        selected = list(lb_defs)
    selected_ids = {lb.get("id") for lb in selected}

    pages = list(dict.fromkeys(lb.get("page") for lb in selected if lb.get("page")))
    page_html: dict[str, str | None] = {}
    for page in pages:
        print(f"sleep {delay}s before next request...")
        time.sleep(delay)
        try:
            resp = http_get(AA_BASE + page)
            page_html[page] = resp.text
            print(f"ok    AA {page}")
        except Exception as exc:  # noqa: BLE001 - isolate per-page failures
            page_html[page] = None
            print(f"error AA {page}: {exc}", file=sys.stderr)

    succeeded = 0
    failed = 0
    results: list[dict] = []
    for lb in lb_defs:
        lb_id = lb.get("id")
        if lb_id not in selected_ids:
            kept = prev_by_id.get(lb_id)
            if kept:
                results.append(kept)
            continue
        html_text = page_html.get(lb.get("page"))
        if html_text is None:
            failed += 1
            kept = prev_by_id.get(lb_id)
            if kept:
                results.append(kept)
                print(f"keep  LB {lb_id}: {len(kept.get('entries', []))} previous entries")
            continue
        parse_type = lb.get("parse", "table")
        parser = LB_PARSERS.get(parse_type)
        if not parser:
            failed += 1
            print(f"error LB {lb_id}: unknown parse type {parse_type!r}", file=sys.stderr)
            continue
        try:
            entries = parser(html_text, top_n)
            record = {
                "id": lb_id,
                "label": lb.get("label") or lb_id,
                "group": lb.get("group") or "",
                "variant": lb.get("variant"),
                "note": lb.get("note"),
                "url": lb.get("url") or (AA_BASE + (lb.get("page") or "")),
                "score_label": LB_SCORE_LABELS.get(parse_type, "Score"),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "entries": entries,
            }
            results.append(record)
            succeeded += 1
            print(f"ok    LB {lb_id}: {len(entries)} entries")
        except Exception as exc:  # noqa: BLE001 - isolate per-board failures
            failed += 1
            kept = prev_by_id.get(lb_id)
            if kept:
                results.append(kept)
            print(
                f"error LB {lb_id}: {exc}"
                + (f" (keeping {len(kept.get('entries', []))} previous entries)" if kept else ""),
                file=sys.stderr,
            )
    return results, succeeded, failed


def load_existing() -> tuple[list[dict], list[dict], list[dict], dict | None]:
    if DATA_PATH.exists():
        try:
            data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
            return (
                data.get("items", []),
                data.get("featured", []),
                data.get("leaderboards", []),
                data.get("health"),
            )
        except (json.JSONDecodeError, OSError):
            pass
    return [], [], [], None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default=str(ROOT / "sources.yaml"),
        help="Path to sources config (default: sources.yaml)",
    )
    parser.add_argument(
        "--only",
        default=None,
        help="Only fetch sources whose name contains this substring",
    )
    args = parser.parse_args()

    config = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    delay = float(config.get("delay_seconds", 3))
    limit = int(config.get("max_items_per_source", 25))
    max_age_days = config.get("max_age_days")
    sources = config.get("sources", [])
    featured = config.get("featured_links", [])
    lb_defs = config.get("leaderboards") or []
    lb_top_n = int(config.get("leaderboard_top_n", 10))

    existing_items, existing_featured, existing_leaderboards, existing_health = (
        load_existing()
    )
    by_source: dict[str, list[dict]] = {}
    for item in existing_items:
        by_source.setdefault(item.get("source", ""), []).append(item)

    source_health: dict[str, dict] = {}
    if existing_health:
        for row in existing_health.get("sources", []):
            if row.get("name"):
                source_health[row["name"]] = row

    succeeded = 0
    failed = 0
    for index, src in enumerate(sources):
        name = src.get("name", "?")
        if args.only and args.only.lower() not in name.lower():
            continue
        if src.get("enabled", True) is False:
            print(f"skip  {name} (disabled)")
            continue
        if index > 0:
            print(f"sleep {delay}s before next request...")
            time.sleep(delay)
        fetcher = FETCHERS.get(src.get("type"))
        if not fetcher:
            print(f"error {name}: unknown type {src.get('type')!r}", file=sys.stderr)
            failed += 1
            source_health[name] = {
                "name": name,
                "ok": False,
                "items": len(by_source.get(name, [])),
                "error": f"unknown type {src.get('type')!r}",
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
            continue
        try:
            items = fetcher(src, limit)
            by_source[name] = items
            succeeded += 1
            source_health[name] = {
                "name": name,
                "ok": True,
                "items": len(items),
                "error": None,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
            print(f"ok    {name}: {len(items)} items")
        except Exception as exc:  # noqa: BLE001 - isolate per-source failures
            failed += 1
            kept = len(by_source.get(name, []))
            source_health[name] = {
                "name": name,
                "ok": False,
                "items": kept,
                "error": str(exc),
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
            print(f"error {name}: {exc} (keeping {kept} previous items)", file=sys.stderr)

    merged: list[dict] = []
    seen_ids: set[str] = set()
    for items in by_source.values():
        for item in items:
            item_id = item.get("id")
            if item_id and item_id not in seen_ids:
                seen_ids.add(item_id)
                merged.append(item)
    merged.sort(key=lambda item: item.get("published", ""), reverse=True)

    if max_age_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=float(max_age_days))
        before = len(merged)
        filtered: list[dict] = []
        for item in merged:
            raw = item.get("published")
            try:
                published = datetime.fromisoformat(raw) if raw else None
            except (TypeError, ValueError):
                published = None
            if published is None:
                filtered.append(item)
                continue
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
            if published >= cutoff:
                filtered.append(item)
        dropped = before - len(filtered)
        if dropped:
            print(f"age   dropped {dropped} items older than {max_age_days} days")
        merged = filtered

    if failed and not succeeded and not merged:
        print("all sources failed and no previous data", file=sys.stderr)
        return 1

    leaderboards = existing_leaderboards
    lb_ok = 0
    lb_failed = 0
    lb_health = (existing_health or {}).get("leaderboards") if existing_health else None
    if lb_defs:
        leaderboards, lb_ok, lb_failed = fetch_leaderboards(
            lb_defs,
            delay=delay,
            top_n=lb_top_n,
            only=args.only,
            previous=existing_leaderboards,
        )
        if not args.only or lb_ok or lb_failed:
            lb_health = {
                "ok": lb_ok,
                "failed": lb_failed,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }

    health = {
        "sources": sorted(
            source_health.values(), key=lambda row: row.get("name", "")
        ),
        "leaderboards": lb_health,
    }

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "items": merged,
        "featured": featured or existing_featured,
        "leaderboards": leaderboards,
        "health": health,
    }
    DATA_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"wrote {DATA_PATH.relative_to(ROOT)}: {len(merged)} items, "
        f"{len(leaderboards)} leaderboards, "
        f"{succeeded} ok, {failed} failed"
        + (f", LB {lb_ok} ok, {lb_failed} failed" if lb_defs else "")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
