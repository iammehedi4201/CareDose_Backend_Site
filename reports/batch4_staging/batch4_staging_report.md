# CareDose — Staged Batch 4 Wave Review (Read-Only Staging)

Generated: 2026-11-25T11:49:45.673Z | Status: STAGED (0 PostgreSQL mutations)

## Batch 4 Summary
- **Sub-batch 4A (4 core inserts + 1 optional duplicate-twin decision):** Verified Zero-Pack `EXACT_MATCH` inserts (`Serivan 34 mg`, `Twincard 50+25`, `Uroblock 25 mg`, `Uroblock 50 mg`). Optional duplicate sibling `Salmolin 100 mcg/puff #32420` (`'200 metered doses (Refill)' @ ৳200.00`) flagged for choice; **3 held** (`Nilonib 200`, `Ketoseem 10`, `Prostalex 250`).
- **Sub-batch 4B (9 updates):** Remaining CAPTCHA-paused `REM_187` tail unblocked via web search (`2` same-box + `7` pack/container migrations); **4 false positives excluded** (`Laxadil`, `Renova 500`, `Renova 250`, `Fast 250`).
- **Sub-batch 4C (48 updates):** `VERIFY_REQ_55` non-divisible strip & corrupted-template repairs verified online (incl. `Utrogestan 200 mg` `pp=1 -> 1080.00` & `2 x 7`); **6 held** (`4` H. pylori kits + `Rabnil 20` + `Linamet ER 2.5+1000`).
- **Total Core Staged Operations:** **61** (`4` inserts + `57` pack updates), clearing **49** stale `pack_price_inconsistent_with_unit_price` warnings in the same step (**62** if optional `Salmolin #32420` Refill insert is approved).

## Sub-batch 4A — Clean Zero-Pack Inserts (4)
- **Serivan 34 mg (Capsule)** [`sid=32382`]: insert `3 x 6` (`pu=18, su=6, u=40.00, pp=720.00`)
- **Twincard 50 mg+25 mg (Tablet)** [`sid=33171`]: insert `5 x 10` (`pu=50, su=10, u=5.00, pp=250.00`)
- **Uroblock 25 mg (Tablet (Extended Release))** [`sid=32469`]: insert `2 x 10` (`pu=20, su=10, u=30.00, pp=600.00`)
- **Uroblock 50 mg (Tablet (Extended Release))** [`sid=32470`]: insert `1 x 10` (`pu=10, su=10, u=55.00, pp=550.00`)

### Optional Duplicate-Twin Decision (1)
- **Salmolin 100 mcg/puff** [`sid=32420`]: Sibling `sid=3505` already owns `200 metered doses @ ৳230.00`. Option A: insert `'200 metered doses (Refill)' @ ৳200.00`; Option B: leave held / consolidate later.

