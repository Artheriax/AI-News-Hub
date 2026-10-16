const CATEGORY_LABELS = {
  all: "All",
  videos: "Videos",
  news: "News",
  papers: "Papers",
  newsletter: "Newsletter",
};

const PAGE_SIZE = 12;

const state = {
  items: [],
  featured: [],
  leaderboards: [],
  bestPicks: null,
  openPatterns: [],
  pickLicense: "closed",
  compare: [],
  modelsIndex: [],
  health: null,
  seenTs: null,
  category: "all",
  source: "",
  query: "",
  page: 1,
};

const els = {
  timeline: document.getElementById("timeline"),
  empty: document.getElementById("empty"),
  status: document.getElementById("status"),
  updated: document.getElementById("updated"),
  search: document.getElementById("search"),
  sourceFilter: document.getElementById("source-filter"),
  categoryFilters: document.getElementById("category-filters"),
  featured: document.getElementById("featured"),
  featuredList: document.getElementById("featured-list"),
  pagination: document.getElementById("pagination"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  pageLabel: document.getElementById("page-label"),
  leaderboards: document.getElementById("leaderboards"),
  lbGrid: document.getElementById("lb-grid"),
  bestPicks: document.getElementById("best-picks"),
  picksGrid: document.getElementById("picks-grid"),
  picksUpdated: document.getElementById("picks-updated"),
  compare: document.getElementById("compare"),
  compareSlots: document.getElementById("compare-slots"),
  compareAdd: document.getElementById("compare-add"),
  compareCopy: document.getElementById("compare-copy"),
  compareClear: document.getElementById("compare-clear"),
  compareHint: document.getElementById("compare-hint"),
  compareHead: document.getElementById("compare-head"),
  compareBody: document.getElementById("compare-body"),
  popularCompare: document.getElementById("popular-compare"),
  themeToggle: document.getElementById("theme-toggle"),
  freshness: document.getElementById("freshness"),
  freshnessText: document.getElementById("freshness-text"),
  health: document.getElementById("health"),
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function categoryOf(item) {
  return item.category || "news";
}

function matches(item) {
  if (state.category !== "all" && categoryOf(item) !== state.category) {
    return false;
  }
  if (state.source && item.source !== state.source) {
    return false;
  }
  if (state.query) {
    const haystack = [item.title, item.source, item.summary]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(state.query)) return false;
  }
  return true;
}

function renderCategories(items) {
  const counts = { all: items.length };
  for (const item of items) {
    const cat = categoryOf(item);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const order = ["all", "videos", "news", "papers", "newsletter"].filter(
    (key) => key === "all" || counts[key],
  );
  els.categoryFilters.innerHTML = order
    .map(
      (key) => `
      <button
        type="button"
        class="chip"
        role="tab"
        data-category="${key}"
        aria-selected="${state.category === key}"
      >${escapeHtml(CATEGORY_LABELS[key] || key)} (${counts[key] || 0})</button>`,
    )
    .join("");
}

function renderSources(items) {
  const sources = [...new Set(items.map((item) => item.source))].sort();
  const options = ['<option value="">All sources</option>'].concat(
    sources.map(
      (source) =>
        `<option value="${escapeHtml(source)}"${
          state.source === source ? " selected" : ""
        }>${escapeHtml(source)}</option>`,
    ),
  );
  els.sourceFilter.innerHTML = options.join("");
}

function renderFeatured() {
  if (!state.featured.length) return;
  els.featured.hidden = false;
  els.featuredList.innerHTML = state.featured
    .map(
      (link) => `
      <a class="featured-card reveal" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">
        <strong>${escapeHtml(link.name)}</strong>
        <span>${escapeHtml(link.description || link.url)}</span>
      </a>`,
    )
    .join("");
}

function formatScore(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderLeaderboards() {
  if (!state.leaderboards.length) return;
  els.leaderboards.hidden = false;
  els.lbGrid.innerHTML = state.leaderboards
    .map((lb) => {
      const variant = lb.variant
        ? `<span class="badge lb-variant">${escapeHtml(lb.variant)}</span>`
        : "";
      const group = lb.group
        ? `<span class="lb-group">${escapeHtml(lb.group)}</span>`
        : "";
      const note = lb.note
        ? `<p class="lb-note">${escapeHtml(lb.note)}</p>`
        : "";
      const scoreLabel = lb.score_label
        ? `<div class="lb-score-label muted">${escapeHtml(lb.score_label)}</div>`
        : "";
      const entries = (lb.entries || [])
        .map((entry) => {
          const creator = entry.creator
            ? `<span class="lb-creator">${escapeHtml(entry.creator)}</span>`
            : "";
          const score =
            entry.score != null && entry.score !== ""
              ? `<span class="lb-score">${escapeHtml(formatScore(entry.score))}</span>`
              : "";
          return `<li>
            <span class="lb-rank">${escapeHtml(entry.rank)}</span>
            <span class="lb-name">${escapeHtml(entry.name)}${creator}</span>
            ${score}
          </li>`;
        })
        .join("");
      return `
        <article class="lb-card reveal">
          <header class="lb-card-head">
            <div>
              <h3 class="lb-title">${escapeHtml(lb.label)}</h3>
              ${group}
            </div>
            ${variant}
          </header>
          ${note}
          ${scoreLabel}
          <ol class="lb-list">${entries}</ol>
          <a class="lb-link" href="${escapeHtml(lb.url)}" target="_blank" rel="noopener">View leaderboard →</a>
        </article>`;
    })
    .join("");
}

function normalizeModelName(name) {
  return String(name || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyModel(name) {
  return normalizeModelName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isOpenModel(name) {
  const hay = String(name || "").toLowerCase();
  for (const pat of state.openPatterns) {
    if (pat && hay.includes(String(pat).toLowerCase())) return true;
  }
  return hay.includes("open") || hay.includes("oss");
}

function buildModelsIndex() {
  const map = new Map();
  for (const lb of state.leaderboards) {
    for (const entry of lb.entries || []) {
      const norm = normalizeModelName(entry.name);
      if (!norm) continue;
      if (!map.has(norm)) {
        map.set(norm, {
          name: norm,
          display: norm,
          creator: entry.creator || "",
          open: isOpenModel(entry.name),
          boards: [],
          mentions: 0,
        });
      }
      const rec = map.get(norm);
      rec.boards.push({
        boardId: lb.id,
        label: lb.label,
        variant: lb.variant || "",
        group: lb.group || "",
        rank: entry.rank,
        score: entry.score,
        scoreLabel: lb.score_label || "",
        url: lb.url,
      });
      if (!rec.creator && entry.creator) rec.creator = entry.creator;
      if (isOpenModel(entry.name)) rec.open = true;
    }
  }
  // Feed mentions: title contains normalized model (min 4 chars to avoid noise).
  const titles = state.items.map((it) => String(it.title || "").toLowerCase());
  for (const rec of map.values()) {
    const needle = rec.name.toLowerCase();
    if (needle.length < 4) continue;
    let count = 0;
    for (const t of titles) {
      if (t.includes(needle)) count += 1;
    }
    rec.mentions = count;
  }
  state.modelsIndex = [...map.values()].sort((a, b) => {
    if (b.boards.length !== a.boards.length) return b.boards.length - a.boards.length;
    return a.name.localeCompare(b.name);
  });
}

function pickWinner(task, license) {
  if (license === "open") return task.open_winner || null;
  return task.closed_winner || null;
}

function renderBestPicks() {
  if (!els.picksGrid) return;
  const picks = state.bestPicks;
  if (!picks || !Array.isArray(picks.tasks) || !picks.tasks.length) return;
  els.bestPicks.hidden = false;
  document.querySelectorAll(".seg-btn[data-license]").forEach((btn) => {
    const active = btn.dataset.license === state.pickLicense;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.classList.toggle("active", active);
  });
  els.picksGrid.innerHTML = picks.tasks
    .map((task) => {
      const winner = pickWinner(task, state.pickLicense);
      const licenseBadge =
        state.pickLicense === "open"
          ? '<span class="badge badge-open">Open</span>'
          : '<span class="badge badge-closed">Closed</span>';
      if (!winner) {
        return `
        <article class="pick-card reveal visible">
          <header class="pick-head">
            <span class="pick-icon" aria-hidden="true">${escapeHtml(task.icon || "◆")}</span>
            <div><h3 class="pick-task">${escapeHtml(task.label)}</h3>
            <span class="muted pick-bench">${escapeHtml(task.benchmark || "")}</span></div>
            ${licenseBadge}
          </header>
          <p class="pick-empty muted">No verified ${escapeHtml(state.pickLicense)} pick yet — see the benchmark ranking.</p>
          ${task.benchmark_url ? `<a class="lb-link" href="${escapeHtml(task.benchmark_url)}" target="_blank" rel="noopener">View benchmark →</a>` : ""}
        </article>`;
      }
      const runner = task.runner_up
        ? `<div class="pick-runner muted">Runner-up: ${escapeHtml(task.runner_up.model || "")}${task.runner_up.score ? ` · ${escapeHtml(task.runner_up.score)}` : ""}</div>`
        : "";
      return `
        <article class="pick-card reveal visible">
          <header class="pick-head">
            <span class="pick-icon" aria-hidden="true">${escapeHtml(task.icon || "◆")}</span>
            <div><h3 class="pick-task">${escapeHtml(task.label)}</h3>
            <span class="muted pick-bench">${escapeHtml(task.benchmark || "")}</span></div>
            ${licenseBadge}
          </header>
          <p class="pick-use">Use <strong>${escapeHtml(winner.model)}</strong> for ${escapeHtml(task.label.toLowerCase())}</p>
          <div class="pick-meta">
            <span class="pick-score">${escapeHtml(winner.score || "")}</span>
            <span class="muted">${escapeHtml(winner.developer || "")}${winner.released ? ` · ${escapeHtml(winner.released)}` : ""}</span>
          </div>
          ${runner}
          ${task.source_note ? `<p class="pick-src muted">${escapeHtml(task.source_note)}</p>` : ""}
          <div class="pick-links">
            ${task.benchmark_url ? `<a class="lb-link" href="${escapeHtml(task.benchmark_url)}" target="_blank" rel="noopener">Benchmark →</a>` : ""}
            <button type="button" class="lb-link pick-compare" data-model="${escapeHtml(winner.model)}">Compare →</button>
          </div>
        </article>`;
    })
    .join("");
  if (els.picksUpdated) {
    els.picksUpdated.textContent = picks.updated_at
      ? `Picks snapshot: ${formatDate(picks.updated_at)} · benchmark scores cite AI Release Tracker`
      : "";
  }
}

function compareEntryFor(modelName, boardId) {
  const lb = state.leaderboards.find((b) => b.id === boardId);
  if (!lb) return null;
  const norm = normalizeModelName(modelName).toLowerCase();
  for (const e of lb.entries || []) {
    if (normalizeModelName(e.name).toLowerCase() === norm) return e;
  }
  return null;
}

function defaultCompareSelection() {
  const top = state.modelsIndex.slice(0, 3).map((m) => m.name);
  return top;
}

function readCompareFromHash() {
  try {
    const hash = location.hash || "";
    const qIndex = hash.indexOf("?");
    if (!hash.startsWith("#compare") || qIndex === -1) return null;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const slugs = params.getAll("m").filter(Boolean).slice(0, 3);
    if (!slugs.length) return null;
    const bySlug = new Map(state.modelsIndex.map((m) => [slugifyModel(m.name), m.name]));
    const resolved = slugs.map((s) => bySlug.get(s)).filter(Boolean);
    return resolved.length ? resolved : null;
  } catch {
    return null;
  }
}

function writeCompareToHash() {
  try {
    const params = new URLSearchParams();
    for (const name of state.compare) params.append("m", slugifyModel(name));
    const base = "#compare";
    const next = state.compare.length ? `${base}?${params.toString()}` : base;
    history.replaceState(null, "", next);
  } catch {
    /* ignore */
  }
}

function renderCompare() {
  if (!els.compareSlots || !els.compareBody) return;
  els.compare.hidden = false;
  if (!state.compare.length) {
    state.compare = defaultCompareSelection();
    if (readCompareFromHash()) state.compare = readCompareFromHash();
  }
  const options = state.modelsIndex
    .map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.display)}${m.open ? " · open" : ""} (${m.boards.length})</option>`)
    .join("");
  els.compareSlots.innerHTML = state.compare
    .map(
      (name, i) => `
      <label class="compare-slot">
        <span class="muted">Model ${i + 1}</span>
        <select data-slot="${i}" aria-label="Compare model ${i + 1}">
          ${options
            .replace(
              `value="${escapeHtml(name)}"`,
              `value="${escapeHtml(name)}" selected`,
            )}
        </select>
        <button type="button" class="icon-btn compare-remove" data-remove="${i}" aria-label="Remove model ${i + 1}">×</button>
      </label>`,
    )
    .join("");
  els.compareAdd.disabled = state.compare.length >= 3;
  // Head
  els.compareHead.innerHTML =
    `<th scope="col">Board</th>` +
    state.compare
      .map(
        (name) => {
          const rec = state.modelsIndex.find((m) => m.name === name);
          const badge = rec && rec.open ? ' <span class="badge badge-open">Open</span>' : "";
          return `<th scope="col">${escapeHtml(name)}${badge}</th>`;
        },
      )
      .join("");
  // Body rows: one per leaderboard, plus overview rows.
  const rows = state.leaderboards.map((lb) => {
    const cells = state.compare.map((name) => compareEntryFor(name, lb.id));
    const scored = cells.filter((c) => c && typeof c.score === "number");
    let bestIdx = -1;
    if (scored.length >= 2) {
      let best = -Infinity;
      cells.forEach((c, idx) => {
        if (c && typeof c.score === "number" && c.score > best) {
          best = c.score;
          bestIdx = idx;
        }
      });
    }
    const tds = cells
      .map((c, idx) => {
        if (!c) return `<td class="cmp-missing">—</td>`;
        const win = idx === bestIdx ? " cmp-win" : "";
        return `<td class="cmp-cell${win}">#${escapeHtml(c.rank)} · ${escapeHtml(formatScore(c.score))}</td>`;
      })
      .join("");
    const label = `${escapeHtml(lb.label)}${lb.variant ? ` <span class="muted">· ${escapeHtml(lb.variant)}</span>` : ""}`;
    return `<tr><th scope="row">${label}<span class="cmp-sub muted">${escapeHtml(lb.score_label || "")}</span></th>${tds}</tr>`;
  });
  // Overview rows: boards present + feed mentions.
  const presence = state.compare
    .map((name) => {
      const rec = state.modelsIndex.find((m) => m.name === name);
      return `<td>${rec ? `${rec.boards.length}/${state.leaderboards.length} boards` : "—"}</td>`;
    })
    .join("");
  const mentions = state.compare
    .map((name) => {
      const rec = state.modelsIndex.find((m) => m.name === name);
      return `<td>${rec ? `${rec.mentions} mentions` : "—"}</td>`;
    })
    .join("");
  els.compareBody.innerHTML =
    rows.join("") +
    `<tr><th scope="row">Coverage<span class="cmp-sub muted">boards in top 10</span></th>${presence}</tr>` +
    `<tr><th scope="row">Feed<span class="cmp-sub muted">title mentions</span></th>${mentions}</tr>`;
  if (els.compareHint) {
    els.compareHint.textContent = state.compare.length
      ? `${state.compare.length}/3 models · ${state.modelsIndex.length} models indexed from ${state.leaderboards.length} boards`
      : "Add a model to start comparing.";
  }
  renderPopularCompare();
}

