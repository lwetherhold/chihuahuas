const DATA_URL = new URL("data/dogs.json", import.meta.url);

/** @type {Map<string, object>} */
const dogsById = new Map();

/** @type {ReturnType<typeof setInterval>[]} */
const carouselTimers = [];

let modalCarouselTimer = null;
let lastFocus = null;
let currentMeta = {};

const els = {
  loadMsg: document.getElementById("load-msg"),
  errMsg: document.getElementById("err-msg"),
  grid: document.getElementById("dog-grid"),
  pageTitle: document.getElementById("page-title"),
  pageSubtitle: document.getElementById("page-subtitle"),
  weightNote: document.getElementById("weight-note"),
  modal: document.getElementById("dog-modal"),
  modalInner: document.getElementById("modal-inner"),
  modalClose: document.getElementById("modal-close"),
  themeToggle: document.getElementById("theme-toggle"),
  themeToggleLabel: document.getElementById("theme-toggle-label"),
  sortSelect: document.getElementById("sort-select"),
  compatBanner: document.getElementById("compat-banner"),
  backToTop: document.getElementById("back-to-top"),
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPhotoUrls(dog) {
  const urls = [];
  if (Array.isArray(dog.photoUrls)) {
    dog.photoUrls.forEach((u) => {
      if (u && String(u).trim()) urls.push(String(u).trim());
    });
  }
  if (dog.photoUrl && String(dog.photoUrl).trim()) urls.push(String(dog.photoUrl).trim());
  return [...new Set(urls)];
}

/** Listing personality: prefer `personality`, fall back to legacy `temperament`. */
function getPersonality(dog) {
  const p = dog.personality != null && String(dog.personality).trim() ? String(dog.personality).trim() : "";
  if (p) return p;
  if (dog.temperament != null && String(dog.temperament).trim()) return String(dog.temperament).trim();
  return "";
}

function formatCuddle(score) {
  const map = { high: "Very cuddly", medium: "Somewhat cuddly", unknown: "Cuddliness unclear" };
  return map[score] || map.unknown;
}

function labelForScore(s) {
  if (s >= 85) return "Excellent";
  if (s >= 70) return "Strong";
  if (s >= 55) return "Good";
  if (s >= 40) return "Okay";
  return "Tougher fit";
}

/**
 * @returns {{ score: number, label: string, factors: string[], manual: boolean }}
 */
function computeCompatibility(dog, meta) {
  if (typeof dog.compatibilityScore === "number" && !Number.isNaN(dog.compatibilityScore)) {
    const score = clamp(Math.round(dog.compatibilityScore), 0, 100);
    return {
      score,
      label: labelForScore(score),
      factors: ["Score set manually in the data file"],
      manual: true,
    };
  }

  const target = meta?.targetWeightLbs || { min: 5, max: 6 };
  const ideal = (target.min + target.max) / 2;
  let score = 52;
  /** @type {string[]} */
  const factors = [];

  if (typeof dog.weightLbs === "number" && !Number.isNaN(dog.weightLbs)) {
    const d = Math.abs(dog.weightLbs - ideal);
    if (d <= 0.6) {
      score += 26;
      factors.push("Near ideal weight (~5–6 lbs)");
    } else if (d <= 1.5) {
      score += 16;
      factors.push("Close to target weight");
    } else if (d <= 3) {
      score += 6;
      factors.push("Weight somewhat off target");
    } else {
      score -= 12;
      factors.push("Weight farther from ~5–6 lbs");
    }
  } else {
    factors.push("Weight not listed — confirm with shelter");
  }

  const c = dog.cuddleScore;
  if (c === "high") {
    score += 18;
    factors.push("Sounds very cuddly / lap-oriented");
  } else if (c === "medium") {
    score += 8;
    factors.push("Somewhat cuddly");
  } else {
    factors.push("Cuddliness not rated");
  }

  const text = `${getPersonality(dog)} ${dog.temperament || ""}`.toLowerCase();
  const energeticHints = [
    "spunky",
    "high energy",
    "high-energy",
    "very active",
    "lots of exercise",
    "needs lots of exercise",
    "bouncy",
    "jumpy",
    "feisty",
    "terrier",
    "bossy",
  ];
  let penalty = 0;
  for (const w of energeticHints) {
    if (text.includes(w)) penalty += 7;
  }
  penalty = Math.min(penalty, 28);
  if (penalty > 0) {
    score -= penalty;
    factors.push("Listing sounds energetic — may be less of a lap dog");
  }

  const calmHints = ["calm", "lap", "cuddl", "snuggl", "held", "quiet", "gentle", "loves people", "companion"];
  let bonus = 0;
  for (const w of calmHints) {
    if (text.includes(w)) bonus += 2;
  }
  bonus = Math.min(bonus, 14);
  score += bonus;
  if (bonus >= 6) factors.push("Sounds calm / people-focused");

  score = clamp(Math.round(score), 0, 100);
  if (!factors.length) factors.push("Baseline estimate from available info");

  return { score, label: labelForScore(score), factors, manual: false };
}

function weightHtml(dog, meta) {
  const target = meta?.targetWeightLbs;
  if (typeof dog.weightLbs === "number" && !Number.isNaN(dog.weightLbs)) {
    const match =
      target && dog.weightLbs >= target.min && dog.weightLbs <= target.max
        ? ` <span class="badge badge--match">${target.min}–${target.max} lbs</span>`
        : "";
    return `<span class="stat"><span class="stat__label">Weight</span> <span class="stat__value">${dog.weightLbs} lbs</span>${match}</span>`;
  }
  return `<span class="stat"><span class="stat__label">Weight</span> <span class="stat__value">Not listed</span> <span class="badge badge--missing-weight" title="Ask the shelter or foster">Ask shelter</span></span>`;
}

function renderCarouselMarkup(urls, dogId, dotsClass = "carousel__dots") {
  if (!urls.length) {
    return `<div class="dog-card__carousel"><div class="carousel__track carousel__track--empty"><div class="dog-card__photo--placeholder">🐕</div></div></div>`;
  }

  const slides = urls
    .map(
      (u, i) =>
        `<img class="carousel__slide ${i === 0 ? "is-active" : ""}" src="${escapeHtml(u)}" alt="" loading="lazy" data-slide-index="${i}" />`
    )
    .join("");

  const dots =
    urls.length > 1
      ? urls
          .map(
            (_, i) =>
              `<button type="button" class="carousel__dot ${i === 0 ? "is-active" : ""}" data-carousel-dot="${escapeHtml(dogId)}" data-slide="${i}" aria-label="Photo ${i + 1} of ${urls.length}"></button>`
          )
          .join("")
      : "";

  return `
    <div class="dog-card__carousel" data-carousel-root="${escapeHtml(dogId)}" data-slide-count="${urls.length}">
      <div class="carousel__track">${slides}</div>
      ${dots ? `<div class="${dotsClass}">${dots}</div>` : ""}
    </div>`;
}

function setActiveSlide(container, index) {
  const slides = container.querySelectorAll(".carousel__slide");
  const dots = container.querySelectorAll(".carousel__dot");
  slides.forEach((s, i) => s.classList.toggle("is-active", i === index));
  dots.forEach((d, i) => d.classList.toggle("is-active", i === index));
}

function wireCarousel(container, dogId) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = parseInt(container.getAttribute("data-slide-count") || "0", 10);
  if (count <= 1) return;

  let idx = 0;
  let paused = false;

  const tick = () => {
    if (paused) return;
    idx = (idx + 1) % count;
    setActiveSlide(container, idx);
  };

  let timer = null;
  if (!reduce) {
    timer = window.setInterval(tick, 4200);
    carouselTimers.push(timer);
  }

  container.addEventListener("mouseenter", () => {
    paused = true;
  });
  container.addEventListener("mouseleave", () => {
    paused = false;
  });

  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-carousel-dot]");
    if (!btn || btn.getAttribute("data-carousel-dot") !== dogId) return;
    const si = parseInt(btn.getAttribute("data-slide") || "0", 10);
    if (!Number.isNaN(si)) {
      idx = si;
      setActiveSlide(container, idx);
    }
  });
}

