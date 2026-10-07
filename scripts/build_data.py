"""Build the JSON the site reads from raw sales and price data.

Inputs
  data/catalog.json         models and calibers shown on the site
  data/raw/sold_sales.csv   model_id, date, condition, price, source
  data/raw/ammo_prices.csv  caliber_id, date, retailer, box_price, rounds, source

Outputs
  data/guns.json   price bands by condition, 12 month history, trend
  data/ammo.json   cost per round, low today, 90 day change, weekly history

Rules (also shown on the site's Method section)
  * Sold prices only. Asking prices never enter sold_sales.csv.
  * Top and bottom 5% trimmed before any statistic.
  * Bands are the 20th, 50th and 80th percentiles of the trimmed sales.
  * Windows widen from 90 to 180 to 365 days until a condition has 8 sales.

Standard library only, so it runs anywhere: python scripts/build_data.py
"""
import csv
import datetime as dt
import json
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CONDITIONS = ["good", "very_good", "excellent"]
MIN_SALES = 8


def pct(values, p):
    """Linear interpolated percentile, p in 0..100."""
    s = sorted(values)
    if not s:
        return None
    k = (len(s) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def trim(values, share=0.05):
    if len(values) < 10:
        return list(values)
    lo, hi = pct(values, share * 100), pct(values, 100 - share * 100)
    return [v for v in values if lo <= v <= hi]


def r10(v):
    return int(round(v / 10.0) * 10) if v is not None else None


def months_back(today, n):
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def read_csv(path):
    if not path.exists():
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def build_guns(catalog, rows, today):
    by_model = defaultdict(list)
    for r in rows:
        try:
            d = dt.date.fromisoformat(r["date"])
            price = float(r["price"])
        except (KeyError, ValueError):
            continue
        if r.get("condition") in CONDITIONS and price > 0:
            by_model[r["model_id"]].append((d, r["condition"], price))

    months = months_back(today, 12)
    out = []
    for m in catalog["models"]:
        sales = by_model.get(m["id"], [])
        bands, window_used = {}, {}
        for c in CONDITIONS:
            for days in (90, 180, 365):
                vals = [p for d, cond, p in sales if cond == c and (today - d).days < days]
                if len(vals) >= MIN_SALES or days == 365:
                    break
            vals = trim(vals)
            bands[c] = {"low": r10(pct(vals, 20)), "median": r10(pct(vals, 50)),
                        "high": r10(pct(vals, 80)), "n": len(vals)}
            window_used[c] = days

        # Normalize every sale to Very Good so the history line uses all of them
        vg = bands["very_good"]["median"]
        ratio = {c: (bands[c]["median"] / vg) if vg and bands[c]["median"] else 1 for c in CONDITIONS}
        per_month = defaultdict(list)
        for d, c, p in sales:
            key = f"{d.year:04d}-{d.month:02d}"
            if key in months:
                per_month[key].append(p / ratio[c])
        history = []
        for key in months:
            vals = trim(per_month.get(key, []))
            history.append({"month": key, "median": r10(statistics.median(vals)) if len(vals) >= 3 else None,
                            "n": len(vals)})

        first = [h["median"] for h in history[:3] if h["median"]]
        last = [h["median"] for h in history[-3:] if h["median"]]
        trend = round((statistics.median(last) - statistics.median(first)) / statistics.median(first), 3) \
            if first and last else None
        n90 = sum(1 for d, _, _ in sales if (today - d).days < 90)
        out.append({
            **m,
            "bands": bands,
            "window_days": window_used,
            "sales_90d": n90,
            "confidence": "high" if n90 >= 30 else "medium" if n90 >= 10 else "low",
            "trend_12m": trend,
            "history": history,
        })
    return out


def build_ammo(catalog, rows, today):
    by_cal = defaultdict(list)
    for r in rows:
        try:
            d = dt.date.fromisoformat(r["date"])
            cpr = float(r["box_price"]) / float(r["rounds"])
        except (KeyError, ValueError, ZeroDivisionError):
            continue
        by_cal[r["caliber_id"]].append((d, cpr, r.get("retailer", "")))

    out = []
    for c in catalog["calibers"]:
        offers = by_cal.get(c["id"], [])
        if not offers:
            out.append({**c, "median": None, "low_today": None, "change_90d": None, "best": None, "history": []})
            continue
        latest = max(d for d, _, _ in offers)
        recent = trim([p for d, p, _ in offers if (latest - d).days < 7])
        then = trim([p for d, p, _ in offers if 90 <= (latest - d).days < 97])
        today_offers = [(p, r) for d, p, r in offers if d == latest]
        best = min(today_offers) if today_offers else None
        med = statistics.median(recent)
        history = []
        for w in range(12, -1, -1):
            vals = trim([p for d, p, _ in offers if w * 7 <= (latest - d).days < (w + 1) * 7])
            history.append(round(statistics.median(vals), 4) if vals else None)
        out.append({
            **c,
            "median": round(med, 3),
            "low_today": round(best[0], 3) if best else None,
            "best": {"retailer": best[1], "per_round": round(best[0], 3)} if best else None,
            "change_90d": round((med - statistics.median(then)) / statistics.median(then), 3) if then else None,
            "as_of": latest.isoformat(),
            "history": history,
        })
    return out


def main():
    catalog = json.loads((DATA / "catalog.json").read_text())
    sales = read_csv(DATA / "raw" / "sold_sales.csv")
    ammo = read_csv(DATA / "raw" / "ammo_prices.csv")
    dates = [r["date"] for r in sales + ammo if r.get("date")]
    today = dt.date.fromisoformat(max(dates)) if dates else dt.date.today()
    meta = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "as_of": today.isoformat(),
        "sample": any(r.get("source") == "sample" for r in sales + ammo),
    }
    (DATA / "guns.json").write_text(json.dumps({"meta": meta, "models": build_guns(catalog, sales, today)}, indent=1))
    (DATA / "ammo.json").write_text(json.dumps({"meta": meta, "calibers": build_ammo(catalog, ammo, today)}, indent=1))
    print(f"Built {len(catalog['models'])} models and {len(catalog['calibers'])} calibers as of {today}"
          + (" (sample data)" if meta["sample"] else ""))


if __name__ == "__main__":
    main()
