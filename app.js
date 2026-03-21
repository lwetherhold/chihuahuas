const DATA_URL = new URL("data/dogs.json", import.meta.url);

const LS_FAV = "chihuahuas-favorites";
const LS_COMPARE = "chihuahuas-compare";
const MAX_COMPARE = 3;

const MISSING = "Not provided on the listing.";

/** @type {Map<string, object>} */
const dogsById = new Map();

/** @type {ReturnType<typeof setInterval>[]} */
const carouselTimers = [];

/** @type {Set<string>} */
let favoriteSet = new Set();

/** @type {string[]} */
let compareIds = [];

let modalCarouselTimer = null;
let lastFocus = null;
let currentMeta = {};

/** @type {object[]} */
let allDogs = [];

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
  toolbar: document.getElementById("toolbar"),
  searchInput: document.getElementById("search-input"),
  filterMinTier: document.getElementById("filter-min-tier"),
  filterCare: document.getElementById("filter-care"),
  filterMaxDist: document.getElementById("filter-max-dist"),
  filterBreed: document.getElementById("filter-breed"),
  filterFavoritesOnly: document.getElementById("filter-favorites-only"),
  filterClear: document.getElementById("filter-clear"),
  filterCount: document.getElementById("filter-count"),
  compareDock: document.getElementById("compare-dock"),
  compareOpen: document.getElementById("compare-open"),
  compareClear: document.getElementById("compare-clear"),
  compareModal: document.getElementById("compare-modal"),
  compareModalClose: document.getElementById("compare-modal-close"),
  compareTableWrap: document.getElementById("compare-table-wrap"),
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

function hasText(v) {
  return v != null && String(v).trim().length > 0;
}

function displayOrMissing(val) {
  return hasText(val) ? escapeHtml(String(val).trim()) : `<span class="missing-field">${MISSING}</span>`;
}

