# CareDose — Post-Batch-11 Consolidated Catalogue Audit Report

Generated: 2026-11-26T05:45:20.171Z | Mode: Strictly Read-Only (`RepeatableRead`)

## Live Catalogue Inventory & Health
- **Generics:** `1846`
- **Brands:** `25208` (`25187` priced with >=1 pack; `21` verified unpriced exclusions)
- **Packs:** `27481` (`2067` multi-pack brands)
- **Clinical Tables (`PatientMedication`, `InventoryTransaction`, `Purchase`, `MedicationSchedule`, `DoseEvent`):** `0` rows (untouched)

## Live Hygiene Invariants
- **Non-divisible strips (`pu % su != 0`):** `0`
- **Out-of-range `stripUnits` (`<= 1` or `> 100`):** `0`
- **Missing `packPrice`:** `481`
- **Packs with warnings remaining (intentionally held):** `9`
- **Arithmetic mismatch >5% remaining (intentionally held):** `3`
- **Arithmetic mismatch 1%–5% (verified MedEx rounding):** `42`
- **Zero-pack brands remaining (documented unpriced/institutional):** `21`

## Held Packs With Warnings (9)
- **Carmin 5 mg** (`Capsule`): `30's pack`, `u=12.04`, `pp=300.48`, `warnings=["pack_price_inconsistent_with_unit_price"]`
- **Carmin 2.5 mg** (`Capsule`): `30's pack`, `u=12.04`, `pp=300.48`, `warnings=["pack_price_inconsistent_with_unit_price"]`
- **Helicon V 20 mg+1000 mg+500 mg** (`Tablet`): `30's pack`, `u=8`, `pp=280`, `warnings=["pack_price_inconsistent_with_unit_price"]`
- **Sac Sweet 12.5 mg** (`Tablet`): `300's pack`, `u=0.09`, `pp=28`, `warnings=["pack_price_inconsistent_with_unit_price"]`
- **Salpium (100 mcg+20 mcg)/puff** (`Inhaler`): `200 metered doses`, `u=null`, `pp=250.76`, `warnings=["price_text_not_fully_parsed"]`
- **Seroxyn (25 mcg+250 mcg)/puff** (`Inhaler`): `120 metered doses`, `u=null`, `pp=797.39`, `warnings=["price_text_not_fully_parsed"]`
- **Seroxyn (25 mcg+125 mcg)/puff** (`Inhaler`): `120 metered doses`, `u=null`, `pp=596.79`, `warnings=["price_text_not_fully_parsed"]`
- **Sulprex (100 mcg+20 mcg)/puff** (`Inhaler`): `200 metered doses`, `u=null`, `pp=250.75`, `warnings=["price_text_not_fully_parsed"]`
- **Ticamet (25 mcg+250 mcg)/puff** (`Inhaler`): `120 metered doses`, `u=null`, `pp=797.39`, `warnings=["price_text_not_fully_parsed"]`

## Remaining >5% Arithmetic Mismatch Packs (3)
- **Carmin 5 mg** (`30's pack`, `pu=30`, `u=12.04`, `pp=300.48`, `err=16.81%`)
- **Carmin 2.5 mg** (`30's pack`, `pu=30`, `u=12.04`, `pp=300.48`, `err=16.81%`)
- **Helicon V 20 mg+1000 mg+500 mg** (`30's pack`, `pu=30`, `u=8`, `pp=280`, `err=16.67%`)

