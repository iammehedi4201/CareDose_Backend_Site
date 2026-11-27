"""Resumable, polite live Arogga catalog collector (Pass 1: generics+mfrs, Pass 2: unmatched brand tokens).

Zero PostgreSQL mutations. Writes fetched Arogga v3 JSON records into a local checkpointed SQLite DB.
"""
import argparse
import csv
import json
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parents[3]
BRANDS_CSV = REPO_ROOT / "backend" / "reports" / "catalogue_export" / "medicine_brands_export.csv"
OUT_DIR = REPO_ROOT / "backend" / "reports" / "catalogue_verification"
OUT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = OUT_DIR / "arogga_live_catalog.sqlite"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

SALT_WORDS = {
    "hydrochloride", "hcl", "besilate", "besylate", "sodium", "potassium",
    "calcium", "maleate", "tartrate", "bitartrate", "citrate", "sulfate",
    "sulphate", "methylsulfate", "methylsulphate", "metilsulfate",
    "phosphate", "trihydrate", "monohydrate", "dihydrate", "anhydrous",
    "sesquihydrate", "hemihydrate", "tetrahydrate", "pentahydrate",
    "hexahydrate", "decahydrate", "hydrate", "monosodium", "trisodium",
    "dipotassium", "monopotassium", "acetate", "diacetate", "fumarate",
    "hemifumarate", "succinate", "mesylate", "mesilate", "bromide",
    "chloride", "nitrate", "benzoate", "glucoheptonate", "medoxomil",
    "axetil", "proxetil", "cilexetil", "pivalate", "valerate", "dipropionate",
    "propionate", "furoate", "butyrate", "acetonide", "lactate", "gluconate",
    "palmitate", "stearate", "oleate", "disodium", "meglumine", "tromethamine",
    "trometamol", "dihydrogen", "tosylate", "esylate", "pamoate", "embonate",
    "edetate", "olamine", "estolate", "ethylsuccinate", "lactobionate",
    "oral", "bp", "usp", "inn", "ep",
}


def strip_generic_salts(name: str) -> str:
    cleaned = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", name or "")
    parts = [p.strip() for p in re.split(r"[+&/,]", cleaned) if p.strip()]
    out = []
    for part in parts:
        words = [w for w in re.findall(r"[a-zA-Z0-9-]+", part) if w.lower() not in SALT_WORDS]
        if words:
            out.append(" ".join(words))
    return " ".join(out).strip()


