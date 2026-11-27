# CareDose — Staged Batch 2B & Option 1 Quick Fixes Review (Read-Only Staging)

Generated: 2026-11-25T08:44:05.914Z | DB Baseline: 1846 generics, 25208 brands, 27468 packs

## Staging Scope Summary
- **Sub-batch A1 (16 Price Fixes — Live MedEx HTTP 200 Confirmed):** Ready
- **Sub-batch A2 (2 Roche Biologics — MedEx 404, 3-Way Pharmacy Confirmed):** Separate opt-in (`--include-roche-a2`)
- **Sub-batch B (3 Stale Warning Cleanups):** Ready (Decimal arithmetic exact)
- **Sub-batch C1 (9 Strip Hygiene Updates):** Ready (Linamide 7->6, 7x Nx1 1->NULL, B-Vit 4 200->NULL)
- **Held C2 (1 SKU — Carva 75 mg):** Held pending decision between `200's` strip `15->10` vs Live MedEx `13 x 15 @ ৳0.80 / ৳156`
- **Sub-batch D1 (7 Zero-Pack Brand Inserts):** Ready (Sanityza Clear, Turmeric, Urican, Veneta 50/100, Viera 50/200)
- **Held D2 (1 SKU — Sultolin 100 mcg/puff #3514):** Held duplicate/refill decision (#3513 already active @ ৳250; #3514 maps to Refill ৳220)

## Sub-batch A1 — 16 Live MedEx Confirmed Tier 3 Price Corrections
| Rank | Brand | Pack | Old Price | New MedEx MRP | Live Source Note |
|---:|---|---|---:|---:|---|
| #47 | Trastunix 440 mg/20 ml | 440 mg vial | ৳80 | **৳58005.00** | Live MedEx revised MRP down from historical Kaggle/Arogga 80,000.00. |
| #48 | Solu-Medrol 1 gm/vial | 1 gm vial | ৳2 | **৳3028.00** | Live MedEx current MRP (between historical Kaggle 2,050 and Arogga 3,360.36). |
| #49 | Zoledron 5 mg/100 ml | 100 ml bottle | ৳5 | **৳5950.00** | Live MedEx matches historical Kaggle 5,950.00 (Arogga 5,967.89). |
| #50 | Tocoban 37.5 mg/5 ml | 5 ml vial | ৳2 | **৳2500.00** | 3-way exact match: Live MedEx 2,500 == Arogga #44656 2,500 == Kaggle 2,500. |
| #51 | Zavicefta (2 gm+0.5 gm)/vial | 2.5 gm vial | ৳6 | **৳9285.00** | Live MedEx revised MRP up from historical Kaggle/Arogga 6,460.00. |
| #52 | Zavicefta (2 gm+0.5 gm)/vial | 10's pack | ৳64 | **৳92850.00** | Live MedEx 1x10 pack MRP 92,850.00 (10 * 9,285.00); preserves unitPrice=null to match Moxin pattern. |
| #53 | Diapamiro 370 mg/ml | 100 ml vial | ৳2 | **৳2410.00** | Old /brands/21062 slug 404s; canonical MedEx 100 ml page /brands/34200 & Arogga #43848 (stock=1) confirm 2,410.00. |
| #54 | Tolosa 80 mg/4 ml | 4 ml vial | ৳8 | **৳8500.00** | 3-way exact match: Live MedEx 8,500 == Arogga 8,500 == Kaggle 8,500. |
| #55 | Sandostatin 50 mcg/ml | 5's pack | ৳7 | **৳1810.00** | Live MedEx Novartis revised MRP down to 362/amp (1,810/5's box vs old 7,025.66); preserves unitPrice=null. |
| #56 | Zerlinda 4 mg/5 ml | 4 mg vial | ৳7 | **৳7800.00** | 3-way exact match: Live MedEx 7,800 == Arogga 7,800 == Kaggle 7,800. |
| #57 | Simulect 20 mg/vial | 20 mg vial | ৳103 | **৳143195.00** | Live MedEx Novartis revised MRP up from historical 103,273.56 / 103,273. |
| #58 | Tasigna 200 mg | (unit) | ৳3 | **৳475.00** | Live MedEx Novartis revised unit MRP down from historical 3,051.50 to 475.00; DB comma-truncated 3,051.50 to 3. |
| #59 | Amidol 370 mg/ml | 100 ml vial | ৳2 | **৳2636.00** | Old /brands/28431 slug 404s; canonical MedEx 100 ml page /brands/34198 == Arogga #27390 == Kaggle 2,636.00. |
| #61 | Zoltero 5 mg/100 ml | 100 ml bottle | ৳7 | **৳7000.00** | 3-way exact match: Live MedEx 7,000 == Arogga 7,000 == Kaggle 7,000. |
| #63 | Xoleron 4 mg/5 ml | 4 mg vial | ৳5 | **৳6000.00** | 2-way live match: Live MedEx 6,000 == Live Arogga 6,000 (revised up from Kaggle 5,000). |
| #64 | Zometa 4 mg/5 ml | 4 mg vial | ৳30 | **৳10182.92** | Live MedEx Novartis revised MRP down to 10,182.92 (vs historical Kaggle 30,113.60 / Arogga 26,122). |

## Sub-batch A2 — 2 Cold-Chain Biologics (MedEx 404, Multi-Pharmacy Confirmed)
| Rank | Brand | Pack | Old Price | Proposed MRP | Confirming Sources |
|---:|---|---|---:|---:|---|
| #60 | Actemra 400 mg/20 ml | 20 ml vial | ৳43 | **৳43500.00** | Kaggle MedEx export: 20 ml vial: ৳ 43,500.00; Arogga #32383: 43,500; MedEasy: ৳ 43,500 MRP |
| #62 | Mabthera 1400 mg/11.7 ml | 1400 mg vial | ৳65 | **৳65500.00** | Kaggle MedEx export: 1400 mg vial: ৳ 65,500.00; Arogga #36110: 65,500; OsudPotro: ৳ 62,225 (exact 5% off 65,500) |

## Sub-batch B — 3 Stale Warning Cleanups
- **Montinex Fast 10 mg**: `18 * 30 = 540 (exact)` -> remove `pack_price_inconsistent_with_unit_price`
- **Fenadin ODT 30 mg**: `3.5 * 30 = 105 (exact)` -> remove `pack_price_inconsistent_with_unit_price`
- **Panzest 25000 300 mg**: `50 * 30 = 1500 (exact)` -> remove `pack_price_inconsistent_with_unit_price`

## Sub-batch C1 — 9 Verified Strip Cleanups (+ Held Carva)
- **#73 Linamide 25 mg** (`18's pack`): `stripUnits 7 -> 6` — Live MedEx /brands/17259 ('3 x 6: ৳ 7,200.00', Strip ৳2,400) & Arogga confirm Linamide 25 mg 18's pack is 3x6; stripUnits=7 was inherited from 21's pack.
- **#65 Albamax DS 400 mg** (`25 x 1`): `stripUnits 1 -> null` — Live MedEx /brands/253 confirms single-blister 25 x 1 box (Strip Price ৳5.00 = Unit Price); clear stripUnits=1 to NULL per stock-calculator >1 rule.
- **#66 Ben-A 400 mg** (`25 x 1`): `stripUnits 1 -> null` — Live MedEx /brands/297 confirms single-blister 25 x 1 box (Strip Price ৳5.01 = Unit Price); clear stripUnits=1 to NULL.
- **#67 Alphin DS 400 mg** (`50 x 1`): `stripUnits 1 -> null` — Live MedEx /brands/286 confirms single-blister 50 x 1 box (Strip Price ৳5.00 = Unit Price); clear stripUnits=1 to NULL.
- **#68 Aldes DS 400 mg** (`25 x 1`): `stripUnits 1 -> null` — Live MedEx /brands/274 confirms single-blister 25 x 1 box (Strip Price ৳4.00 = Unit Price); clear stripUnits=1 to NULL.
- **#70 Aldaben-DS 400 mg** (`25 x 1`): `stripUnits 1 -> null` — Live MedEx /brands/272 confirms single-blister 25 x 1 box (Strip Price ৳5.00 = Unit Price); clear stripUnits=1 to NULL.
- **#71 Elmin 400 mg** (`25 x 1`): `stripUnits 1 -> null` — Live MedEx /brands/312 confirms single-blister 25 x 1 box; clear stripUnits=1 to NULL. (Separate follow-up price note: DB 3.35/83.75 vs Live MedEx 4.50/112.50.)
- **#72 Alba 400 mg** (`48 x 1`): `stripUnits 1 -> null` — Live MedEx /brands/252 confirms single-blister 48 x 1 box (Strip Price ৳4.50 = Unit Price); clear stripUnits=1 to NULL.
- **#69 B-Vit 4 5 mg+2 mg+2 mg+20 mg** (`200 tablet strip`): `stripUnits 200 -> null` — Per reviewed bVit4Investigation & stock-calculator stripUnits<=100 cap: Live MedEx /brands/13766 confirms '200 tablet strip: ৳ 86.00' vs '45 tablet pot: ৳ 27.00'; clearing stripUnits 200->NULL treats it safely as 200-tab bulk dispenser pack.
- **HELD #74 Carva 75 mg** (`200's pack`, `stripUnits=15`, `0.63/126`): Live MedEx now shows `13 x 15: ৳156.00 (৳0.80/tab)`. Choose Option A (`stripUnits 15->10` on `200's`) or Option B (full refresh to `13 x 15`, `pu=195, su=15, 0.80/156`).

## Sub-batch D1 — 7 Verified Zero-Pack Inserts (+ Held Sultolin #3514)
| Brand | Pack | Pack Units | Strip Units | Unit Price | Pack Price | Confirmation |
|---|---|---:|---:|---:|---:|---|
| Sanityza Clear 0.5%+70% | 250 ml bottle (with dispenser) | - | - | - | **৳150.00** | Arogga #47952 (stock=1, mrp=150) |
| Turmeric 1000 mg | 3 x 10 | 30 | 10 | 20.00 | **৳600.00** | Arogga #39716 (stock=1, mrp=20, multipliers=[1,10,30]) |
| Urican 400 mg | 8 x 4 | 32 | 4 | 18.00 | **৳576.00** | Arogga #39740 (stock=1, mrp=18, multipliers=[1,4,32]) |
| Veneta 50 mg | 3 x 10 | 30 | 10 | 210.00 | **৳6300.00** | Arogga #34038 (stock=1, mrp=210, multipliers=[1,10,30]) |
| Veneta 100 mg | 3 x 10 | 30 | 10 | 410.00 | **৳12300.00** | Arogga #39004 (stock=1, mrp=410, multipliers=[1,10,30]) |
| Viera 50 mg | 1 x 10 | 10 | 10 | 50.00 | **৳500.00** | Arogga #33922 (stock=1, mrp=50, multipliers=[1,10]) |
| Viera 200 mg | 1 x 8 | 8 | 8 | 130.00 | **৳1040.00** | Arogga #33921 (stock=1, mrp=130, multipliers=[1,8]) |
- **HELD Sultolin 100 mcg/puff (`#3514`, brandId `d3186950-0749-4bd1-bec5-9bf554e59c65`)**: Sibling `#3513` already has `200 metered doses @ ৳250`. Decide whether to backfill `200 metered doses (Refill) @ ৳220.00` on `#3514` or consolidate onto `#3513`.