## Remaining 1%–5% Arithmetic Items (42)
- **Alkixen 250 mg** (`28's pack`, `pu=28`, `u=1750`, `pp=50500`, `err=3.06%`)
- **Amit 25 mg** (`15 x 10`, `pu=150`, `u=1.76`, `pp=259.5`, `err=1.7%`)
- **Angicard 0.5 mg** (`42's pack`, `pu=42`, `u=3`, `pp=128.1`, `err=1.67%`)
- **Angicard 0.5 mg** (`100's pack`, `pu=100`, `u=3`, `pp=305`, `err=1.67%`)
- **Antox 6 mg+200 mg+50 mg** (`20's pack`, `pu=20`, `u=2.55`, `pp=50`, `err=1.96%`)
- **Antox 6 mg+200 mg+50 mg** (`100's pack`, `pu=100`, `u=2.55`, `pp=250`, `err=1.96%`)
- **Asmolex 4 mg** (`100's pack`, `pu=100`, `u=0.3`, `pp=29.54`, `err=1.53%`)
- **AX 6 mg+200 mg+50 mg** (`30's pack`, `pu=30`, `u=2.53`, `pp=75`, `err=1.19%`)
- **Axidin 20 mg** (`100's pack`, `pu=100`, `u=2`, `pp=205`, `err=2.5%`)
- **Cabanib 60 mg** (`30's pack`, `pu=30`, `u=1044`, `pp=31950`, `err=2.01%`)
- **Camiton 5 mg** (`98's pack`, `pu=98`, `u=4.05`, `pp=392`, `err=1.23%`)
- **Cardizem 30 mg** (`98's pack`, `pu=98`, `u=3`, `pp=297.92`, `err=1.33%`)
- **Ciprofloxacin 250 mg** (`30's pack`, `pu=30`, `u=8.5`, `pp=252.38`, `err=1.03%`)
- **Crizona 250 mg** (`28's pack`, `pu=28`, `u=1750`, `pp=50500`, `err=3.06%`)
- **Crizonil 250 mg** (`28's pack`, `pu=28`, `u=1750`, `pp=50500`, `err=3.06%`)
- **Desloratadine 5 mg** (`100's pack`, `pu=100`, `u=2.5`, `pp=245`, `err=2%`)
- **Diverin 10 mg** (`50's pack`, `pu=50`, `u=2.02`, `pp=102.5`, `err=1.49%`)
- **Dolin 100 mg** (`100's pack`, `pu=100`, `u=2.06`, `pp=200.5`, `err=2.67%`)
- **Doxin 50 mg** (`50's pack`, `pu=50`, `u=1.43`, `pp=72.5`, `err=1.4%`)
- **Efidox 100 mg** (`100's pack`, `pu=100`, `u=2.06`, `pp=200.5`, `err=2.67%`)
- **Etnol 50 mg** (`100's pack`, `pu=100`, `u=0.78`, `pp=77`, `err=1.28%`)
- **Famopep 20 mg** (`100's pack`, `pu=100`, `u=2`, `pp=205`, `err=2.5%`)
- **Folison 5 mg** (`500's pack`, `pu=500`, `u=0.34`, `pp=175`, `err=2.94%`)
- **Histacin 4 mg** (`500's pack`, `pu=500`, `u=0.29`, `pp=150`, `err=3.45%`)
- **Informet 850 mg** (`60's pack`, `pu=60`, `u=4.45`, `pp=270`, `err=1.12%`)
- **Lily 30 mg** (`1 tablet pack`, `pu=1`, `u=195`, `pp=200`, `err=2.56%`)
- **Lorat 10 mg** (`100's pack`, `pu=100`, `u=3.05`, `pp=300`, `err=1.64%`)
- **NCR FAST 20 mg** (`100's pack`, `pu=100`, `u=2`, `pp=205`, `err=2.5%`)
- **Neodox 100 mg** (`100's pack`, `pu=100`, `u=2.06`, `pp=200.5`, `err=2.67%`)
- **Neostidine-R 20 mg** (`100's pack`, `pu=100`, `u=2`, `pp=205`, `err=2.5%`)
- **Nopain 25 mg** (`100's pack`, `pu=100`, `u=2.05`, `pp=200`, `err=2.44%`)
- **Oxitab 6 mg+200 mg+50 mg** (`20's pack`, `pu=20`, `u=2.5`, `pp=50.6`, `err=1.2%`)
- **Penicillin-V 250 mg** (`100's pack`, `pu=100`, `u=1.5`, `pp=152`, `err=1.33%`)
- **Pitofen 0.5 mg** (`100's pack`, `pu=100`, `u=2.95`, `pp=300`, `err=1.69%`)
- **Purilin 1 mg** (`112's pack`, `pu=112`, `u=0.9`, `pp=101.92`, `err=1.11%`)
- **Restovit-M ** (`30's pack`, `pu=30`, `u=1.4`, `pp=42.9`, `err=2.14%`)
- **Risponex 4 mg** (`30's pack`, `pu=30`, `u=9`, `pp=276`, `err=2.22%`)
- **Sac Sweet 12.5 mg** (`300's pack`, `pu=300`, `u=0.09`, `pp=28`, `err=3.7%`)
- **Serviprofen 400 mg** (`100's pack`, `pu=100`, `u=1.42`, `pp=140`, `err=1.41%`)
- **Sinaferon 200 mg+200 mcg** (`100's pack`, `pu=100`, `u=0.19`, `pp=18.68`, `err=1.68%`)
- **Thyronor 12.5 mcg** (`105's pack`, `pu=105`, `u=0.69`, `pp=73.5`, `err=1.45%`)
- **Zinon 20 mg** (`30's pack`, `pu=30`, `u=1.48`, `pp=45`, `err=1.35%`)

