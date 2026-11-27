# CareDose Consolidated Catalogue Remediation Plan

**Generated:** 2026-11-25 07:41 UTC  
**Database Verification Mode:** 100% Read-Only (`REPEATABLE READ, READ ONLY`) against live PostgreSQL snapshot (`25,208` brands, `27,468` packages, `1,846` generics).  
**Primary Artifacts Directory:** [`consolidated_remediation`](file:///F:/My%20Projects/CareDose/backend/reports/consolidated_remediation/)

---

## 1. Executive Reconciliation: Live DB vs Historical Executions

| Stage / Transition | Records Modified / Audited | Verification Finding |
|---|---:|---|
| Baseline (`packaging_audit` pre-High-40) | `1,464` invalid (`1,055` arith + `409` non-divisible) | Baseline CSV `catalogue_export/` was taken right after High-40 cleanup (`1,424` invalid). |
| High-40 Strip Cleanup (`--scope=high40`) | `40` `stripUnits -> NULL` (`22` later synced by Arogga) | Non-divisible strips reduced `409 -> 369`. |
| Arogga Synchronization (`4,807` staged) | `4,746` applied, `61` excluded/rolled back | Live post-Arogga export matches `4,746` exact `packId`s; `4,764` total touched incl. High-40. |
| Priority-1 Conflict Audit (`280` packs) & Execution | `104` price updates applied; `166` variants, `6` source conflicts, `4` verified correct held | Exact `104` diffs between post-Arogga and live post-P1 exports; `0` brand/generic changes; `0` overlap with `4,746`. |
| **Cumulative Baseline-to-Live Modified Packs** | **`4,850` unique `packId`s** | `4,746` (Arogga) + `104` (Priority-1) CSV price/strip changes (`+18` High-40-only `stripUnits=NULL` pre-export = `4,868`). |

### Live Partition of All `27,468` `MedicinePack` Records
- `4,746` applied in Arogga synchronization (`final_approved_updates.json`)
- `61` QA-excluded / rolled back (`excluded_updates_report.json`)
- `792` post-sync conflicts (`104` already fixed + `4` verified correct in P1; `684` remain open)
- `895` unmatched Arogga package variants (`866` logged + `29` recovered DPI / Inhalation Capsule packs with missing container MRP)
- `738` matched Arogga `pv_stock_status=0` dummy-MRP records
- `9,110` no live Arogga match (`8,202` brands)
- `11,126` matched Arogga within tolerance (`VERIFIED_NO_CHANGE`)  
**Total:** `4,746 + 61 + 792 + 895 + 738 + 9,110 + 11,126 = 27,468` (exact 100% partition).

---

## 2. Unified Remediation Ledger Summary

- **Ledger File:** [`consolidated_remediation_ledger.csv`](file:///F:/My%20Projects/CareDose/backend/reports/consolidated_remediation/consolidated_remediation_ledger.csv) (`16,755` unique `packId` rows; `0` duplicates).
- **Multi-Category Packs:** `1,957` packs appear in `2+` active/hygiene categories (detailed in [`duplicate_issue_membership_report.json`](file:///F:/My%20Projects/CareDose/backend/reports/consolidated_remediation/duplicate_issue_membership_report.json)).

| Resolution Status | Unique `packId`s | Meaning |
|---|---:|---|
| `ALREADY_CORRECTED` | `4,699` | Resolved in High-40 / Arogga `4,746` / P1 `104` with zero remaining open issues/warnings. |
| `ALREADY_CORRECTED_STALE_WARNING` | `70` | Arithmetically fixed in Priority-1 `104`, still holding pre-existing `"pack_price_inconsistent_with_unit_price"` warning text. |
| `ALREADY_CORRECTED_OPEN_SECONDARY_ISSUE` | `99` | Updated in Arogga `4,746`, but secondary issue remains (`Elmin` `su=1`; `Glypressin` & `Enterogermina` Category H; Cat B/C where applicable). |
| `EXISTING_VERIFIED_CORRECT` | `2` | Audited in P1 and verified accurate (`Ventonix 10 mg`, `Ventonix 50 mg`). |
| `EXISTING_VERIFIED_CORRECT_OPEN_SECONDARY_ISSUE` | `2` | Price verified in P1 (`Stafoxin`, `Delzo` `10/300`), while `non_divisible_strip` remains open. |
| `EXCLUDED_REQUIRES_REVIEW` | `61` | QA-excluded/rolled-back Arogga updates (`4` verified ready for Batch 1C; `Brodil` already correct in DB). |
| `UNRESOLVED` | `11,822` | Open price, packaging, conversion, variant, or source-coverage issues. |

---

## 3. Deduplicated Phase-3 Issue Groups (Unique Packs & Unique Brands)

| Group | Issue Group | Unique Packs | Unique Brands | Key Composition & Sub-Scopes |
|---|---|---:|---:|---|
| **1** | **Non-divisible strip & strip anomalies** | **`376`** | **`372`** | `368` `pu % su != 0` (`325` in `conflicts_792`: `290` `MED-314` + `35` `VER-55`, plus `43` outside) + `8` live anomalies (`7` `su=1` Nx1 packs + `1` `B-Vit 4` `200`-tab strip). |
| **2** | **Large price differences & arithmetic mismatch** | **`805`** | **`796`** | Union of `187` `conflicts_792` large deltas (`178` `LARGE_PRICE_DELTA` + `9` `OTHER_CONFLICT`) and `638` remaining live `>5%` arithmetic mismatches (`708 - 70` P1 fixes; `20` overlap `187`). Note `+ 27` comma-truncated `2..103 BDT` rows inside `187`. |
| **3** | **Remaining Priority-1 package variants** | **`166`** | **`166`** | `165` synthetic `280/300` benchmark packs mismatched to alternate box sizes + `1` legacy `1-BDT` `100`'s pack (`138` also have `live_arith_638`; `32` overlap Group 1). |
| **4** | **Source conflicts & QA exclusions** | **`67`** | **`65`** | `6` P1 `SOURCE_CONFLICT` + `61` `excluded_updates_report` (`47` manufacturer mismatch, `5` generic conflict, `2` strength swap, `2` kit scaling, `5` partial rounding). Strict entity/source conflict count excluding the 5 rounding items: `62` packs / `61` brands. |
| **5** | **Zero-package brands** | **`0`** | **`37`** | Completely unpopulated in `MedicinePack`; `15` have Arogga brand candidates (see Batch 2C). |
| **6** | **Frontend conversion mismatches (Cat H)** | **`50`** | **`49`** | `39` injection noun/volume mismatches, `10` liquid pack counts without ml, `1` nasal spray without metered doses (`36` overlap Group 8, `8` Group 7, `2` Group 2). |
| **7** | **Unmatched package variants** | **`895`** | **`850`** | `866` logged `NO_EXACT_PACK_VARIANT_MATCH_ON_AROGGA` + `29` recovered DPI / Inhalation Capsule packs missing container MRP (`8` overlap Group 6). |
| **8** | **Brands without a live source match** | **`9,110`** | **`8,202`** | `4,993` `NO_STEM_CANDIDATE` + `4,080` `FORM_OR_STRENGTH_MISMATCH` + `37` `AMBIGUOUS_MFR_CONFLICT` (`438` also have arithmetic price mismatch; `36` Group 6). |

**Supplementary Live Hygiene Scopes:** `738` Arogga `stock=0` dummy-MRP packs (`711` brands) · `1,736` Category B/D missing quantities · `48` Category C missing injection nouns · `61` Category E nesting brands · `356` Category F informative generic-strip variance groups · `70` stale Priority-1 price warnings (`Sup_StaleP1PriceWarning`).

---

## 4. Prioritized Next Remediation Roadmap

Detailed per-record payloads, live evidence, and confidence tags are in [`proposed_next_batch.json`](file:///F:/My%20Projects/CareDose/backend/reports/consolidated_remediation/proposed_next_batch.json).

1. **Priority 1 (Immediate Execution Ready — `HIGH` Confidence):**
   - **Batch 1A–1C (`15` packs):**
     - `9` web+MedEx+Arogga+Kaggle verified comma-truncated `>=৳1,000` corrupt DB prices (`Zoclast`, `Zolenic`, `Trulicity` syringe + `4`'s pack, `Sporium`, `Tericin`, `Tazumab`, `Tarceva 150`, `Trepmac 90`).
     - `2` live-MedEx-verified `REM_187` fixes (`Upanib 15 mg`: `280 -> 120.00`, `Renesis 150 mg`: `350/1050 -> 800/2400`).
     - `4` live-MedEx-verified `excluded_61` partial rounding sync fixes (`Folate 5 mg`, `GastroLax`, `Neosaline 20's` & `50's`).
   - **Batch 1D (`70` packs, metadata-only hygiene):** Clear stale `pack_price_inconsistent_with_unit_price` warning tags on Priority-1-corrected packs where arithmetic diff is now `0.00`.
2. **Priority 2 (High-Value Direct MedEx Verification — `MEDIUM` Confidence):**
   - **`18` remaining comma-truncated `REM_187` packs (`৳2`–`৳103`):** Proven corrupted vs Kaggle commas, but held out of auto-apply because live MedEx checks showed significant MRP revisions (e.g., `Tasigna 200` `~475` vs Kaggle `3,051.50`; `Sandostatin 50` `~1,810` vs `7,025.66`; `Simulect` `~143,195` vs `103,273`; `Trastunix` `~58,005` vs `80,000`; `Zavicefta` `~9,285` vs `6,460`).
   - **`6` Priority-1 Source Conflicts + `57` remaining `excluded_61` records:** Verify `R-Pag 25 mg` (`500/tab` vs `4,600` pack), `Cytomis Kit`, `Triokit`, `47` MFR mismatches, and `5` generic conflicts on live MedEx (keep `Brodil 2` & `Orextil 250` unchanged — DB already matches live MedEx).
3. **Priority 3 (Packaging & Conversion Integrity — `2,162` Unique Packs):**
   - Audit `376` live strip anomalies (`69` MFR-matched Arogga product-specific `pu_multiplier` candidates + `8` single-blister/200-strip anomalies = `77` in Batch 2B, plus `299` requiring direct MedEx page inspection; **zero peer-similarity assumptions**).
   - Resolve `50` Category H mismatches and `48` Category C injection nouns (`435` core packaging/conversion packs) + `1,736` Category B/D parseable quantities.
4. **Priority 4 (Moderate Price Verification & Zero-Pack Backfill):**
   - Verify `166` remaining Priority-1 wrong package variants, remaining `REM_187` items (guarding against Arogga's 5-suppository strip unit pricing as seen on `Napa` / `Renova`), remaining `638` arithmetic mismatches, and backfill `15` Arogga-matched zero-pack brands (`37` total zero-pack brands).
5. **Priority 5 (Systematic Catalogue Coverage — `10,743` Unverified Long Tail):**
   - Scheduled direct MedEx / DGDA / manufacturer verification for `895` unmatched package variants, `738` Arogga `stock=0` items, and `9,110` no-live-Arogga-match packs (`8,202` brands).
