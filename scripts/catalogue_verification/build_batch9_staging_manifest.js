/**
 * Strictly READ-ONLY builder for Batch 9 Staged Wave Manifest.
 * Audits all 234 remaining warning / arithmetic-mismatch packs post-Batch-8:
 *   - Sub-batch 9A (16): Non-arithmetic (<=5% err) warning packs verified via grounded web search
 *   - Sub-batch 9B (209): 5%-25% arithmetic mismatch packs verified via grounded web search
 *                         (includes Linamet ER 2.5+1000, clearing held VERIFY_REQ_55 non-divisible strip)
 *   - Held (9): Sac Sweet 12.5 (exact MedEx ৳0.09/300s=৳28 rounding), 5 dual-pack inhalers (Complete+Refill),
 *               Carmin 2.5 & 5 (officially unpriced), Helicon V (no published MedEx single/pack MRP)
 *
 * Strictly zero PostgreSQL writes (SET TRANSACTION READ ONLY).
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const dbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch9_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Format: [packId, subKind, pq, pu, su, unitPrice, packPrice, evidence, allowSmallRoundingPct?]
const SUBBATCH_9A_SPECS = [
  ['ae21ef0a-52fa-49b6-bc1c-0d17f346f5fe', 'NON_ARITH_WARN', "30's pack", 30, null, '210.00', '6300.00', 'MedEx search: Leukenib 400 mg Tablet ৳210.00 (30s pack: ৳6,300.00).'],
  ['eae00235-b616-4f87-a88b-9a47097700d8', 'NON_ARITH_WARN', '50 x 10', 500, 10, '0.30', '150.00', 'MedEx search: Cytacin 4 mg Tablet ৳0.30 (50 x 10: ৳150.00).'],
  ['24f1bee2-a0ad-42db-bd95-d2a13391e480', 'NON_ARITH_WARN', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Ameloss M 7+10 XR Capsule ৳20.00 (2 x 10: ৳400.00).'],
  ['bb5b1181-ec7e-4746-9c9f-c938124c0508', 'NON_ARITH_WARN', '1 x 14', 14, 14, '10.00', '140.00', 'MedEx search: Calfix C Effervescent Tablet ৳10.00 (1 x 14: ৳140.00).'],
  ['79c0b01e-e002-49be-a036-c4e50ac69ed4', 'NON_ARITH_WARN', '1 x 4', 4, 4, '20.00', '80.00', 'MedEx search: Charm 25 mg Tablet ৳20.00 (1 x 4: ৳80.00).'],
  ['ab31f849-f4da-498a-b465-0226c8ebf4da', 'NON_ARITH_WARN', '1 x 10', 10, 10, '10.00', '100.00', 'MedEx search: CX-C Effervescent Tablet ৳10.00 (1 x 10: ৳100.00).'],
  ['966b101a-c223-4aaf-b708-859c5413879a', 'NON_ARITH_WARN', '3 x 10', 30, 10, '11.00', '330.00', 'MedEx search: Lexapro 10 mg Tablet ৳11.00 (3 x 10: ৳330.00).'],
  ['2a0ec30e-9d60-4989-977c-55cc895f6e8f', 'NON_ARITH_WARN', '3 x 10', 30, 10, '320.00', '9600.00', 'MedEx search: Imakin 400 mg Tablet ৳320.00 (3 x 10: ৳9,600.00).'],
  ['d8a42e9b-b39a-463c-827b-aea3b6b80fd3', 'NON_ARITH_WARN', '50 x 10', 500, 10, '0.30', '150.00', 'MedEx search: Hispasin 4 mg Tablet ৳0.30 (50 x 10: ৳150.00).'],
  ['938019e7-3e2e-4f3f-9725-9e14a04d8768', 'NON_ARITH_WARN', '2 x 6', 12, 6, '22.00', '264.00', 'MedEx search: Glipagen Plus 50+850 Tablet ৳22.00 (2 x 6: ৳264.00).'],
  ['a9f7b113-95fd-4845-827f-01d4573e069c', 'NON_ARITH_WARN', '10 x 10', 100, 10, '0.18', '18.00', 'MedEx search: Nemine 4 mg Tablet ৳0.18 (10 x 10: ৳18.00).'],
  ['3a33743f-4348-48d6-a817-bd47a552b91f', 'NON_ARITH_WARN', '3 x 10', 30, 10, '25.00', '750.00', 'MedEx search: Folimax 15 mg Tablet ৳25.00 (3 x 10: ৳750.00).'],
  ['f678b911-f239-4bba-9028-058de50cf07d', 'NON_ARITH_WARN', '3 x 10', 30, 10, '1150.00', '34500.00', 'MedEx search: Olatab 100 mg Tablet ৳1,150.00 (3 x 10: ৳34,500.00).'],
  ['875c5cd9-27a0-4fb7-acca-eb592314a315', 'NON_ARITH_WARN', '2 x 6', 12, 6, '24.55', '294.60', 'MedEx search: Azithromycin 250 mg (Pharmik) Tablet ৳24.55 (2 x 6: ৳294.60).'],
  ['c57081cb-ff58-4641-b7d0-fa2a583ab822', 'NON_ARITH_WARN', '50 x 10', 500, 10, '0.29', '145.00', 'MedEx search: H-CIN 4 mg Tablet ৳0.29 (50 x 10: ৳145.00).'],
  ['a98af7b2-a790-4c61-b9ba-2abd723b5769', 'NON_ARITH_WARN', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: B stop 500 mg Capsule ৳20.00 (2 x 10: ৳400.00).'],
];

const SUBBATCH_9B_SPECS = [
  ['00a96888-a5a5-4f40-b30f-d7b1e8d606a9', 'MISMATCH_5_25', '2 x 8', 16, 8, '25.00', '400.00', 'MedEx search: Intrax 650 mg CR Tablet ৳25.00 (2 x 8: ৳400.00).'],
  ['59b6287c-c0d9-4426-a3fb-864beae5ffc2', 'MISMATCH_5_25', '3 x 10', 30, 10, '6.00', '180.00', 'MedEx search: G-Montelukast 5 mg Tablet ৳6.00 (3 x 10: ৳180.00).'],
  ['730d392b-ecb0-47e1-b761-a8549687575e', 'MISMATCH_5_25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Angirest 35 mg MR Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['63ea4726-fcce-4893-b4f1-34c4495abd08', 'MISMATCH_5_25', '2 x 10', 20, 10, '14.00', '280.00', 'MedEx search: Oricox 30 mg Tablet ৳14.00 (2 x 10: ৳280.00).'],
  ['aa39e016-0aed-4517-bff7-7c91e9cd864f', 'MISMATCH_5_25', '3 x 10', 30, 10, '14.00', '420.00', 'MedEx search: Presart AM 10+80 Tablet ৳14.00 (3 x 10: ৳420.00).'],
  ['4537a706-c253-4a6d-9a31-5bb84b521811', 'MISMATCH_5_25', '6 x 10', 60, 10, '4.80', '288.00', 'MedEx search: Alfol CI TR Capsule ৳4.80 (6 x 10: ৳288.00).'],
  ['6fd9e764-134c-46d8-94f5-b38fdacb9e0e', 'MISMATCH_5_25', '3 x 10', 30, 10, '3.00', '90.00', 'MedEx search: Blood Plus TR Capsule ৳3.00 (3 x 10: ৳90.00).'],
  ['75edac0a-ebf3-40cd-b79f-2338463bd2cb', 'MISMATCH_5_25', '1 x 10', 10, 10, '40.00', '400.00', 'MedEx search: Derbicil 250 mg Tablet ৳40.00 (1 x 10: ৳400.00).'],
  ['4f7feab8-936e-4694-bdc8-4de07456336e', 'MISMATCH_5_25', '10 x 10', 100, 10, '4.60', '460.00', 'MedEx search: Omehil 20 mg EC Capsule ৳4.60 (10 x 10: ৳460.00).'],
  ['3b221927-4b22-4800-a4f7-94339ff3502b', 'MISMATCH_5_25', '1 x 10', 10, 10, '40.00', '400.00', 'MedEx search: Lomitin 250 mg Tablet ৳40.00 (1 x 10: ৳400.00).'],
  ['a0e3b40d-0b1b-4146-854a-4f1b61f886c0', 'MISMATCH_5_25', "30's pack", 30, null, '7.00', '210.00', 'MedEx search: Rabistar 20 mg EC Tablet ৳7.00 (30s pack: ৳210.00).'],
  ['4038035d-6411-46fd-bb45-6b6f80481a2b', 'MISMATCH_5_25', '1 x 14', 14, 14, '13.00', '182.00', 'MedEx search: Algecal C Plus Effervescent Tablet ৳13.00 (1 x 14: ৳182.00).'],
  ['ce6f59dd-c71e-42c8-9245-b99c135d3269', 'MISMATCH_5_25', '1 x 10', 10, 10, '60.00', '600.00', 'MedEx search: Lizolix 400 mg Tablet ৳60.00 (1 x 10: ৳600.00).'],
  ['7bbb7ef5-79a9-4f54-b503-b28d443f1255', 'MISMATCH_5_25', '3 x 10', 30, 10, '6.00', '180.00', 'MedEx search: Cosmorab 20 mg EC Tablet ৳6.00 (3 x 10: ৳180.00).'],
  ['bfbbdb43-cf9f-467b-bd7d-02d354f4a49e', 'MISMATCH_5_25', '5 x 14', 70, 14, '6.00', '420.00', 'MedEx search: Rabetol 20 mg EC Tablet ৳6.00 (5 x 14: ৳420.00).'],
  ['495d5741-7378-41ac-8496-45b06cf7518f', 'MISMATCH_5_25', '5 x 10', 50, 10, '6.00', '300.00', 'MedEx search: Omimak 20 mg EC Capsule ৳6.00 (5 x 10: ৳300.00).'],
  ['ec7c05cb-af75-4d91-ab68-1913655647a7', 'MISMATCH_5_25', '3 x 10', 30, 10, '6.00', '180.00', 'MedEx search: Diabest 850 mg Tablet ৳6.00 (3 x 10: ৳180.00).'],
  ['987d4b29-a479-479e-838c-ffed067d601e', 'MISMATCH_5_25', '10 x 10', 100, 10, '6.00', '600.00', 'MedEx search: Gastrocare 20 mg EC Capsule ৳6.00 (10 x 10: ৳600.00).'],
  ['b6828f3f-02e4-4869-ba2d-b7d7b2ee58fd', 'MISMATCH_5_25', '4 x 7', 28, 7, '14.00', '392.00', 'MedEx search: Cephrasic 500 mg Capsule ৳14.00 (4 x 7: ৳392.00).'],
  ['305a07b1-336f-45b0-af5c-de953e30ecda', 'MISMATCH_5_25', '10 x 10', 100, 10, '5.50', '550.00', 'MedEx search: Omesic 20 mg EC Capsule ৳5.50 (10 x 10: ৳550.00).'],
  ['0ec1369d-0a2d-4a7a-bb93-ec9e709a3478', 'MISMATCH_5_25', '1 x 10', 10, 10, '55.00', '550.00', 'MedEx search: Linbid 400 mg Tablet ৳55.00 (1 x 10: ৳550.00).'],
  ['387524b9-34b6-4f76-9ea2-7cab60e7e7c1', 'MISMATCH_5_25', '1 x 10', 10, 10, '50.00', '500.00', 'MedEx search: Lizobest 400 mg Tablet ৳50.00 (1 x 10: ৳500.00).'],
  ['cc51bb38-56a1-4e26-9d63-de376d96cab9', 'MISMATCH_5_25', '20 x 10', 200, 10, '1.90', '380.00', 'MedEx search: DC-Vit C 250 mg Chewable Tablet ৳1.90 (20 x 10: ৳380.00).'],
  ['a9a54e1d-a693-4d40-8999-9192596b39d1', 'MISMATCH_5_25', '10 x 10', 100, 10, '1.90', '190.00', 'MedEx search: Civitin 250 mg Chewable Tablet ৳1.90 (10 x 10: ৳190.00).'],
  ['feda3c20-d5a9-4345-8b74-6b061e08e2a0', 'MISMATCH_5_25', '5 x 10', 50, 10, '7.00', '350.00', 'MedEx search: Onibest 50 mg Tablet ৳7.00 (5 x 10: ৳350.00).'],
  ['30fc889c-5a9f-4189-a909-f946628389cc', 'MISMATCH_5_25', '5 x 10', 50, 10, '7.50', '375.00', 'MedEx search: Novispa 50 mg Tablet ৳7.50 (5 x 10: ৳375.00).'],
  ['7543cdcf-5c3f-4326-95b0-aabce789696f', 'MISMATCH_5_25', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Joint Plus 250+200 Tablet ৳12.00 (3 x 10: ৳360.00).'],
  ['847f0dc1-d03b-4567-9ac6-00fd3e025d8f', 'MISMATCH_5_25', '3 x 10', 30, 10, '35.00', '1050.00', 'MedEx search: Citazar XR 750 mg Tablet ৳35.00 (3 x 10: ৳1,050.00).'],
  ['1b28ff7e-953d-4a55-b47d-0674391805c5', 'MISMATCH_5_25', '3 x 10', 30, 10, '5.00', '150.00', 'MedEx search: Olmefast 10 mg Tablet ৳5.00 (3 x 10: ৳150.00).'],
  ['a255b201-6f52-4b91-8486-53b5f1dc6711', 'MISMATCH_5_25', '2 x 15', 30, 15, '5.00', '150.00', 'MedEx search: Olmemax 10 mg Tablet ৳5.00 (2 x 15: ৳150.00).'],
  ['636a14e1-2654-4b8d-ac17-2079575d45a8', 'MISMATCH_5_25', '4 x 6', 24, 6, '600.00', '14400.00', 'MedEx search: Ibrucon 140 mg Capsule ৳600.00 (4 x 6: ৳14,400.00).'],
  ['98d6dab5-7f69-4645-ab48-354b834c11fa', 'MISMATCH_5_25', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Lamo 50 mg Tablet ৳20.00 (2 x 10: ৳400.00).'],
  // [33, 34] Carmin 2.5 & 5 -> HELD
  ['39b30871-a23d-40f1-b153-792f4ed1d3be', 'MISMATCH_5_25', "60's pack", 60, null, '5.00', '300.00', 'MedEx search: Radifylin 200 mg Tablet ৳5.00 (60s pack: ৳300.00).'],
  ['a55ddebd-820f-46be-97cd-e09568aa37df', 'MISMATCH_5_25', '3 x 10', 30, 10, '6.00', '180.00', 'MedEx search: Novetor 200 mg Tablet ৳6.00 (3 x 10: ৳180.00).'],
  ['1b9205d5-b486-4f6c-8e39-a3812fbc6429', 'MISMATCH_5_25', '2 x 7', 14, 7, '38.40', '537.60', 'MedEx search: Cefuxim-CV 250+62.5 Tablet ৳38.40 (2 x 7: ৳537.60).'],
  ['66bbfe27-e9fe-4a9d-ab70-720027d31045', 'MISMATCH_5_25', '2 x 7', 14, 7, '30.00', '420.00', 'MedEx search: Clavimax-CV 250+62.5 Tablet ৳30.00 (2 x 7: ৳420.00).'],
  ['cc9906a0-97f0-44d6-832b-bedc4de92faf', 'MISMATCH_5_25', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Copadox 200 mg Tablet ৳5.00 (5 x 10: ৳250.00).'],
  ['6a8f97ae-ec46-4613-b751-dbcb589600a3', 'MISMATCH_5_25', '4 x 4', 16, 4, '25.00', '400.00', 'MedEx search: Furoxim 250 mg Tablet ৳25.00 (4 x 4: ৳400.00).'],
  ['c5ebe100-06a4-4044-ab4c-d57177fe003e', 'MISMATCH_5_25', '5 x 10', 50, 10, '6.00', '300.00', 'MedEx search: Freeway 200 mg Tablet ৳6.00 (5 x 10: ৳300.00).'],
  // [42] Helicon V -> HELD
  ['9ac52092-f9b7-4fc0-a0e4-7ae2112259fe', 'MISMATCH_5_25', '6 x 10', 60, 10, '5.00', '300.00', 'MedEx search: Asmadox 200 mg Tablet ৳5.00 (6 x 10: ৳300.00).'],
  ['776fd780-16f3-466e-9c81-237ba40e52d1', 'MISMATCH_5_25', '2 x 7', 14, 7, '30.00', '420.00', 'MedEx search: Ceroclav 250+62.5 Tablet ৳30.00 (2 x 7: ৳420.00).'],
  ['dc053eb1-7e63-4bce-ad2f-c76a2ae02b60', 'MISMATCH_5_25', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Doxofylline 200 mg (Zenith) Tablet ৳5.00 (5 x 10: ৳250.00).'],
  ['fbd06f13-3f0d-432a-8f1e-baeb185c2604', 'MISMATCH_5_25', '5 x 4', 20, 4, '30.00', '600.00', 'MedEx search: Doctil 250 mg Tablet ৳30.00 (5 x 4: ৳600.00).'],
  ['938b21fa-c739-492c-8d2a-035e8f0b4233', 'MISMATCH_5_25', '2 x 10', 20, 10, '34.00', '680.00', 'MedEx search: Doctil Plus 250+62.5 Tablet ৳34.00 (2 x 10: ৳680.00).'],
  ['f9eff68b-4a63-4a77-87f1-00efc42cd054', 'MISMATCH_5_25', '3 x 10', 30, 10, '13.00', '390.00', 'MedEx search: Actical 1200+0.25 Tablet ৳13.00 (3 x 10: ৳390.00).'],
  ['53087075-e0bc-4db9-9deb-06df3cc0b21a', 'MISMATCH_5_25', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Mucodox 200 mg Tablet ৳5.00 (5 x 10: ৳250.00).'],
  ['2bfb0fba-50af-4cc4-b497-e170352a1a0d', 'MISMATCH_5_25', '2 x 10', 20, 10, '6.00', '120.00', 'MedEx search: Linasec 5 mg Tablet ৳6.00 (2 x 10: ৳120.00).'],
  ['a0f84064-1105-45d6-8e46-3eebd6ddc406', 'MISMATCH_5_25', '10 x 10', 100, 10, '7.00', '700.00', 'MedEx search: Doxoair 200 mg Tablet ৳7.00 (10 x 10: ৳700.00).'],
  ['3b4e3220-2361-4a65-80f0-dd970d73e64f', 'MISMATCH_5_25', "50's pack", 50, null, '7.00', '350.00', 'MedEx search: Rabezol 20 mg EC Capsule ৳7.00 (50s pack: ৳350.00).'],
  ['270694e7-3741-40a4-806c-f118d0668062', 'MISMATCH_5_25', '5 x 10', 50, 10, '8.00', '400.00', 'MedEx search: Rabefour 20 mg EC Capsule ৳8.00 (5 x 10: ৳400.00).'],
  ['492d0c78-609e-4ee9-b221-51b4e222134e', 'MISMATCH_5_25', '2 x 10', 20, 10, '22.00', '440.00', 'MedEx search: Flukzol 150 mg Capsule ৳22.00 (2 x 10: ৳440.00).'],
  ['caaee256-af66-4ba8-9bf9-eea4e337672d', 'MISMATCH_5_25', '1 x 10', 10, 10, '20.00', '200.00', 'MedEx search: Candiver 150 mg Capsule ৳20.00 (1 x 10: ৳200.00).'],
  ['05051538-2808-4c1b-89fd-aa2ca32dbbf4', 'MISMATCH_5_25', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Fungicap 150 mg Capsule ৳20.00 (2 x 10: ৳400.00).'],
  ['d30f2e1a-14ac-42e3-9ce7-1a2d67c58db1', 'MISMATCH_5_25', '1 x 10', 10, 10, '20.00', '200.00', 'MedEx search: Flucovax 150 mg Capsule ৳20.00 (1 x 10: ৳200.00).'],
  ['c03caad6-2e37-4e2d-b68f-336df1cafe4e', 'MISMATCH_5_25', '3 x 10', 30, 10, '7.00', '210.00', 'MedEx search: Alvita B1+B6+B12 Tablet ৳7.00 (3 x 10: ৳210.00).'],
  ['1c5dbd97-b26e-4d02-8689-6a83b53ab7d5', 'MISMATCH_5_25', '4 x 3', 12, 3, '35.00', '420.00', 'MedEx search: Azibact 500 mg Tablet ৳35.00 (4 x 3: ৳420.00).'],
  ['7b1c582d-f3fb-4e83-a622-35e7fd61fa03', 'MISMATCH_5_25', '3 x 10', 30, 10, '7.00', '210.00', 'MedEx search: Fexobest 120 mg Tablet ৳7.00 (3 x 10: ৳210.00).'],
  ['f6d987e2-7379-4ded-801e-1497b16bbe08', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Neovitan Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['ddf528a4-1ddb-4388-892b-d484c06f46d0', 'MISMATCH_5_25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Fenafex 120 mg Tablet ৳9.00 (3 x 10: ৳270.00).'],
  ['7390becf-9d76-41fe-a4ec-c981f1ac6f37', 'MISMATCH_5_25', "30's pack", 30, null, '9.00', '270.00', 'MedEx search: Bfill Tablet ৳9.00 (1 x 30 pack: ৳270.00).'],
  ['d129be62-e136-4f7f-b5b2-74cb483d3dec', 'MISMATCH_5_25', '5 x 10', 50, 10, '8.00', '400.00', 'MedEx search: Neutos Tablet ৳8.00 (5 x 10: ৳400.00).'],
  ['1c1e9ebf-e055-499d-87a2-6658629b8712', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Centobion Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['8b79c465-67c3-4045-87ca-88db6c1ae0a1', 'MISMATCH_5_25', '2 x 6', 12, 6, '30.00', '360.00', 'MedEx search: G-Azithromycin 500 mg Tablet ৳30.00 (2 x 6: ৳360.00).'],
  ['7dcb3bd5-4121-467e-b44e-69205ac7ad49', 'MISMATCH_5_25', '1 x 6', 6, 6, '50.00', '300.00', 'MedEx search: G-Sofosbuvir 400 mg Tablet ৳50.00 (1 x 6: ৳300.00).'],
  ['a8e5b7ca-3b7b-476d-b8b5-59357e2a74ac', 'MISMATCH_5_25', '2 x 6', 12, 6, '30.00', '360.00', 'MedEx search: Parazith 500 mg Tablet ৳30.00 (2 x 6: ৳360.00).'],
  ['0aa8f0cd-2738-4eaf-8fa6-f87919483f7a', 'MISMATCH_5_25', '5 x 10', 50, 10, '7.00', '350.00', 'MedEx search: Pristibion Tablet ৳7.00 (5 x 10: ৳350.00).'],
  ['24ed5252-b048-43ec-84b6-29377b1a5370', 'MISMATCH_5_25', "30's pack", 30, null, '10.00', '300.00', 'MedEx search: Nervotil Tablet ৳10.00 (1 x 30 pack: ৳300.00).'],
  ['0d07850a-5e76-4b85-9c84-f6a1d37260a5', 'MISMATCH_5_25', '3 x 4', 12, 4, '40.00', '480.00', 'MedEx search: Makzit 500 mg Tablet ৳40.00 (3 x 4: ৳480.00).'],
  ['e2a75942-de6c-432b-aca1-f6229dc720b4', 'MISMATCH_5_25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Neto B Tablet ৳9.00 (3 x 10: ৳270.00).'],
  ['3948ca6a-714a-418e-b12a-12ab3b2a539c', 'MISMATCH_5_25', "30's pack", 30, null, '8.00', '240.00', 'MedEx search: Neucent Tablet ৳8.00 (1 x 30 pack: ৳240.00).'],
  ['ad9d10bb-586f-45b2-9247-5089b86f22c2', 'MISMATCH_5_25', '6 x 10', 60, 10, '7.50', '450.00', 'MedEx search: Nurowel Tablet ৳7.50 (6 x 10: ৳450.00).'],
  ['eda260ca-4fe8-4f99-842f-5804d81dda8e', 'MISMATCH_5_25', '5 x 4', 20, 4, '4.25', '85.00', 'MedEx search: Renamycin 500 mg Capsule ৳4.25 (5 x 4: ৳85.00).'],
  ['37447d3c-9879-4ca7-bc9e-6988450e9a66', 'MISMATCH_5_25', '2 x 6', 12, 6, '40.00', '480.00', 'MedEx search: Azithromycin 500 mg (Pharmik) Tablet ৳40.00 (2 x 6: ৳480.00).'],
  ['85c81a4a-472e-4a83-97d4-10c6586ac5f1', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Fexosic 120 mg Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['9fc90462-1814-424d-8bd2-a9e8dc03466e', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Nexofen 120 mg Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['57ef74fb-3fe3-438e-a8c5-de05f4d676d5', 'MISMATCH_5_25', '4 x 3', 12, 3, '40.00', '480.00', 'MedEx search: Raicin 500 mg Tablet ৳40.00 (4 x 3: ৳480.00).'],
  ['16b2ad96-b454-4b2a-85a9-237cddf55e73', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Ambfex 120 mg Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['2c9f1bd0-4259-49e9-9929-ff1ffc6788b9', 'MISMATCH_5_25', '3 x 10', 30, 10, '7.00', '210.00', 'MedEx search: Fexen 120 mg Tablet ৳7.00 (3 x 10: ৳210.00).'],
  ['90bfb30e-db57-42be-bebd-b20a0a58cbdb', 'MISMATCH_5_25', '2 x 6', 12, 6, '50.00', '600.00', 'MedEx search: Favozyth 500 mg Tablet ৳50.00 (2 x 6: ৳600.00).'],
  ['9a4a64a7-831f-4f6c-a4c4-cdd64191f516', 'MISMATCH_5_25', '3 x 10', 30, 10, '7.00', '210.00', 'MedEx search: Neuropa Tablet ৳7.00 (3 x 10: ৳210.00).'],
  ['5d92f348-01ab-45b7-bdcf-c83630e9efe7', 'MISMATCH_5_25', "30's pack", 30, null, '10.00', '300.00', 'MedEx search: COS B126 Tablet ৳10.00 (1 x 30 pack: ৳300.00).'],
  ['6368fbd9-787b-4886-9d99-3f2b870598f5', 'MISMATCH_5_25', '6 x 10', 60, 10, '8.00', '480.00', 'MedEx search: Lozide MR 30 mg Tablet ৳8.00 (6 x 10: ৳480.00).'],
  ['69bed15e-330e-4544-8bca-ebe1db15bc04', 'MISMATCH_5_25', '5 x 10', 50, 10, '8.00', '400.00', 'MedEx search: Fexoton 120 mg Tablet ৳8.00 (5 x 10: ৳400.00).'],
  ['1d2f9814-8894-46bf-9806-5670ae2e9606', 'MISMATCH_5_25', '6 x 10', 60, 10, '10.00', '600.00', 'MedEx search: Neuroton Tablet ৳10.00 (6 x 10: ৳600.00).'],
  ['f5f79802-0713-453e-a4b7-82f8a7837c28', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Fixasin 120 mg Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['9a250e53-463b-4dd2-a326-c0113c565bcc', 'MISMATCH_5_25', '5 x 10', 50, 10, '8.00', '400.00', 'MedEx search: Radiplex Tablet ৳8.00 (5 x 10: ৳400.00).'],
  ['ff4be4aa-3cb3-4ac3-b888-f7b9b46573aa', 'MISMATCH_5_25', "30's pack", 30, null, '9.60', '288.00', 'MedEx search: Alvit Gold Tablet ৳9.60 (1 x 30 pack: ৳288.00).'],
  ['99570a74-af97-482e-b751-5e3a84bca298', 'MISMATCH_5_25', "30's pack", 30, null, '7.00', '210.00', 'MedEx search: Astra Gold Tablet ৳7.00 (1 x 30 pack: ৳210.00).'],
  ['115d51da-b0dc-4485-a7c1-0c84a3ba998e', 'MISMATCH_5_25', "30's pack", 30, null, '7.00', '210.00', 'MedEx search: Astra Silver Tablet ৳7.00 (1 x 30 pack: ৳210.00).'],
  ['1aed5258-dd70-460e-aac7-5a5505f8941a', 'MISMATCH_5_25', "30's pack", 30, null, '10.00', '300.00', 'MedEx search: Centrium Gold Tablet ৳10.00 (1 x 30 pack: ৳300.00).'],
  ['a8655461-d52b-4a31-a700-6e5d9a222fe2', 'MISMATCH_5_25', "30's pack", 30, null, '11.00', '330.00', 'MedEx search: Advance A to Z Gold Tablet ৳11.00 (1 x 30 pack: ৳330.00).'],
  ['b28f2d93-f077-423a-9390-fa37593572be', 'MISMATCH_5_25', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: A to Z Silver Tablet ৳12.00 (3 x 10: ৳360.00).'],
  ['9c78909c-63af-4e88-89fc-8b0199cded78', 'MISMATCH_5_25', '3 x 10', 30, 10, '430.00', '12900.00', 'MedEx search: Cortiment 9 mg PR Tablet ৳430.00 (3 x 10: ৳12,900.00).'],
  ['9d318842-d1b7-4680-9da6-bd4699e7076f', 'MISMATCH_5_25', '3 x 10', 30, 10, '14.00', '420.00', 'MedEx search: Cipro-P 500 mg Tablet ৳14.00 (3 x 10: ৳420.00).'],
  ['2fb3625d-adba-45cd-974a-31effa00811e', 'MISMATCH_5_25', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Cyrus 500 mg Tablet ৳12.00 (3 x 10: ৳360.00).'],
  ['0370b2e9-40d6-4c2d-949f-bb785d9ff0a2', 'MISMATCH_5_25', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Ciprodyl 500 mg Tablet ৳12.00 (3 x 10: ৳360.00).'],
  ['fa391aaf-370b-4f7e-b75b-4ffef4d775ee', 'MISMATCH_5_25', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Ciprofloxacin 500 mg (Pharmik) Tablet ৳15.00 (3 x 10: ৳450.00).'],
  ['67c67f5d-c2d5-474b-a82c-bb92ee840796', 'MISMATCH_5_25', '3 x 10', 30, 10, '14.50', '435.00', 'MedEx search: Ciprosic 500 mg Tablet ৳14.50 (3 x 10: ৳435.00).'],
  ['b19f73f3-dc77-438c-a5e3-a16eb2635460', 'MISMATCH_5_25', '5 x 10', 50, 10, '4.00', '200.00', 'MedEx search: Paracal 500 mg Tablet ৳4.00 (5 x 10: ৳200.00).'],
  ['0a49c2ed-922b-4eb8-9a95-3fee5b44a177', 'MISMATCH_5_25', "30's pack", 30, null, '4.00', '120.00', 'MedEx search: Calcium DS 500 mg (Pharmik) Tablet ৳4.00 (1 x 30 pack: ৳120.00).'],
  ['c88cd17c-7255-4106-88d4-6bf8110400ce', 'MISMATCH_5_25', '3 x 10', 30, 10, '13.00', '390.00', 'MedEx search: D-Glip 50 mg Tablet ৳13.00 (3 x 10: ৳390.00).'],
  ['37635888-ffbe-40f3-b7fa-97df9f67d753', 'MISMATCH_5_25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Novas 500 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['3ad5784e-ef1b-4d6b-a251-268f234f29ef', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.50', '255.00', 'MedEx search: Naprofast 500 mg Tablet ৳8.50 (3 x 10: ৳255.00).'],
  ['7e9dbb27-e974-4503-8e2c-4c7dda87f8a2', 'MISMATCH_5_25', "15's pack", 15, null, '17.00', '255.00', 'MedEx search: Reef-D Vita Effervescent Tablet ৳17.00 (15s pack: ৳255.00).'],
  ['7eac322f-d8f2-4357-952a-19adab197555', 'MISMATCH_5_25', '4 x 4', 16, 4, '20.00', '320.00', 'MedEx search: Prostacare-D Capsule ৳20.00 (4 x 4: ৳320.00).'],
  ['19cab908-aef3-4f37-b546-f4f79cb6c601', 'MISMATCH_5_25', '4 x 6', 24, 6, '22.00', '528.00', 'MedEx search: Alkanon DT 1000 mg Dispersible Tablet ৳22.00 (4 x 6: ৳528.00).'],
  ['ff7bdc8b-61fe-4a39-b9ae-13719d94bfd1', 'MISMATCH_5_25', '3 x 10', 30, 10, '3.00', '90.00', 'MedEx search: Desatrol ODT 2.5 mg Tablet ৳3.00 (3 x 10: ৳90.00).'],
  ['57944359-bc08-4cfe-8392-a63f086365a0', 'MISMATCH_5_25', '3 x 10', 30, 10, '13.00', '390.00', 'MedEx search: Etorac MDT 10 mg Tablet ৳13.00 (3 x 10: ৳390.00).'],
  ['b8ce3858-c86f-41b7-a492-955cb203c095', 'MISMATCH_5_25', '3 x 10', 30, 10, '13.00', '390.00', 'MedEx search: Ramoset 2.5 mcg Dispersible Tablet ৳13.00 (3 x 10: ৳390.00).'],
  ['0025da5b-ab5d-4432-83bb-41b17b15cae5', 'MISMATCH_5_25', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Ramoset 5 mcg Dispersible Tablet ৳20.00 (2 x 10: ৳400.00).'],
  ['afaf6984-9a32-4fec-afff-cba085683744', 'MISMATCH_5_25', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Nabumax 1000 mg Dispersible Tablet ৳15.00 (3 x 10: ৳450.00).'],
  ['ac3533e2-ac45-4510-b64e-2b180d191b0c', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Olmefast 20 mg Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['55bb8379-457c-4739-8ce0-62654b5ba0d3', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Oltan 20 mg Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['08dc9a1a-6ffc-4ffc-882f-4f1492204115', 'MISMATCH_5_25', '2 x 15', 30, 15, '7.00', '210.00', 'MedEx search: Olmemax 20 mg Tablet ৳7.00 (2 x 15: ৳210.00).'],
  ['ca316b8e-95e9-4776-a24c-ecc9c7a69e50', 'MISMATCH_5_25', '3 x 15', 45, 15, '3.02', '136.00', 'MedEx search: Fecel TR Capsule ৳3.02 (3 x 15: ৳136.00).'],
  ['08b61f0a-7f91-4aed-8a9a-44dd71af2802', 'MISMATCH_5_25', '10 x 6', 60, 6, '3.62', '217.20', 'MedEx search: Alvit-B Gold Capsule ৳3.62 (10 x 6: ৳217.20).'],
  ['c9087b71-25ca-41c7-baf5-96294e07bf11', 'MISMATCH_5_25', '1 x 7', 7, 7, '550.00', '3850.00', 'MedEx search: Eltropag 50 mg Tablet ৳550.00 (1 x 7: ৳3,850.00).'],
  ['0a37cb4b-b9a1-4af5-8780-95930494be51', 'MISMATCH_5_25', '1 x 10', 10, 10, '900.00', '9000.00', 'MedEx search: Olapag 50 mg Tablet ৳900.00 (1 x 10: ৳9,000.00).'],
  ['3e80fbfd-7418-41d4-860b-87f9489e3081', 'MISMATCH_5_25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Esozol 40 mg EC Capsule ৳9.00 (3 x 10: ৳270.00).'],
  ['6e3e8cf3-2727-4c30-9e83-fe152f1b8f71', 'MISMATCH_5_25', '5 x 10', 50, 10, '10.00', '500.00', 'MedEx search: Esosic 40 mg EC Capsule ৳10.00 (5 x 10: ৳500.00).'],
  ['d67ca1e0-2b4d-4a60-bc5a-e3c8cfa71f34', 'MISMATCH_5_25', '5 x 10', 50, 10, '10.00', '500.00', 'MedEx search: Esosav 40 mg EC Capsule ৳10.00 (5 x 10: ৳500.00).'],
  ['7c43f883-9319-4af1-9e60-0a448f5bbdd7', 'MISMATCH_5_25', '6 x 10', 60, 10, '8.00', '480.00', 'MedEx search: Esru 40 mg EC Capsule ৳8.00 (6 x 10: ৳480.00).'],
  ['1607475a-21e2-4651-a868-17694e742acd', 'MISMATCH_5_25', '5 x 10', 50, 10, '12.00', '600.00', 'MedEx search: Esolam 40 mg EC Capsule ৳12.00 (5 x 10: ৳600.00).'],
  ['3fe17463-d9ae-4a0e-998b-15c385d47d73', 'MISMATCH_5_25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Elena 40 mg EC Capsule ৳9.00 (3 x 10: ৳270.00).'],
  ['2ab98bcc-b6e8-40a6-9ae8-31f2d4a63b4b', 'MISMATCH_5_25', '4 x 10', 40, 10, '11.00', '440.00', 'MedEx search: Maxora 40 mg EC Capsule ৳11.00 (4 x 10: ৳440.00).'],
  ['560e2377-a52a-4492-870b-12aa5e64072b', 'MISMATCH_5_25', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Lexotan 3 mg Tablet ৳5.00 (5 x 10: ৳250.00).'],
  ['553bc040-e0ca-4345-b832-09a3edeae721', 'MISMATCH_5_25', '5 x 10', 50, 10, '4.50', '225.00', 'MedEx search: Bromazepam 3 mg (Pharmik) Tablet ৳4.50 (5 x 10: ৳225.00).'],
  ['dea62654-10b7-4aae-9894-e24ccabd85a3', 'MISMATCH_5_25', "24's pack", 24, null, '15.00', '360.00', 'MedEx search: Ezymilk 9000 IU Chewable Tablet ৳15.00 (1 x 24 pack: ৳360.00).'],
  ['2b757ff0-e1c3-4f42-902b-5aacd65b8430', 'MISMATCH_5_25', '1 x 10', 10, 10, '22.00', '220.00', 'MedEx search: Rifexa 200 mg Tablet ৳22.00 (1 x 10: ৳220.00).'],
  ['ff0ac5fd-0674-4406-b50c-e1b62398da3f', 'MISMATCH_5_25', '1 x 14', 14, 14, '10.00', '140.00', 'MedEx search: Calfix C Plus Effervescent Tablet ৳10.00 (1 x 14: ৳140.00).'],
  ['1efda026-6e4d-497c-856a-2cfe7fa5d645', 'MISMATCH_5_25', '1 x 10', 10, 10, '10.00', '100.00', 'MedEx search: CX-C Plus Effervescent Tablet ৳10.00 (1 x 10: ৳100.00).'],
  ['fa77daa5-162b-454f-a586-08e760229a4c', 'MISMATCH_5_25', '2 x 6', 12, 6, '40.00', '480.00', 'MedEx search: Delight 50000 IU Capsule ৳40.00 (2 x 6: ৳480.00).'],
  ['00cdbfb0-4298-4c38-92a7-e305fd02b099', 'MISMATCH_5_25', '12 x 10', 120, 10, '2.50', '300.00', 'MedEx search: Adol Plus 500+65 Tablet ৳2.50 (12 x 10: ৳300.00).'],
  ['d3cef17b-be82-4d84-b9d4-9fa4914eb7b2', 'MISMATCH_5_25', '3 x 10', 30, 10, '5.00', '150.00', 'MedEx search: Baclof 5 mg Tablet ৳5.00 (3 x 10: ৳150.00).'],
  ['c2411700-a4c4-469a-b22e-03019c0857a1', 'MISMATCH_5_25', '1 x 10', 10, 10, '40.00', '400.00', 'MedEx search: D-Rise 50000 IU Capsule ৳40.00 (1 x 10: ৳400.00).'],
  ['e7fbf9f8-064b-4284-8316-6e1fc68a963e', 'MISMATCH_5_25', '9 x 10', 90, 10, '2.00', '180.00', 'MedEx search: Cetamex Plus 500+65 Tablet ৳2.00 (9 x 10: ৳180.00).'],
  ['cecf6ede-7638-4294-b701-efb1430a621f', 'MISMATCH_5_25', '10 x 10', 100, 10, '2.00', '200.00', 'MedEx search: Parafeine 500+65 Tablet ৳2.00 (10 x 10: ৳200.00).'],
  ['de2c193c-557e-4828-9ad0-3155d7ed37f8', 'MISMATCH_5_25', '1 x 10', 10, 10, '180.00', '1800.00', 'MedEx search: Golixen 150 mg Tablet ৳180.00 (1 x 10: ৳1,800.00).'],
  ['9566c16b-f95a-4989-9bb5-21597ecdd989', 'MISMATCH_5_25', '1 x 12', 12, 12, '10.00', '120.00', 'MedEx search: Calcium Vitamin C & D (Pharmik) Eff. Tablet ৳10.00 (1 x 12: ৳120.00).'],
  ['b8316099-a4d6-46b3-ae5e-eb9ce2eb165c', 'MISMATCH_5_25', '3 x 10', 30, 10, '4.50', '135.00', 'MedEx search & manufacturer spec: Movibac 5 mg Tablet ৳4.50 (3 x 10: ৳135.00).'],
  ['f0259a6b-409b-44f6-a75e-311939f36b02', 'MISMATCH_5_25', '10 x 10', 100, 10, '2.50', '250.00', 'MedEx search: Alpa Extra 500+65 Tablet ৳2.50 (10 x 10: ৳250.00).'],
  ['ebb71ad2-26f8-405d-a7fc-a04c288995ce', 'MISMATCH_5_25', '10 x 10', 100, 10, '2.00', '200.00', 'MedEx search: Napton Plus 500+65 Tablet ৳2.00 (10 x 10: ৳200.00).'],
  ['3aada116-3ba1-4f13-94ca-03dd6c231c1e', 'MISMATCH_5_25', "60's pack", 60, null, '0.50', '30.00', 'MedEx search: Bioplex Tablet ৳0.50 (1 x 60 pack: ৳30.00).'],
  ['cd5d3338-44bb-4a91-b998-19c26ecf11bc', 'MISMATCH_5_25', '5 x 15', 75, 15, '0.41', '31.00', 'MedEx search: Asivit Tablet ৳0.41 (5 x 15: ৳31.00; 0.81% pack rounding).', 0.01],
  ['bb48f7eb-4cdb-42f3-a6cb-cc5ef89ffce1', 'MISMATCH_5_25', '3 x 10', 30, 10, '7.00', '210.00', 'MedEx search: Pantohil 40 mg EC Tablet ৳7.00 (3 x 10: ৳210.00).'],
  ['50142a2f-6e7d-4484-9da3-3ce081738826', 'MISMATCH_5_25', '5 x 10', 50, 10, '7.00', '350.00', 'MedEx search: Panoz 40 mg EC Tablet ৳7.00 (5 x 10: ৳350.00).'],
  ['6e79205d-f7be-4b95-9ea7-b7c4ce85629a', 'MISMATCH_5_25', '5 x 10', 50, 10, '7.00', '350.00', 'MedEx search: Pantoprazole 40 mg (Pristine) EC Tablet ৳7.00 (5 x 10: ৳350.00).'],
  ['767cd253-c9fd-47e4-ad1e-1a5198ae8e9b', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Pantomak 40 mg EC Tablet ৳8.00 (3 x 10: ৳240.00).'],
  ['60718a68-bbfd-477f-b370-6bc9f5fd3fc3', 'MISMATCH_5_25', '5 x 10', 50, 10, '10.00', '500.00', 'MedEx search: Pantolam 40 mg EC Tablet ৳10.00 (5 x 10: ৳500.00).'],
  ['eed23255-53f9-4b40-8c70-60a380432a64', 'MISMATCH_5_25', '1 x 10', 10, 10, '10.00', '100.00', 'MedEx search: CEE 1000 mg Effervescent Tablet ৳10.00 (1 x 10: ৳100.00).'],
  ['f188dd07-bab0-4a0d-93a7-32970e745883', 'MISMATCH_5_25', '3 x 10', 30, 10, '22.00', '660.00', 'MedEx search: Ligotin 25 mg Tablet ৳22.00 (3 x 10: ৳660.00).'],
  ['d5ae8c1f-c684-48a8-ad54-c3a394ca405c', 'MISMATCH_5_25', '1 x 14', 14, 14, '12.00', '168.00', 'MedEx search: Algecal C Effervescent Tablet ৳12.00 (1 x 14: ৳168.00).'],
  ['09005068-79f3-47cf-a68f-5bef699d90c5', 'MISMATCH_5_25', "20's pack", 20, null, '5.00', '100.00', 'MedEx search: Albion Oralsaline 10.25 gm Oral Powder ৳5.00 (20s pack: ৳100.00).'],
  ['7f7b617c-4a86-402d-92f2-687297545a15', 'MISMATCH_5_25', "20's pack", 20, null, '5.00', '100.00', 'MedEx search: Oral Saline-I 10.25 gm Oral Powder ৳5.00 (20s pack: ৳100.00).'],
  ['fd6e1025-2550-4f9d-965e-3c6b590a396e', 'MISMATCH_5_25', "30's pack", 30, null, '3.00', '90.00', 'MedEx search: MoniMix Plus 1 gm/sachet Oral Powder ৳3.00 (30s pack: ৳90.00).'],
  ['b06f5a45-98ad-4b45-b21c-b6fde2428f5e', 'MISMATCH_5_25', "20's pack", 20, null, '5.00', '100.00', 'MedEx search: Chemist OralSaline 10.25 gm Oral Powder ৳5.00 (20s pack: ৳100.00).'],
  ['ac783fbb-91fb-4b6c-a2bb-ef8ef9c3eec1', 'MISMATCH_5_25', "20's pack", 20, null, '6.00', '120.00', 'MedEx search: Oralyte 10.25 gm Oral Powder ৳6.00 (20s pack: ৳120.00).'],
  ['da39b64a-9574-438d-8c45-5be457bf4107', 'MISMATCH_5_25', "20's pack", 20, null, '5.00', '100.00', 'MedEx search: Fast oralsaline-N 10.25 gm Oral Powder ৳5.00 (20s pack: ৳100.00).'],
  ['ba4bcd94-1c8d-4cb2-85a9-7b29082b74b5', 'MISMATCH_5_25', "20's pack", 20, null, '5.00', '100.00', 'MedEx search: Fast Tasty Oral Saline Oral Powder ৳5.00 (20s pack: ৳100.00).'],
  ['da2c5624-887d-4aee-b01a-ec896b40b706', 'MISMATCH_5_25', "20's pack", 20, null, '5.00', '100.00', 'MedEx search: Ibnsina Tasty Saline Oral Powder ৳5.00 (20s pack: ৳100.00).'],
  ['7cad2573-0ca5-4c34-bd6b-dbb355b6f4b5', 'MISMATCH_5_25', "20's pack", 20, null, '7.00', '140.00', 'MedEx search: ACI Fruit Sal Tasty Saline Oral Powder ৳7.00 (20s pack: ৳140.00).'],
  ['91efccb5-c02a-4fe3-968f-ad0ed2892b59', 'MISMATCH_5_25', "20's pack", 20, null, '8.50', '170.00', 'MedEx search: Ener-G Tasty Saline Oral Powder ৳8.50 (20s pack: ৳170.00).'],
  ['5d7c20b7-9643-4f1f-83ed-948dcf85584d', 'MISMATCH_5_25', "20's pack", 20, null, '5.00', '100.00', 'MedEx search: Index Tasty Food Saline Oral Powder ৳5.00 (20s pack: ৳100.00).'],
  ['8e61b170-d578-48bc-91bd-d9868a4ea517', 'MISMATCH_5_25', "20's pack", 20, null, '7.00', '140.00', 'MedEx search: Acme Tasty Saline Oral Powder ৳7.00 (20s pack: ৳140.00).'],
  ['2a61ee14-3003-4af9-97a5-690b0a4f28b9', 'MISMATCH_5_25', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Goodmet 850 mg Tablet ৳5.00 (5 x 10: ৳250.00).'],
  ['6f095569-9959-4779-a8cb-111de191d8ca', 'MISMATCH_5_25', '2 x 10', 20, 10, '10.00', '200.00', 'MedEx search: Fexobest 180 mg Tablet ৳10.00 (2 x 10: ৳200.00).'],
  ['f878e114-a6a1-4207-ab28-01abc5ecf9ac', 'MISMATCH_5_25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Alerfast 180 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['1f07d491-a409-48bd-82d1-8765af90efbc', 'MISMATCH_5_25', '2 x 10', 20, 10, '9.00', '180.00', 'MedEx search: Fexocare 180 mg Tablet ৳9.00 (2 x 10: ৳180.00).'],
  ['fd5fca03-82df-4a4b-9e39-3a3446b868f0', 'MISMATCH_5_25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Fexonor 180 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['223f325d-6eff-4fe5-abfa-a99d8cc5ef60', 'MISMATCH_5_25', '2 x 10', 20, 10, '9.00', '180.00', 'MedEx search: Fexosic 180 mg Tablet ৳9.00 (2 x 10: ৳180.00).'],
  ['bf186c51-b40e-402c-a48e-873e59156733', 'MISMATCH_5_25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Ambfex 180 mg Tablet ৳9.00 (3 x 10: ৳270.00).'],
  ['117bf786-99c9-4e87-97fe-fdaeb42dd06c', 'MISMATCH_5_25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Fexen 180 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['506078a9-bc18-4771-a0a1-1651412b686a', 'MISMATCH_5_25', "20's pack", 20, null, '12.04', '240.80', 'MedEx search: Adora 1000 mg Capsule ৳12.04 (20s pack: ৳240.80).'],
  ['05c07441-a395-44fd-8f21-81ff2778559f', 'MISMATCH_5_25', '3 x 7', 21, 7, '50.00', '1050.00', 'MedEx search: Esuvast 20 mg Tablet ৳50.00 (3 x 7: ৳1,050.00).'],
  ['f07e95cf-cd6a-4c77-abf7-9917a74413c7', 'MISMATCH_5_25', '5 x 10', 50, 10, '7.00', '350.00', 'MedEx search: Esompus 20 mg EC Tablet ৳7.00 (5 x 10: ৳350.00).'],
  ['8b15c0dd-40af-4f9a-af5b-8a2a570d45f2', 'MISMATCH_5_25', '6 x 10', 60, 10, '3.00', '180.00', 'MedEx search: Esowell 20 mg EC Tablet ৳3.00 (6 x 10: ৳180.00).'],
  ['bad921f3-b611-4e19-9e94-b4c4aa56a870', 'MISMATCH_5_25', '3 x 10', 30, 10, '6.50', '195.00', 'MedEx search: Lexapro 5 mg Tablet ৳6.50 (3 x 10: ৳195.00).'],
  ['12d06de1-8604-45c7-a70d-d266e3a7b048', 'MISMATCH_5_25', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Nozma ODT 4 mg Dispersible Tablet ৳15.00 (3 x 10: ৳450.00).'],
  ['8471d799-63b7-47a6-82c5-7b8547805ba1', 'MISMATCH_5_25', '6 x 4', 24, 4, '30.00', '720.00', 'MedEx search: Mimoxclav 500+125 Tablet ৳30.00 (6 x 4: ৳720.00).'],
  ['a6a78125-0b96-4a63-a1a8-cc948f664b2e', 'MISMATCH_5_25', '5 x 6', 30, 6, '35.00', '1050.00', 'MedEx search: AmoxyClavulanic 500+125 (Pharmik) Tablet ৳35.00 (5 x 6: ৳1,050.00).'],
  ['3f49398c-49a2-4625-87c9-2f9604fe9529', 'MISMATCH_5_25', '3 x 6', 18, 6, '32.00', '576.00', 'MedEx search: Aristomox CV 500+125 Tablet ৳32.00 (3 x 6: ৳576.00).'],
  ['c0c0abd1-8f81-4e29-b401-665a81b17f4b', 'MISMATCH_5_25', '20 x 10', 200, 10, '0.30', '60.00', 'MedEx search: Cal Lactate 300 mg (Union) Tablet ৳0.30 (20 x 10: ৳60.00).'],
  ['a6c34232-5434-4062-a0bc-7f2e86a3474c', 'MISMATCH_5_25', '5 x 6', 30, 6, '10.00', '300.00', 'MedEx search: Pegaron 25 mg Capsule ৳10.00 (5 x 6: ৳300.00).'],
  ['500d40de-fcd5-410c-b7b7-c939134eedc3', 'MISMATCH_5_25', '4 x 7', 28, 7, '250.00', '7000.00', 'MedEx search: Gefikin 250 mg Tablet ৳250.00 (4 x 7: ৳7,000.00).'],
  ['be232e1b-f2b8-4438-84b6-fe9f2406173c', 'MISMATCH_5_25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Pregan 25 mg Capsule ৳10.00 (3 x 10: ৳300.00).'],
  ['a27af342-2a8f-408d-9ccb-d29a1cd956b9', 'MISMATCH_5_25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Nerfid 25 mg Capsule ৳9.00 (3 x 10: ৳270.00).'],
  ['3d0a2409-b197-4566-a30b-1c735b39bd45', 'MISMATCH_5_25', '3 x 10', 30, 10, '16.00', '480.00', 'MedEx search: Montium 10 mg Tablet ৳16.00 (3 x 10: ৳480.00).'],
  ['97ccf764-4cc8-4db7-ba90-d6b8a030c87c', 'MISMATCH_5_25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: G-Montelukast 10 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['b35603ca-b645-4ee3-b072-31cfb9ab2d33', 'MISMATCH_5_25', '2 x 10', 20, 10, '15.00', '300.00', 'MedEx search: Montison 10 mg Tablet ৳15.00 (2 x 10: ৳300.00).'],
  ['925e2fe8-8126-4868-8468-24c728573da3', 'MISMATCH_5_25', '3 x 10', 30, 10, '13.00', '390.00', 'MedEx search: M-K 10 mg Tablet ৳13.00 (3 x 10: ৳390.00).'],
  ['61adce49-4281-49be-9bd4-6e42003bb6bc', 'MISMATCH_5_25', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Egaba 25 mg Capsule ৳8.00 (3 x 10: ৳240.00).'],
  ['2665959e-7e9b-4be0-9a26-ad8c6f3b1575', 'MISMATCH_5_25', '5 x 6', 30, 6, '248.00', '7440.00', 'MedEx search: Gefitab 250 mg Tablet ৳248.00 (5 x 6: ৳7,440.00).'],
  ['df08e766-90c0-4247-894e-ab141a35be7e', 'MISMATCH_5_25', '3 x 10', 30, 10, '14.00', '420.00', 'MedEx search: Molly 10 mg Tablet ৳14.00 (3 x 10: ৳420.00).'],
  ['eadee06b-6e76-4a0e-bbb7-ee588eacf8f6', 'MISMATCH_5_25', '3 x 10', 30, 10, '16.00', '480.00', 'MedEx search: Monasic 10 mg Tablet ৳16.00 (3 x 10: ৳480.00).'],
  ['13b01380-3cae-4562-b007-f06a988721ef', 'MISMATCH_5_25', '3 x 10', 30, 10, '14.00', '420.00', 'MedEx search: Ambkust 10 mg Tablet ৳14.00 (3 x 10: ৳420.00).'],
  ['2bfd7e7c-2575-49f4-a6d4-21f7733a8eb1', 'MISMATCH_5_25', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Proximont 10 mg Tablet ৳15.00 (3 x 10: ৳450.00).'],
  ['76ba62f1-32d3-4131-bed1-a19f7d4460d5', 'MISMATCH_5_25', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Lungair 10 mg Tablet ৳15.00 (3 x 10: ৳450.00).'],
  ['b7c95496-d3a8-4993-bdda-16178dac8414', 'MISMATCH_5_25', '2 x 10', 20, 10, '30.00', '600.00', 'MedEx search: Nerfid 150 mg Capsule ৳30.00 (2 x 10: ৳600.00).'],
  ['8db7c4ba-d023-4364-bd2d-a7596159d059', 'MISMATCH_5_25', '5 x 6', 30, 6, '80.00', '2400.00', 'MedEx search: Megecare 160 mg Tablet ৳80.00 (5 x 6: ৳2,400.00).'],
  ['6998cf2b-d787-4fcf-9728-be6f51d20705', 'MISMATCH_5_25', '3 x 10', 30, 10, '90.00', '2700.00', 'MedEx search: Gistol 160 mg Tablet ৳90.00 (3 x 10: ৳2,700.00).'],
  ['ede14c58-b5e1-49d2-864a-b25b28dd539a', 'MISMATCH_5_25', '3 x 6', 18, 6, '17.00', '306.00', 'MedEx search & Arogga: Linamet ER 2.5+1000 Tablet ৳17.00 (3 x 6: ৳306.00); also resolves held VERIFY_REQ_55 non-divisible strip.'],
  ['9161d248-251a-4185-8058-2d9b91c94079', 'MISMATCH_5_25', "30's pack", 30, null, '16.05', '481.50', 'MedEx search: Diobis 10 mg Tablet ৳16.05 (30s pack: ৳481.50).'],
  ['ee8303cb-23a8-4312-b8fb-cb3badca317c', 'MISMATCH_5_25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Novetor 400 mg Tablet ৳9.00 (3 x 10: ৳270.00).'],
  ['fcfcaccc-b5a3-43be-a6b6-9499e1042630', 'MISMATCH_5_25', '5 x 10', 50, 10, '9.00', '450.00', 'MedEx search: Doxofast 400 mg Tablet ৳9.00 (5 x 10: ৳450.00).'],
  ['36894d3f-b267-469b-b2ae-ee70cb81ef22', 'MISMATCH_5_25', '5 x 10', 50, 10, '6.00', '300.00', 'MedEx search: Freeway 400 mg Tablet ৳6.00 (5 x 10: ৳300.00).'],
  ['98947485-7b5c-4c71-b5dd-da5a9852a77a', 'MISMATCH_5_25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Asmadox 400 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['650ee107-4628-4591-96d0-ecc84cfa9ef5', 'MISMATCH_5_25', '5 x 10', 50, 10, '9.00', '450.00', 'MedEx search: Doxofylline 400 mg (Zenith) Tablet ৳9.00 (5 x 10: ৳450.00).'],
  ['38a64aa2-5456-4463-8c2d-8b103a68c1ea', 'MISMATCH_5_25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Mitazapine 15 mg Tablet ৳9.00 (3 x 10: ৳270.00).'],
  ['2e0b744c-3eb1-4030-b9bf-f5b1a7152e4d', 'MISMATCH_5_25', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Doxoair 400 mg Tablet ৳12.00 (3 x 10: ৳360.00).'],
];

const HELD_FROM_BATCH9 = [
  {
    packId: 'fe59250d-2c90-41f0-ab70-7674514656cd',
    name: 'Sac Sweet 12.5 mg Tablet (Sonear)',
    reason: 'Exact MedEx MRP rounding (Unit Price ৳0.09 vs 300s pack ৳28.00; 3.7% delta on ৳0.09/unit). Held unchanged.',
  },
  {
    packId: '1a345901-2fd8-447a-80e6-7c9a665bca2a',
    name: 'Salpium 100+20 Inhaler (ACME)',
    reason: 'Complete inhaler pack price ৳250.76 matches MedEx verbatim; price_text_not_fully_parsed reflects alternate Refill price (৳230.69). Held unchanged.',
  },
  {
    packId: 'd99ca5ba-f4ff-43f2-bac5-a0d4a90adf26',
    name: 'Seroxyn 25+125 Inhaler (ACI)',
    reason: 'Complete inhaler pack price ৳596.79 matches MedEx verbatim; price_text_not_fully_parsed reflects alternate Refill price (৳500.00). Held unchanged.',
  },
  {
    packId: 'ae11796e-87dc-4f32-8d5a-c51376ffb3bd',
    name: 'Seroxyn 25+250 Inhaler (ACI)',
    reason: 'Complete inhaler pack price ৳797.39 matches MedEx verbatim; price_text_not_fully_parsed reflects alternate Refill price (৳700.00). Held unchanged.',
  },
  {
    packId: 'afe5becb-3df8-4d18-a3cb-201935e18886',
    name: 'Sulprex 100+20 Inhaler (Square)',
    reason: 'Complete inhaler pack price ৳250.75 matches MedEx verbatim; price_text_not_fully_parsed reflects alternate Refill price (৳230.69). Held unchanged.',
  },
  {
    packId: 'a31db718-77ac-42ec-aa04-849c1e169874',
    name: 'Ticamet 25+250 Inhaler (Square)',
    reason: 'Complete inhaler pack price ৳797.39 matches MedEx verbatim; price_text_not_fully_parsed reflects alternate Refill price (৳695.00). Held unchanged.',
  },
  {
    packId: '74f470df-8e0d-40b4-bf50-c1b234470fcf',
    name: 'Carmin 2.5 mg Capsule (Eskayef)',
    reason: 'No official MedEx/Arogga MRP published (held from Batch 7).',
  },
  {
    packId: 'fef5a0c4-4abd-4796-8488-7ab08de55c02',
    name: 'Carmin 5 mg Capsule (Eskayef)',
    reason: 'No official MedEx/Arogga MRP published (held from Batch 7).',
  },
  {
    packId: 'ac3fd8bf-d057-4a28-9f40-25720203e92a',
    name: 'Helicon V 20+1000+500 Tablet (General)',
    reason: 'Triple-therapy kit without published MedEx single/pack MRP (Arogga Box 4/14 unverified vs 30s template; held from Batch 6).',
  },
];

function validateRow(label, pu, su, u, pp, maxTol = 0.001) {
  if (pu !== null && su !== null) {
    if (su <= 1 || su > 100 || pu % su !== 0) {
      throw new Error(`Invalid strip/packUnits on ${label}: pu=${pu}, su=${su}`);
    }
  }
  if (u !== null && pu && pp !== null) {
    const exp = Number(u) * pu;
    const act = Number(pp);
    if (Math.abs(act - exp) / act > maxTol) {
      throw new Error(`Arithmetic mismatch on ${label}: ${u} * ${pu} = ${exp} vs ${act} (tol=${maxTol})`);
    }
  }
}

(async () => {
  const allSpecs = [...SUBBATCH_9A_SPECS, ...SUBBATCH_9B_SPECS];
  const ids = allSpecs.map((s) => s[0]);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Duplicate packId detected in Batch 9 specs');
  }

  const heldIds = HELD_FROM_BATCH9.map((h) => h.packId);
  if (new Set([...ids, ...heldIds]).size !== ids.length + heldIds.length) {
    throw new Error('Overlap detected between Batch 9 staged specs and held specs');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const { counts, packs, heldPacks } = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [generics, brands, packsTotal, pRows, hRows] = await Promise.all([
        tx.medicineGeneric.count(),
        tx.medicineBrand.count(),
        tx.medicinePack.count(),
        tx.medicinePack.findMany({
          where: { id: { in: ids } },
          include: { brand: { select: { sourceId: true, name: true, strength: true, dosageForm: true, manufacturer: true } } },
        }),
        tx.medicinePack.findMany({
          where: { id: { in: heldIds } },
          include: { brand: { select: { sourceId: true, name: true, strength: true, dosageForm: true, manufacturer: true } } },
        }),
      ]);
      return { counts: { generics, brands, packs: packsTotal }, packs: pRows, heldPacks: hRows };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 });

    const pMap = new Map(packs.map((p) => [p.id, p]));
    let warningsClearedCount = 0;

    const baselineRows = [];
    const stagedUpdates = allSpecs.map((spec) => {
      const [packId, subKind, pq, pu, su, unitPrice, packPrice, evidence, allowTol] = spec;
      const p = pMap.get(packId);
      if (!p) throw new Error(`Missing packId: ${packId}`);
      validateRow(`${p.brand.name} ${p.brand.strength ?? ''}`, pu, su, unitPrice, packPrice, allowTol ?? 0.001);

      const nextWarnings = (p.warnings || []).filter(
        (w) => w !== 'pack_price_inconsistent_with_unit_price' && w !== 'pack_not_divisible_by_strip',
      );
      if (nextWarnings.length < (p.warnings || []).length) warningsClearedCount++;

      baselineRows.push({
        packId: p.id,
        brandId: p.brandId,
        sourceId: p.brand.sourceId,
        brandName: p.brand.name,
        strength: p.brand.strength,
        packQuantity: p.packQuantity,
        packUnits: p.packUnits,
        stripUnits: p.stripUnits,
        unitPrice: p.unitPrice?.toString() ?? null,
        packPrice: p.packPrice?.toString() ?? null,
        warnings: p.warnings,
      });

      return {
        packId: p.id,
        brandId: p.brandId,
        sourceId: p.brand.sourceId,
        brandName: p.brand.name,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        manufacturer: p.brand.manufacturer,
        subKind,
        migrationKind: p.packUnits === pu ? 'SAME_PACK_UNITS' : 'PACK_MIGRATION',
        currentValues: {
          packQuantity: p.packQuantity,
          packUnits: p.packUnits,
          stripUnits: p.stripUnits,
          unitPrice: p.unitPrice?.toString() ?? null,
          packPrice: p.packPrice?.toString() ?? null,
          warnings: p.warnings,
        },
        proposedValues: {
          packQuantity: pq,
          packUnits: pu,
          stripUnits: su,
          unitPrice,
          packPrice,
          warnings: nextWarnings,
        },
        clearsWarning: nextWarnings.length < (p.warnings || []).length,
        evidence,
      };
    });

    if (heldPacks.length !== HELD_FROM_BATCH9.length) {
      throw new Error(`Expected ${HELD_FROM_BATCH9.length} held packs in DB, found ${heldPacks.length}`);
    }

    const snapPath = path.join(STAGING_DIR, 'pre_batch9_baseline_snapshot.json');
    fs.writeFileSync(snapPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      counts,
      targetPackCount: baselineRows.length,
      baselineRows,
    }, null, 2));

    const sub9A = stagedUpdates.filter((x) => x.subKind === 'NON_ARITH_WARN');
    const sub9B = stagedUpdates.filter((x) => x.subKind === 'MISMATCH_5_25');

    const manifest = {
      generatedAt: new Date().toISOString(),
      status: 'STAGED_READ_ONLY_NOT_EXECUTED',
      summary: {
        subbatch9A_nonArithWarn_count: sub9A.length,
        subbatch9B_mismatch5to25_count: sub9B.length,
        totalVerifiedStagedBatch9: stagedUpdates.length,
        samePackUnitsCount: stagedUpdates.filter((x) => x.migrationKind === 'SAME_PACK_UNITS').length,
        packMigrationCount: stagedUpdates.filter((x) => x.migrationKind === 'PACK_MIGRATION').length,
        warningsClearedCount,
        heldFromBatch9Count: HELD_FROM_BATCH9.length,
      },
      batch9Updates: stagedUpdates,
      heldFromBatch9: HELD_FROM_BATCH9,
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch9_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const fmtRow = (x) => `- **${x.brandName} ${x.strength ?? ''}** [${x.subKind}]: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``;

    const mdLines = [
      '# CareDose — Staged Batch 9 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 9 Summary',
      `- **Sub-batch 9A — Non-Arithmetic (<=5% err) Warning Packs (${sub9A.length}):** All verified warning packs excluding exact-rounding \`Sac Sweet\` and 5 dual-pack inhalers (\`Leukenib 400\`, \`Imakin 400\`, \`Olatab 100\`, \`Ameloss M 7+10\`, \`Glipagen Plus\`, \`Folimax 15\`, \`Lexapro 10\`, \`B stop 500\`, \`Charm 25\`, \`Nemine 4\`, \`Cytacin 4\`, \`Hispasin 4\`, \`H-CIN 4\`, \`Calfix C\`, \`CX-C\`, \`Azithromycin 250 Pharmik\`).`,
      `- **Sub-batch 9B — Remaining 5%–25% Arithmetic Mismatches (${sub9B.length}):** All verified 5%–25% mismatches across corrupted scraper templates and stale MRPs (incl. 22 Vit B1+B6+B12 / Fexofenadine 120 / \`u=7/240\`, 15 Pregabalin/Montelukast/Gefitinib \`u=9/252\` & \`15/420\`, 12 Oral Powders \`u=4.59/100\`, 8 Doxofylline 200 \`u=6/250\`, 7 Azithromycin 500 \`u=35/360\`, 7 A-Z Gold/Silver \`u=7/180.25\`, 7 Esomeprazole 40 \`u=9.03/300\`, 7 Fexofenadine 180 \`u=9.03/247.5\`, 7 Doxofylline 400/Mitazapine \`u=9.5/300\`, 6 Cefuroxime 250 \`12's pack\`, 6 Dispersible Tablets \`u=8/270\`, 6 Effervescent Calcium/Vitamin D \`u=10/110\`, 5 Ciprofloxacin 500 \`u=14/361.2\`, 5 Pantoprazole 40 \`u=6.02/273\`, 5 Paracetamol+Caffeine \`u=2/220\`, 4 Fluconazole 150 \`u=22/252\`, 4 Omeprazole 20 \`u=5/400\`, \`Ibrucon 140\`, \`Eltropag 50\`, \`Olapag 50\`, \`Cortiment 9\`, \`Golixen 150\`, \`Linamet ER 2.5+1000\` resolving held \`VERIFY_REQ_55\`, etc.).`,
      `- **Total Verified Batch 9 Updates:** **${manifest.summary.totalVerifiedStagedBatch9}** (\`${manifest.summary.samePackUnitsCount}\` same pack units + \`${manifest.summary.packMigrationCount}\` pack migrations), clearing **${warningsClearedCount}** pack warnings.`,
      `- **Held From Batch 9 (${HELD_FROM_BATCH9.length}):** \`Sac Sweet 12.5 mg\` (legitimate 3.7% rounding on \`৳0.09\` unit), 5 dual-pack inhalers (\`Salpium\`, \`Seroxyn 125\`, \`Seroxyn 250\`, \`Sulprex\`, \`Ticamet\`), \`Carmin 2.5 mg\` & \`Carmin 5 mg\` (unpriced), \`Helicon V\` (triple kit unverified).`,
      '',
      `## Sub-batch 9A (${sub9A.length})`,
      ...sub9A.map(fmtRow),
      '',
      `## Sub-batch 9B (${sub9B.length})`,
      ...sub9B.map(fmtRow),
      '',
      `## Held From Batch 9 (${HELD_FROM_BATCH9.length})`,
      ...HELD_FROM_BATCH9.map((h) => `- **${h.name}**: ${h.reason}`),
    ];

    const mdOut = path.join(STAGING_DIR, 'batch9_staging_report.md');
    fs.writeFileSync(mdOut, mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH9_STAGED_SUCCESSFULLY', summary: manifest.summary, snapPath, jsonOut, mdOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