## Documented Excluded Zero-Pack Brands (21)
- **Baloflu 20 mg** (Navana Pharmaceuticals Ltd., `PRESENT`, `OFFICIALLY_UNPRICED`): MedEx/retail listings show Price Unavailable (unpriced specialty antiviral).
- **Baloflu 40 mg** (Navana Pharmaceuticals Ltd., `PRESENT`, `OFFICIALLY_UNPRICED`): MedEx lists Price Unavailable.
- **Cholera Fluid** (Institute of Public Health (IPH), `PRESENT`, `GOVERNMENT_IPH_NOT_FOR_SALE`): Government Institute of Public Health supply (Not for sale / unpriced on MedEx).
- **Covishield** (Serum Institute of India, `PRESENT`, `GOVERNMENT_INSTITUTIONAL_VACCINE`): Public immunization vaccine (Price Unavailable on MedEx).
- **Dextran 10%+5%** (Institute of Public Health (IPH), `PRESENT`, `GOVERNMENT_IPH_NOT_FOR_SALE`): Government IPH institutional IV infusion (Not for sale / unpriced).
- **Dextran 6%+5%** (Institute of Public Health (IPH), `PRESENT`, `GOVERNMENT_IPH_NOT_FOR_SALE`): Government IPH institutional IV infusion (Not for sale / unpriced).
- **Dextran 40 10%+0.9%** (Institute of Public Health (IPH), `PRESENT`, `GOVERNMENT_IPH_NOT_FOR_SALE`): Government IPH institutional IV infusion (Not for sale / unpriced).
- **Dextran 70 6%+0.9%** (Institute of Public Health (IPH), `PRESENT`, `GOVERNMENT_IPH_NOT_FOR_SALE`): Government IPH institutional IV infusion (Not for sale / unpriced).
- **Glucose Saline 0.9%+5%** (Institute of Public Health (IPH), `PRESENT`, `GOVERNMENT_IPH_NOT_FOR_SALE`): Government IPH institutional IV infusion (Not for sale / unpriced).
- **Hertinib 40 mg** (Drug International Ltd., `PRESENT`, `OFFICIALLY_UNPRICED`): MedEx lists Price Unavailable (specialist oncology).
- **Ketoseem 10 mg** (Seema Pharmaceuticals Ltd., `PRESENT`, `SEEMA_PHARMA_UNPRICED`): Discontinued/inactive Seema SKU; MedEx lists Price Unavailable.
- **Nilonib 200 mg** (Drug International Ltd., `PRESENT`, `OFFICIALLY_UNPRICED_ON_MEDEX`): MedEx lists Price Unavailable for Nilonib 200 mg (Arogga #39689 stock=0 lists ৳800 Box=30; kept held pending official MedEx MRP).
- **Panto SP 40 mg** (Seema Pharmaceuticals Ltd., `PRESENT`, `SEEMA_PHARMA_UNPRICED`): MedEx only prices 20 mg; 40 mg SKU has no published MRP.
- **Paramol 500 mg** (Seema Pharmaceuticals Ltd., `PRESENT`, `SEEMA_PHARMA_UNPRICED`): MedEx only prices Oral Suspension; 500 mg tablet is Price Unavailable.
- **Prostalex 250 mg** (Beacon Pharmaceuticals Ltd., `PRESENT`, `OFFICIALLY_UNPRICED`): MedEx lists Price Unavailable (Arogga #15574 dummy pv_mrp=1).
- **Riboseem 5 mg** (Seema Pharmaceuticals Ltd., `PRESENT`, `SEEMA_PHARMA_UNPRICED`): MedEx lists Price Unavailable.
- **Seema-C 250 mg** (Seema Pharmaceuticals Ltd., `UNAVAILABLE`, `SEEMA_PHARMA_UNPRICED`): MedEx lists Price Unavailable.
- **Seemagyl 400 mg** (Seema Pharmaceuticals Ltd., `UNAVAILABLE`, `SEEMA_PHARMA_UNPRICED`): MedEx only prices Suspension; 400 mg tablet is Price Unavailable.
- **Seemaldrat 400 mg/5 ml** (Seema Pharmaceuticals Ltd., `UNAVAILABLE`, `SEEMA_PHARMA_UNPRICED`): MedEx lists Price Unavailable.
- **Seematrin DS 800 mg+160 mg** (Seema Pharmaceuticals Ltd., `UNAVAILABLE`, `SEEMA_PHARMA_UNPRICED`): MedEx only prices Suspension; DS tablet is Price Unavailable.
- **Soto 250 mg** (Hudson Pharmaceuticals Ltd., `UNAVAILABLE`, `OFFICIALLY_UNPRICED`): MedEx explicitly shows price not officially listed / Price Unavailable.

## Batch Validation Ledger
- **Batch 1**: `passed=true` | `matchedCounts=null`
- **Batch 2A**: `passed=true` | `matchedCounts=null`
- **Batch 2B**: `passed=true` | `matchedCounts={"subbatchA1_prices":16,"subbatchB_warnings":3,"subbatchC1_strips":9,"subbatchD1_inserts":7,"untouchedBaselinePacks":27440}`
- **Batch 2B Held4**: `passed=true` | `matchedCounts={"a2Prices":2,"carvaOptionB":1,"sultolinRefillInsert":1,"untouchedBaselinePacks":27472}`
- **Batch 3**: `passed=true` | `matchedCounts={"batch3UpdatedPacks":55,"batch3WarningsCleared":11,"untouchedPacks":27421}`
- **Batch 4**: `passed=true` | `matchedCounts={"batch4ZeroPackInserted":5,"batch4PacksUpdated":57,"hpyloriKitsStripCleared":4,"untouchedBaselinePacks":27415}`
- **Batch 5**: `passed=true` | `matchedCounts={"batch5UpdatedPacks":72,"untouchedPacks":27409}`
- **Batch 6**: `passed=true` | `matchedCounts={"batch6UpdatedPacks":64,"untouchedPacks":27417}`
- **Batch 7**: `passed=true` | `matchedCounts={"batch7UpdatedPacks":141,"untouchedPacks":27340}`
- **Batch 8**: `passed=true` | `matchedCounts={"batch8UpdatedPacks":89,"untouchedPacks":27392}`
- **Batch 9**: `passed=true` | `matchedCounts={"batch9UpdatedPacks":225,"untouchedPacks":27256}`
- **Batch 10**: `passed=true` | `matchedCounts={"batch10UpdatedPacks":128,"batch10InsertedPacks":3,"batch10InsertedBrandPriceStatusUpdated":3,"batch10DeletedObsoletePacks":2,"untouchedPacks":27351}`
- **Batch 11**: `passed=true` | `matchedCounts={"batch11UpdatedPacks":155,"batch11DeletedObsoletePacks":1,"untouchedPacks":27326}`