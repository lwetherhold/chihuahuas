# chihuahuas

A small static site for Grandma: one place to see hand-picked adoptable chihuahuas, with **age, weight, and temperament** (including how cuddly they are) shown on the page so she does not have to jump between adoption sites.

## How it works

- **Data:** Edit [`data/dogs.json`](data/dogs.json). Each dog has a short card and a **Read full details** panel with the full text you paste in (from the listing or your notes).
- **Photos:** Set `photoUrl` to a direct image URL from the listing, or leave it empty for a friendly placeholder.
- **Weight:** `weightLbs` is shown prominently. Dogs near **5–6 lbs** get a small “near target weight” badge (configurable under `meta.targetWeightLbs`).
- **Cuddliness:** Use `cuddleScore` (`high` | `medium` | `unknown`) and optional `lapDogNote` for “wants to be held / lap dog” notes.
- **Original link:** Optional `sourceUrl` appears at the bottom of the detail panel if you want a link back to the listing.

## GitHub Actions → GitHub Pages

On push to `main` (or `master`), [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys the repo root to **GitHub Pages**.

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main`; the workflow publishes the site.
3. Your site URL will look like `https://<user>.github.io/chihuahuas/` (project page).

## Try it locally

Opening `index.html` as a file may block loading `dogs.json`. From the repo folder:

```bash
npx --yes serve .
```

Then open the URL it prints (often `http://localhost:3000`).