function renderPopularCompare() {
  if (!els.popularCompare) return;
  const picks = (state.modelsIndex.slice(0, 4) || []).map((m) => m.name);
  if (picks.length < 2) {
    els.popularCompare.innerHTML = "";
    return;
  }
  const pairs = [];
  for (let i = 0; i + 1 < picks.length; i += 2) pairs.push([picks[i], picks[i + 1]]);
  els.popularCompare.innerHTML =
    `<span class="muted popular-label">Popular:</span> ` +
    pairs
      .map(([a, b]) => {
        const params = new URLSearchParams();
        params.append("m", slugifyModel(a));
        params.append("m", slugifyModel(b));
        return `<button type="button" class="chip popular-chip" data-pair="${escapeHtml(a)}|||${escapeHtml(b)}">${escapeHtml(a)} vs ${escapeHtml(b)}</button>`;
      })
      .join(" ");
}

function mediaHtml(item) {
  if (item.thumbnail) {
    return `<img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />`;
  }
  return `<div class="placeholder">${escapeHtml(
    item.kind === "video" ? "Video" : item.kind === "paper" ? "Paper" : "Article",
  )}</div>`;
}

function renderTimeline() {
  const visible = state.items.filter(matches);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);

  const rangeFrom = visible.length ? start + 1 : 0;
  const rangeTo = Math.min(start + PAGE_SIZE, visible.length);
  els.status.textContent = visible.length
    ? `Showing ${rangeFrom}–${rangeTo} of ${visible.length} items`
    : `Showing 0 of ${state.items.length} items`;
  els.empty.hidden = visible.length > 0;

  const showPager = visible.length > PAGE_SIZE;
  els.pagination.hidden = !showPager;
  if (showPager) {
    els.pageLabel.textContent = `Page ${state.page} of ${totalPages}`;
    els.prevPage.disabled = state.page <= 1;
    els.nextPage.disabled = state.page >= totalPages;
  }

  els.timeline.innerHTML = pageItems
    .map((item) => {
      const category = categoryOf(item);
      const upvotes =
        typeof item.upvotes === "number"
          ? `<span class="upvotes">▲ ${item.upvotes}</span>`
          : "";
      const publishedMs = Date.parse(item.published || "");
      const isNew =
        state.seenTs != null &&
        !Number.isNaN(publishedMs) &&
        publishedMs > state.seenTs;
      return `
        <article class="card">
          <div class="card-media">${mediaHtml(item)}</div>
          <div class="card-body">
            <div class="card-meta">
              <span class="badge category-${escapeHtml(category)}">${escapeHtml(
                CATEGORY_LABELS[category] || category,
              )}</span>
              <span class="badge">${escapeHtml(item.source)}</span>
              ${isNew ? '<span class="badge badge-new">New</span>' : ""}
            </div>
            <h3 class="card-title">
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(
                item.title,
              )}</a>
            </h3>
            ${
              item.summary
                ? `<p class="card-summary">${escapeHtml(item.summary)}</p>`
                : ""
            }
            <div class="card-footer">
              <time datetime="${escapeHtml(item.published)}">${escapeHtml(
                formatDate(item.published),
              )}</time>
              ${upvotes}
            </div>
          </div>
        </article>`;
    })
    .join("");
}

