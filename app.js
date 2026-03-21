const DATA_URL = new URL("data/dogs.json", import.meta.url);

/** @type {Map<string, object>} */
const dogsById = new Map();

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
};

let lastFocus = null;

function inWeightRange(weight, min, max) {
  if (typeof weight !== "number" || Number.isNaN(weight)) return false;
  return weight >= min && weight <= max;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCard(dog, meta) {
  const target = meta?.targetWeightLbs;
  const match =
    target && typeof dog.weightLbs === "number"
      ? inWeightRange(dog.weightLbs, target.min, target.max)
      : false;

  const photo =
    dog.photoUrl && String(dog.photoUrl).trim()
      ? `<img class="dog-card__photo" src="${escapeHtml(dog.photoUrl)}" alt="" loading="lazy" />`
      : `<div class="dog-card__photo dog-card__photo--placeholder" aria-hidden="true">🐕</div>`;

  const weightLine =
    typeof dog.weightLbs === "number"
      ? `<span class="stat"><span class="stat__label">Weight</span> <span class="stat__value">${dog.weightLbs} lbs</span>${
          match ? ` <span class="badge badge--match">Near ${target.min}–${target.max} lbs</span>` : ""
        }</span>`
      : "";

  const cuddle = dog.cuddleScore
    ? `<span class="badge" title="How lap-focused they seem">${formatCuddle(dog.cuddleScore)}</span>`
    : "";

  const li = document.createElement("li");
  li.className = "dog-card";
  li.innerHTML = `
    ${photo}
    <div class="dog-card__body">
      <h2 class="dog-card__name">${escapeHtml(dog.name)}</h2>
      <div class="dog-card__stats">
        <span class="stat"><span class="stat__label">Age</span> <span class="stat__value">${escapeHtml(dog.age)}</span></span>
        ${weightLine}
        ${dog.sex ? `<span class="stat"><span class="stat__label">Sex</span> <span class="stat__value">${escapeHtml(dog.sex)}</span></span>` : ""}
        ${cuddle}
      </div>
      <p class="dog-card__summary">${escapeHtml(dog.summary)}</p>
      <p class="dog-card__temperament"><span class="stat__label">Temperament</span> ${escapeHtml(dog.temperament)}</p>
      <button type="button" class="dog-card__btn" data-open="${escapeHtml(dog.id)}">Read full details</button>
    </div>
  `;
  return li;
}

function formatCuddle(score) {
  const map = { high: "Very cuddly", medium: "Somewhat cuddly", unknown: "Cuddliness unknown" };
  return map[score] || map.unknown;
}

function openModal(dog) {
  lastFocus = document.activeElement;
  els.modal.hidden = false;
  document.body.style.overflow = "hidden";

  const photoBlock =
    dog.photoUrl && String(dog.photoUrl).trim()
      ? `<img class="modal-photo" src="${escapeHtml(dog.photoUrl)}" alt="" />`
      : "";

  const sourceBlock = dog.sourceUrl
    ? `<p class="modal-source">Original listing (optional): <a href="${escapeHtml(dog.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        dog.sourceUrl
      )}</a></p>`
    : "";

  const lapNote = dog.lapDogNote
    ? `<p class="modal-lap"><strong>About being held:</strong> ${escapeHtml(dog.lapDogNote)}</p>`
    : "";

  els.modalInner.innerHTML = `
    <h2 id="modal-title">${escapeHtml(dog.name)}</h2>
    ${photoBlock}
    <dl class="modal-stats">
      <dt>Age</dt><dd>${escapeHtml(dog.age)}</dd>
      ${typeof dog.weightLbs === "number" ? `<dt>Weight</dt><dd>${dog.weightLbs} lbs</dd>` : ""}
      ${dog.sex ? `<dt>Sex</dt><dd>${escapeHtml(dog.sex)}</dd>` : ""}
      <dt>Temperament</dt><dd>${escapeHtml(dog.temperament)}</dd>
      ${dog.cuddleScore ? `<dt>Cuddliness</dt><dd>${escapeHtml(formatCuddle(dog.cuddleScore))}</dd>` : ""}
    </dl>
    ${lapNote}
    <p class="modal-body">${escapeHtml(dog.details)}</p>
    ${sourceBlock}
  `;

  els.modalClose.focus();
}

function closeModal() {
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

async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Could not load dog list (${res.status})`);
    const data = await res.json();
    const meta = data.meta || {};
    const dogs = Array.isArray(data.dogs) ? data.dogs : [];

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

    els.loadMsg.hidden = true;
    els.grid.innerHTML = "";
    dogs.forEach((dog) => els.grid.appendChild(renderCard(dog, meta)));

    els.grid.addEventListener("click", onGridClick);
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
