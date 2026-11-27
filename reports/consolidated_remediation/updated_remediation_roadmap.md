# CareDose Consolidated Catalogue Remediation Roadmap (Post-Batch 1 Refresh)

**Refreshed:** 2026-11-25 08:05 UTC  
**Live PostgreSQL Snapshot:** [`catalogue_export_post_batch1`](file:///F:/My%20Projects/CareDose/backend/reports/catalogue_export_post_batch1/) (`25,208` brands, `27,468` packages, `1,846` generics; all `UNVERIFIED`, `0` unintended diffs).  
**Status:** Batch 1A–1D (`85` records) committed & validated; **Batch 2 NOT executed** (staged strictly for review).

---

## 1. Completed Remediation History (4 Waves · `4,883` Unique Packs Touched)

| Wave | Scope | Applied | Key Impact & Immutable Artifacts |
|---|---|---:|---|
| **1** | High-40 Strip Cleanup (`--scope=high40`) | `40` | `stripUnits -> NULL`; non-divisible strips `409 -> 369`. |
| **2** | Arogga Synchronization (`4,807` staged) | `4,746` | Price & strip sync (`22` overlap High-40; `61` excluded). |
| **3** | Priority-1 Price Corrections (`280` audited) | `104` | `75` benchmarks + `28` `1-BDT` + `1` Diazox (`0` overlap `4,746`). |
| **4A–C** | Batch 1A–1C Price Corrections | `15` | `9` comma-truncated + `2` REM-187 + `4` excluded rounding ([`batch1_price_execution_report.json`](file:///F:/My%20Projects/CareDose/backend/reports/batch1_remediation_execution/batch1_price_execution_report.json)). |
| **4D** | Batch 1D Stale Warning Cleanup | `70` | Cleared pre-existing `pack_price_inconsistent_with_unit_price` inside Priority-1 `104` ([`batch1_warning_cleanup_report.json`](file:///F:/My%20Projects/CareDose/backend/reports/batch1_remediation_execution/batch1_warning_cleanup_report.json)). |

- **Ledger v1 -> v2 Transitions:** [`consolidated_remediation_ledger_v2.csv`](file:///F:/My%20Projects/CareDose/backend/reports/consolidated_remediation/consolidated_remediation_ledger_v2.csv) (`16,755` unique `packId`s, `0` duplicates).
  - `ALREADY_CORRECTED`: `4,699 -> 4,777` (`+78`: `70` stale warnings cleared + `8` Batch 1A–1C price fixes with complete pack data)
  - `ALREADY_CORRECTED_STALE_WARNING`: `70 -> 0` (`-70`, fully cleared)
  - `ALREADY_CORRECTED_OPEN_SECONDARY_ISSUE`: `99 -> 106` (`+7` Batch 1A–1B vials/tablets whose price was fixed while Cat B missing `packUnits` remains open)
  - `EXCLUDED_REQUIRES_REVIEW`: `61 -> 57` (`-4` moved to completed via Batch 1C)
  - `UNRESOLVED`: `11,822 -> 11,811` (`-11` price conflicts resolved via Batch 1A–1B; all `85` Batch 1 records have `activeIssueGroupCount = 0`)
  - Verified-correct baseline counts preserved (`EXISTING_VERIFIED_CORRECT = 2`, `EXISTING_VERIFIED_CORRECT_OPEN_SECONDARY_ISSUE = 2`).
- **Catalogue-Wide Warnings:** Non-empty `warnings` dropped strictly **`733 -> 663`** (`0` stale P1 price warnings left).
- Full chronological provenance and rollback references: [`completed_remediation_history.json`](file:///F:/My%20Projects/CareDose/backend/reports/consolidated_remediation/completed_remediation_history.json).

---

## 2. Recalculated Remaining Issues (`remaining_issues_v2.json`)

| Group | Issue Group | v1 Packs | v2 Packs | v2 Brands | Delta |
|---|---|---:|---:|---:|---:|
| **1** | Non-divisible strip & anomalies (`368` + `8`) | `376` | **`376`** | `372` | `0` |
| **2** | Large price deltas (`176`) & live arith (`638`) | `805` | **`794`** | `786` | `-11` |
| **3** | Remaining Priority-1 package variants | `166` | **`166`** | `166` | `0` |
| **4** | Source conflicts (`6` P1 + `57` remaining excluded) | `67` | **`63`** | `62` | `-4` |
| **5** | Zero-package brands | `0` | **`0`** | `37` | `0` |
| **6** | Frontend conversion mismatches (Cat H) | `50` | **`50`** | `49` | `0` |
| **7** | Unmatched package variants (`866` + `29` DPI) | `895` | **`895`** | `850` | `0` |
| **8** | Brands without live source match | `9,110` | **`9,110`** | `8,202` | `0` |

- **Open Overlap Summary:** `1,950` packs remain in `2+` active/hygiene categories (top intersections: `NoLiveMatch & Cat B/D = 1,181`, `Arith638 & NoLiveMatch = 438`, `Arith638 & P1Variant166 = 138`, `Strip376 & Arith638 = 45`). See [`remaining_issues_v2.json`](file:///F:/My%20Projects/CareDose/backend/reports/consolidated_remediation/remaining_issues_v2.json).

---

## 3. Next 100 Highest-Confidence Unresolved Records (`proposed_batch2a_review.json`)

Staged strictly for review in [`proposed_batch2a_review.json`](file:///F:/My%20Projects/CareDose/backend/reports/consolidated_remediation/proposed_batch2a_review.json) (**`100` unique `packId`s**, plus `6` live-verified zero-pack candidates in appendix):

1. **Tier 1 (`42` packs — `HIGH_STAGED_FOR_REVIEW`):** 3-way verified (`live MedEx + Arogga st=1 + MFR match`) `REM_187` prices (`Annova 250`, `Montinex Fast`, `Fixolin`, `Pansos`, `Defrol`, `Finmax 10/20`, `Regocent`, `Zomitan`, `Fenadin ODT`, `Oral-Z`, `Moxin` x2, `Itracon`, `Natrol 0.05/0.1`, `Loxodol 8`, `Camlor 4/8`, `Lorno 4/8`, `Loricam 8`, `Ornopain 4/8`, `Thyrolar 50`, `Ovocal Plus`, `Montelon`, `Litiam ER`, `Kanopas`, `Nortin`, `Tamen 60/100`, `Renova 100`, `Aristopin`, `Atrokid`, `Aquafresh PF`, `Pilorine`, `Itra`, `Itrader`, `Phenergan Plus`, `Atofix 1%`, `Qupet`).
2. **Tier 2 (`4` packs — `HIGH_STAGED_FOR_REVIEW`):** Live MedEx MRP overrides correcting stale DB & Arogga values (`Exelon 1.5 mg` `-> 64/1792`, `Cosentyx 150` `-> 31,780`, `Panzest 25000` `-> 50/1500`, `Diclofix 50` `-> 1.00/100`).
3. **Tier 3 (`18` packs — `MEDIUM_CORRUPT_DB_PROVEN_BY_KAGGLE`):** Remaining comma-truncated `৳2–৳103` oncology/biologic prices (`Tasigna`, `Sandostatin`, `Simulect`, `Zavicefta` x2, `Trastunix`, `Solu-Medrol`, etc.) needing direct MedEx MRP capture before write.
4. **Tier 4 (`10` packs):** `Linamide 25 mg` (`su 7->6`) & `Carva 75 mg` (`su 15->10`) verified strip updates (`HIGH_STAGED_FOR_REVIEW`) + `8` live structural anomalies (`7` antiparasitic `Nx1` `su=1` + `1` `B-Vit 4` `su=200`).
5. **Tier 5 (`26` packs — `MEDIUM_NEEDS_DIRECT_MEDEX_CONFIRMATION`):** Top MFR-matched `non_divisible_strip` rows with product-specific Arogga `pu_multiplier` candidates awaiting MedEx brand-page confirmation.
