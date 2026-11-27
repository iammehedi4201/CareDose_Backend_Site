# CareDose — Staged Batch 5 Wave Review (Read-Only Staging)

Generated: 2026-11-25T12:25:34.040Z | Status: STAGED (0 PostgreSQL mutations)

## Batch 5 Summary
- **Sub-batch 5A (27):** `Unisaline Fruity` (`price_text_not_fully_parsed` 100->120) + `Rabnil 20 mg` (`7 x 10: ৳420.00`, resolves non-divisible strip) + `25` severe `>=48%` non-`u=8/280` corrupted-price items (incl. `Deroximel DR` 7->200, `Pancreon 25000` 7->70, `R-Pag` 600->250, `ETP` 600->250).
- **Sub-batch 5B (45):** Top `45` highest-value solid `u=8.00 / pp=280.00` corrupted-template items (`৳60–৳1,430/tab`, incl. `Azarest 300` 8->1,430, `Lefabac 600` 8->850, `Filgotin 200` 8->450, `Avalet 20` 8->275, `Avapag 20` 8->260, `Aromasin 25` 8->200, `Daprosis 4` 8->150, `Amenavir 200` 8->150).
- **Total Verified Batch 5 Updates:** **72** (`12` same pack units + `60` pack migrations), clearing **72** pack warnings (`71` inconsistent + `1` unparsed).
- **Held Pending Direct Confirmation (3):** `Laxana 24 mg`, `Goodmet 500 mg`, `Diabest 500 mg`.

## Sub-batch 5A — Non-u=8/280 Severe Outliers & Resolved Singles (27)
- **Unisaline Fruity **: `20's pack (pu=20, su=null, null/100)` -> `20's pack (pu=20, su=null, 6.00/120.00)`
- **Rabnil 20 mg**: `50's pack (pu=50, su=14, 5/300)` -> `7 x 10 (pu=70, su=10, 6.00/420.00)`
- **Alarzil 22.7 mg**: `100's pack (pu=100, su=null, 0.99/250)` -> `15 x 10 (pu=150, su=10, 1.50/225.00)`
- **Diliner DR 30 mg**: `18's pack (pu=18, su=null, 7.07/288)` -> `3 x 6 (pu=18, su=6, 10.07/181.26)`
- **Conpan ODT 0.5 mg**: `30's pack (pu=30, su=null, 7/455)` -> `5 x 10 (pu=50, su=10, 6.90/345.00)`
- **Ovajet 50 mg**: `10's pack (pu=10, su=null, 10/200)` -> `3 x 10 (pu=30, su=10, 10.00/300.00)`
- **Magmax 365 mg**: `30's pack (pu=30, su=null, 6/325)` -> `10 x 6 (pu=60, su=6, 5.00/300.00)`
- **Deroximel DR 231 mg**: `30's pack (pu=30, su=null, 7/350)` -> `5 x 6 (pu=30, su=6, 200.00/6000.00)`
- **Pancreon 25000 300 mg**: `30's pack (pu=30, su=null, 7/350)` -> `10 x 6 (pu=60, su=6, 70.00/4200.00)`
- **Panzest 10000 150 mg**: `30's pack (pu=30, su=null, 7/350)` -> `3 x 10 (pu=30, su=10, 50.00/1500.00)`
- **Defcort 18 mg**: `30's pack (pu=30, su=null, 30/320)` -> `2 x 10 (pu=20, su=10, 20.00/400.00)`
- **Deflazit 18 mg**: `30's pack (pu=30, su=null, 30/320)` -> `2 x 10 (pu=20, su=10, 20.00/400.00)`
- **Deflazit 36 mg**: `30's pack (pu=30, su=null, 30/320)` -> `1 x 10 (pu=10, su=10, 34.00/340.00)`
- **Fast One 1000 mg**: `100's pack (pu=100, su=null, 1.82/294.5)` -> `20 x 10 (pu=200, su=10, 2.25/450.00)`
- **Disopan ODT 0.25 mg**: `30's pack (pu=30, su=null, 7.5/350)` -> `5 x 10 (pu=50, su=10, 4.00/200.00)`
- **Colasa 400 mg**: `30's pack (pu=30, su=null, 7.58/350)` -> `3 x 10 (pu=30, su=10, 7.60/228.00)`
- **Feoplex TR **: `30's pack (pu=30, su=null, 3/137.5)` -> `6 x 10 (pu=60, su=10, 2.50/150.00)`
- **Jointfree DA 1500 mg+1200 mg**: `30's pack (pu=30, su=null, 8.03/367.5)` -> `2 x 15 (pu=30, su=15, 40.67/1220.00)`
- **R-Pag 12.5 mg**: `7's pack (pu=7, su=null, 600/6363.14)` -> `1 x 10 (pu=10, su=10, 250.00/2500.00)`
- **ETP 12.5 mg**: `7's pack (pu=7, su=null, 600/6363.14)` -> `1 x 7 (pu=7, su=7, 250.00/1750.00)`
- **Laxana 8 mg**: `20's pack (pu=20, su=null, 15.05/451.5)` -> `3 x 10 (pu=30, su=10, 15.00/450.00)`
- **Ivtin 6 mg**: `10's pack (pu=10, su=null, 10/150)` -> `1 x 10 (pu=10, su=10, 10.00/100.00)`
- **Emetant 40 mg**: `10's pack (pu=10, su=null, 50/250)` -> `1 x 10 (pu=10, su=10, 45.00/450.00)`
- **Imectin 6 mg**: `10's pack (pu=10, su=null, 10/150)` -> `1 x 10 (pu=10, su=10, 8.00/80.00)`
- **Momodol 500 mg**: `10's pack (pu=10, su=null, 8.05/120.35)` -> `5 x 5 (pu=25, su=5, 8.00/200.00)`
- **Momodol 250 mg**: `10's pack (pu=10, su=null, 5.03/75.15)` -> `6 x 5 (pu=30, su=5, 5.00/150.00)`
- **Momodol 125 mg**: `10's pack (pu=10, su=null, 4.03/60.15)` -> `6 x 5 (pu=30, su=5, 4.00/120.00)`

