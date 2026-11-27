"""Generate structured conflict-triage manifest and prioritized MedEx browser-verification queue."""
import csv
import json
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VER_DIR = REPO_ROOT / "backend" / "reports" / "catalogue_verification"
EXP_DIR = REPO_ROOT / "backend" / "reports" / "catalogue_export"

conf = json.load(open(VER_DIR / "conflicts_requiring_review.json", encoding="utf-8"))["records"]
unv = json.load(open(VER_DIR / "unverified_brands_and_packs.json", encoding="utf-8"))
brands_map = {r["brandId"]: r for r in csv.DictReader(open(EXP_DIR / "medicine_brands_export.csv", encoding="utf-8"))}

triaged = []
counts = Counter()
for c in conf:
    du = c.get("dbUnitPrice")
    dp = c.get("dbPackPrice")
    au = c.get("aroggaUnitMrp")
    ap = c.get("aroggaExpectedPackPrice")
    pu = c.get("dbPackUnits")
    su = c.get("dbStripUnits")
    asu = c.get("aroggaStripUnits")

    if dp == 1.0 or du == 1.0:
        bucket = "CORRUPT_DB_PRICE_1_BDT"
        action = "RECOMMEND_REPLACE_CORRUPT_1_BDT_AFTER_MEDEX_CONFIRMATION"
    elif (du == 8.0 and dp == 280.0 and pu == 30) or (du == 10.0 and dp == 300.0 and pu == 30) or (du == 12.04 and dp == 300.48):
        bucket = "STALE_SYNTHETIC_BENCHMARK_280_300"
        action = "RECOMMEND_REPLACE_BENCHMARK_PRICE_WITH_LIVE_MRP"
    elif du and au and (abs(du / au - 10.0) < 0.5 or (su and abs(du / au - su) < 0.5)):
        bucket = "UNIT_PRICE_STORED_AS_STRIP_PRICE_SWAP"
        action = "RECOMMEND_CORRECT_10X_UNIT_VS_STRIP_SWAP"
    elif pu and asu and pu % asu != 0:
        bucket = "NON_DIVISIBLE_STRIP_CONFLICT"
        action = "REVIEW_PACK_UNITS_VS_STRIP_UNITS_SEPARATELY"
    elif su and asu and su != asu and (pu is None or pu % su == 0):
        bucket = "DIFFERENT_STRIP_SIZE_CLAIM"
        action = "VERIFY_TRUE_BLISTER_STRIP_SIZE"
    elif dp and ap and (ap / dp > 2.0 or ap / dp < 0.5):
        bucket = "LARGE_PRICE_DELTA_OR_PACK_MISMATCH"
        action = "VERIFY_PACK_SIZE_AND_LIVE_PRICE"
    else:
        bucket = "OTHER_CONFLICT"
        action = "MANUAL_REVIEW"

    counts[bucket] += 1
    b_info = brands_map.get(c["brandId"], {})
    triaged.append({
        **c,
        "triageBucket": bucket,
        "recommendedAction": action,
        "medexProductUrl": b_info.get("productUrl"),
    })

with open(VER_DIR / "triaged_conflicts_report.json", "w", encoding="utf-8") as f:
    json.dump({"totalConflicts": len(triaged), "countsByBucket": dict(counts), "records": triaged}, f, indent=2, ensure_ascii=False)

# Build prioritized MedEx verification queue (brands not verified live on Arogga + conflicts)
queue_rows = []
seen_brands = set()

# Priority 1: Zero-pack brands
for b in unv["unverifiedBrands"]:
    if b["issue"] == "ZERO_PACKS_IN_DB":
        seen_brands.add(b["brandId"])
        queue_rows.append({
            "priority": "P1_ZERO_PACK_BRAND",
            "brandId": b["brandId"],
            "sourceId": b["sourceId"],
            "brandName": b["brandName"],
            "strength": b["strength"],
            "dosageForm": b["dosageForm"],
            "manufacturer": b["manufacturer"],
            "medexProductUrl": brands_map.get(b["brandId"], {}).get("productUrl", ""),
            "reason": b["issue"],
        })

# Priority 2: Conflicts requiring MedEx truth check
for c in triaged:
    if c["brandId"] not in seen_brands:
        seen_brands.add(c["brandId"])
        queue_rows.append({
            "priority": "P2_CONFLICT_REVIEW",
            "brandId": c["brandId"],
            "sourceId": c["sourceId"],
            "brandName": c["brandName"],
            "strength": c["strength"],
            "dosageForm": c["dosageForm"],
            "manufacturer": brands_map.get(c["brandId"], {}).get("manufacturer", ""),
            "medexProductUrl": c.get("medexProductUrl") or "",
            "reason": c["triageBucket"],
        })

# Priority 3: Unmatched on Arogga
for b in unv["unverifiedBrands"]:
    if b["brandId"] not in seen_brands:
        seen_brands.add(b["brandId"])
        queue_rows.append({
            "priority": "P3_UNMATCHED_ON_AROGGA",
            "brandId": b["brandId"],
            "sourceId": b["sourceId"],
            "brandName": b["brandName"],
            "strength": b["strength"],
            "dosageForm": b["dosageForm"],
            "manufacturer": b["manufacturer"],
            "medexProductUrl": brands_map.get(b["brandId"], {}).get("productUrl", ""),
            "reason": b["issue"],
        })

q_fields = ["priority", "brandId", "sourceId", "brandName", "strength", "dosageForm", "manufacturer", "medexProductUrl", "reason"]
with open(VER_DIR / "remaining_medex_verification_queue.csv", "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=q_fields)
    w.writeheader()
    w.writerows(queue_rows)

print(json.dumps({"triagedCounts": dict(counts), "medexVerificationQueueCount": len(queue_rows)}, indent=2))
