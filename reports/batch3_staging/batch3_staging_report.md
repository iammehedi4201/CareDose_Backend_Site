# CareDose — Staged Batch 3 Wave Review (Read-Only Staging)

Generated: 2026-11-25T11:14:41.186Z | Status: STAGED (0 PostgreSQL mutations)

## Batch 3 Summary
- **Sub-batch 3A (3):** Adjacent price repairs (Sandostatin 1 ml, Tasigna 28's, Elmin 400)
- **Sub-batch 3B (5):** Tier 5 matching-box fixes (#77, #80, #83, #88, #97)
- **Sub-batch 3C (21):** Tier 5 commercial box + price migrations (#75-#100 remainder)
- **Sub-batch 3D (14):** REM_187 remaining same-box live MedEx price repairs (incl. Electro-K, Colasa, Indula, Dewax, Kidopia, Piloma OSD, Bigatab)
- **Sub-batch 3E (12):** REM_187 remaining pack+price migrations (incl. Prinagel 8% 5,085->335, Biomolipon, Mycept-S 180/360, Pancreon 10000)
- **Total Ready & Staged:** **55**
- **Verified False Positives Kept Untouched:** 7 live MedEx exact + 66 Arogga st=0 Kaggle-exact = **73**
- **Stopped Safely at MedEx CAPTCHA:** 13 items (#34-#46 held without bypass)

## Sub-batch 3A — Adjacent Verified Prices
- **Sandostatin 50 mcg/ml** (`1 ml ampoule`): `null/1` -> `{"packPrice":"362.00"}`
- **Tasigna 200 mg** (`28's pack`): `3051.5/85442` -> `{"unitPrice":"475.00","packPrice":"13300.00"}`
- **Elmin 400 mg** (`25 x 1`): `3.35/83.75` -> `{"unitPrice":"4.50","packPrice":"112.50"}`

## Sub-batch 3B — Tier 5 Matching-Box Fixes (5)
- **#77 Co-Axet 500 mg+125 mg** (`8's pack`): `{"stripUnits":4,"unitPrice":"55.00","packPrice":"440.00"}` | Unit Price: ৳ 55.00 (2 x 4: ৳ 440.00) Strip Price: ৳ 220.00
- **#80 Vildus 50 mg** (`20's pack`): `{"stripUnits":10}` | Unit Price: ৳ 20.00 (2 x 10: ৳ 400.00) Strip Price: ৳ 200.00
- **#83 Prexim 200 mg** (`12's pack`): `{"stripUnits":4}` | Unit Price: ৳ 35.00 (3 x 4: ৳ 420.00) Strip Price: ৳ 140.00
- **#88 Linarol-M 2.5 mg+500 mg** (`14's pack`): `{"stripUnits":7}` | Unit Price: ৳ 12.00 (2 x 7: ৳ 168.00) Strip Price: ৳ 84.00
- **#97 Dialiptin-M 50 mg+500 mg** (`14's pack`): `{"stripUnits":7,"unitPrice":"18.00","packPrice":"252.00"}` | Unit Price: ৳ 18.00 (2 x 7: ৳ 252.00) Strip Price: ৳ 126.00

## Sub-batch 3C — Tier 5 Commercial Box Migrations (21)
- **#75 Emijoy DS 25 mg+10 mg**: `50's pack (su=15, 7/350)` -> `2 x 15 (pu=30, su=15, 12.00/360.00)`
- **#76 Olsart 40 mg**: `20's pack (su=14, 16/320)` -> `2 x 14 (pu=28, su=14, 18.00/504.00)`
- **#78 Cefaclav 500 mg+125 mg**: `8's pack (su=7, 50/400)` -> `2 x 7 (pu=14, su=7, 60.00/840.00)`
- **#79 Zofra ODT 4 mg**: `30's pack (su=14, 5/150)` -> `3 x 14 (pu=42, su=14, 5.75/241.50)`
- **#81 Mensil N 5 mg**: `56's pack (su=10, 7.5/420)` -> `6 x 10 (pu=60, su=10, 7.50/450.00)`
- **#82 Dytor 2.5 mg**: `28's pack (su=10, 6/168)` -> `3 x 10 (pu=30, su=10, 6.00/180.00)`
- **#84 Cefaclav 250 mg+62.5 mg**: `12's pack (su=7, 30/360)` -> `2 x 7 (pu=14, su=7, 35.00/490.00)`
- **#85 Cardimet MR 35 mg**: `30's pack (su=14, 6/180)` -> `3 x 14 (pu=42, su=14, 8.00/336.00)`
- **#86 Cinalid 500 mg**: `6's pack (su=4, 34/204)` -> `2 x 4 (pu=8, su=4, 40.00/320.00)`
- **#87 Exalin 10 mg**: `30's pack (su=14, 10/300)` -> `3 x 14 (pu=42, su=14, 12.00/504.00)`
- **#89 Anset 8 mg**: `30's pack (su=14, 11/330)` -> `3 x 14 (pu=42, su=14, 11.00/462.00)`
- **#90 Nexven MUPS 20 mg**: `50's pack (su=6, 10/500)` -> `6 x 10 (pu=60, su=10, 8.00/480.00)`
- **#91 Myrica 75 mg**: `28's pack (su=10, 16/448)` -> `3 x 10 (pu=30, su=10, 18.00/540.00)`
- **#92 Reversair 10 mg**: `30's pack (su=14, 16/480)` -> `3 x 14 (pu=42, su=14, 17.50/735.00)`
- **#93 Stafoxin 500 mg**: `30's pack (su=4, 10/300)` -> `4 x 6 (pu=24, su=6, 10.00/240.00)`
- **#94 E-coxib 60 mg**: `30's pack (su=14, null/210)` -> `2 x 14 (pu=28, su=14, 7.00/196.00)`
- **#95 Omep 10 mg**: `48's pack (su=10, 2/96)` -> `6 x 10 (pu=60, su=10, 2.00/120.00)`
- **#96 Larb Plus 100 mg+25 mg**: `30's pack (su=21, 12/360)` -> `2 x 21 (pu=42, su=21, 12.03/505.26)`
- **#98 Cerox CV 250 mg+62.5 mg**: `12's pack (su=7, 35/420)` -> `2 x 7 (pu=14, su=7, 35.00/490.00)`
- **#99 Progesic 500 mg+20 mg**: `28's pack (su=10, 10/280)` -> `3 x 10 (pu=30, su=10, 15.00/450.00)`
- **#100 Sitadus 50 mg**: `30's pack (su=14, 15.05/451.5)` -> `3 x 14 (pu=42, su=14, 15.05/632.10)`

## Sub-batch 3D — REM_187 Same-Box Price Repairs
- **Enyl Extend 665 mg** (`100's pack`): `1.5/151` -> `{"unitPrice":"2.00","packPrice":"200.00"}` | Unit Price: ৳ 2.00 (10 x 10: ৳ 200.00) Strip Price: ৳ 20.00
- **Neforex 20 mg/ml** (`5's pack`): `null/75` -> `{"packPrice":"400.00"}` | 1 ml ampoule: ৳ 80.00 (1 x 5: ৳ 400.00)
- **Clofenac 25 mg** (`15's pack`): `12.09/181.35` -> `{"unitPrice":"16.00","packPrice":"240.00"}` | Unit Price: ৳ 16.00 (3 x 5: ৳ 240.00)
- **Reversair CT 10 mg** (`30's pack`): `8/180.9` -> `{"unitPrice":"18.00","packPrice":"540.00"}` | Unit Price: ৳ 18.00 (3 x 10: ৳ 540.00) Strip Price: ৳ 180.00
- **Gynomix ** (`6's pack`): `25.1/150.6` -> `{"unitPrice":"26.00","packPrice":"156.00"}` | Unit Price: ৳ 26.00 (1 x 6: ৳ 156.00)
- **Bigatab 90 mg** (`30's pack`): `1200/24500` -> `{"unitPrice":"350.00","packPrice":"10500.00"}` | Unit Price: ৳ 350.00 (3 x 10: ৳ 10,500.00) Strip Price: ৳ 3,500.00
- **Hypen Max SR 1.5 mg+5 mg** (`30's pack`): `6/281.8` -> `{"unitPrice":"15.00","packPrice":"450.00"}` | Unit Price: ৳ 15.00 (3 x 10: ৳ 450.00) Strip Price: ৳ 150.00
- **Colasa 1 gm** (`10's pack`): `9/150` -> `{"unitPrice":"60.00","packPrice":"600.00"}` | Unit Price: ৳ 60.00 (2 x 5: ৳ 600.00)
- **Indula 25 mcg** (`30's pack`): `15/450` -> `{"unitPrice":"4.00","packPrice":"120.00"}` | Unit Price: ৳ 4.00 (3 x 10: ৳ 120.00) Strip Price: ৳ 40.00
- **Kidopia 0.01%** (`5 ml drop`): `null/27.98` -> `{"packPrice":"280.00"}` | 5 ml drop: ৳ 280.00
- **Dewax 6.5%** (`10 ml drop`): `null/70.11` -> `{"packPrice":"300.00"}` | 10 ml drop: ৳ 300.00
- **Piloma OSD 2%** (`10 ml drop`): `null/186.12` -> `{"packPrice":"580.00"}` | 10 ml drop: ৳ 580.00
- **Electro-K 600 mg** (`100's pack`): `0.6/60` -> `{"unitPrice":"2.00","packPrice":"200.00"}` | Unit Price: ৳ 2.00 (10 x 10: ৳ 200.00) Strip Price: ৳ 20.00
- **Fertinatal 50 mg** (`30's pack`): `15/450` -> `{"unitPrice":"53.33","packPrice":"1600.00"}` | Unit Price: ৳ 53.33 (3 x 10: ৳ 1,600.00) Strip Price: ৳ 533.33

## Sub-batch 3E — REM_187 Pack + Price Migrations
- **Annova Plus 375 mg+20 mg**: `30's pack (8.02/241.2)` -> `{"packQuantity":"7 x 6","packUnits":42,"stripUnits":6,"unitPrice":"17.00","packPrice":"714.00"}` | Unit Price: ৳ 17.00 (7 x 6: ৳ 714.00) Strip Price: ৳ 102.00
- **Dephos 500 mg**: `30's pack (4/190)` -> `{"packQuantity":"1 x 12","packUnits":12,"stripUnits":12,"unitPrice":"45.00","packPrice":"540.00"}` | Unit Price: ৳ 45.00 (1 x 12: ৳ 540.00) Strip Price: ৳ 540.00
- **Aproxi EZY 125 mg+80 mg+80 mg**: `4's pack (50/350.65)` -> `{"packQuantity":"3 capsule pack","packUnits":3,"stripUnits":null,"unitPrice":null,"packPrice":"350.00"}` | 3 capsule pack: ৳ 350.00
- **Pancreon 10000 150 mg**: `30's pack (7/350)` -> `{"packQuantity":"10 x 10","packUnits":100,"stripUnits":10,"unitPrice":"60.00","packPrice":"6000.00"}` | Unit Price: ৳ 60.00 (10 x 10: ৳ 6,000.00) Strip Price: ৳ 600.00
- **Biomolipon 600 mg/ampoule**: `5's pack (10.2/65)` -> `{"packQuantity":"600 mg ampoule","packUnits":null,"stripUnits":null,"unitPrice":null,"packPrice":"820.00"}` | 600 mg ampoule: ৳ 820.00
- **Prinagel 8%**: `15's pack (339/5085)` -> `{"packQuantity":"15 gm tube & applicator","packUnits":null,"stripUnits":null,"unitPrice":null,"packPrice":"335.00"}` | 15 gm tube & applicator: ৳ 335.00
- **Avas EZ 40 mg+10 mg**: `30's pack (14/420)` -> `{"packQuantity":"1 x 14","packUnits":14,"stripUnits":14,"unitPrice":"30.00","packPrice":"420.00"}` | Unit Price: ৳ 30.00 (1 x 14: ৳ 420.00) Strip Price: ৳ 420.00
- **Mycept-S 180 mg**: `50's pack (5/250)` -> `{"packQuantity":"3 x 10","packUnits":30,"stripUnits":10,"unitPrice":"50.00","packPrice":"1500.00"}` | Unit Price: ৳ 50.00 (3 x 10: ৳ 1,500.00) Strip Price: ৳ 500.00
- **Mycept-S 360 mg**: `50's pack (5/250)` -> `{"packQuantity":"3 x 10","packUnits":30,"stripUnits":10,"unitPrice":"90.00","packPrice":"2700.00"}` | Unit Price: ৳ 90.00 (3 x 10: ৳ 2,700.00) Strip Price: ৳ 900.00
- **Enclot 650 mg**: `30's pack (8.02/300.5)` -> `{"packQuantity":"2 x 10","packUnits":20,"stripUnits":10,"unitPrice":"25.00","packPrice":"500.00"}` | Unit Price: ৳ 25.00 (2 x 10: ৳ 500.00) Strip Price: ৳ 250.00
- **Ceframax 500 mg**: `20's pack (12.5/300)` -> `{"packQuantity":"3 x 10","packUnits":30,"stripUnits":10,"unitPrice":"12.00","packPrice":"360.00"}` | Unit Price: ৳ 12.00 (3 x 10: ৳ 360.00) Strip Price: ৳ 120.00
- **Elivier DT 1000 mg**: `30's pack (8/270)` -> `{"packQuantity":"4 x 6","packUnits":24,"stripUnits":6,"unitPrice":"30.00","packPrice":"720.00"}` | Unit Price: ৳ 30.00 (4 x 6: ৳ 720.00) Strip Price: ৳ 180.00

## Excluded False Positives (Already Match Live MedEx)
- **Napa 125 mg**: DB=4/80 == Live MedEx (Unit Price: ৳ 4.00 (4 x 5: ৳ 80.00)) | Arogga had 20/20
- **Fluking 250 mg**: DB=5.5/154 == Live MedEx (Unit Price: ৳ 5.50 (7 x 4: ৳ 154.00) Strip Price: ৳ 22.00) | Arogga had 1/1
- **Technofen 100 mg**: DB=4.96/496.1 == Live MedEx (Unit Price: ৳ 4.96 (10 x 10: ৳ 496.00) Strip Price: ৳ 49.60) | Arogga had 0.4/0.4
- **Tranal 100 mg/2 ml**: DB=null/100.4 == Live MedEx (2 ml ampoule: ৳ 20.08 (1 x 5: ৳ 100.40)) | Arogga had 100.7/100.7
- **Napa 250 mg**: DB=5/100 == Live MedEx (Unit Price: ৳ 5.00 (4 x 5: ৳ 100.00)) | Arogga had 25/25
- **Fast 125 mg**: DB=4.03/40.3 == Live MedEx (Unit Price: ৳ 4.03 (2 x 5: ৳ 40.30)) | Arogga had 20.15/20.15
- **Multical**: DB=4/120 == Live MedEx (Unit Price: ৳ 4.00 (1 x 30: ৳ 120.00)) | Arogga had 48.33/1449.9

## Held at MedEx CAPTCHA Gate (Stopped Without Bypass)
- **Laxadil 3.5 gm/sachet** (`15's pack`): DB=null/105, Arogga=150/150
- **Apremig ODT 75 mg** (`30's pack`): DB=8/270, Arogga=150/1200
- **Renova 500 mg** (`10's pack`): DB=8.03/80.3, Arogga=40.3/80.6
- **Annova 500 mg** (`30's pack`): DB=7.52/255.06, Arogga=16/160
- **Atofix 0.3% w/w** (`10 gm tube`): DB=null/50.19, Arogga=350/350
- **Renova 250 mg** (`10's pack`): DB=5.02/50.2, Arogga=25.15/25.15
- **Lura 80 mg** (`30's pack`): DB=27.5/600, Arogga=70/700
- **Coxitor 30 mg** (`30's pack`): DB=12/280, Arogga=4/40
- **Progel 8%** (`15's pack`): DB=339/5085, Arogga=500/500
- **Lura 120 mg** (`30's pack`): DB=27.5/600, Arogga=95/570
- **Demelon 4.5 mg** (`28's pack`): DB=92.78/2237.68, Arogga=40/280
- **Calfix Plus EF ** (`10's pack`): DB=20/200, Arogga=210/210
- **Fast 250 mg** (`10's pack`): DB=5.03/50.3, Arogga=25.15/25.15