## Sub-batch 5B — Top 45 Corrupted u=8.00/pp=280.00 Solid Packs (45)
- **Lefabac 600 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 850.00/8500.00)`
- **Azarest 300 mg**: `30's (pu=30, 8/280)` -> `1 x 14 (pu=14, su=14, 1430.00/20020.00)`
- **Filgotin 200 mg**: `30's (pu=30, 8/280)` -> `1 x 8 (pu=8, su=8, 450.00/3600.00)`
- **Dancy 4 mg**: `30's (pu=30, 8/280)` -> `(24 active + 4 inert) tablets (pu=28, su=null, null/400.00)`
- **Aleena 4 mg**: `30's (pu=30, 8/280)` -> `(24 active + 4 inert) tablets (pu=28, su=null, null/400.00)`
- **Avapag 20 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 260.00/2600.00)`
- **Avalet 20 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 275.00/2750.00)`
- **Filgotin 100 mg**: `30's (pu=30, 8/280)` -> `1 x 8 (pu=8, su=8, 275.00/2200.00)`
- **Aromasin 25 mg**: `30's (pu=30, 8/280)` -> `2 x 15 (pu=30, su=15, 200.00/6000.00)`
- **Daprosis 4 mg**: `30's (pu=30, 8/280)` -> `2 x 7 (pu=14, su=7, 150.00/2100.00)`
- **Amenavir 200 mg**: `30's (pu=30, 8/280)` -> `1 x 7 (pu=7, su=7, 150.00/1050.00)`
- **Marzev 25 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 140.00/560.00)`
- **Omaglip 25 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 140.00/560.00)`
- **Ckemia 4 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 140.00/1400.00)`
- **Omaglo 25 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 140.00/560.00)`
- **Ajuben 12 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 130.00/1300.00)`
- **Omari 25 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 140.00/560.00)`
- **Daprotab 6 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 120.00/1200.00)`
- **Reluren 40 mg+1 mg+0.5 mg**: `30's (pu=30, 8/280)` -> `2 x 5 (pu=10, su=5, 100.00/1000.00)`
- **Exemis 25 mg**: `30's (pu=30, 8/280)` -> `3 x 10 (pu=30, su=10, 100.00/3000.00)`
- **Liberen 40 mg+1 mg+0.5 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 100.00/1000.00)`
- **Farobac 200 mg**: `30's (pu=30, 8/280)` -> `7 x 3 (pu=21, su=3, 95.00/1995.00)`
- **Fezotan 45 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 95.00/950.00)`
- **Feoza 45 mg**: `30's (pu=30, 8/280)` -> `2 x 10 (pu=20, su=10, 95.00/1900.00)`
- **Fizora 45 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 95.00/950.00)`
- **Ckemia 2 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 90.00/900.00)`
- **Aprodust 4 mg**: `30's (pu=30, 8/280)` -> `2 x 10 (pu=20, su=10, 90.00/1800.00)`
- **Faropen 200 mg**: `30's (pu=30, 8/280)` -> `2 x 7 (pu=14, su=7, 90.00/1260.00)`
- **Gefan 45 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 80.00/800.00)`
- **Marzev 12.5 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 80.00/320.00)`
- **Omaglip 12.5 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 80.00/320.00)`
- **Omaglo 12.5 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 80.00/320.00)`
- **Coughex 45 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 80.00/800.00)`
- **Daprotab 4 mg**: `30's (pu=30, 8/280)` -> `2 x 10 (pu=20, su=10, 80.00/1600.00)`
- **Aventy 100 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 75.00/300.00)`
- **Farobac 150 mg**: `30's (pu=30, 8/280)` -> `7 x 3 (pu=21, su=3, 75.00/1575.00)`
- **Ajuben 6 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 70.00/700.00)`
- **Omari 12.5 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 80.00/320.00)`
- **Femoston 1 mg+5 mg**: `30's (pu=30, 8/280)` -> `28's pack (pu=28, su=null, 66.00/1848.00)`
- **Afalino 50 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 65.00/650.00)`
- **Cenomate 50 mg**: `30's (pu=30, 8/280)` -> `1 x 10 (pu=10, su=10, 64.00/640.00)`
- **Aventy 50 mg**: `30's (pu=30, 8/280)` -> `1 x 4 (pu=4, su=4, 60.00/240.00)`
- **Femoston 1 mg+10 mg**: `30's (pu=30, 8/280)` -> `28's pack (pu=28, su=null, 60.00/1680.00)`
- **Femoston 2 mg+10 mg**: `30's (pu=30, 8/280)` -> `28's pack (pu=28, su=null, 60.00/1680.00)`
- **Aprodust 2 mg**: `30's (pu=30, 8/280)` -> `2 x 10 (pu=20, su=10, 60.00/1200.00)`

## Held Items Excluded From Batch 5 (3)
- **Laxana 24 mg Capsule (Renata)**: Arogga pv=40 (৳1,200/30s) while search snippet cited ৳15/৳450 (possibly 8 mg text). Hold until exact 24 mg MRP verified.
- **Goodmet 500 mg Tablet (Goodman)**: DB has 100s pack 4.00/200.10; search snippets gave mixed strip/box totals without clean 100s vs 6x10 disambiguation.
- **Diabest 500 mg Tablet (Al-Madina)**: DB has 100s pack 4.00/200.10; search snippets gave ৳5.00 unit / 3x10=150 without resolving 100s box format.