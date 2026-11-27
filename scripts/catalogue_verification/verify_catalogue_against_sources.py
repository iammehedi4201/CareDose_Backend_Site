"""Dosage-form-aware cross-verification engine for all CareDose brands (25,208) and packs (27,468).

Compares the CareDose catalogue export against:
  1. Live Arogga retail pharmacy snapshot (arogga_live_catalog.sqlite, 28,978 items, 2026-11-24)
  2. Historical MedEx SQLite scrape (medex.db, 19,590 items, 2026-07-09) — secondary reference only

Strictly read-only on PostgreSQL. Preserves all brandId / sourceId / packId values,
filters Arogga dummy stock=0/MRP<=1 prices, enforces release-marker, volume/weight, and vial-strength
safety guards across every dosage form, and routes suspicious >2x jumps or structural conflicts
to conflicts_requiring_review rather than proposing unverified updates.
"""
import csv
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parents[3]
EXPORT_DIR = REPO_ROOT / "backend" / "reports" / "catalogue_export"
VER_DIR = REPO_ROOT / "backend" / "reports" / "catalogue_verification"
VER_DIR.mkdir(parents=True, exist_ok=True)

BRANDS_CSV = EXPORT_DIR / "medicine_brands_export.csv"
PACKS_CSV = EXPORT_DIR / "medicine_packs_export.csv"
AROGGA_DB = VER_DIR / "arogga_live_catalog.sqlite"
MEDEX_DB = REPO_ROOT / "Bangladeshi-Medicine-API" / "data" / "medex.db"

NAME_CRITICAL_MARKERS = {
    "xr_family": {"er", "sr", "xr", "cr", "mr", "tr", "pr", "retard", "extend", "extended", "sustained", "controlled", "modified"},
    "dr_family": {"dr", "enteric", "ec"},
    "odt_family": {"odt", "dt", "dispersible"},
    "chew": {"chewable", "chew"},
    "ds": {"ds"},
    "plus": {"plus"},
    "extra": {"extra"},
    "forte": {"forte"},
    "max": {"max"},
    "mups": {"mups"},
    "ped": {"junior", "pediatric", "paediatric", "kids", "kid", "baby", "infant"},
    "refill": {"refill"},
    "evohaler": {"evohaler"},
    "accuhaler": {"accuhaler"},
    "maxhaler": {"maxhaler"},
    "turbuhaler": {"turbuhaler"},
    "rotahaler": {"rotahaler"},
    "solostar": {"solostar"},
    "kwikpen": {"kwikpen"},
    "flexpen": {"flexpen"},
    "flextouch": {"flextouch"},
    "penfill": {"penfill"},
}

MFR_ALIASES = {
    "sk+f": "eskayef",
    "skf": "eskayef",
    "eskayef": "eskayef",
    "sanofi": "synovia",
    "synovia": "synovia",
    "gsk": "glaxosmithkline",
    "glaxosmithkline": "glaxosmithkline",
    "aci": "aci",
    "incepta": "incepta",
    "square": "square",
    "beximco": "beximco",
    "renata": "renata",
    "healthcare": "healthcare",
    "opsonin": "opsonin",
    "acme": "acme",
    "aristopharma": "aristopharma",
    "popular": "popular",
    "general": "general",
    "beacon": "beacon",
    "radiant": "radiant",
    "unimed": "unimedunihealth",
    "unihealth": "unimedunihealth",
    "smc": "smc",
    "nipro": "niprojmi",
    "jmi": "niprojmi",
    "drug": "druginternational",
    "ibnsina": "ibnsina",
    "ibn": "ibnsina",
    "ziska": "ziska",
    "orion": "orion",
    "navana": "navana",
    "globe": "globe",
    "biopharma": "biopharma",
    "novartis": "novartis",
    "novo": "novonordisk",
    "sandoz": "sandoz",
    "servier": "servier",
    "astrazeneca": "astrazeneca",
    "roche": "roche",
    "pfizer": "pfizer",
    "getz": "getz",
    "sun": "sunpharma",
}

STRIP_LABELS = {"strip", "sreip", "blister", "pata"}


def norm_mfr(raw: str | None) -> str:
    t = (raw or "").lower()
    t = re.sub(r"^\s*the\s+", " ", t)
    t = re.sub(
        r"\b(the|pharmaceuticals?|pharma|laboratories|laboratory|lab|industries|ind|ltd|limited|plc|inc|corp|co|bd|bangladesh|enterprise|chemical|health\s*care)\b\.?",
        " ",
        t,
    )
    t = t.replace("&", " ").replace("+", " ")
    tokens = [w for w in re.findall(r"[a-z0-9]+", t) if w]
    if not tokens:
        return ""
    head = tokens[0]
    if head in MFR_ALIASES:
        return MFR_ALIASES[head]
    joined = "".join(tokens)
    for k, v in MFR_ALIASES.items():
        if joined.startswith(k):
            return v
    return joined


