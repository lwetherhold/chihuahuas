# chihuahuas

Static **HTML + CSS + JavaScript** site: search, filters, sort, favorites (saved in the browser), side-by-side **compare** (up to three dogs), and a detail view that only shows **what you put in** [`data/dogs.json`](data/dogs.json) — nothing is invented for empty fields.

## Search & filters

- **Search** scans name, breed, location, caretaker, pet ID, personality, summary, and details.
- **Filters:** minimum match tier, where the dog stays (shelter vs foster), max distance (miles), breed substring, **favorites only**.
- **Sort:** match score, favorites-first mode, name, age (uses `ageSortMonths` when set, otherwise a simple parse of `age`), distance, weight.
- **Favorites** (♥) and **compare** checkboxes are stored in `localStorage` on this device. Favorites are **pinned to the top** of the list (within the current sort/filter), except when you choose **“Favorites first (then best match)”** as the sort mode.

## Fields (copy from each listing)

Use optional keys for anything the listing shows, for example: `petId`, `breed`, `color`, `weightLbs`, `adoptionFee`, `location`, `origin`, `distanceMiles`, `caretakerName`, `careSetting` (`shelter` | `foster` | omit for unknown), `postedAt`, `listingUpdatedAt`, `health`, `myStory`, `adoptionProcess`, `howToApply`, `personality`, `fitAnalysis`, `adoptionProcessSummary`, etc. If a field is missing, the UI says **not provided** — it does **not** guess.

## “AI” analysis

This **GitHub Pages** project has **no server and no API keys**. It cannot call AI for you.

- Put your own **fit** write-up in **`fitAnalysis`** (your judgment, or text you generated elsewhere and pasted in).
- Put a short adoption overview in **`adoptionProcessSummary`** if you want a quick summary; use **`adoptionProcess`** for the full text from the site.

The UI states clearly that these blocks are **from your file**, not auto-generated here.

## Photo carousel

Images **rotate automatically** and **pause while the pointer is over** the photo so you can look at one picture without it changing — that tends to feel easier than animating only on hover. If you prefer always-on rotation with no pause, say so and we can add a toggle.

## Deploy

GitHub Actions deploys to **GitHub Pages** (see `.github/workflows/pages.yml`).

## Local preview

```bash
npx --yes serve .
```