def init_db(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS arogga_products (
            id INTEGER PRIMARY KEY,
            p_name TEXT,
            p_strength TEXT,
            p_form TEXT,
            p_generic_name TEXT,
            p_brand_name TEXT,
            raw_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS query_log (
            query_key TEXT PRIMARY KEY,
            total_hits INTEGER,
            fetched_items INTEGER,
            pages_fetched INTEGER,
            status TEXT,
            fetched_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def fetch_query(query: str, max_pages: int = 10) -> tuple[str, int, list[dict], int, str]:
    items = []
    total_hits = 0
    pages_fetched = 0
    for pg in range(1, max_pages + 1):
        url = (
            f"https://api.arogga.com/general/v3/search"
            f"?_page={pg}&_perPage=100&_product_type=medicine&_search={urllib.parse.quote(query)}"
        )
        last_err = None
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    if resp.status != 200:
                        last_err = f"HTTP {resp.status}"
                        time.sleep(0.5 * (attempt + 1))
                        continue
                    payload = json.loads(resp.read().decode("utf-8"))
                    if pg == 1:
                        total_hits = int(payload.get("total") or 0)
                    batch = payload.get("data") or []
                    pages_fetched += 1
                    items.extend(batch)
                    if len(batch) < 100:
                        return query, total_hits, items, pages_fetched, "ok"
                    last_err = None
                    break
            except Exception as exc:
                last_err = str(exc)
                if "403" in last_err or "429" in last_err:
                    time.sleep(1.5 * (attempt + 1))
                else:
                    time.sleep(0.4 * (attempt + 1))
        if last_err is not None:
            return query, total_hits, items, pages_fetched, f"err:{last_err[:120]}"
    return query, total_hits, items, pages_fetched, "ok_capped"


def norm_alnum(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def load_done_queries(conn: sqlite3.Connection) -> set[str]:
    return {
        r[0]
        for r in conn.execute("SELECT query_key FROM query_log WHERE status LIKE 'ok%'").fetchall()
    }


def upsert_results(conn: sqlite3.Connection, results: list[tuple[str, int, list[dict], int, str]], now_iso: str) -> int:
    new_or_updated = 0
    for q_key, total_hits, items, pages_fetched, status in results:
        for it in items:
            pid = it.get("id") or it.get("p_id")
            if not pid:
                continue
            conn.execute(
                """
                INSERT INTO arogga_products (id, p_name, p_strength, p_form, p_generic_name, p_brand_name, raw_json, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    p_name = excluded.p_name,
                    p_strength = excluded.p_strength,
                    p_form = excluded.p_form,
                    p_generic_name = excluded.p_generic_name,
                    p_brand_name = excluded.p_brand_name,
                    raw_json = excluded.raw_json,
                    fetched_at = excluded.fetched_at
                """,
                (
                    int(pid),
                    it.get("p_name") or "",
                    it.get("p_strength") or "",
                    it.get("p_form") or "",
                    it.get("p_generic_name") or "",
                    it.get("p_brand_name") or it.get("p_manufacturer") or "",
                    json.dumps(it, ensure_ascii=False),
                    now_iso,
                ),
            )
            new_or_updated += 1
        conn.execute(
            """
            INSERT INTO query_log (query_key, total_hits, fetched_items, pages_fetched, status, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(query_key) DO UPDATE SET
                total_hits = excluded.total_hits,
                fetched_items = excluded.fetched_items,
                pages_fetched = excluded.pages_fetched,
                status = excluded.status,
                fetched_at = excluded.fetched_at
            """,
            (q_key, total_hits, len(items), pages_fetched, status, now_iso),
        )
    conn.commit()
    return new_or_updated


def run_batch(conn: sqlite3.Connection, queries: list[str], key_prefix: str, max_pages: int, workers: int) -> None:
    done_keys = load_done_queries(conn)
    pending = [(f"{key_prefix}:{q}", q) for q in queries if f"{key_prefix}:{q}" not in done_keys]
    print(f"[{key_prefix}] Total queries={len(queries)}, already cached={len(queries) - len(pending)}, remaining={len(pending)}")
    if not pending:
        return

    t0 = time.time()
    buf = []
    completed = 0
    errors = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        fut_map = {ex.submit(fetch_query, q_str, max_pages): q_key for q_key, q_str in pending}
        for fut in as_completed(fut_map):
            q_key = fut_map[fut]
            completed += 1
            try:
                _, tot, items, pgs, status = fut.result()
                if not status.startswith("ok"):
                    errors += 1
                buf.append((q_key, tot, items, pgs, status))
            except Exception as exc:
                errors += 1
                buf.append((q_key, 0, [], 0, f"err:{str(exc)[:100]}"))

            if len(buf) >= 100 or completed == len(pending):
                upsert_results(conn, buf, datetime.now(timezone.utc).isoformat())
                buf.clear()
                if completed % 200 == 0 or completed == len(pending):
                    tot_prods = conn.execute("SELECT count(*) FROM arogga_products").fetchone()[0]
                    print(
                        f"  [{key_prefix}] {completed}/{len(pending)} queries | errors={errors} | unique_arogga_products={tot_prods} | elapsed={time.time() - t0:.1f}s"
                    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["pass1", "pass2", "all"], default="all")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    with open(BRANDS_CSV, encoding="utf-8") as f:
        brands = list(csv.DictReader(f))

    conn = init_db(DB_PATH)
    try:
        if args.mode in ("pass1", "all"):
            generic_queries = sorted(
                {strip_generic_salts(b["genericName"]) for b in brands if b["genericName"] and len(strip_generic_salts(b["genericName"])) >= 3}
            )
            mfr_queries = sorted({b["manufacturer"].strip() for b in brands if b["manufacturer"].strip()})
            run_batch(conn, generic_queries, "gen", max_pages=10, workers=args.workers)
            run_batch(conn, mfr_queries, "mfr", max_pages=10, workers=args.workers)

        if args.mode in ("pass2", "all"):
            # Identify CareDose brand first words not yet represented cleanly in arogga_products by stem
            existing_names = set()
            for (nm,) in conn.execute("SELECT p_name FROM arogga_products").fetchall():
                an = norm_alnum(nm)
                if an:
                    existing_names.add(an)
                first_tok = (nm or "").strip().split()
                if first_tok:
                    existing_names.add(norm_alnum(first_tok[0]))

            unmatched_brand_queries = set()
            for b in brands:
                bn = (b["brandName"] or "").strip()
                if not bn:
                    continue
                bn_al = norm_alnum(bn)
                first_w = bn.split()[0]
                fw_al = norm_alnum(first_w)
                if bn_al not in existing_names and fw_al not in existing_names:
                    q = first_w if len(first_w) >= 3 else bn
                    if len(q) >= 2:
                        unmatched_brand_queries.add(q)

            run_batch(conn, sorted(unmatched_brand_queries), "brand", max_pages=3, workers=args.workers)

        tot_prods = conn.execute("SELECT count(*) FROM arogga_products").fetchone()[0]
        err_queries = conn.execute("SELECT count(*) FROM query_log WHERE status NOT LIKE 'ok%'").fetchone()[0]
        print(f"[DONE] Arogga live catalog saved to {DB_PATH}: {tot_prods} unique products, query errors={err_queries}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