function clearCarouselTimers() {
  carouselTimers.forEach((id) => clearInterval(id));
  carouselTimers.length = 0;
}

function renderCard(dog, meta) {
  const compat = computeCompatibility(dog, meta);
  const urls = getPhotoUrls(dog);
  const personality = getPersonality(dog);
  const persoDisplay = personality || "Not specified on listing — see details.";

  const li = document.createElement("li");
  li.className = "dog-card";
  li.innerHTML = `
    <div class="dog-card__match-ring" title="${escapeHtml(compat.label)} match">${compat.score}</div>
    ${renderCarouselMarkup(urls, dog.id)}
    <div class="dog-card__body">
      <h2 class="dog-card__name">${escapeHtml(dog.name)}</h2>
      <div class="dog-card__stats">
        <span class="stat"><span class="stat__label">Age</span> <span class="stat__value">${escapeHtml(dog.age)}</span></span>
        ${weightHtml(dog, meta)}
        ${dog.sex ? `<span class="stat"><span class="stat__label">Sex</span> <span class="stat__value">${escapeHtml(dog.sex)}</span></span>` : ""}
        ${dog.cuddleScore ? `<span class="badge" title="Lap / cuddle estimate">${escapeHtml(formatCuddle(dog.cuddleScore))}</span>` : ""}
      </div>
      <p class="dog-card__summary">${escapeHtml(dog.summary)}</p>
      <p class="dog-card__personality-label">Personality</p>
      <p class="dog-card__personality">${escapeHtml(persoDisplay)}</p>
      <button type="button" class="dog-card__btn" data-open="${escapeHtml(dog.id)}">Full details</button>
    </div>
  `;
  return li;
}