def norm_strength(s: str | None) -> str:
    if not s:
        return ""
    t = s.lower().strip()
    t = t.replace("μ", "mc").replace("µ", "mc")
    t = re.sub(r"[()\[\]]", "", t)
    t = re.sub(r"\s+", "", t)
    t = re.sub(r"(?:w/w|w/v|v/v)\b", "", t)
    t = re.sub(r"(?<!\d)\.(\d)", r"0.\1", t)
    t = re.sub(r"\.0+(?=[a-z%/]|$)", "", t)

    def _conv(m):
        val = float(m.group(1))
        unit = m.group(2)
        if unit in ("gm", "g"):
            val *= 1000.0
        elif unit == "mcg":
            val /= 1000.0
        if abs(val - round(val)) < 1e-6:
            return f"{int(round(val))}mg"
        return f"{val:g}mg"

    t = re.sub(r"(\d+(?:\.\d+)?)(gm|g|mcg)(?![a-z])", _conv, t)
    t = re.sub(r"(\d+(?:\.\d+)?)i\.?u\.?", r"\1iu", t)
    parts = [p for p in re.split(r"[+/]", t) if p]
    return "+".join(sorted(parts))


def extract_strength_from_name(name: str | None) -> str:
    if not name:
        return ""
    matches = re.findall(
        r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|gm|g|iu|%)(?:/\d*(?:\.\d+)?\s*(?:ml|vial|ampoule|puff|spray|gm|g))?\b",
        name.lower(),
    )
    return norm_strength("+".join(matches)) if matches else ""


def classify_form_family(form: str | None, name: str | None = None, pu_labels: list[str] | None = None) -> str:
    f = (form or "").strip().lower()
    n = (name or "").strip().lower()
    pus = " ".join(pu_labels or []).lower()

    if "suppository" in f or "pessary" in f or "suppository" in n or "suppository" in pus:
        return "suppository"
    if any(k in f for k in ("ophthalmic ointment", "ophthalmic gel", "eye ointment", "cream", "ointment", "gel", "paste", "lotion", "scalp", "shampoo", "topical solution")):
        return "topical"
    if any(k in f for k in ("drop", "ophthalmic solution", "ophthalmic suspension", "ophthalmic emulsion", "eye_drop", "eye/ear")):
        return "drops"
    if any(k in f for k in ("inhalation capsule", "dpi", "mdpi")):
        return "inhalation_capsule_dpi"
    if any(k in f for k in ("inhaler", "nasal spray", "topical spray", "ocular spray", "spray")) and "bottle" not in f:
        return "inhaler_spray"
    if any(k in f for k in ("injection", "infusion", "insulin device", "syringe", "prefilled", "pre-filled", "respirator", "nebulis")) and "oral &" not in f:
        return "injection"
    if any(k in f for k in ("syrup", "suspension", "oral solution", "elixir", "mouthwash", "hand rub", "emulsion", "saline", "cleanser", "liquid")) or f == "solution":
        return "liquid"
    if any(k in f for k in ("powder", "granules", "sachet")) and "suspension" not in f:
        return "powder_sachet"
    if "capsule" in f:
        return "capsule"
    if "tablet" in f:
        return "tablet"
    if not f:
        if "tablet" in pus or "tablet" in n:
            return "tablet"
        if "capsule" in pus or "capsule" in n:
            return "capsule"
        if "drop" in pus or "drop" in n:
            return "drops"
        if "tube" in pus or any(k in n for k in ("cream", "ointment", "gel", "lotion", "shampoo")):
            return "topical"
        if "syrup" in n or "suspension" in n or "ml bot" in pus:
            return "liquid"
        if "injection" in pus or "vial" in pus or "amps" in pus or "injection" in n:
            return "injection"
        if "inhaler" in n or "spray" in n:
            return "inhaler_spray"
        if "sachet" in pus or "oral saline" in pus or "powder" in n:
            return "powder_sachet"
    return "other"


def classify_topical_or_drop_subtype(form: str | None, name: str | None, pu_labels: list[str] | None = None) -> str:
    txt = f"{form or ''} {name or ''} {' '.join(pu_labels or [])}".lower()
    if "ophthalmic" in txt or "eye" in txt:
        return "ophthalmic"
    if "nasal" in txt:
        return "nasal"
    if "ear" in txt or "otic" in txt:
        return "otic"
    if "pediatric" in txt or "paediatric" in txt:
        return "pediatric_drop"
    if "ointment" in txt:
        return "ointment"
    if "cream" in txt:
        return "cream"
    if "gel" in txt:
        return "gel"
    if "lotion" in txt or "scalp" in txt:
        return "lotion"
    if "shampoo" in txt:
        return "shampoo"
    return "generic"


def extract_markers(text: str | None) -> set[str]:
    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    out = set()
    for tok in tokens:
        for canonical, group in NAME_CRITICAL_MARKERS.items():
            if tok in group:
                out.add(canonical)
    return out


