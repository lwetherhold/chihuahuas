# chihuahuas

Static **HTML + CSS + JavaScript** site: search, filters, sort, saved dogs (in the browser), side-by-side **compare** (up to three), and **Details** with everything from [`data/dogs.json`](data/dogs.json). Empty fields stay empty — nothing is invented.

## Search & filters

- **Search** scans name, breed, location, caretaker, pet ID, personality, summary, and details.
- On phones, extra options sit under **Filters** so the first screen stays simple. On wider screens, filters stay open.
- **Filters:** minimum match tier, where the dog stays (shelter vs foster), max distance (miles), breed substring, **saved only**.
- **Sort:** match score, saved-first, name, age (`ageSortMonths` or a simple parse of `age`), distance, weight.
- **Saved** (♥) and **compare** use `localStorage`. Saved dogs are **pinned to the top** (except when sort is **Saved first**).

## Fields (copy from each listing)

Optional keys include: `petId`, `breed`, `color`, `weightLbs`, `adoptionFee`, `location`, `origin`, `distanceMiles`, `caretakerName`, `careSetting` (`shelter` | `foster` | omit for unknown), `postedAt`, `listingUpdatedAt`, `health`, `myStory`, `adoptionProcess`, `howToApply`, `personality`, `fitAnalysis`, `adoptionProcessSummary`, etc.

## Fit notes & adoption summary

The page **only shows text you put in the file** (no server, no API). Add human-written copy — or draft in ChatGPT and paste into **`fitAnalysis`** and **`adoptionProcessSummary`**. Use **`adoptionProcess`** for the long text copied from the listing.

## Photo carousel

Photos **crossfade on a timer** continuously. On desktop, **hover** adds a light frame; it does **not** pause the slideshow, so phones and desktops behave the same.

## Deploy

GitHub Actions deploys to **GitHub Pages** (see `.github/workflows/pages.yml`).

## Local preview

```bash
npx --yes serve .
```
