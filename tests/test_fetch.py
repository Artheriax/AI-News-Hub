import json
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta

import pytest

import fetch

TABLE_HTML = """
<table>
  <thead>
    <tr><th>#</th><th>Model</th><th>Elo</th><th>Released</th><th>API Pricing</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td><img alt="Acme logo" src="/logo.png">Model A</td>
      <td>1,234</td>
      <td>Sep 2026</td>
      <td>$1.50 /min</td>
    </tr>
    <tr>
      <td>2</td>
      <td><img alt="Beta logo" src="/logo2.png">Model B</td>
      <td>1200</td>
      <td>Aug 2026</td>
      <td>No API available</td>
    </tr>
  </tbody>
</table>
"""


def test_parse_lb_table_extracts_entries():
    entries = fetch.parse_lb_table(TABLE_HTML, top_n=10)

    assert [entry["rank"] for entry in entries] == [1, 2]
    assert entries[0] == {
        "rank": 1,
        "name": "Model A",
        "creator": "Acme",
        "score": 1234.0,
        "meta": "Sep 2026 · $1.50 /min",
    }
    assert entries[1]["score"] == 1200.0


def test_parse_lb_table_requires_a_table():
    with pytest.raises(ValueError):
        fetch.parse_lb_table("<main>no table</main>", top_n=10)


def test_arena_entries_reads_overall_ranking_and_open_flag():
    payload = json.dumps(
        [
            [
                None,
                [
                    {
                        "formatted": {"elo": "1,500", "released": "Oct 2026"},
                        "values": {
                            "name": "Closed Model",
                            "openWeightsUrl": None,
                            "pricePerMinute": 0.5,
                            "creator": {"name": "Acme"},
                        },
                    },
                    {
                        "formatted": {"elo": "1400", "released": "Sep 2026"},
                        "values": {
                            "name": "Open Model",
                            "openWeightsUrl": "https://example.com/weights",
                            "priceDisplayOverride": "no_api",
                            "creator": {"name": "Beta"},
                        },
                    },
                ],
            ]
        ]
    )

    entries = fetch._arena_entries(payload)

    assert [entry["name"] for entry in entries] == ["Closed Model", "Open Model"]
    assert entries[0]["score"] == 1500.0
    assert entries[0]["meta"] == "Oct 2026 · $0.50 /min"
    assert entries[1]["meta"] == "Sep 2026 · No API available"

    open_entries = fetch._arena_entries(payload, open_only=True)
    assert [entry["name"] for entry in open_entries] == ["Open Model"]


def test_model_open_flags_reads_rsc_payload():
    page = 'shortName\\":\\"Model A\\" something isOpenWeights\\":true'

    assert fetch._model_open_flags(page) == {"Model A": True}


@pytest.mark.parametrize(
    ("value", "tokens"),
    [(128_000, "128k"), (1_000_000, "1M"), (0, ""), (None, "")],
)
def test_format_context(value, tokens):
    assert fetch._format_context(value) == tokens


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("https://example.com/a?b=1", "https://example.com/a?b=1"),
        ("javascript:alert(1)", None),
        ("data:text/html,hi", None),
        ("//example.com/x", None),
        ("", None),
        (None, None),
    ],
)
def test_safe_http_url(value, expected):
    assert fetch.safe_http_url(value) == expected


def test_clip_text_stops_at_word_boundary():
    assert fetch.clip_text("hello world again", 12) == "hello world…"
    assert fetch.clip_text("short", 20) == "short"


def test_entry_image_prefers_media_content():
    entry = {
        "media_content": [
            {"url": "https://example.com/pic.webp", "medium": "image"},
        ],
        "summary": '<p><img src="https://example.com/ignored.jpg"></p>',
    }

    assert fetch._entry_image(entry, "https://example.com/feed") == (
        "https://example.com/pic.webp"
    )


def test_entry_image_falls_back_to_inline_image():
    entry = {
        "summary": '<p><img src="/images/inline.jpg"></p>',
    }

    assert fetch._entry_image(entry, "https://example.com/blog/") == (
        "https://example.com/images/inline.jpg"
    )


def test_make_item_drops_unsafe_urls_and_keeps_missing_date():
    item = fetch.make_item(
        item_id="rss:test",
        title="A &amp; B",
        url="javascript:alert(1)",
        source="Source",
        category="news",
        published=None,
        summary="summary",
        thumbnail="data:image/png;base64,abc",
    )

    assert item["title"] == "A & B"
    assert item["url"] == ""
    assert item["thumbnail"] is None
    assert item["published"] is None