### Held Zero-Pack Brands (3)
- **Nilonib 200 mg Capsule** [`sid=33089`]: Arogga #39689 (stock=0, pv_mrp=800, Box=30) agrees on ৳800/cap, but exact live MedEx Nilonib box format (e.g. 3 x 10 vs 1 x 10) was not directly confirmed in search snippets.
- **Ketoseem 10 mg Tablet** [`sid=15433`]: Discontinued/inactive Seema SKU (Arogga #9954 stock=0, retail ~৳9.09-10.00) with no confirmed live MedEx pricing snippet.
- **Prostalex 250 mg Tablet** [`sid=33091`]: MedEx has no fixed MRP; Arogga #15574 has dummy pv_mrp=1 (stock=0). Held permanently unless fixed MRP is published.

## Sub-batch 4B — Unblocked REM_187 Tail Fixes (9)
- **Atofix 0.3% w/w** [SAME_BOX]: `10 gm tube (pu=null, su=null, null/50.19)` -> `{"packPrice":"350.00"}`
- **Demelon 4.5 mg** [SAME_BOX]: `28's pack (pu=28, su=7, 92.78/2237.68)` -> `{"packQuantity":"4 x 7","packUnits":28,"stripUnits":7,"unitPrice":"40.00","packPrice":"1120.00","warnings":[]}`
- **Apremig ODT 75 mg** [PACK_MIGRATION]: `30's pack (pu=30, su=null, 8/270)` -> `{"packQuantity":"2 x 4","packUnits":8,"stripUnits":4,"unitPrice":"150.00","packPrice":"1200.00","warnings":[]}`
- **Annova 500 mg** [PACK_MIGRATION]: `30's pack (pu=30, su=10, 7.52/255.06)` -> `{"packQuantity":"5 x 10","packUnits":50,"stripUnits":10,"unitPrice":"16.00","packPrice":"800.00","warnings":[]}`
- **Lura 80 mg** [PACK_MIGRATION]: `30's pack (pu=30, su=null, 27.5/600)` -> `{"packQuantity":"1 x 10","packUnits":10,"stripUnits":10,"unitPrice":"70.00","packPrice":"700.00","warnings":[]}`
- **Lura 120 mg** [PACK_MIGRATION]: `30's pack (pu=30, su=6, 27.5/600)` -> `{"packQuantity":"2 x 6","packUnits":12,"stripUnits":6,"unitPrice":"95.00","packPrice":"1140.00","warnings":[]}`
- **Coxitor 30 mg** [PACK_MIGRATION]: `30's pack (pu=30, su=10, 12/280)` -> `{"packQuantity":"5 x 10","packUnits":50,"stripUnits":10,"unitPrice":"4.00","packPrice":"200.00","warnings":[]}`
- **Progel 8%** [PACK_MIGRATION]: `15's pack (pu=15, su=null, 339/5085)` -> `{"packQuantity":"22.5 gm tube & applicator","packUnits":null,"stripUnits":null,"unitPrice":null,"packPrice":"500.00"}`
- **Calfix Plus EF ** [PACK_MIGRATION]: `10's pack (pu=10, su=null, 20/200)` -> `{"packQuantity":"1 x 14","packUnits":14,"stripUnits":14,"unitPrice":"15.00","packPrice":"210.00"}`

### Excluded REM_187 False Positives (4)
- **Laxadil 3.5 gm/sachet**: DB (15s pack, 105.00) already matches MedEx (3.5 gm sachet: ৳7.00, 15s pack: ৳105.00).
- **Renova 500 mg**: DB (8.03/80.30) already matches MedEx (2 x 5: ৳80.30); Arogga had strip=5 b2c_mrp=80.6.
- **Renova 250 mg**: DB (5.02/50.20) already matches MedEx (2 x 5: ৳50.20).
- **Fast 250 mg**: DB (5.03/50.30) already matches MedEx (2 x 5: ৳50.30).

## Sub-batch 4C — Verified VERIFY_REQ_55 Repairs (48)
- **Famotid 40 mg**: `100's pack (pu=100, su=14, null/400)` -> `4 x 14 (pu=56, su=14, 5.00/280.00)`
- **Esoprol 20 mg**: `56's pack (pu=56, su=10, null/280)` -> `6 x 10 (pu=60, su=10, 5.00/300.00)`
- **Exforge 5 mg+80 mg**: `30's pack (pu=30, su=14, 8/270.45)` -> `2 x 14 (pu=28, su=14, 50.50/1414.00)` [clears warning]
- **Renolina 5 mg**: `30's pack (pu=30, su=7, 18/450)` -> `3 x 7 (pu=21, su=7, 22.00/462.00)` [clears warning]
- **Cefix 200 mg**: `8's pack (pu=8, su=6, null/200)` -> `2 x 6 (pu=12, su=6, 35.00/420.00)`
- **Orili 150 mg**: `10's pack (pu=10, su=6, 170/1870)` -> `2 x 6 (pu=12, su=6, 170.00/2040.00)` [clears warning]
- **Nictoris 5 mg**: `30's pack (pu=30, su=14, 6/216)` -> `3 x 14 (pu=42, su=14, 3.50/147.00)` [clears warning]
- **Presnor 20 mg**: `30's pack (pu=30, su=7, 8.03/270)` -> `5 x 7 (pu=35, su=7, 9.00/315.00)` [clears warning]
- **Exelon 6 mg**: `60's pack (pu=60, su=14, null/6420)` -> `2 x 14 (pu=28, su=14, 150.00/4200.00)`
- **Ferromax 30 mg**: `30's pack (pu=30, su=8, 12.04/300.48)` -> `4 x 8 (pu=32, su=8, 11.00/352.00)` [clears warning]
- **Prelica CR 165 mg**: `20's pack (pu=20, su=6, 35/875)` -> `5 x 6 (pu=30, su=6, 35.00/1050.00)` [clears warning]
- **Dementa XR 14 mg**: `20's pack (pu=20, su=8, 18/480)` -> `4 x 8 (pu=32, su=8, 20.00/640.00)` [clears warning]
- **Disoral 300 mg**: `30's pack (pu=30, su=14, 8/280)` -> `3 x 14 (pu=42, su=14, 3.00/126.00)` [clears warning]
- **Neopem 200 mg**: `30's pack (pu=30, su=4, 8/280)` -> `5 x 4 (pu=20, su=4, 95.00/1900.00)` [clears warning]
- **Neopem 150 mg**: `30's pack (pu=30, su=4, 8/280)` -> `5 x 4 (pu=20, su=4, 75.00/1500.00)` [clears warning]
- **Fortimox 500 mg+125 mg**: `18's pack (pu=18, su=4, 30/500)` -> `5 x 4 (pu=20, su=4, 32.00/640.00)` [clears warning]
- **Neurolife 10 mg**: `30's pack (pu=30, su=14, 8/280)` -> `1 x 14 (pu=14, su=14, 32.00/448.00)` [clears warning]
- **Neurolife 5 mg**: `30's pack (pu=30, su=14, 8/280)` -> `2 x 14 (pu=28, su=14, 18.00/504.00)` [clears warning]
- **Leveron XR 750 mg**: `20's pack (pu=20, su=6, 37.5/610)` -> `2 x 6 (pu=12, su=6, 38.00/456.00)` [clears warning]
- **Farpem 150 mg**: `30's pack (pu=30, su=4, 8/280)` -> `3 x 4 (pu=12, su=4, 75.00/900.00)` [clears warning]
- **Rivadem 3 mg**: `28's pack (pu=28, su=10, 40/840)` -> `2 x 10 (pu=20, su=10, 40.00/800.00)` [clears warning]
- **Othera 20 mg**: `18's pack (pu=18, su=10, 7.07/288)` -> `6 x 10 (pu=60, su=10, 11.00/660.00)` [clears warning]
- **Bislol 7.5 mg**: `30's pack (pu=30, su=14, 9/290)` -> `3 x 14 (pu=42, su=14, 16.00/672.00)` [clears warning]
- **Lyric CR 165 mg**: `20's pack (pu=20, su=6, 35/875)` -> `3 x 6 (pu=18, su=6, 35.00/630.00)` [clears warning]
- **Orfanem 200 mg**: `30's pack (pu=30, su=7, 8/280)` -> `2 x 7 (pu=14, su=7, 95.00/1330.00)` [clears warning]
- **Itored 50 mg**: `30's pack (pu=30, su=14, 8/280)` -> `3 x 14 (pu=42, su=14, 6.00/252.00)` [clears warning]
- **Miragaba 2.5 mg**: `30's pack (pu=30, su=14, 8/280)` -> `2 x 14 (pu=28, su=14, 12.00/336.00)` [clears warning]
- **Miragaba 5 mg**: `30's pack (pu=30, su=14, 8/280)` -> `2 x 14 (pu=28, su=14, 20.00/560.00)` [clears warning]
- **Nemotis 200 mg**: `30's pack (pu=30, su=4, 8/280)` -> `3 x 4 (pu=12, su=4, 95.00/1140.00)` [clears warning]
- **Nemotis 150 mg**: `30's pack (pu=30, su=4, 8/280)` -> `3 x 4 (pu=12, su=4, 75.00/900.00)` [clears warning]
- **Belsar 10 mg**: `30's pack (pu=30, su=7, 5.02/178.5)` -> `4 x 7 (pu=28, su=7, 6.00/168.00)` [clears warning]
- **Denbac 50 mg**: `24's pack (pu=24, su=10, 15/330)` -> `3 x 10 (pu=30, su=10, 15.00/450.00)` [clears warning]
- **Merol-A 160 mg**: `30's pack (pu=30, su=8, 80/2250)` -> `3 x 8 (pu=24, su=8, 90.00/2160.00)` [clears warning]
- **Glipxen-M 2.5 mg+850 mg**: `30's pack (pu=30, su=7, 14/280)` -> `4 x 7 (pu=28, su=7, 14.00/392.00)` [clears warning]
- **Daprosis 6 mg**: `30's pack (pu=30, su=7, 8/280)` -> `2 x 7 (pu=14, su=7, 200.00/2800.00)` [clears warning]
- **Evoxil CV 500 mg+125 mg**: `18's pack (pu=18, su=5, 30/500)` -> `4 x 5 (pu=20, su=5, 32.00/640.00)` [clears warning]
- **Co-Clav 500 mg+125 mg**: `18's pack (pu=18, su=4, 30/500)` -> `5 x 4 (pu=20, su=4, 32.00/640.00)` [clears warning]
- **Febuxit 80 mg**: `30's pack (pu=30, su=14, 22/440)` -> `2 x 14 (pu=28, su=14, 22.00/616.00)` [clears warning]
- **Moxilin-CV 500 mg+125 mg**: `18's pack (pu=18, su=7, 30/500)` -> `3 x 7 (pu=21, su=7, 32.00/672.00)` [clears warning]
- **Leveron XR 500 mg**: `12's pack (pu=12, su=10, 30/480)` -> `2 x 10 (pu=20, su=10, 30.00/600.00)` [clears warning]
- **Farpem 200 mg**: `30's pack (pu=30, su=4, 8/280)` -> `3 x 4 (pu=12, su=4, 95.00/1140.00)` [clears warning]
- **Othera 40 mg**: `18's pack (pu=18, su=10, 7.07/288)` -> `3 x 10 (pu=30, su=10, 17.00/510.00)` [clears warning]
- **Provigor 10 mg**: `30's pack (pu=30, su=4, 8/280)` -> `1 x 4 (pu=4, su=4, 35.00/140.00)` [clears warning]
- **Adrox CV 250 mg+62.5 mg**: `12's pack (pu=12, su=7, 30/420)` -> `2 x 7 (pu=14, su=7, 55.00/770.00)` [clears warning]
- **Novaclav 500 mg+125 mg**: `18's pack (pu=18, su=4, 30/500)` -> `5 x 4 (pu=20, su=4, 32.00/640.00)` [clears warning]
- **Farospec 150 mg**: `30's pack (pu=30, su=4, 8/280)` -> `2 x 4 (pu=8, su=4, 75.00/600.00)` [clears warning]
- **Farospec 200 mg**: `30's pack (pu=30, su=4, 8/280)` -> `2 x 4 (pu=8, su=4, 95.00/760.00)` [clears warning]
- **Utrogestan 200 mg**: `15's pack (pu=15, su=7, null/1)` -> `2 x 7 (pu=14, su=7, 77.14/1080.00)`

### Held VERIFY_REQ_55 Items (6)
- **Helicon Kit 30 mg+1000 mg+500 mg** [H_PYLORI_KIT]: Already has 4-tab strip pack; 14s pack (৳775.17 = 14 strips) represents 14 regimen pouches rather than single-tablet divisibility. Decide whether to clear stripUnits=null (like Triokit) or convert to 14 x 4 (pu=56).
- **Finix HP 20 mg+1000 mg+500 mg** [H_PYLORI_KIT]: Already has 4-tab strip (13.84/55.36); 7s pack (৳387.52 = 7 strips) represents 7 regimen pouches.
- **Pylotrip 30 mg+1000 mg+500 mg** [H_PYLORI_KIT]: Already has 4-tab strip (13.79/55.16); 14s pack (৳772.24 = 14 strips) represents 14 regimen pouches.
- **Pylotrip R 20 mg+1000 mg+500 mg** [H_PYLORI_KIT]: Already has 4-tab strip (13.75/55.00); 14s pack (৳770.00 = 14 strips) represents 14 regimen pouches.
- **Rabnil 20 mg EC Tablet (Benham)** [UNCONFIRMED_BOX]: Arogga #71246 has Strip=14, Box=70 (pv_mrp=6, stock=0), while MedEx search snippet mentioned 7 x 10 (৳420.00) alongside EC Capsule (৳7). Hold until exact 5 x 14 vs 7 x 10 verified.
- **Linamet ER 2.5 mg+1000 mg** [UNCONFIRMED_MRP]: Arogga #59270 shows pv_mrp=17 (Strip=6, Box=18) and discounted ৳15.30 online, but MedEx ER MRP snippet was not retrieved without login/direct hit.