function loadFavoriteSet() {
  try {
    const raw = localStorage.getItem(LS_FAV);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch (e) {
    return new Set();
  }
}

function saveFavoriteSet() {
  try {
    localStorage.setItem(LS_FAV, JSON.stringify([...favoriteSet]));
  } catch (e) {}
}

function loadCompareIds() {
  try {
    const raw = localStorage.getItem(LS_COMPARE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, MAX_COMPARE) : [];
  } catch (e) {
    return [];
  }
}

function saveCompareIds() {
  try {
    localStorage.setItem(LS_COMPARE, JSON.stringify(compareIds));
  } catch (e) {}
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

function getPersonality(dog) {
  const p = hasText(dog.personality) ? String(dog.personality).trim() : "";
  if (p) return p;
  if (hasText(dog.temperament)) return String(dog.temperament).trim();
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

/** @returns {'excellent'|'strong'|'good'|'okay'|'low'} */
function getTierKey(score) {
  if (score >= 85) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 55) return "good";
  if (score >= 40) return "okay";
  return "low";
}

function tierClassName(score) {
  return `tier-${getTierKey(score)}`;
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

function getAgeSortMonths(dog) {
  if (typeof dog.ageSortMonths === "number" && !Number.isNaN(dog.ageSortMonths)) return dog.ageSortMonths;
  const s = String(dog.age || "").toLowerCase();
  const y = s.match(/(\d+)\s*year/);
  const m = s.match(/(\d+)\s*month/);
  if (y) return parseInt(y[1], 10) * 12;
  if (m) return parseInt(m[1], 10);
  if (s.includes("senior")) return 120;
  if (s.includes("puppy") || s.includes("baby")) return 3;
  return 99999;
}

function getDistanceMiles(dog) {
  if (typeof dog.distanceMiles === "number" && !Number.isNaN(dog.distanceMiles)) return dog.distanceMiles;
  return null;
}

function careSettingValue(dog) {
  const v = dog.careSetting;
  if (v === "shelter" || v === "foster") return v;
  return "unknown";
}

function normalizeCareLabel(dog) {
  const v = careSettingValue(dog);
  if (v === "shelter") return "Shelter / on-site";
  if (v === "foster") return "Foster home";
  return "Not specified";
}

function minTierToScore(tier) {
  const map = { any: 0, gte40: 40, gte55: 55, gte70: 70, gte85: 85 };
  return map[tier] ?? 0;
}

function searchHaystack(dog) {
  const parts = [
    dog.name,
    dog.petId,
    dog.breed,
    dog.location,
    dog.origin,
    dog.caretakerName,
    getPersonality(dog),
    dog.summary,
    dog.details,
    dog.color,
  ];
  return parts
    .filter(Boolean)
    .map((x) => String(x).toLowerCase())
    .join(" ");
}

function passesFilters(dog) {
  const compat = computeCompatibility(dog, currentMeta);
  const q = (els.searchInput?.value || "").trim().toLowerCase();
  if (q && !searchHaystack(dog).includes(q)) return false;

  const minTier = els.filterMinTier?.value || "any";
  if (minTier !== "any" && compat.score < minTierToScore(minTier)) return false;

  const care = els.filterCare?.value || "any";
  if (care !== "any" && careSettingValue(dog) !== care) return false;

  const maxD = parseFloat(els.filterMaxDist?.value || "");
  if (!Number.isNaN(maxD) && maxD > 0) {
    const dm = getDistanceMiles(dog);
    if (dm != null && dm > maxD) return false;
  }

  const breedQ = (els.filterBreed?.value || "").trim().toLowerCase();
  if (breedQ) {
    const b = (dog.breed && String(dog.breed).toLowerCase()) || "";
    if (!b.includes(breedQ)) return false;
  }

  if (els.filterFavoritesOnly?.checked && !favoriteSet.has(dog.id)) return false;

  return true;
}

function filterDogs(dogs) {
  return dogs.filter(passesFilters);
}

function sortDogs(dogs, sortKey) {
  const arr = [...dogs];
  const meta = currentMeta;

  if (sortKey === "favorites-first") {
    const byScore = (a, b) => computeCompatibility(b, meta).score - computeCompatibility(a, meta).score;
    const fav = arr.filter((d) => favoriteSet.has(d.id)).sort(byScore);
    const rest = arr.filter((d) => !favoriteSet.has(d.id)).sort(byScore);
    return [...fav, ...rest];
  }

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
  } else if (sortKey === "age-asc") {
    arr.sort((a, b) => getAgeSortMonths(a) - getAgeSortMonths(b));
  } else if (sortKey === "age-desc") {
    arr.sort((a, b) => getAgeSortMonths(b) - getAgeSortMonths(a));
  } else if (sortKey === "distance-asc") {
    arr.sort((a, b) => {
      const da = getDistanceMiles(a);
      const db = getDistanceMiles(b);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  } else if (sortKey === "distance-desc") {
    arr.sort((a, b) => {
      const da = getDistanceMiles(a);
      const db = getDistanceMiles(b);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return db - da;
    });
  } else {
    arr.sort((a, b) => computeCompatibility(b, meta).score - computeCompatibility(a, meta).score);
  }
  return arr;
}

/** Favorites at top (keeps order within each group). */
function boostFavorites(dogs, sortKey) {
  if (sortKey === "favorites-first") return dogs;
  const fav = dogs.filter((d) => favoriteSet.has(d.id));
  const rest = dogs.filter((d) => !favoriteSet.has(d.id));
  return [...fav, ...rest];
}

/** One short line for the card (photos + name + tap for more). */
function cardFactsLine(dog) {
  const age = hasText(dog.age) ? String(dog.age).trim() : "Age?";
  const w = typeof dog.weightLbs === "number" && !Number.isNaN(dog.weightLbs) ? `${dog.weightLbs} lbs` : "Weight?";
  return `${age} · ${w}`;
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

  const tick = () => {
    idx = (idx + 1) % count;
    setActiveSlide(container, idx);
  };

  let timer = null;
  if (!reduce) {
    timer = window.setInterval(tick, 4200);
    carouselTimers.push(timer);
  }

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
  const tier = tierClassName(compat.score);
  const urls = getPhotoUrls(dog);
  const isFav = favoriteSet.has(dog.id);
  const inCompare = compareIds.includes(dog.id);

  const li = document.createElement("li");
  li.className = "dog-card";
  li.innerHTML = `
    <button type="button" class="dog-card__fav ${isFav ? "is-fav" : ""}" data-favorite-toggle="${escapeHtml(
      dog.id
    )}" aria-pressed="${isFav}" aria-label="${isFav ? "Remove saved dog" : "Save dog"}">${isFav ? "♥" : "♡"}</button>
    <div class="dog-card__match-ring ${tier}" title="${escapeHtml(compat.label)}">${compat.score}</div>
    ${renderCarouselMarkup(urls, dog.id)}
    <div class="dog-card__body">
      <h2 class="dog-card__name">${escapeHtml(dog.name)}</h2>
      <p class="dog-card__facts">${escapeHtml(cardFactsLine(dog))}</p>
      <p class="dog-card__peek">${escapeHtml(dog.summary)}</p>
      <div class="dog-card__row">
        <label class="dog-card__compare"><input type="checkbox" data-compare-toggle="${escapeHtml(dog.id)}" ${inCompare ? "checked" : ""} /> Compare</label>
        <button type="button" class="dog-card__btn" data-open="${escapeHtml(dog.id)}">Details</button>
      </div>
    </div>
  `;
  return li;
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
  modalCarouselTimer = window.setInterval(() => {
    idx = (idx + 1) % count;
    setActiveSlide(container, idx);
  }, 4500);

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

function longBlock(title, text, threshold = 220) {
  if (!hasText(text)) return `<p class="missing-block">${MISSING}</p>`;
  const t = String(text).trim();
  if (t.length <= threshold) return `<div class="modal-block"><h3 class="modal-section-title">${escapeHtml(title)}</h3><p class="modal-body">${escapeHtml(t)}</p></div>`;
  return `<details class="expand-block"><summary><span class="expand-title">${escapeHtml(title)}</span> <span class="expand-hint">Show full text</span></summary><div class="modal-body">${escapeHtml(t)}</div></details>`;
}

function adoptionSection(dog) {
  const summary = hasText(dog.adoptionProcessSummary) ? String(dog.adoptionProcessSummary).trim() : "";
  const raw = hasText(dog.adoptionProcess) ? String(dog.adoptionProcess).trim() : "";
  const how = hasText(dog.howToApply) ? String(dog.howToApply).trim() : "";

  let html = `<div class="adoption-wrap">`;
  html += `<h3 class="modal-section-title">Adoption</h3>`;

  if (summary) {
    html += `<div class="modal-adoption-summary"><p class="modal-lead">${escapeHtml(summary)}</p></div>`;
  } else {
    html += `<p class="missing-block subtle">No short summary in file (<code>adoptionProcessSummary</code>).</p>`;
  }

  if (raw) {
    html += `<details class="expand-block"><summary>Full text from listing</summary><div class="modal-adoption">${escapeHtml(raw)}</div></details>`;
  } else {
    html += `<p class="missing-block">${MISSING}</p>`;
  }

  html += `<h3 class="modal-section-title">How to apply</h3>`;
  if (how) {
    html += `<p class="modal-body">${escapeHtml(how)}</p>`;
  } else {
    html += `<p class="missing-block">${MISSING}</p>`;
  }

  html += `</div>`;
  return html;
}

function fitAnalysisSection(dog) {
  if (!hasText(dog.fitAnalysis)) {
    return `<div class="modal-block">
      <h3 class="modal-section-title">Fit notes</h3>
      <p class="missing-block">None in file. Add <code>fitAnalysis</code> if you want a short write-up here.</p>
    </div>`;
  }
  return `<div class="modal-block modal-fit">
    <h3 class="modal-section-title">Fit notes</h3>
    <p class="modal-body modal-lead">${escapeHtml(String(dog.fitAnalysis).trim())}</p>
  </div>`;
}

function openModal(dog) {
  lastFocus = document.activeElement;
  els.modal.hidden = false;
  document.body.style.overflow = "hidden";

  const urls = getPhotoUrls(dog);
  const compat = computeCompatibility(dog, currentMeta);
  const tier = tierClassName(compat.score);
  const personality = getPersonality(dog);
  const modalId = `modal-${dog.id}`;

  const weightBlock =
    typeof dog.weightLbs === "number" && !Number.isNaN(dog.weightLbs)
      ? `<dt>Weight</dt><dd>${dog.weightLbs} lbs</dd>`
      : `<dt>Weight</dt><dd><span class="missing-field">${MISSING}</span></dd>`;

  const photoBlock = renderModalCarousel(urls, modalId);

  const sourceBlock = dog.sourceUrl
    ? `<p class="modal-source">Original listing: <a href="${escapeHtml(dog.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        dog.sourceUrl
      )}</a></p>`
    : `<p class="modal-source missing-field">${MISSING}</p>`;

  const lapNote = dog.lapDogNote
    ? `<div class="modal-lap"><strong>About being held / laps:</strong> ${escapeHtml(dog.lapDogNote)}</div>`
    : "";

  const factorsList =
    compat.factors && compat.factors.length
      ? `<ul class="modal-score__factors">${compat.factors.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
      : "";

  const fillPct = compat.score;

  const feeLine = displayOrMissing(dog.adoptionFee);
  const petIdLine = displayOrMissing(dog.petId);
  const colorLine = displayOrMissing(dog.color);
  const breedLine = displayOrMissing(dog.breed);
  const locLine = displayOrMissing(dog.location);
  const originLine = displayOrMissing(dog.origin);
  const caretakerLine = displayOrMissing(dog.caretakerName);
  const distLine =
    getDistanceMiles(dog) != null ? escapeHtml(`${getDistanceMiles(dog)} mi`) : `<span class="missing-field">${MISSING}</span>`;
  const posted = displayOrMissing(dog.postedAt);
  const updated = displayOrMissing(dog.listingUpdatedAt);

  els.modalInner.innerHTML = `
    <h2 id="modal-title">${escapeHtml(dog.name)}</h2>
    <div class="modal-score ${tier}" data-tier="${getTierKey(compat.score)}">
      <span class="modal-score__value">${compat.score}/100 · ${escapeHtml(compat.label)}</span>
      <div class="modal-score__bar" role="presentation"><div class="modal-score__fill" style="width:${fillPct}%"></div></div>
      ${factorsList}
    </div>
    ${photoBlock}
    <dl class="modal-stats">
      <dt>Pet ID</dt><dd>${petIdLine}</dd>
      <dt>Breed</dt><dd>${breedLine}</dd>
      <dt>Age</dt><dd>${displayOrMissing(dog.age)}</dd>
      ${weightBlock}
      <dt>Sex</dt><dd>${displayOrMissing(dog.sex)}</dd>
      <dt>Color</dt><dd>${colorLine}</dd>
      <dt>Adoption fee</dt><dd>${feeLine}</dd>
      <dt>Location</dt><dd>${locLine}</dd>
      <dt>Origin / area</dt><dd>${originLine}</dd>
      <dt>Distance (if you added it)</dt><dd>${distLine}</dd>
      <dt>Cared for by</dt><dd>${caretakerLine}</dd>
      <dt>Where they stay</dt><dd>${escapeHtml(normalizeCareLabel(dog))}</dd>
      <dt>Posted</dt><dd>${posted}</dd>
      <dt>Listing last updated</dt><dd>${updated}</dd>
      <dt>Cuddliness (your note)</dt><dd>${dog.cuddleScore ? escapeHtml(formatCuddle(dog.cuddleScore)) : `<span class="missing-field">${MISSING}</span>`}</dd>
    </dl>
    <div>
      <h3 class="modal-section-title">Personality (from listing)</h3>
      <p class="modal-personality">${personality ? escapeHtml(personality) : `<span class="missing-field">${MISSING}</span>`}</p>
    </div>
    ${lapNote}
    ${fitAnalysisSection(dog)}
    ${longBlock("Health & records (from listing)", dog.health)}
    ${longBlock("My story (from listing)", dog.myStory)}
    ${longBlock("Extra notes & description", dog.details)}
    ${adoptionSection(dog)}
    ${sourceBlock}
    <p class="modal-honesty">Everything here comes from your data file.</p>
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

function toggleFavorite(id) {
  if (!id) return;
  if (favoriteSet.has(id)) favoriteSet.delete(id);
  else favoriteSet.add(id);
  saveFavoriteSet();
  rebuildGrid();
}

function onCompareChange(e) {
  const t = e.target;
  if (!t.matches || !t.matches("[data-compare-toggle]")) return;
  const id = t.getAttribute("data-compare-toggle");
  if (!id) return;
  if (t.checked) {
    if (compareIds.length >= MAX_COMPARE && !compareIds.includes(id)) {
      t.checked = false;
      window.alert(`You can compare up to ${MAX_COMPARE} dogs at once.`);
      return;
    }
    if (!compareIds.includes(id)) compareIds.push(id);
  } else {
    compareIds = compareIds.filter((x) => x !== id);
  }
  saveCompareIds();
  updateCompareDock();
}

function updateCompareDock() {
  if (!els.compareDock || !els.compareOpen) return;
  const n = compareIds.length;
  els.compareDock.hidden = n === 0;
  els.compareOpen.disabled = n === 0;
  const label = document.getElementById("compare-dock-label");
  if (label) label.textContent = n ? `Compare (${n})` : "Compare";
}

function openCompareModal() {
  if (!els.compareModal || !els.compareTableWrap) return;
  const dogs = compareIds.map((id) => dogsById.get(id)).filter(Boolean);
  if (!dogs.length) return;

  const rows = [
    "Match",
    "Age",
    "Weight",
    "Breed",
    "Sex",
    "Distance",
    "Personality",
    "Adoption fee",
    "Where they stay",
    "Cared for by",
  ];

  const header = `<thead><tr><th></th>${dogs.map((d) => `<th>${escapeHtml(d.name)}</th>`).join("")}</tr></thead>`;

  function cell(d, val) {
    const c = computeCompatibility(d, currentMeta);
    if (val === "Match") return `${c.score} (${c.label})`;
    if (val === "Age") return hasText(d.age) ? String(d.age) : "—";
    if (val === "Weight") return typeof d.weightLbs === "number" ? `${d.weightLbs} lbs` : "—";
    if (val === "Breed") return hasText(d.breed) ? String(d.breed) : "—";
    if (val === "Sex") return hasText(d.sex) ? String(d.sex) : "—";
    if (val === "Distance") {
      const dm = getDistanceMiles(d);
      return dm != null ? `${dm} mi` : "—";
    }
    if (val === "Personality") return getPersonality(d) || "—";
    if (val === "Adoption fee") return hasText(d.adoptionFee) ? String(d.adoptionFee) : "—";
    if (val === "Where they stay") return normalizeCareLabel(d);
    if (val === "Cared for by") return hasText(d.caretakerName) ? String(d.caretakerName) : "—";
    return "—";
  }

  const body = rows
    .map(
      (row) =>
        `<tr><th scope="row">${escapeHtml(row)}</th>${dogs
          .map((d) => `<td>${escapeHtml(cell(d, row))}</td>`)
          .join("")}</tr>`
    )
    .join("");

  els.compareTableWrap.innerHTML = `<div class="table-scroll"><table class="compare-table">${header}<tbody>${body}</tbody></table></div>`;

  els.compareModal.hidden = false;
  document.body.style.overflow = "hidden";
  els.compareModalClose?.focus();
}


function closeCompareModal() {
  if (!els.compareModal) return;
  els.compareModal.hidden = true;
  if (els.modal?.hidden) document.body.style.overflow = "";
}

function clearCompare() {
  compareIds = [];
  saveCompareIds();
  rebuildGrid();
  updateCompareDock();
}

function onGridClick(e) {
  const favBtn = e.target.closest("[data-favorite-toggle]");
  if (favBtn && els.grid.contains(favBtn)) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(favBtn.getAttribute("data-favorite-toggle"));
    return;
  }

  const btn = e.target.closest("[data-open]");
  if (!btn || !els.grid.contains(btn)) return;
  const id = btn.getAttribute("data-open");
  const dog = id ? dogsById.get(id) : undefined;
  if (dog) openModal(dog);
}

function updateFilterCount(filtered) {
  if (!els.filterCount) return;
  if (allDogs.length === 0) {
    els.filterCount.textContent = "";
    return;
  }
  els.filterCount.textContent = `Showing ${filtered.length} of ${allDogs.length} dogs`;
}

function rebuildGrid() {
  clearCarouselTimers();
  const sortKey = els.sortSelect?.value || "compatibility-desc";
  const filtered = filterDogs(allDogs);
  updateFilterCount(filtered);
  const sorted = sortDogs(filtered, sortKey);
  const ordered = boostFavorites(sorted, sortKey);
  els.grid.innerHTML = "";
  ordered.forEach((dog) => els.grid.appendChild(renderCard(dog, currentMeta)));
  els.grid.querySelectorAll("[data-carousel-root]").forEach((el) => {
    const id = el.getAttribute("data-carousel-root");
    if (id) wireCarousel(el, id);
  });
}

function clearFilters() {
  if (els.searchInput) els.searchInput.value = "";
  if (els.filterMinTier) els.filterMinTier.value = "any";
  if (els.filterCare) els.filterCare.value = "any";
  if (els.filterMaxDist) els.filterMaxDist.value = "";
  if (els.filterBreed) els.filterBreed.value = "";
  if (els.filterFavoritesOnly) els.filterFavoritesOnly.checked = false;
  rebuildGrid();
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

async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Could not load dog list (${res.status})`);
    const data = await res.json();
    const meta = data.meta || {};
    const dogs = Array.isArray(data.dogs) ? data.dogs : [];

    currentMeta = meta;
    allDogs = dogs;

    dogsById.clear();
    dogs.forEach((d) => {
      if (d && d.id) dogsById.set(d.id, d);
    });

    favoriteSet = loadFavoriteSet();
    compareIds = loadCompareIds().filter((id) => dogsById.has(id));
    saveCompareIds();

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
    if (els.toolbar) els.toolbar.hidden = false;

    const toolbarFilters = document.getElementById("toolbar-filters");
    if (toolbarFilters) {
      const mq = window.matchMedia("(min-width: 768px)");
      const syncToolbarOpen = () => {
        toolbarFilters.open = mq.matches;
      };
      syncToolbarOpen();
      mq.addEventListener("change", syncToolbarOpen);
    }

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
    rebuildGrid();
    updateCompareDock();

    els.grid.addEventListener("click", onGridClick);
    els.grid.addEventListener("change", onCompareChange);

    els.sortSelect?.addEventListener("change", rebuildGrid);

    const debounce = (fn, ms) => {
      let t;
      return () => {
        clearTimeout(t);
        t = setTimeout(fn, ms);
      };
    };
    const debouncedRebuild = debounce(rebuildGrid, 200);
    els.searchInput?.addEventListener("input", debouncedRebuild);
    els.filterMinTier?.addEventListener("change", rebuildGrid);
    els.filterCare?.addEventListener("change", rebuildGrid);
    els.filterMaxDist?.addEventListener("input", debouncedRebuild);
    els.filterBreed?.addEventListener("input", debouncedRebuild);
    els.filterFavoritesOnly?.addEventListener("change", rebuildGrid);
    els.filterClear?.addEventListener("click", clearFilters);

    els.themeToggle?.addEventListener("click", toggleTheme);

    const onScroll = () => {
      if (!els.backToTop) return;
      els.backToTop.hidden = window.scrollY < 400;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    els.backToTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    els.compareOpen?.addEventListener("click", openCompareModal);
    els.compareClear?.addEventListener("click", clearCompare);
    els.compareModalClose?.addEventListener("click", closeCompareModal);
    els.compareModal?.querySelector("[data-close-compare]")?.addEventListener("click", closeCompareModal);
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
  if (e.key !== "Escape") return;
  if (els.compareModal && !els.compareModal.hidden) {
    closeCompareModal();
    return;
  }
  if (!els.modal.hidden) closeModal();
});

init();
