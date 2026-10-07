# Project Arma

Fair market prices for firearms and ammunition. A Carlisle Capital LLC project.

* **Price guide.** Sold price ranges for each model by condition (Good, Very Good, Excellent), a 12 month trend, and a checker that grades a quoted price.
* **Ammo tracker.** Cost per round, lowest offer today, and 90 day change, including historical calibers.
* **Landed cost.** Online price plus shipping, transfer fee, and tax, compared with a local store's out the door price.

Information only. The site does not sell firearms, hold inventory, or process transfers.

> **Status: prototype.** Everything in `data/raw/` is generated sample data, marked `source=sample`. The site shows a prototype banner until real data replaces it.

## How it works

```
data/catalog.json        models and calibers shown on the site
data/raw/*.csv           raw sold sales and retailer prices
scripts/build_data.py    turns raw data into the JSON the site reads
data/guns.json           built: bands, history, trend per model
data/ammo.json           built: cost per round and history per caliber
index.html, assets/      static site, no framework, no build step
```

GitHub Actions runs `build_data.py` on every push and once a day, then deploys to GitHub Pages.

### Pricing rules

* Sold prices only. Asking prices never go in `sold_sales.csv`.
* The top and bottom 5% of sales are trimmed before any statistic.
* Bands are the 20th, 50th, and 80th percentiles.
* If a condition has fewer than 8 sales in 90 days, the window widens to 180, then 365 days.

## Run it locally

```bash
python scripts/build_data.py
python -m http.server 8000
# open http://localhost:8000
```

To regenerate the sample data: `python scripts/make_sample_data.py`

## Adding real data

**Sold sales** (`data/raw/sold_sales.csv`)

| column | example |
|---|---|
| model_id | m1-garand (must match catalog.json) |
| date | 2026-10-01 |
| condition | good, very_good, or excellent |
| price | 1450 |
| source | rock-island, cmp, user-report |

**Ammo prices** (`data/raw/ammo_prices.csv`)

| column | example |
|---|---|
| caliber_id | 45acp |
| date | 2026-10-06 |
| retailer | Retailer name |
| box_price | 21.99 |
| rounds | 50 |
| source | feed name |

Write one importer script per source that appends rows to these files, then call it in `.github/workflows/deploy.yml` before the build step. Use approved affiliate feeds or APIs, and check each site's terms before collecting anything from it.

To add a model or caliber, add it to `data/catalog.json` with a new id.

## Roadmap

1. Apply to retailer affiliate programs for ammo and new gun feeds.
2. Start logging sold prices from public auction results and CMP.
3. Add a "what I paid" form for user reports.
4. Add sponsored store listings, always labeled, never affecting prices.
5. Buy a domain and point it at GitHub Pages.