def make_brand_stems(brand_name: str | None, arogga_mode: bool = False) -> set[str]:
    raw = (brand_name or "").strip().lower()
    raw = raw.replace("+", " plus ").replace("&", " ")
    no_parens = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", raw)
    candidates = {raw, no_parens}
    if arogga_mode:
        stripped = re.sub(
            r"\b(?:tablet|tablets|tab|capsule|capsules|cap|syrup|oral\s+suspension|suspension|dry\s+syrup|powder\s+for\s+suspension|oral\s+solution|solution|eye\s+drops?|ear\s+drops?|nasal\s+drops?|drops?|cream|ointment|gel|lotion|injection|iv\s+injection|im\s+injection|sc\s+injection|infusion|inhaler|nasal\s+spray|spray|suppository|sachet|pen|cartridge|cartidge|refill|bottle|bot|tube)\b",
            " ",
            no_parens,
        )
        stripped_nums = re.sub(
            r"\b\d+(?:\.\d+)?(?:\s*(?:mg|mcg|gm|g|ml|l|iu|%|/|s|doses?))*\b",
            " ",
            stripped,
        )
        candidates.add(stripped)
        candidates.add(stripped_nums)
    else:
        stripped = re.sub(r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|gm|g|ml|iu|%)\b", " ", no_parens)
        candidates.add(stripped)

    out = set()
    for c in candidates:
        al = re.sub(r"[^a-z0-9]+", "", c)
        if len(al) >= 2:
            out.add(al)
    return out