def test_stabilize_items_preserves_dates_and_clamps_future():
    previous = [{"id": "old", "published": "2020-01-01T00:00:00+00:00"}]
    future = (datetime.now(UTC) + timedelta(days=5)).isoformat()
    items = [
        {"id": "old", "published": None},
        {"id": "new", "published": None},
        {"id": "future", "published": future},
    ]
    before = datetime.now(UTC)

    fetch.stabilize_items(items, previous)
    after = datetime.now(UTC)

    assert items[0]["published"] == "2020-01-01T00:00:00+00:00"
    assert before <= datetime.fromisoformat(items[1]["published"]) <= after
    assert datetime.fromisoformat(items[2]["published"]) <= after


def test_make_health_row_tracks_failure_streak():
    previous = {"failed_streak": 2, "last_ok_at": "2026-11-01T00:00:00+00:00"}

    failed = fetch.make_health_row(
        "Source",
        ok=False,
        count=4,
        error="boom",
        previous=previous,
    )
    recovered = fetch.make_health_row(
        "Source",
        ok=True,
        count=8,
        error=None,
        previous=failed,
    )

    assert failed["failed_streak"] == 3
    assert failed["last_ok_at"] == "2026-11-01T00:00:00+00:00"
    assert recovered["failed_streak"] == 0
    assert recovered["last_ok_at"] == recovered["checked_at"]


def test_apply_board_picks_refreshes_media_winners():
    tasks = {
        "tasks": [
            {
                "id": "image",
                "board_closed": "text-to-image",
                "board_open": "text-to-image-open",
            }
        ]
    }
    boards = [
        {
            "id": "text-to-image",
            "entries": [
                {
                    "name": "Model A",
                    "creator": "Acme",
                    "score": 1261.0,
                    "meta": "Nov 2026 · $2.00 /min",
                },
                {"name": "Model B", "creator": "Beta", "score": 1229, "meta": ""},
            ],
        },
        {
            "id": "text-to-image-open",
            "entries": [
                {"name": "Open A", "creator": "Gamma", "score": 1066, "meta": ""}
            ],
        },
    ]

    fetch.apply_board_picks(tasks, boards)

    task = tasks["tasks"][0]
    assert task["closed_winner"] == {
        "model": "Model A",
        "developer": "Acme",
        "score": "1261",
        "released": "Nov 2026",
    }
    assert task["open_winner"]["model"] == "Open A"
    assert task["runner_up"] == {"model": "Model B", "score": "1229"}


def test_write_feeds_writes_valid_rss_and_json(tmp_path, monkeypatch):
    xml_path = tmp_path / "feed.xml"
    json_path = tmp_path / "feed.json"
    monkeypatch.setattr(fetch, "FEED_XML_PATH", xml_path)
    monkeypatch.setattr(fetch, "FEED_JSON_PATH", json_path)
    output = {
        "generated_at": "2026-11-15T00:00:00+00:00",
        "items": [
            {
                "id": "rss:one",
                "title": "A & B",
                "url": "https://example.com/a?x=1&y=2",
                "source": "Source",
                "category": "news",
                "published": "2026-11-14T00:00:00+00:00",
                "summary": "Summary & more",
                "thumbnail": "https://example.com/a.jpg",
            },
            {
                "id": "bad",
                "title": "Bad",
                "url": "javascript:alert(1)",
                "published": "2026-11-14T00:00:00+00:00",
            },
        ],
    }

    fetch.write_feeds(output)

    root = ET.parse(xml_path).getroot()
    channel = root.find("channel")
    assert channel is not None
    assert channel.findtext("title") == "AI News Hub"
    rss_items = channel.findall("item")
    assert len(rss_items) == 1
    assert rss_items[0].findtext("title") == "A & B"
    assert rss_items[0].findtext("link") == "https://example.com/a?x=1&y=2"

    payload = json.loads(json_path.read_text(encoding="utf-8"))
    assert payload["version"].startswith("https://jsonfeed.org/version/1.1")
    assert len(payload["items"]) == 1
    assert payload["items"][0]["id"] == "rss:one"
    assert payload["items"][0]["image"] == "https://example.com/a.jpg"
    assert payload["items"][0]["tags"] == ["Source", "news"]
