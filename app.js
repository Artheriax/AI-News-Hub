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
      <a class="featured-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">
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
        <article class="lb-card">
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
      return `
        <article class="card">
          <div class="card-media">${mediaHtml(item)}</div>
          <div class="card-body">
            <div class="card-meta">
              <span class="badge category-${escapeHtml(category)}">${escapeHtml(
                CATEGORY_LABELS[category] || category,
              )}</span>
              <span class="badge">${escapeHtml(item.source)}</span>
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

async function load() {
  try {
    const resp = await fetch("data/items.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    state.featured = Array.isArray(data.featured) ? data.featured : [];
    state.leaderboards = Array.isArray(data.leaderboards)
      ? data.leaderboards
      : [];
    if (data.generated_at) {
      els.updated.textContent = `Updated ${formatDate(data.generated_at)}`;
    }
    renderFeatured();
    renderLeaderboards();
    renderAll();
  } catch (error) {
    els.status.textContent = `Failed to load data: ${error.message}`;
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
load();