def parse_ml(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*ml\b", text, re.I)
    if m:
        val = float(m.group(1))
        return val if val > 0 else None
    m2 = re.search(r"(\d+(?:\.\d+)?)\s*l(?:iters?|itters?)?\b", text, re.I)
    if m2:
        val = float(m2.group(1)) * 1000.0
        return val if val > 0 else None
    return None


def parse_gm(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:gm|g)\b", text, re.I)
    if m:
        val = float(m.group(1))
        return val if val > 0 else None
    return None


def parse_dose_amount(text: str | None) -> str | None:
    """Extract vial/ampoule mass/IU amount (e.g. '500 mg vial' -> '500mg', '150 IU vial' -> '150iu')."""
    if not text:
        return None
    m = re.search(r"\b(\d+(?:\.\d+)?)\s*(mg|mcg|gm|g|iu)\b", text, re.I)
    if not m:
        return None
    return norm_strength(f"{m.group(1)}{m.group(2)}")


def parse_arogga_packaging(item: dict) -> dict:
    pvs = item.get("pv") or []
    pus = item.get("pu") or []
    v0 = pvs[0] if pvs else {}

    raw_mrp = v0.get("pv_mrp")
    try:
        mrp = float(raw_mrp) if raw_mrp is not None else None
    except (TypeError, ValueError):
        mrp = None
    stock_status = v0.get("pv_stock_status")
    is_dummy_price = mrp is None or mrp <= 0 or (mrp <= 1.0 and stock_status == 0)

    b2c_mrp_raw = v0.get("pv_b2c_mrp")
    try:
        b2c_mrp = float(b2c_mrp_raw) if b2c_mrp_raw is not None else None
    except (TypeError, ValueError):
        b2c_mrp = None

    base_lbl = (v0.get("pu_base_unit_label") or "").strip()
    sales_lbl = (v0.get("pu_b2c_sales_unit_label") or "").strip()
    base_mult = v0.get("pu_base_unit_multiplier") or 1
    sales_mult = v0.get("pu_b2c_base_unit_multiplier") or 1

    strip_cands = []
    box_mults = set()
    pu_ml = None
    pu_gm = None
    pu_dose = None
    all_pu_labels = []
    metered_doses = None

    for u in pus:
        lbl = (u.get("pu_label") or "").strip()
        lbl_l = lbl.lower()
        all_pu_labels.append(lbl_l)
        mult = u.get("pu_multiplier")
        is_b2c = bool(u.get("pu_is_b2c_sales_unit"))
        try:
            mult_int = int(round(float(mult))) if mult is not None else None
        except (TypeError, ValueError):
            mult_int = None

        if lbl_l in STRIP_LABELS and mult_int and 1 < mult_int <= 100:
            strip_cands.append((1 if is_b2c else 0, mult_int))
        elif mult_int == 1:
            m_tab = re.match(r"^(\d+)\s+(?:tablets?|capsules?|suppositorys?|suppositories)$", lbl_l)
            if m_tab and 1 < int(m_tab.group(1)) <= 100:
                strip_cands.append((1 if is_b2c else 0, int(m_tab.group(1))))

        if lbl_l in ("box", "pack", "carton", "jar", "pot", "bottle") and mult_int and mult_int > 1:
            box_mults.add(mult_int)

        if pu_ml is None:
            pu_ml = parse_ml(lbl)
        if pu_gm is None:
            pu_gm = parse_gm(lbl)
        if pu_dose is None:
            pu_dose = parse_dose_amount(lbl)
        if metered_doses is None:
            md = re.search(r"(\d+)\s*(?:metered\s+)?(?:doses?|sprays?|puffs?)\b", lbl_l)
            if md:
                metered_doses = int(md.group(1))

    if not strip_cands and sales_lbl.lower() in STRIP_LABELS:
        try:
            sm = int(round(float(sales_mult)))
            if 1 < sm <= 100:
                strip_cands.append((1, sm))
        except (TypeError, ValueError):
            pass

    arogga_strip = None
    if strip_cands:
        strip_cands.sort(key=lambda x: (-x[0], x[1]))
        arogga_strip = strip_cands[0][1]

    if pu_ml is None:
        pu_ml = parse_ml(item.get("p_name"))
    if pu_gm is None:
        pu_gm = parse_gm(item.get("p_name"))
    if pu_dose is None:
        pu_dose = parse_dose_amount(item.get("p_name")) or parse_dose_amount(item.get("p_strength"))

    form_family = classify_form_family(item.get("p_form"), item.get("p_name"), all_pu_labels)

    unit_mrp = None
    container_mrp = None
    if not is_dummy_price and mrp is not None:
        if form_family in ("tablet", "capsule", "suppository"):
            if base_mult == 1:
                unit_mrp = round(mrp, 2)
        elif form_family == "powder_sachet":
            if base_mult == 1 and any(w in base_lbl.lower() for w in ("sachet", "saline", "pack", "gm", "g")):
                unit_mrp = round(mrp, 2)
                container_mrp = round(mrp, 2)
            elif base_mult == 1:
                container_mrp = round(mrp, 2)
        else:
            if base_mult == 1:
                container_mrp = round(mrp, 2)

    return {
        "arogga_id": item.get("id") or item.get("p_id"),
        "p_name": item.get("p_name") or "",
        "p_strength": item.get("p_strength") or "",
        "p_form": item.get("p_form") or "",
        "p_generic_name": item.get("p_generic_name") or "",
        "p_brand_name": item.get("p_brand_name") or item.get("p_manufacturer") or "",
        "form_family": form_family,
        "sub_type": classify_topical_or_drop_subtype(item.get("p_form"), item.get("p_name"), all_pu_labels),
        "norm_strength": norm_strength(item.get("p_strength")) or extract_strength_from_name(item.get("p_name")),
        "norm_mfr": norm_mfr(item.get("p_brand_name") or item.get("p_manufacturer")),
        "name_markers": extract_markers(item.get("p_name")),
        "all_markers": extract_markers(f"{item.get('p_name') or ''} {item.get('p_form') or ''}"),
        "stems": make_brand_stems(item.get("p_name"), arogga_mode=True),
        "is_dummy_price": is_dummy_price,
        "stock_status": stock_status,
        "raw_mrp": mrp,
        "b2c_mrp": b2c_mrp,
        "unit_mrp": unit_mrp,
        "container_mrp": container_mrp,
        "strip_units": arogga_strip,
        "box_multipliers": sorted(box_mults),
        "pu_ml": pu_ml,
        "pu_gm": pu_gm,
        "pu_dose": pu_dose,
        "metered_doses": metered_doses,
        "pu_labels": all_pu_labels,
    }


def main() -> None:
    with open(BRANDS_CSV, encoding="utf-8") as f:
        brands = list(csv.DictReader(f))
    with open(PACKS_CSV, encoding="utf-8") as f:
        packs = list(csv.DictReader(f))
    packs_by_brand = defaultdict(list)
    for pk in packs:
        packs_by_brand[pk["brandId"]].append(pk)

    m_conn = sqlite3.connect(MEDEX_DB)
    m_conn.row_factory = sqlite3.Row
    medex_by_sid = {
        str(r["id"]): dict(r)
        for r in m_conn.execute("SELECT id, brand_name, dosage_form, strength, unit_price, price_text, pack_sizes FROM medicines").fetchall()
    }
    m_conn.close()

    a_conn = sqlite3.connect(AROGGA_DB)
    arogga_rows = a_conn.execute("SELECT raw_json FROM arogga_products").fetchall()
    a_conn.close()

    arogga_parsed = []
    arogga_by_stem = defaultdict(list)
    for (raw_s,) in arogga_rows:
        parsed = parse_arogga_packaging(json.loads(raw_s))
        arogga_parsed.append(parsed)
        for st in parsed["stems"]:
            arogga_by_stem[st].append(parsed)

    brand_match_stats = Counter()
    pack_status_stats = Counter()
    form_breakdown = defaultdict(Counter)

    verified_updates = []
    conflicts_review = []
    unverified_brands = []
    unverified_packs = []

    def find_matching_arogga_items(b: dict) -> tuple[list[dict], str]:
        b_stems = make_brand_stems(b["brandName"], arogga_mode=False)
        b_str = norm_strength(b["strength"])
        b_fam = classify_form_family(b["dosageForm"], b["brandName"])
        b_sub = classify_topical_or_drop_subtype(b["dosageForm"], b["brandName"])
        b_mfr = norm_mfr(b["manufacturer"])
        b_name_markers = extract_markers(b["brandName"])
        b_all_markers = extract_markers(f"{b['brandName']} {b['dosageForm']}")

        cands_seen = {}
        for st in b_stems:
            for it in arogga_by_stem.get(st, []):
                cands_seen[it["arogga_id"]] = it
        cands = list(cands_seen.values())
        if not cands:
            return [], "NO_STEM_CANDIDATE"

        exact_matches = []
        near_matches = []

        for it in cands:
            it_fam = it["form_family"]
            form_ok = (b_fam == it_fam) or (
                b_fam in ("inhalation_capsule_dpi", "capsule") and it_fam in ("inhalation_capsule_dpi", "capsule")
            )
            if not form_ok:
                continue

            if b_fam in ("topical", "drops"):
                if b_sub != "generic" and it["sub_type"] != "generic" and b_sub != it["sub_type"]:
                    continue

            if b_fam in ("tablet", "capsule", "inhaler_spray", "inhalation_capsule_dpi"):
                # Critical brand-name markers (Plus/DS/Extend/XR/Max/Evohaler/Accuhaler) must always agree
                if b_name_markers != it["name_markers"]:
                    # Allow CareDose 'Longpara' + form 'Tablet (Extended Release)' to match Arogga 'Longpara' + 'Tablet'
                    # ONLY if Arogga has no separate XR/plain sibling at that strength AND non-XR markers match
                    non_xr_b = b_name_markers - {"xr_family", "dr_family", "odt_family"}
                    non_xr_it = it["name_markers"] - {"xr_family", "dr_family", "odt_family"}
                    if non_xr_b != non_xr_it:
                        continue
                    # Reject if Arogga item has a release tag in name that DB lacks, or DB name has XR that Arogga lacks
                    if bool(it["name_markers"] & {"xr_family"}) and not bool(b_all_markers & {"xr_family"}):
                        continue

            it_str = it["norm_strength"]
            str_ok = False
            if b_str and it_str:
                str_ok = (b_str == it_str)
            elif not b_str and not it_str:
                str_ok = True
            elif not b_str and it_str:
                str_ok = True

            if not str_ok:
                continue

            it_mfr = it["norm_mfr"]
            mfr_ok = (
                not b_mfr
                or not it_mfr
                or b_mfr == it_mfr
                or b_mfr.startswith(it_mfr[:4])
                or it_mfr.startswith(b_mfr[:4])
            )
            if mfr_ok:
                exact_matches.append(it)
            else:
                near_matches.append(it)

        if exact_matches:
            return exact_matches, "EXACT_MATCH"
        if len(near_matches) == 1:
            return near_matches, "MFR_VARIANT_MATCH"
        if near_matches:
            return near_matches, "AMBIGUOUS_MFR_CONFLICT"
        return [], "FORM_OR_STRENGTH_MISMATCH"

    for b in brands:
        b_id = b["brandId"]
        b_packs = packs_by_brand.get(b_id, [])
        b_fam = classify_form_family(b["dosageForm"], b["brandName"])
        matched_items, match_kind = find_matching_arogga_items(b)
        brand_match_stats[match_kind] += 1
        valid_priced_items = [it for it in matched_items if not it["is_dummy_price"]]

        if len(b_packs) == 0:
            unverified_brands.append({
                "brandId": b_id,
                "sourceId": b["sourceId"],
                "brandName": b["brandName"],
                "strength": b["strength"],
                "dosageForm": b["dosageForm"],
                "manufacturer": b["manufacturer"],
                "issue": "ZERO_PACKS_IN_DB",
                "aroggaMatchKind": match_kind,
                "aroggaCandidatesCount": len(valid_priced_items),
            })
            continue

        if match_kind not in ("EXACT_MATCH", "MFR_VARIANT_MATCH") or not matched_items:
            unverified_brands.append({
                "brandId": b_id,
                "sourceId": b["sourceId"],
                "brandName": b["brandName"],
                "strength": b["strength"],
                "dosageForm": b["dosageForm"],
                "manufacturer": b["manufacturer"],
                "issue": f"NO_AROGGA_MATCH:{match_kind}",
                "aroggaMatchKind": match_kind,
                "medexDbPresent": b["sourceId"] in medex_by_sid,
            })
            for pk in b_packs:
                pack_status_stats["UNVERIFIED_NO_LIVE_MATCH"] += 1
                form_breakdown[b_fam]["UNVERIFIED_NO_LIVE_MATCH"] += 1
                unverified_packs.append({
                    "packId": pk["packId"], "brandId": b_id, "sourceId": b["sourceId"],
                    "brandName": b["brandName"], "dosageForm": b["dosageForm"], "strength": b["strength"],
                    "packQuantity": pk["packQuantity"], "reason": match_kind,
                })
            continue

        for pk in b_packs:
            db_pq = pk["packQuantity"]
            db_pu = int(pk["packUnits"]) if pk["packUnits"] else None
            db_su = int(pk["stripUnits"]) if pk["stripUnits"] else None
            db_up = float(pk["unitPrice"]) if pk["unitPrice"] else None
            db_pp = float(pk["packPrice"]) if pk["packPrice"] else None

            if not valid_priced_items:
                strip_cands = [it["strip_units"] for it in matched_items if it["strip_units"]]
                if b_fam in ("tablet", "capsule", "suppository") and db_su is None and len(set(strip_cands)) == 1:
                    new_su = strip_cands[0]
                    if db_pu is None or (db_pu >= new_su and db_pu % new_su == 0):
                        verified_updates.append({
                            "brandId": b_id, "sourceId": b["sourceId"], "brandName": b["brandName"],
                            "strength": b["strength"], "dosageForm": b["dosageForm"], "formFamily": b_fam,
                            "packId": pk["packId"], "packQuantity": db_pq,
                            "updateCategory": "STRIP_FILL_WITH_AROGGA_DUMMY_PRICE_SKIPPED",
                            "oldUnitPrice": db_up, "newUnitPrice": db_up,
                            "oldPackPrice": db_pp, "newPackPrice": db_pp,
                            "oldPackUnits": db_pu, "newPackUnits": db_pu,
                            "oldStripUnits": db_su, "newStripUnits": new_su,
                            "aroggaId": matched_items[0]["arogga_id"], "aroggaName": matched_items[0]["p_name"],
                        })
                        pack_status_stats["VERIFIED_UPDATE_READY"] += 1
                        form_breakdown[b_fam]["VERIFIED_UPDATE_READY"] += 1
                        continue
                pack_status_stats["UNVERIFIED_AROGGA_OUT_OF_STOCK_DUMMY_MRP"] += 1
                form_breakdown[b_fam]["UNVERIFIED_AROGGA_OUT_OF_STOCK_DUMMY_MRP"] += 1
                unverified_packs.append({
                    "packId": pk["packId"], "brandId": b_id, "sourceId": b["sourceId"],
                    "brandName": b["brandName"], "dosageForm": b["dosageForm"], "strength": b["strength"],
                    "packQuantity": db_pq, "reason": "AROGGA_DUMMY_MRP_STOCK_0",
                })
                continue

            # Pick pack-specific Arogga candidate safely
            chosen = None
            if b_fam in ("tablet", "capsule", "suppository", "inhalation_capsule_dpi"):
                with_unit_mrp = [it for it in valid_priced_items if it["unit_mrp"] is not None]
                if with_unit_mrp:
                    if db_pu:
                        box_hit = [it for it in with_unit_mrp if db_pu in it["box_multipliers"] or db_pu == it["strip_units"]]
                        chosen = box_hit[0] if box_hit else (with_unit_mrp[0] if len(with_unit_mrp) == 1 else None)
                    elif len(with_unit_mrp) == 1:
                        chosen = with_unit_mrp[0]
            else:
                pk_ml = parse_ml(db_pq)
                pk_gm = parse_gm(db_pq)
                pk_dose = parse_dose_amount(db_pq) if b_fam == "injection" else None
                pk_metered = re.search(r"(\d+)\s*(?:metered\s+)?(?:doses?|sprays?|puffs?)\b", db_pq or "", re.I)

                if pk_dose is not None:
                    # Injection packs specifying e.g. '500 mg vial' vs '200 mg vial' MUST match Arogga's pu_dose/p_name
                    dose_hits = [it for it in valid_priced_items if it["pu_dose"] == pk_dose]
                    if len(dose_hits) == 1:
                        chosen = dose_hits[0]
                elif pk_metered is not None:
                    md_val = int(pk_metered.group(1))
                    md_hits = [it for it in valid_priced_items if it["metered_doses"] == md_val]
                    if len(md_hits) == 1:
                        chosen = md_hits[0]
                    elif len(valid_priced_items) == 1 and valid_priced_items[0]["metered_doses"] is None and valid_priced_items[0]["pu_ml"] is None:
                        chosen = valid_priced_items[0]
                elif pk_ml is not None:
                    ml_hits = [it for it in valid_priced_items if it["pu_ml"] is not None and abs(it["pu_ml"] - pk_ml) < 0.05]
                    if ml_hits:
                        chosen = ml_hits[0]
                elif pk_gm is not None:
                    gm_hits = [it for it in valid_priced_items if it["pu_gm"] is not None and abs(it["pu_gm"] - pk_gm) < 0.05]
                    if gm_hits:
                        chosen = gm_hits[0]
                elif len(valid_priced_items) == 1:
                    it0 = valid_priced_items[0]
                    # Do not apply single liquid bottle price to conflicting multi-pack unless box multiplier matches
                    if not (db_pu and db_pu > 1 and it0["pu_ml"] and db_pu not in it0["box_multipliers"]):
                        chosen = it0

            if chosen is None:
                pack_status_stats["UNVERIFIED_PACK_VARIANT_NOT_MATCHED"] += 1
                form_breakdown[b_fam]["UNVERIFIED_PACK_VARIANT_NOT_MATCHED"] += 1
                unverified_packs.append({
                    "packId": pk["packId"], "brandId": b_id, "sourceId": b["sourceId"],
                    "brandName": b["brandName"], "dosageForm": b["dosageForm"], "strength": b["strength"],
                    "packQuantity": db_pq, "reason": "NO_EXACT_PACK_VARIANT_MATCH_ON_AROGGA",
                })
                continue

            if b_fam in ("tablet", "capsule", "suppository"):
                live_up = chosen["unit_mrp"]
                live_su = chosen["strip_units"]
                expected_pp = round(live_up * db_pu, 2) if (live_up is not None and db_pu is not None and db_pu > 0) else None

                # Flag suspicious >2x or <0.5x shifts OR Kaggle packPrice=1 / missing packUnits anomalies clearly
                anomalous = False
                if db_up and live_up and (live_up / db_up > 2.0 or live_up / db_up < 0.5):
                    anomalous = True

                # Never overwrite an existing valid divisible stripUnits (e.g. '25 x 2' with stripUnits=2)
                db_strip_valid = (
                    db_su is not None
                    and db_su > 1
                    and (db_pu is None or (db_pu >= db_su and db_pu % db_su == 0))
                )
                strip_change = False
                proposed_su = db_su
                strip_conflict = False
                if live_su is not None and not db_strip_valid:
                    if db_pu is None or (db_pu >= live_su and db_pu % live_su == 0):
                        if db_su != live_su:
                            proposed_su = live_su
                            strip_change = True
                    else:
                        if db_su == live_su:
                            strip_conflict = True
                elif live_su is not None and db_strip_valid and db_su != live_su:
                    # Both sides claim different valid strip counts -> flag for review only if pack explicitly had no NxM matrix
                    if not re.match(r"^\d+\s*x\s*\d+", (db_pq or "").strip(), re.I):
                        strip_conflict = True

                if anomalous or strip_conflict:
                    pack_status_stats["CONFLICT_REQUIRES_REVIEW"] += 1
                    form_breakdown[b_fam]["CONFLICT_REQUIRES_REVIEW"] += 1
                    conflicts_review.append({
                        "brandId": b_id, "sourceId": b["sourceId"], "brandName": b["brandName"],
                        "strength": b["strength"], "dosageForm": b["dosageForm"],
                        "packId": pk["packId"], "packQuantity": db_pq,
                        "reason": "ANOMALOUS_PRICE_DELTA_OR_STRIP_CONFLICT",
                        "dbUnitPrice": db_up, "aroggaUnitMrp": live_up,
                        "dbPackPrice": db_pp, "aroggaExpectedPackPrice": expected_pp,
                        "dbPackUnits": db_pu, "dbStripUnits": db_su, "aroggaStripUnits": live_su,
                        "aroggaId": chosen["arogga_id"], "aroggaName": chosen["p_name"],
                    })
                    continue

                up_diff = live_up is not None and (db_up is None or abs(live_up - db_up) > max(0.05, 0.01 * live_up))
                pp_diff = expected_pp is not None and (db_pp is None or abs(expected_pp - db_pp) > max(0.25, 0.01 * expected_pp))

                if not up_diff and not pp_diff and not strip_change:
                    pack_status_stats["VERIFIED_MATCH_NO_CHANGE"] += 1
                    form_breakdown[b_fam]["VERIFIED_MATCH_NO_CHANGE"] += 1
                else:
                    verified_updates.append({
                        "brandId": b_id, "sourceId": b["sourceId"], "brandName": b["brandName"],
                        "strength": b["strength"], "dosageForm": b["dosageForm"], "formFamily": b_fam,
                        "packId": pk["packId"], "packQuantity": db_pq,
                        "updateCategory": "+".join([c for c, flag in (("PRICE", up_diff or pp_diff), ("STRIP", strip_change)) if flag]),
                        "oldUnitPrice": db_up, "newUnitPrice": live_up if up_diff else db_up,
                        "oldPackPrice": db_pp, "newPackPrice": expected_pp if pp_diff else db_pp,
                        "oldPackUnits": db_pu, "newPackUnits": db_pu,
                        "oldStripUnits": db_su, "newStripUnits": proposed_su,
                        "aroggaId": chosen["arogga_id"], "aroggaName": chosen["p_name"],
                    })
                    pack_status_stats["VERIFIED_UPDATE_READY"] += 1
                    form_breakdown[b_fam]["VERIFIED_UPDATE_READY"] += 1
            else:
                live_cp = chosen["container_mrp"]
                if live_cp is None:
                    pack_status_stats["UNVERIFIED_PACK_VARIANT_NOT_MATCHED"] += 1
                    form_breakdown[b_fam]["UNVERIFIED_PACK_VARIANT_NOT_MATCHED"] += 1
                    continue

                expected_pp = live_cp
                if db_pu and db_pu > 1 and chosen["pu_ml"] is None and chosen["pu_gm"] is None:
                    expected_pp = round(live_cp * db_pu, 2)
                elif db_pu and db_pu > 1 and db_pu in chosen["box_multipliers"]:
                    expected_pp = round(live_cp * db_pu, 2)

                anomalous = False
                if db_pp and expected_pp and (expected_pp / db_pp > 2.0 or expected_pp / db_pp < 0.5):
                    anomalous = True

                if anomalous:
                    pack_status_stats["CONFLICT_REQUIRES_REVIEW"] += 1
                    form_breakdown[b_fam]["CONFLICT_REQUIRES_REVIEW"] += 1
                    conflicts_review.append({
                        "brandId": b_id, "sourceId": b["sourceId"], "brandName": b["brandName"],
                        "strength": b["strength"], "dosageForm": b["dosageForm"],
                        "packId": pk["packId"], "packQuantity": db_pq,
                        "reason": "ANOMALOUS_CONTAINER_PRICE_DELTA",
                        "dbPackPrice": db_pp, "aroggaContainerMrp": live_cp,
                        "aroggaExpectedPackPrice": expected_pp,
                        "dbPackUnits": db_pu, "aroggaId": chosen["arogga_id"],
                        "aroggaName": chosen["p_name"], "aroggaPuLabels": chosen["pu_labels"],
                    })
                    continue

                pp_diff = db_pp is None or abs(expected_pp - db_pp) > max(0.25, 0.01 * expected_pp)
                if not pp_diff:
                    pack_status_stats["VERIFIED_MATCH_NO_CHANGE"] += 1
                    form_breakdown[b_fam]["VERIFIED_MATCH_NO_CHANGE"] += 1
                else:
                    verified_updates.append({
                        "brandId": b_id, "sourceId": b["sourceId"], "brandName": b["brandName"],
                        "strength": b["strength"], "dosageForm": b["dosageForm"], "formFamily": b_fam,
                        "packId": pk["packId"], "packQuantity": db_pq,
                        "updateCategory": "CONTAINER_PRICE",
                        "oldUnitPrice": db_up, "newUnitPrice": db_up,
                        "oldPackPrice": db_pp, "newPackPrice": expected_pp,
                        "oldPackUnits": db_pu, "newPackUnits": db_pu,
                        "oldStripUnits": db_su, "newStripUnits": db_su,
                        "aroggaId": chosen["arogga_id"], "aroggaName": chosen["p_name"],
                    })
                    pack_status_stats["VERIFIED_UPDATE_READY"] += 1
                    form_breakdown[b_fam]["VERIFIED_UPDATE_READY"] += 1

    update_fields = [
        "brandId", "sourceId", "brandName", "strength", "dosageForm", "formFamily",
        "packId", "packQuantity", "updateCategory",
        "oldUnitPrice", "newUnitPrice", "oldPackPrice", "newPackPrice",
        "oldPackUnits", "newPackUnits", "oldStripUnits", "newStripUnits",
        "aroggaId", "aroggaName",
    ]
    with open(VER_DIR / "verified_price_and_packaging_updates.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=update_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(verified_updates)
    with open(VER_DIR / "verified_price_and_packaging_updates.json", "w", encoding="utf-8") as f:
        json.dump({"count": len(verified_updates), "records": verified_updates}, f, indent=2, ensure_ascii=False)

    with open(VER_DIR / "conflicts_requiring_review.json", "w", encoding="utf-8") as f:
        json.dump({"count": len(conflicts_review), "records": conflicts_review}, f, indent=2, ensure_ascii=False)

    with open(VER_DIR / "unverified_brands_and_packs.json", "w", encoding="utf-8") as f:
        json.dump({
            "unverifiedBrandsCount": len(unverified_brands),
            "unverifiedPacksCount": len(unverified_packs),
            "unverifiedBrands": unverified_brands,
            "unverifiedPacks": unverified_packs,
        }, f, indent=2, ensure_ascii=False)

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "postgresqlModified": False,
        "sourcesUsed": {
            "primaryLive": "Arogga API v3 (2026-11-24, 28,978 products)",
            "secondaryReference": "medex.db (2026-07-09 scrape, 19,590 rows)",
        },
        "totalCareDoseBrands": len(brands),
        "totalCareDosePacks": len(packs),
        "brandMatchBreakdown": dict(brand_match_stats),
        "packVerificationBreakdown": dict(pack_status_stats),
        "dosageFormBreakdown": {k: dict(v) for k, v in form_breakdown.items()},
        "updateCategoryCounts": dict(Counter(u["updateCategory"] for u in verified_updates)),
    }
    with open(VER_DIR / "verification_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