function sortDogs(dogs, sortKey) {
  const arr = [...dogs];
  if (sortKey === "name-asc") {
    arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } else if (sortKey === "weight-asc") {
    arr.sort((a, b) => {
      const wa = typeof a.weightLbs === "number" ? a.weightLbs : 999;
      const wb = typeof b.weightLbs === "number" ? b.weightLbs : 999;
      return wa - wb;
    });
  } else if (sortKey === "weight-desc") {
    arr.sort((a, b) => {
      const wa = typeof a.weightLbs === "number" ? a.weightLbs : -1;
      const wb = typeof b.weightLbs === "number" ? b.weightLbs : -1;
      return wb - wa;
    });
  } else {
    arr.sort((a, b) => computeCompatibility(b, currentMeta).score - computeCompatibility(a, currentMeta).score);
  }
  return arr;
}

function renderModalCarousel(urls, modalId) {
  if (!urls.length) return "";
  const slides = urls
    .map(
      (u, i) =>
        `<img class="carousel__slide ${i === 0 ? "is-active" : ""}" src="${escapeHtml(u)}" alt="" loading="lazy" />`
    )
    .join("");
  const dots =
    urls.length > 1
      ? urls
          .map(
            (_, i) =>
              `<button type="button" class="carousel__dot ${i === 0 ? "is-active" : ""}" data-modal-dot="${escapeHtml(modalId)}" data-slide="${i}" aria-label="Photo ${i + 1}"></button>`
          )
      : "";
  return `
    <div class="modal-carousel" data-modal-carousel="${escapeHtml(modalId)}" data-slide-count="${urls.length}">
      <div class="carousel__track">${slides}</div>
      ${dots ? `<div class="carousel__dots">${dots}</div>` : ""}
    </div>`;
}

function wireModalCarousel(container, modalId) {
  if (modalCarouselTimer) {
    clearInterval(modalCarouselTimer);
    modalCarouselTimer = null;
  }
  const count = parseInt(container.getAttribute("data-slide-count") || "0", 10);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (count <= 1 || reduce) return;

  let idx = 0;
  let paused = false;
  modalCarouselTimer = window.setInterval(() => {
    if (paused) return;
    idx = (idx + 1) % count;
    setActiveSlide(container, idx);
  }, 4500);

  container.addEventListener("mouseenter", () => {
    paused = true;
  });
  container.addEventListener("mouseleave", () => {
    paused = false;
  });

  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-modal-dot]");
    if (!btn || btn.getAttribute("data-modal-dot") !== modalId) return;
    const si = parseInt(btn.getAttribute("data-slide") || "0", 10);
    if (!Number.isNaN(si)) {
      idx = si;
      setActiveSlide(container, idx);
    }
  });
}

