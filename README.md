# chihuahuas

A static site (HTML, CSS, and JavaScript) for Grandma: one place to see hand-picked adoptable chihuahuas, with **age, weight, personality**, and a **match score** so you can compare options quickly. Details open in a panel so she does not have to jump between adoption sites.

## Data (`data/dogs.json`)

| Field | Notes |
|--------|--------|
| `photoUrl` / `photoUrls` | One URL or an array; multiple images **cycle automatically** on the card and in the detail panel. |
| `weightLbs` | If omitted, the site shows **“Not listed”** and a prompt to ask the shelter. |
| `personality` | Main blurb from the listing (spunky, calm, etc.). Falls back to `temperament` if empty. |
| `cuddleScore` | `high` \| `medium` \| `unknown` — your read on lap/cuddle fit. |
| `lapDogNote` | Extra notes about wanting to be held. |
| `adoptionProcess` | Fees, meet-and-greet, home checks — paste from the listing if available. |
| `compatibilityScore` | Optional **0–100** override; if omitted, the site **estimates** a score from weight, cuddly cues, and energetic wording. |

## Theme & deploy

- **Dark mode** is the default, with **purple** accents; **light mode** uses **pastel purple** backgrounds. The choice is saved in the browser.
- **GitHub Actions** deploys to **GitHub Pages** on push to `main` / `master` (see `.github/workflows/pages.yml`).

## Local preview

```bash
npx --yes serve .
```

Then open the URL it prints (often `http://localhost:3000`).
