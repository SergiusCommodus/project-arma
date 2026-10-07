"""Generate SAMPLE raw data so the pipeline runs end to end before real feeds exist.

Writes:
  data/raw/sold_sales.csv   one row per completed sale
  data/raw/ammo_prices.csv  one row per retailer offer per day

Every row is marked source=sample. Delete these files (or this script) once
real sources are connected. Run: python scripts/make_sample_data.py
"""
import csv
import datetime as dt
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
TODAY = dt.date(2026, 10, 6)

# model id: (Very Good median today, 12 month drift, sales per 90 days)
GUNS = {
    "m1-garand": (1450, 0.06, 64), "m1-carbine": (1650, 0.08, 51),
    "thompson-1927a1": (1550, 0.03, 38), "m1911a1": (3200, 0.07, 27),
    "colt-saa": (2400, 0.04, 33), "winchester-1873": (1400, 0.02, 29),
    "springfield-m1a": (1550, -0.02, 46), "mauser-k98k": (1450, 0.09, 31),
    "mosin-9130": (400, 0.05, 88), "enfield-no4": (750, 0.04, 42),
    "sks": (600, 0.03, 57), "colt-python": (1450, -0.04, 72),
    "sw-model-29": (1200, 0.03, 40), "glock-19-g5": (460, -0.03, 210),
    "sig-p365": (430, -0.05, 180), "ruger-1022": (270, 0.0, 150),
}
# Condition price multiple relative to Very Good, and share of sales
CONDITIONS = {"good": (0.79, 0.35), "very_good": (1.0, 0.45), "excellent": (1.38, 0.20)}

# caliber id: (median cost per round today, 90 day change)
AMMO = {
    "9mm": (0.24, -0.04), "22lr": (0.07, 0.0), "556": (0.38, -0.02), "308": (0.78, 0.01),
    "38spl": (0.48, 0.03), "12ga-00": (0.85, 0.02), "45acp": (0.42, -0.01),
    "30carbine": (0.78, 0.05), "3006-m2": (1.12, 0.04), "45colt": (0.95, 0.02),
    "303brit": (1.35, 0.06), "762x54r": (0.62, 0.03),
}
RETAILERS = ["Sample Retailer A", "Sample Retailer B", "Sample Retailer C", "Sample Retailer D", "Sample Retailer E"]


def sold_sales(rng):
    rows = []
    for mid, (vg, drift, per90) in GUNS.items():
        n = per90 * 4  # about a year of sales
        for _ in range(n):
            age = rng.randint(0, 364)
            date = TODAY - dt.timedelta(days=age)
            level = vg / (1 + drift) * (1 + drift * (364 - age) / 364)
            cond = rng.choices(list(CONDITIONS), weights=[c[1] for c in CONDITIONS.values()])[0]
            price = level * CONDITIONS[cond][0] * rng.lognormvariate(0, 0.11)
            if rng.random() < 0.02:  # the occasional bidding war
                price *= 1.6
            rows.append([mid, date.isoformat(), cond, round(price), "sample"])
    rows.sort(key=lambda r: r[1])
    return rows


def ammo_prices(rng):
    rows = []
    for cid, (cpr, chg) in AMMO.items():
        start = cpr / (1 + chg)
        for age in range(119, -1, -1):
            date = TODAY - dt.timedelta(days=age)
            level = start + (cpr - start) * (119 - age) / 119 if age <= 119 else start
            for r in rng.sample(RETAILERS, k=rng.randint(3, 5)):
                count = rng.choice([20, 50, 100, 250, 500, 1000])
                per_round = level * rng.lognormvariate(0, 0.08) * (1.06 if count <= 50 else 0.97)
                rows.append([cid, date.isoformat(), r, round(per_round * count, 2), count, "sample"])
    return rows


def main():
    rng = random.Random(1873)
    RAW.mkdir(parents=True, exist_ok=True)
    with open(RAW / "sold_sales.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["model_id", "date", "condition", "price", "source"])
        w.writerows(sold_sales(rng))
    with open(RAW / "ammo_prices.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["caliber_id", "date", "retailer", "box_price", "rounds", "source"])
        w.writerows(ammo_prices(rng))
    print("Wrote sample raw data to", RAW)


if __name__ == "__main__":
    main()