function openModal(dog) {
  lastFocus = document.activeElement;
  els.modal.hidden = false;
  document.body.style.overflow = "hidden";

  const urls = getPhotoUrls(dog);
  const compat = computeCompatibility(dog, currentMeta);
  const personality = getPersonality(dog);
  const modalId = `modal-${dog.id}`;

  const weightBlock =
    typeof dog.weightLbs === "number" && !Number.isNaN(dog.weightLbs)
      ? `<dt>Weight</dt><dd>${dog.weightLbs} lbs (exact from listing)</dd>`
      : `<dt>Weight</dt><dd>Not specified on the site — ask the shelter or foster for an exact weight.</dd>`;

  const photoBlock = renderModalCarousel(urls, modalId);

  const sourceBlock = dog.sourceUrl
    ? `<p class="modal-source">Original listing: <a href="${escapeHtml(dog.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        dog.sourceUrl
      )}</a></p>`
    : "";

  const lapNote = dog.lapDogNote
    ? `<div class="modal-lap"><strong>About being held / laps:</strong> ${escapeHtml(dog.lapDogNote)}</div>`
    : "";

  const adoptionBlock = dog.adoptionProcess && String(dog.adoptionProcess).trim()
    ? `<div>
        <h3 class="modal-section-title">Adoption process (from listing)</h3>
        <div class="modal-adoption">${escapeHtml(String(dog.adoptionProcess).trim())}</div>
      </div>`
    : "";

  const factorsList =
    compat.factors && compat.factors.length
      ? `<ul class="modal-score__factors">${compat.factors.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
      : "";

  const fillPct = compat.score;

  els.modalInner.innerHTML = `
    <h2 id="modal-title">${escapeHtml(dog.name)}</h2>
    <div class="modal-score">
      <span class="modal-score__value">${compat.score}/100 · ${escapeHtml(compat.label)}</span>
      <div class="modal-score__bar" role="presentation"><div class="modal-score__fill" style="width:${fillPct}%"></div></div>
      ${factorsList}
    </div>
    ${photoBlock}
    <dl class="modal-stats">
      <dt>Age</dt><dd>${escapeHtml(dog.age)}</dd>
      ${weightBlock}
      ${dog.sex ? `<dt>Sex</dt><dd>${escapeHtml(dog.sex)}</dd>` : ""}
      ${dog.cuddleScore ? `<dt>Cuddliness (our note)</dt><dd>${escapeHtml(formatCuddle(dog.cuddleScore))}</dd>` : ""}
    </dl>
    <div>
      <h3 class="modal-section-title">Personality (from listing)</h3>
      <p class="modal-personality">${escapeHtml(personality || "Not spelled out on the site — ask the shelter or foster.")}</p>
    </div>
    ${lapNote}
    <div>
      <h3 class="modal-section-title">Notes & description</h3>
      <p class="modal-body">${escapeHtml(dog.details)}</p>
    </div>
    ${adoptionBlock}
    ${sourceBlock}
  `;

  const mc = els.modalInner.querySelector(`[data-modal-carousel="${modalId}"]`);
  if (mc) wireModalCarousel(mc, modalId);

  els.modalClose.focus();
}

function closeModal() {
  if (modalCarouselTimer) {
    clearInterval(modalCarouselTimer);
    modalCarouselTimer = null;
  }
  els.modal.hidden = true;
  document.body.style.overflow = "";
  if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
}

function onGridClick(e) {
  const btn = e.target.closest("[data-open]");
  if (!btn || !els.grid.contains(btn)) return;
  const id = btn.getAttribute("data-open");
  const dog = id ? dogsById.get(id) : undefined;
  if (dog) openModal(dog);
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("chihuahuas-theme", t);
  } catch (e) {}
  if (els.themeToggle) els.themeToggle.setAttribute("aria-pressed", t === "dark");
  if (els.themeToggleLabel) els.themeToggleLabel.textContent = t === "dark" ? "Dark theme (on)" : "Light theme (on)";
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
}

function rebuildGrid(dogs) {
  clearCarouselTimers();
  const sortKey = els.sortSelect?.value || "compatibility-desc";
  const sorted = sortDogs(dogs, sortKey);
  els.grid.innerHTML = "";
  sorted.forEach((dog) => els.grid.appendChild(renderCard(dog, currentMeta)));
  els.grid.querySelectorAll("[data-carousel-root]").forEach((el) => {
    const id = el.getAttribute("data-carousel-root");
    if (id) wireCarousel(el, id);
  });
}

async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Could not load dog list (${res.status})`);
    const data = await res.json();
    const meta = data.meta || {};
    const dogs = Array.isArray(data.dogs) ? data.dogs : [];

    currentMeta = meta;

    dogsById.clear();
    dogs.forEach((d) => {
      if (d && d.id) dogsById.set(d.id, d);
    });

    if (meta.title) els.pageTitle.textContent = meta.title;
    if (meta.subtitle) {
      els.pageSubtitle.textContent = meta.subtitle;
      els.pageSubtitle.hidden = false;
    }
    if (meta.targetWeightLbs?.note) {
      els.weightNote.textContent = meta.targetWeightLbs.note;
      els.weightNote.hidden = false;
    }

    if (els.compatBanner) els.compatBanner.hidden = false;

    const stored = (() => {
      try {
        return localStorage.getItem("chihuahuas-theme");
      } catch (e) {
        return null;
      }
    })();
    if (stored === "light" || stored === "dark") {
      applyTheme(stored);
    } else {
      applyTheme("dark");
    }

    els.loadMsg.hidden = true;
    rebuildGrid(dogs);

    els.grid.addEventListener("click", onGridClick);

    els.sortSelect?.addEventListener("change", () => rebuildGrid(dogs));

    els.themeToggle?.addEventListener("click", toggleTheme);

    const onScroll = () => {
      if (!els.backToTop) return;
      els.backToTop.hidden = window.scrollY < 400;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    els.backToTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  } catch (err) {
    console.error(err);
    els.loadMsg.hidden = true;
    els.errMsg.hidden = false;
    els.errMsg.textContent =
      "We could not load the dog list. If you opened this file from disk, use a local server or view the published GitHub Pages site.";
  }
}

els.modalClose.addEventListener("click", closeModal);
els.modal.querySelector("[data-close-modal]")?.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.modal.hidden) closeModal();
});

init();
