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
    updateFreshness(data.generated_at);
    if (els.updated && data.generated_at) {
      els.updated.textContent = `Updated ${formatDate(data.generated_at)}`;
    }
    renderFeatured();
    renderLeaderboards();
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
  els.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.page = 1;
    renderTimeline();
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
    renderAll();
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
}

initTheme();
bindEvents();
initBackground();
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
load();