function renderAll() {
  renderCategories(state.items);
  renderSources(state.items);
  renderTimeline();
}

let revealObserver = null;

function observeReveals() {
  const targets = document.querySelectorAll(".reveal:not(.visible)");
  if (!targets.length) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof IntersectionObserver === "undefined") {
    targets.forEach((el) => el.classList.add("visible"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -24px 0px" },
    );
  }
  targets.forEach((el) => revealObserver.observe(el));
}

function initBackground() {
  const canvas = document.getElementById("bg-canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Animate even when reduced-motion is requested: background is subtle ambience,
  // but a frozen canvas reads as "broken". Only CSS motion is disabled.
  const COLORS = ["#ffd60a", "#ff2d95", "#00e5ff"];
  let width = 0;
  let height = 0;
  let particles = [];
  let rafId = null;
  let running = false;

  function hexToRgba(hex, alpha) {
    const value = parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeParticle() {
    const shine = Math.random() < 0.16;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      r: shine ? 36 + Math.random() * 70 : 1.4 + Math.random() * 2.6,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -0.1 - Math.random() * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      base: shine ? 0.06 + Math.random() * 0.05 : 0.3 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.5 + Math.random() * 1.1,
      shine,
    };
  }

  function seed() {
    const count = width < 640 ? 26 : 52;
    particles = Array.from({ length: count }, makeParticle);
  }

  function draw(time) {
    const theme = document.documentElement.dataset.theme;
    const alphaScale = theme === "light" ? 0.5 : 1;
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -p.r) {
        p.y = height + p.r;
        p.x = Math.random() * width;
      }
      if (p.x < -p.r) p.x = width + p.r;
      if (p.x > width + p.r) p.x = -p.r;
      const twinkle = 0.7 + 0.3 * Math.sin(time * 0.001 * p.twinkle + p.phase);
      const alpha = p.base * twinkle * alphaScale;
      if (p.shine) {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gradient.addColorStop(0, hexToRgba(p.color, alpha));
        gradient.addColorStop(1, hexToRgba(p.color, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }
  }

  function loop(time) {
    draw(time);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  resize();
  seed();
  start();
  window.addEventListener("resize", () => {
    resize();
    seed();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
}

function updateFreshness(iso) {
  if (!iso || !els.freshnessText) return;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return;
  const time = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const stale = Date.now() - date.getTime() > 2 * 60 * 60 * 1000;
  if (els.freshness) els.freshness.classList.toggle("stale", stale);
  els.freshnessText.textContent = stale
    ? `Stale · updated ${time}`
    : `Updated ${time}`;
}

function renderHealth(health) {
  if (!health || !Array.isArray(health.sources) || !health.sources.length) {
    return;
  }
  if (!els.health) return;
  const sources = health.sources;
  const okCount = sources.filter((row) => row.ok).length;
  const failCount = sources.length - okCount;
  const summary = `<span class="health-summary">${okCount} ok${
    failCount ? ` · <strong>${failCount} failed</strong>` : ""
  }</span>`;
  const chips = sources
    .map((row) => {
      const title = row.ok
        ? `${row.name}: ${row.items} items`
        : `${row.name}: ${row.error || "fetch failed"}`;
      return `<span class="health-chip ${row.ok ? "ok" : "fail"}" title="${escapeHtml(
        title,
      )}"><span class="hc-dot" aria-hidden="true"></span>${escapeHtml(row.name)}</span>`;
    })
    .join("");
  let lbChip = "";
  if (health.leaderboards) {
    const lb = health.leaderboards;
    const detail = lb.failed
      ? `${lb.ok} ok · ${lb.failed} failed`
      : `${lb.ok} ok`;
    lbChip = `<span class="health-chip ${
      lb.failed ? "fail" : "ok"
    }" title="${escapeHtml(`Leaderboards: ${detail}`)}"><span class="hc-dot" aria-hidden="true"></span>Leaderboards</span>`;
  }
  els.health.innerHTML = summary + chips + lbChip;
  els.health.hidden = false;
}

async function load() {
  try {
    const seenRaw = localStorage.getItem("seen_ts");
    state.seenTs = seenRaw ? Number(seenRaw) : null;
    if (Number.isNaN(state.seenTs)) state.seenTs = null;

    const resp = await fetch("data/items.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    state.featured = Array.isArray(data.featured) ? data.featured : [];
    state.leaderboards = Array.isArray(data.leaderboards)
      ? data.leaderboards
      : [];
    state.health = data.health || null;
    state.bestPicks = data.best_picks || null;
    state.openPatterns = (state.bestPicks && state.bestPicks.open_patterns) || [];
    const savedLicense = localStorage.getItem("pick_license");
    if (savedLicense === "open" || savedLicense === "closed") {
      state.pickLicense = savedLicense;
    }
    updateFreshness(data.generated_at);
    if (els.updated && data.generated_at) {
      els.updated.textContent = `Updated ${formatDate(data.generated_at)}`;
    }
    renderFeatured();
    renderLeaderboards();
    buildModelsIndex();
    const fromHash = readCompareFromHash();
    state.compare = fromHash || defaultCompareSelection();
    renderBestPicks();
    renderCompare();
    renderAll();
    observeReveals();
    renderHealth(state.health);
    localStorage.setItem("seen_ts", String(Date.now()));
  } catch (error) {
    els.status.textContent = `Failed to load data: ${error.message}`;
    els.timeline.innerHTML = "";
    els.empty.hidden = false;
    els.empty.innerHTML =
      "<p>Could not load <code>data/items.json</code>. Run <code>python fetch.py</code> first.</p>";
  }
}

function goToPage(page) {
  state.page = page;
  renderTimeline();
  els.timeline.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindEvents() {
  let searchTimer = null;
  els.search.addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = value.trim().toLowerCase();
      state.page = 1;
      renderTimeline();
    }, 200);
  });

  els.sourceFilter.addEventListener("change", (event) => {
    state.source = event.target.value;
    state.page = 1;
    renderTimeline();
  });

  els.categoryFilters.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-category]");
    if (!btn) return;
    state.category = btn.dataset.category;
    state.page = 1;
    renderCategories(state.items);
    renderTimeline();
  });

  els.prevPage.addEventListener("click", () => {
    if (state.page > 1) goToPage(state.page - 1);
  });

  els.nextPage.addEventListener("click", () => {
    goToPage(state.page + 1);
  });

  els.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  document.querySelectorAll(".seg-btn[data-license]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.pickLicense = btn.dataset.license;
      localStorage.setItem("pick_license", state.pickLicense);
      renderBestPicks();
    });
  });

  if (els.picksGrid) {
    els.picksGrid.addEventListener("click", (event) => {
      const btn = event.target.closest(".pick-compare");
      if (!btn) return;
      const raw = btn.dataset.model || "";
      const norm = normalizeModelName(raw);
      const wantSlug = slugifyModel(norm);
      const known = state.modelsIndex.find(
        (m) => m.name.toLowerCase() === norm.toLowerCase(),
      ) || state.modelsIndex.find((m) => slugifyModel(m.name) === wantSlug);
      const label = known ? known.name : norm;
      if (!label) return;
      if (!state.compare.includes(label)) {
        if (state.compare.length >= 3) state.compare.shift();
        state.compare.push(label);
      }
      renderCompare();
      writeCompareToHash();
      if (els.compare) els.compare.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (els.compareSlots) {
    els.compareSlots.addEventListener("change", (event) => {
      const sel = event.target.closest("select[data-slot]");
      if (!sel) return;
      const idx = Number(sel.dataset.slot);
      state.compare[idx] = sel.value;
      renderCompare();
      writeCompareToHash();
    });
    els.compareSlots.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove]");
      if (!btn) return;
      state.compare.splice(Number(btn.dataset.remove), 1);
      renderCompare();
      writeCompareToHash();
    });
  }

  if (els.compareAdd) {
    els.compareAdd.addEventListener("click", () => {
      if (state.compare.length >= 3) return;
      const firstMissing = state.modelsIndex.find((m) => !state.compare.includes(m.name));
      if (firstMissing) {
        state.compare.push(firstMissing.name);
        renderCompare();
        writeCompareToHash();
      }
    });
  }

  if (els.compareCopy) {
    els.compareCopy.addEventListener("click", async () => {
      writeCompareToHash();
      const url = location.href;
      try {
        await navigator.clipboard.writeText(url);
        els.compareCopy.textContent = "Copied ✓";
      } catch {
        prompt("Copy this link:", url);
        return;
      }
      setTimeout(() => {
        els.compareCopy.textContent = "Copy link";
      }, 1600);
    });
  }

  if (els.compareClear) {
    els.compareClear.addEventListener("click", () => {
      state.compare = [];
      renderCompare();
      writeCompareToHash();
    });
  }

  if (els.popularCompare) {
    els.popularCompare.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-pair]");
      if (!chip) return;
      const [a, b] = String(chip.dataset.pair).split("|||");
      state.compare = [a, b].filter(Boolean).slice(0, 3);
      renderCompare();
      writeCompareToHash();
    });
  }

  window.addEventListener("hashchange", () => {
    const fromHash = readCompareFromHash();
    if (fromHash) {
      state.compare = fromHash;
      renderCompare();
    }
  });
}

initTheme();
bindEvents();
initBackground();
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
load();
