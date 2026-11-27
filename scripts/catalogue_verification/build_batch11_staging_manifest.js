/**
 * Strictly READ-ONLY builder for Batch 11 Staged Wave Manifest.
 * Covers ALL 156 remaining non-divisible strip packs in PostgreSQL post-Batch-10:
 *   - Sub-batch 11A (151): Verified MedEx divisible N x M strip packs (incl. 18 with live MedEx MRP changes
 *                          such as Afix 200 Cap ৳45, Beklo 25 ৳20.14, Cosec 40 Cap ৳8.05, Dalatic 300 ৳15.05,
 *                          Itracare SB 100 ৳20, Ngcef 200 ৳42, Alagra 180 ৳10, Midita 50 ৳42, Cefstar 500 1x8).
 *   - Sub-batch 11B (4):   Verified MedEx container/bottle packs whose stripUnits was mis-scraped from
 *                          sibling blister boxes (Coralcin-DX 15's & 30's, Greatnap 28's, Thyrox 25 mcg 100's);
 *                          clears stripUnits -> null while preserving exact verified bottle sizes and MRPs.
 *   - Optional Obsolete 2nd-Pack Delete (1): Deltasone 5 mg 250's pack (874311ac, 0 InventoryTransaction refs);
 *                          MedEx now lists only 17 x 30 (510 tabs @ ৳1.72 = ৳877.20) mapped onto sibling 266be55c.
 *
 * Strictly zero PostgreSQL writes (SET TRANSACTION READ ONLY).
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const rawDbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const dbUrl = rawDbUrl.includes('keepalives=')
  ? rawDbUrl
  : `${rawDbUrl}${rawDbUrl.includes('?') ? '&' : '?'}keepalives=1&keepalives_idle=10&keepalives_interval=5&keepalives_count=10`;
const { PrismaClient } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch11_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Format: [packId, subKind, packQuantity, packUnits, stripUnits, unitPrice, packPrice, evidence]
const BATCH11_UPDATE_SPECS = [
  ['f5025aa0-bf55-4524-b151-22144c42a5d5', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '7.05', '197.40', 'MedEx search: Acepril 10 mg Tablet ৳7.05 (2 x 14: ৳197.40).'],
  ['a9aab1b2-0de2-4225-822b-9922dcbf97b8', 'STRIP_DIVISIBLE', '4 x 14', 56, 14, '4.05', '226.80', 'MedEx search: Acepril 5 mg Tablet ৳4.05 (4 x 14: ৳226.80).'],
  ['157bbc92-95b2-47b3-ba16-6a99412d53dc', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '35.00', '490.00', 'MedEx search: Aegis 200 mg Capsule ৳35.00 (2 x 7: ৳490.00).'],
  ['aa1a3dbb-5ef8-43ec-b1e7-27f7a3d79ba8', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '50.00', '700.00', 'MedEx search: Aegis 400 mg Capsule ৳50.00 (2 x 7: ৳700.00).'],
  ['dda8cc43-7784-49eb-b6da-5b4946b5efad', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '45.00', '630.00', 'MedEx search: Afix 200 mg Capsule ৳45.00 (2 x 7: ৳630.00).'],
  ['0f3b7fbb-fab6-4f4a-b19f-ddc2add1a380', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '35.00', '490.00', 'MedEx search: Afix 200 mg Tablet ৳35.00 (2 x 7: ৳490.00).'],
  ['8b02c3d6-1ecc-4bd5-8c2a-c415e94867f4', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Alagra 180 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['ec0c8888-7f55-4a53-915c-c5e7474bd788', 'STRIP_DIVISIBLE', '3 x 6', 18, 6, '35.00', '630.00', 'MedEx search: Alzacare 28+10 XR Capsule ৳35.00 (3 x 6: ৳630.00).'],
  ['3d2d1bfa-1b84-43c7-96d6-53fac3de3085', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '40.00', '1120.00', 'MedEx search: Anacare 1 mg Tablet ৳40.00 (2 x 14: ৳1,120.00).'],
  ['ee27d4a2-b884-485f-849c-9cc546806c70', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '4.54', '190.68', 'MedEx search: Anset 4 mg Tablet ৳4.54 (3 x 14: ৳190.68).'],
  ['19026a25-f4b4-405a-a667-b4702f6613f0', 'STRIP_DIVISIBLE', '5 x 6', 30, 6, '16.00', '480.00', 'MedEx search: Antogin ER 500 mg Tablet ৳16.00 (5 x 6: ৳480.00).'],
  ['fe44b461-45c1-42db-b27e-e9a7d4acc6fb', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '85.00', '1020.00', 'MedEx search: Anulid 600 mg Tablet ৳85.00 (2 x 6: ৳1,020.00).'],
  ['80b610f6-3730-46e1-8cf5-f3d65478184c', 'STRIP_DIVISIBLE', '4 x 14', 56, 14, '7.00', '392.00', 'MedEx search: Arbitel 20 mg Tablet ৳7.00 (4 x 14: ৳392.00).'],
  ['85e962f7-4b42-4859-afaf-d986b211d68d', 'STRIP_DIVISIBLE', '4 x 14', 56, 14, '12.50', '700.00', 'MedEx search: Arbitel 40 mg Tablet ৳12.50 (4 x 14: ৳700.00).'],
  ['f786d107-c87b-4f22-a9c0-679180fff3b2', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '14.00', '588.00', 'MedEx search: Avas EZ 10+10 Tablet ৳14.00 (3 x 14: ৳588.00).'],
  ['87d2f17e-d185-46f6-845a-d2428a46985a', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '20.14', '563.92', 'MedEx search: Beklo 25 mg Tablet ৳20.14 (2 x 14: ৳563.92).'],
  ['1b58fac8-fcf6-4d57-9abe-7cf7e03a569d', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '15.00', '630.00', 'MedEx search: Beltas 20 mg Tablet ৳15.00 (3 x 14: ৳630.00).'],
  ['a566a42b-b9ea-4b52-baab-d9fff174218a', 'STRIP_DIVISIBLE', '7 x 4', 28, 4, '6.00', '168.00', 'MedEx search: Benadip 5+10 Capsule ৳6.00 (7 x 4: ৳168.00).'],
  ['664a1e90-8cd9-4047-bbb9-6c0ca9dc06f7', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '15.00', '630.00', 'MedEx search: Bilaten 20 mg Tablet ৳15.00 (3 x 14: ৳630.00).'],
  ['eb2bf3f1-af88-4894-b4a4-28a88565cd74', 'STRIP_DIVISIBLE', '2 x 21', 42, 21, '10.03', '421.26', 'MedEx search: Butaret SR 50 mg Tablet ৳10.03 (2 x 21: ৳421.26).'],
  ['99826ad4-e776-4f97-9f90-f9e3be05d4c8', 'STRIP_DIVISIBLE', '4 x 8', 32, 8, '10.00', '320.00', 'MedEx search: Calgi-D 500+200 Tablet ৳10.00 (4 x 8: ৳320.00).'],
  ['82519897-3a95-496e-9207-f8f882643a46', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '15.00', '420.00', 'MedEx search: Calnor 10+20 Tablet ৳15.00 (2 x 14: ৳420.00).'],
  ['86a5711a-4b48-45be-a75a-952edbfe6e45', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '22.00', '616.00', 'MedEx search: Calnor 10+40 Tablet ৳22.00 (2 x 14: ৳616.00).'],
  ['0fdf1d5d-b95b-43db-90c8-ac000db46c85', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '20.00', '560.00', 'MedEx search: Cardotel 5+80 Tablet ৳20.00 (2 x 14: ৳560.00).'],
  ['77279613-71fc-4963-925e-fc46aabd0d14', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '48.00', '576.00', 'MedEx search: Cefadyl 400 mg Capsule ৳48.00 (2 x 6: ৳576.00).'],
  ['21c58af6-4982-4a02-89a9-0b65a89b39ef', 'STRIP_DIVISIBLE', '1 x 8', 8, 8, '45.16', '361.28', 'MedEx search: Cefstar 500 mg Tablet ৳45.16 (Strip/Pack 8s: ৳361.28).'],
  ['fccd7016-0c2c-4803-a164-8535bc4a3b35', 'STRIP_DIVISIBLE', '4 x 7', 28, 7, '15.05', '421.40', 'MedEx search: Cephran 500 mg Capsule ৳15.05 (4 x 7: ৳421.40).'],
  ['ea584a08-8b1e-45e8-a010-0c91421e1900', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '50.00', '600.00', 'MedEx search: Ciko 500 mg Tablet ৳50.00 (2 x 6: ৳600.00).'],
  ['93bf4c0a-8e28-46df-a2a9-bc4100a538a3', 'STRIP_DIVISIBLE', '4 x 8', 32, 8, '25.00', '800.00', 'MedEx search: Citofer 210 mg Tablet ৳25.00 (4 x 8 / strip ৳200: ৳800.00).'],
  ['c8192412-af93-4fc3-9240-6898a1b5f322', 'STRIP_DIVISIBLE', '2 x 21', 42, 21, '12.03', '505.26', 'MedEx search: Clont 75 mg Tablet ৳12.03 (2 x 21: ৳505.26).'],
  ['2f5bca6e-37c4-4020-9952-29ce181e8c11', 'STRIP_DIVISIBLE', '2 x 21', 42, 21, '12.50', '525.00', 'MedEx search: Clontas 75+75 Tablet ৳12.50 (2 x 21: ৳525.00).'],
  ['02e1e492-8be9-49cd-863d-f1cac88aad3c', 'STRIP_DIVISIBLE', '3 x 15', 45, 15, '6.00', '270.00', 'MedEx search: Clonzy 0.5 mg Tablet ৳6.00 (3 x 15: ৳270.00).'],
  ['ab4307a8-5569-46e1-9453-c1df0058bc61', 'STRIP_DIVISIBLE', '5 x 15', 75, 15, '6.00', '450.00', 'MedEx search: Closid 0.5 mg Tablet ৳6.00 (5 x 15: ৳450.00).'],
  ['c0495590-f5a2-448b-a747-8b8c94b5c3a2', 'STRIP_DIVISIBLE', '4 x 15', 60, 15, '8.00', '480.00', 'MedEx search: Closid 1 mg Tablet ৳8.00 (4 x 15: ৳480.00).'],
  ['1b0fa124-4aa5-4e1c-bc9a-758798d36641', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '50.00', '1500.00', 'MedEx search: Cogniz 500 mg Tablet ৳50.00 (3 x 10: ৳1,500.00).'],
  ['3b5c45f3-134c-4ae5-9699-7b8cbd531cd7', 'CONTAINER_STRIP_CLEAR', "15's pack", 15, null, '15.00', '225.00', 'MedEx search: Coralcin-DX lists 1 x 15 pack (৳225.00) alongside 1 x 30 & 5 x 8; stripUnits=8 was mis-copied onto container pack.'],
  ['b03a7434-f528-4ab2-b16c-90f1d88ecb04', 'CONTAINER_STRIP_CLEAR', "30's pack", 30, null, '15.00', '450.00', 'MedEx search: Coralcin-DX lists 1 x 30 pack (৳450.00) alongside 1 x 15 & 5 x 8; stripUnits=8 was mis-copied onto container pack.'],
  ['d428d1ed-7b40-4460-869d-81cf187825d4', 'STRIP_DIVISIBLE', '15 x 14', 210, 14, '1.72', '361.20', 'MedEx search: Cortan 5 mg Tablet ৳1.72 (15 x 14: ৳361.20).'],
  ['98613e52-1da9-4c57-bd8b-5ffd38dae458', 'STRIP_DIVISIBLE', '6 x 7', 42, 7, '8.05', '338.10', 'MedEx search: Cosec 40 mg Capsule ৳8.05 (6 x 7: ৳338.10).'],
  ['dbd171e9-6f5d-4d50-add5-b51b79c0c042', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '7.00', '210.00', 'MedEx search: Cosec-MUPS 20 mg Tablet ৳7.00 (3 x 10: ৳210.00).'],
  ['0638cfd3-23c3-47d0-9c16-4e753b095a03', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '75.00', '900.00', 'MedEx search: Dabiren 75 mg Capsule ৳75.00 (2 x 6: ৳900.00).'],
  ['b334d961-cd2e-4895-a618-90ba4c5cf6f6', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '15.05', '210.70', 'MedEx search: Dalatic 300 mg Capsule ৳15.05 (2 x 7: ৳210.70).'],
  ['f86ee638-c8de-450a-9261-c9f662da4715', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '16.00', '480.00', 'MedEx search: Delanix 60 mg Capsule ৳16.00 (3 x 10: ৳480.00).'],
  ['524a5076-a062-4405-8e23-a6b20f7b69b7', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '35.00', '420.00', 'MedEx search: Delight 40000 IU Capsule ৳35.00 (2 x 6: ৳420.00).'],
  // Primary pack update for Deltasone 5 mg (obsolete 250's pack 874311ac staged in OPTIONAL_OBSOLETE_2PACK_DELETES):
  ['266be55c-ed38-464e-aaaf-f97d820ad9b5', 'STRIP_DIVISIBLE', '17 x 30', 510, 30, '1.72', '877.20', 'MedEx search: Deltasone 5 mg Tablet ৳1.72 (17 x 30: ৳877.20); replaces Kaggle 500s pack.'],
  ['d40ab412-b523-40ad-9f19-49941d475500', 'STRIP_DIVISIBLE', '4 x 12', 48, 12, '10.00', '480.00', 'MedEx search: Delzo 30 mg Capsule ৳10.00 (4 x 12: ৳480.00).'],
  ['e0e61a79-7f76-407c-8360-c9c1f52d066e', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '40.00', '1200.00', 'MedEx search: Demelon 3 mg Capsule ৳40.00 (3 x 10: ৳1,200.00).'],
  ['bed29a40-aa4c-4edc-a68d-36a79a01c386', 'STRIP_DIVISIBLE', '4 x 15', 60, 15, '4.00', '240.00', 'MedEx search: Des 5 mg Tablet ৳4.00 (4 x 15: ৳240.00).'],
  ['28609d0c-7c4d-4513-aca0-ffa8b423919e', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '11.00', '330.00', 'MedEx search: Dytor 5 mg Tablet ৳11.00 (3 x 10: ৳330.00).'],
  ['f4e057f5-bc3f-4257-b0c8-9785eb835312', 'STRIP_DIVISIBLE', '3 x 7', 21, 7, '30.00', '630.00', 'MedEx search: Emaglin-L 10+5 Tablet ৳30.00 (3 x 7: ৳630.00).'],
  ['59f657c7-f80b-4436-badc-79001e5bc358', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '40.00', '560.00', 'MedEx search: Emaglin-L 25+5 Tablet ৳40.00 (2 x 7: ৳560.00).'],
  ['e1268102-8d98-4f49-9617-7d3fe36df36b', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '35.00', '420.00', 'MedEx search: Emixef 200 mg Capsule ৳35.00 (2 x 6: ৳420.00).'],
  ['ccb25b61-5677-4f39-9eec-c18fbe27212d', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '35.00', '420.00', 'MedEx search: Emixef 200 mg Tablet ৳35.00 (2 x 6: ৳420.00).'],
  ['63ec512d-046d-421a-94f6-d214f3cf4416', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '10.00', '420.00', 'MedEx search: Epastat 50 mg Tablet ৳10.00 (3 x 14: ৳420.00).'],
  ['b0f4f05f-dbf8-4629-9581-9fef1f4fcf49', 'STRIP_DIVISIBLE', '1 x 10', 10, 10, '30.00', '300.00', 'MedEx search: Epicet 500 mg Tablet ৳30.00 (1 x 10: ৳300.00).'],
  ['f66af33f-19ae-47d5-a42f-ab4def8aee2f', 'STRIP_DIVISIBLE', '6 x 10', 60, 10, '10.00', '600.00', 'MedEx search: Eso MUPS 20 mg Tablet ৳10.00 (6 x 10: ৳600.00).'],
  ['3f9307c9-1e7a-47d8-8b4d-3c07773b14e9', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '8.00', '336.00', 'MedEx search: Esoral 40 mg EC Tablet ৳8.00 (3 x 14: ৳336.00).'],
  ['12985ba2-a859-460f-aa0e-183c11a2a196', 'STRIP_DIVISIBLE', '5 x 14', 70, 14, '10.00', '700.00', 'MedEx search: Esoral MUPS 20 mg Tablet ৳10.00 (5 x 14: ৳700.00).'],
  ['6d59a9ba-fa2d-42db-8574-20ab4bc54db2', 'STRIP_DIVISIBLE', '4 x 14', 56, 14, '3.00', '168.00', 'MedEx search: Famotid 20 mg Tablet ৳3.00 (4 x 14: ৳168.00).'],
  ['15e4ee25-fee1-4d0b-8b7d-ead8972da14f', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '12.00', '504.00', 'MedEx search: Febuxit 40 mg Tablet ৳12.00 (3 x 14: ৳504.00).'],
  ['a4c15388-0116-46ee-b26f-bf7d1b9431b4', 'STRIP_DIVISIBLE', '4 x 6', 24, 6, '22.00', '528.00', 'MedEx search: Flamfix 750 mg Tablet ৳22.00 (4 x 6: ৳528.00).'],
  ['a77ce018-130a-4c65-a000-6444f652986e', 'STRIP_DIVISIBLE', '10 x 6', 60, 6, '5.50', '330.00', 'MedEx search: Flubex 250 mg Capsule ৳5.50 (10 x 6: ৳330.00).'],
  ['da29e6cf-ea5d-4bad-8362-1b20337b80a2', 'STRIP_DIVISIBLE', '4 x 10', 40, 10, '8.00', '320.00', 'MedEx search: Flunol 50 mg Capsule ৳8.00 (4 x 10: ৳320.00).'],
  ['a765612e-d1d7-4b61-9d81-56df50a02dfd', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '9.00', '252.00', 'MedEx search: Foly 5 mg Tablet ৳9.00 (2 x 14: ৳252.00).'],
  ['7406739a-6414-49aa-a300-bdfb097945ed', 'STRIP_DIVISIBLE', '5 x 4', 20, 4, '8.03', '160.60', 'MedEx search: Fungitrol 50 mg Capsule ৳8.03 (5 x 4: ৳160.60).'],
  ['1244be1a-0fd7-4fe2-b080-dcef93039300', 'STRIP_DIVISIBLE', '3 x 6', 18, 6, '21.00', '378.00', 'MedEx search: Furotil Plus 125+31.25 Tablet ৳21.00 (3 x 6: ৳378.00).'],
  ['a82c5b8a-d42a-45ab-b115-e0e3125b67da', 'STRIP_DIVISIBLE', '5 x 6', 30, 6, '45.00', '1350.00', 'MedEx search: Gaba-P CR 330 mg Tablet ৳45.00 (5 x 6: ৳1,350.00).'],
  ['57036aae-fefc-454f-8f3c-8152ade19e82', 'STRIP_DIVISIBLE', '3 x 7', 21, 7, '8.00', '168.00', 'MedEx search: Glucotin-Plus 250+200 Tablet ৳8.00 (3 x 7: ৳168.00).'],
  ['406e495d-86af-4d5e-97f3-8bf18ed74690', 'STRIP_DIVISIBLE', '4 x 7', 28, 7, '6.00', '168.00', 'MedEx search: Glymax 1 mg Tablet ৳6.00 (4 x 7: ৳168.00).'],
  ['87dabe5f-ebb3-46e5-ad4c-f1fe153a6f25', 'STRIP_DIVISIBLE', '4 x 7', 28, 7, '12.00', '336.00', 'MedEx search: Glymax 3 mg Tablet ৳12.00 (4 x 7: ৳336.00).'],
  ['5220923e-bf5b-4926-9bd6-476184e66955', 'STRIP_DIVISIBLE', '4 x 7', 28, 7, '15.00', '420.00', 'MedEx search: Glymax 4 mg Tablet ৳15.00 (4 x 7: ৳420.00).'],
  ['ad07e671-8ebf-46c1-9d9c-802e0a46ec68', 'CONTAINER_STRIP_CLEAR', "28's pack", 28, null, '10.00', '280.00', 'MedEx search: Greatnap 500+20 DR Tablet lists 28s pack (৳280.00 @ ৳10.00); clear stale stripUnits=10 from non-divisible 28s pack.'],
  ['befe7595-3e08-483a-a5f7-f63ef47e192e', 'STRIP_DIVISIBLE', '7 x 8', 56, 8, '5.00', '280.00', 'MedEx search: Hematin FZ Tablet ৳5.00 (7 x 8: ৳280.00).'],
  ['63d51843-aca3-4f32-bc6e-fc41969eef42', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '7.06', '296.52', 'MedEx search: Hypen Plus 2+0.625 Tablet ৳7.06 (3 x 14: ৳296.52).'],
  ['860b3a77-dc9e-49e6-b67a-9b2e1ab281fd', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '12.09', '338.52', 'MedEx search: Hypen Plus 4+1.25 Tablet ৳12.09 (2 x 14: ৳338.52).'],
  ['1a81db63-3850-4276-af0c-1d86fb83bbb2', 'STRIP_DIVISIBLE', '3 x 6', 18, 6, '28.00', '504.00', 'MedEx search: Itra 200 mg Tablet ৳28.00 (3 x 6: ৳504.00).'],
  ['94b00724-ac48-42c5-9b0e-78b4902354bd', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Itracare SB 100 mg Capsule ৳20.00 (3 x 10: ৳600.00).'],
  ['1660e2d3-4b35-4ded-ad8f-d1f03dd9937c', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Itracare SB 65 mg Capsule ৳15.00 (3 x 10 / strip ৳150: ৳450.00).'],
  ['479a3854-1cd1-4288-b841-7ce50871c585', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '28.00', '336.00', 'MedEx search: Itrafun 200 mg Tablet ৳28.00 (2 x 6: ৳336.00).'],
  ['a8b5834e-3130-4436-9322-b9de087d53d6', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Itrasuba 65 mg Capsule ৳15.00 (3 x 10: ৳450.00).'],
  ['e7ba2194-8118-4ecd-b232-9bf1883833d9', 'STRIP_DIVISIBLE', '3 x 6', 18, 6, '25.00', '450.00', 'MedEx search: Kilbac 250 mg Tablet ৳25.00 (3 x 6: ৳450.00).'],
  ['f808a4bf-47dd-483f-bab4-fb498bc07fb5', 'STRIP_DIVISIBLE', '3 x 4', 12, 4, '45.00', '540.00', 'MedEx search: Kilbac 500 mg Tablet ৳45.00 (3 x 4: ৳540.00).'],
  ['5b6274a5-dc68-48b5-a6f7-a2945e0f2a7e', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '15.00', '210.00', 'MedEx search: Kilmax 125 mg Tablet ৳15.00 (2 x 7: ৳210.00).'],
  ['1858948b-c826-43e0-85aa-f073a667ea63', 'STRIP_DIVISIBLE', '2 x 8', 16, 8, '25.00', '400.00', 'MedEx search: Kilmax 250 mg Tablet ৳25.00 (2 x 8: ৳400.00).'],
  ['16e7b49c-effe-4dea-882d-4a715e635940', 'STRIP_DIVISIBLE', '2 x 5', 10, 5, '40.00', '400.00', 'MedEx search: Letrozol 2.5 mg Tablet ৳40.00 (2 x 5: ৳400.00).'],
  ['91aa5bce-5f09-4cb1-9ecf-78b306d63d3d', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '12.00', '336.00', 'MedEx search: Losita 10 mg Tablet ৳12.00 (2 x 14: ৳336.00).'],
  ['f25062bc-4890-4bda-9b4e-4d2d03bd70df', 'STRIP_DIVISIBLE', '5 x 14', 70, 14, '4.00', '280.00', 'MedEx search: Lumexit 0.5+10 Tablet ৳4.00 (5 x 14: ৳280.00).'],
  ['dda27e3e-51e1-4c3b-aadf-1852e5b94311', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '45.00', '540.00', 'MedEx search: Lyric CR 330 mg Tablet ৳45.00 (2 x 6: ৳540.00).'],
  ['096c0a0f-14cb-4d5d-a3e3-2448c9a4b564', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Meglu ER 1000 mg Tablet ৳9.00 (3 x 10: ৳270.00).'],
  ['d6c65c31-837f-4594-a762-038640185462', 'STRIP_DIVISIBLE', '3 x 15', 45, 15, '5.00', '225.00', 'MedEx search: Mepred 4 mg Tablet ৳5.00 (3 x 15: ৳225.00).'],
  ['fb767128-ffa1-4dc0-b3af-62bbfc974682', 'STRIP_DIVISIBLE', '4 x 14', 56, 14, '3.00', '168.00', 'MedEx search: Methilon 2 mg Tablet ৳3.00 (4 x 14: ৳168.00).'],
  ['6caa9fc3-982b-4726-b682-80d43d3b8764', 'STRIP_DIVISIBLE', '4 x 14', 56, 14, '5.00', '280.00', 'MedEx search: Methilon 4 mg Tablet ৳5.00 (4 x 14: ৳280.00).'],
  ['c5d5c1c6-0e8f-4f1c-9f7f-82f03227d189', 'STRIP_DIVISIBLE', '1 x 4', 4, 4, '42.00', '168.00', 'MedEx search: Midita 50 mg Tablet ৳42.00 (1 x 4: ৳168.00).'],
  ['e24a4ce6-2af4-4245-9b2b-ccd77850f7ee', 'STRIP_DIVISIBLE', '4 x 8', 32, 8, '15.00', '480.00', 'MedEx search: Nabufen 500 mg Tablet ৳15.00 (4 x 8: ৳480.00).'],
  ['33705044-529f-40f4-9451-a4ce575f2a75', 'STRIP_DIVISIBLE', '4 x 8', 32, 8, '22.00', '704.00', 'MedEx search: Nabufen 750 mg Tablet ৳22.00 (4 x 8: ৳704.00).'],
  ['b09f8ad4-875f-4fea-8746-f533be075a30', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '22.00', '660.00', 'MedEx search: Nabumet 750 mg Tablet ৳22.00 (3 x 10: ৳660.00).'],
  ['a20c2d62-4521-41c0-aa16-12a9acb4c74a', 'STRIP_DIVISIBLE', '4 x 6', 24, 6, '22.00', '528.00', 'MedEx search: Nabunil 750 mg Tablet ৳22.00 (4 x 6: ৳528.00).'],
  ['34750286-ff0b-4132-975a-d92b2b597a9d', 'STRIP_DIVISIBLE', '4 x 6', 24, 6, '22.00', '528.00', 'MedEx search: Nabuton 750 mg Tablet ৳22.00 (4 x 6: ৳528.00).'],
  ['97bf06a8-fe7f-4cee-b8a0-ab3dbda72f1d', 'STRIP_DIVISIBLE', '7 x 4', 28, 4, '12.00', '336.00', 'MedEx search: NapExa 375+20 DR Tablet ৳12.00 (7 x 4: ৳336.00).'],
  ['779cc27d-09fd-4bbe-ad04-c5648979279f', 'STRIP_DIVISIBLE', '7 x 4', 28, 4, '16.00', '448.00', 'MedEx search: NapExa 500+20 DR Tablet ৳16.00 (7 x 4: ৳448.00).'],
  ['44215a75-3221-49c5-a271-498204bc3f30', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '12.00', '336.00', 'MedEx search: Nebilol Plus 5+12.5 Tablet ৳12.00 (2 x 14: ৳336.00).'],
  ['d3ec7c66-8a65-43b8-8a66-11568f96e567', 'STRIP_DIVISIBLE', '4 x 7', 28, 7, '7.02', '196.56', 'MedEx search: Nebinex 2.5 mg Tablet ৳7.02 (4 x 7: ৳196.56).'],
  ['ce8b268e-aed3-4f31-8433-c89a52713566', 'STRIP_DIVISIBLE', '10 x 10', 100, 10, '7.00', '700.00', 'MedEx search: NexCap 20 mg EC Capsule ৳7.00 (10 x 10: ৳700.00).'],
  ['d64ea301-a373-4f33-84c6-190f49545d0f', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '42.00', '588.00', 'MedEx search: Ngcef 200 mg Capsule ৳42.00 (2 x 7: ৳588.00).'],
  ['aef8c384-1d2d-4215-95f5-0a18ee51dd21', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '7.00', '294.00', 'MedEx search: Nidocard Retard 6.4 mg Tablet ৳7.00 (3 x 14: ৳294.00).'],
  ['53f1ac80-25a2-473f-8c03-36b2a00e7348', 'STRIP_DIVISIBLE', '5 x 4', 20, 4, '15.00', '300.00', 'MedEx search: Nivoloc 500 mg Tablet ৳15.00 (5 x 4: ৳300.00).'],
  ['c93368d4-b95f-4f74-be6a-6ccf26bad25f', 'STRIP_DIVISIBLE', '3 x 8', 24, 8, '28.00', '672.00', 'MedEx search: Nocandia 200 mg Tablet ৳28.00 (3 x 8: ৳672.00).'],
  ['8a737e40-5acd-43b4-870d-c74ed9971925', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '30.00', '900.00', 'MedEx search: Obecol 5 mg Tablet ৳30.00 (3 x 10: ৳900.00).'],
  ['985e9890-dd46-4368-a263-33c960f5e1f2', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '9.00', '378.00', 'MedEx search: Olsart Plus 20+12.5 Tablet ৳9.00 (3 x 14: ৳378.00).'],
  ['5f44bfa4-548d-4b04-b081-3654fcc98046', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '15.10', '634.20', 'MedEx search: Olsart Plus 40+12.5 Tablet ৳15.10 (3 x 14: ৳634.20).'],
  ['e1b2ab0c-a499-4657-9754-226f16a5e6c7', 'STRIP_DIVISIBLE', '4 x 7', 28, 7, '8.00', '224.00', 'MedEx search: Omep 40 mg EC Capsule ৳8.00 (4 x 7: ৳224.00).'],
  ['e765bad0-2b3b-487c-8c03-624feca2222e', 'STRIP_DIVISIBLE', '6 x 10', 60, 10, '5.00', '300.00', 'MedEx search: Omeprol 20 mg EC Capsule ৳5.00 (6 x 10: ৳300.00).'],
  ['1e3f4b78-054a-4d2a-8472-14c0a27cbf18', 'STRIP_DIVISIBLE', '10 x 14', 140, 14, '3.00', '420.00', 'MedEx search: Orgy 10 mg Tablet ৳3.00 (10 x 14: ৳420.00).'],
  ['a869c351-fad9-48b5-b72d-29d21f53de21', 'STRIP_DIVISIBLE', '4 x 10', 40, 10, '8.00', '320.00', 'MedEx search: Peptex 20 mg EC Capsule ৳8.00 (4 x 10: ৳320.00).'],
  ['81e38e98-27e8-42f9-b003-bdce49a75f03', 'STRIP_DIVISIBLE', '5 x 10', 50, 10, '8.00', '400.00', 'MedEx search: Piozena 15 mg Tablet ৳8.00 (5 x 10: ৳400.00).'],
  ['9a004b61-0b42-4631-8e48-053202b8c9da', 'STRIP_DIVISIBLE', '3 x 6', 18, 6, '80.00', '1440.00', 'MedEx search: Pirfedone 534 mg Tablet ৳80.00 (3 x 6: ৳1,440.00).'],
  ['7a509e5e-4d18-465f-914b-910e0c6e9618', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '125.00', '1500.00', 'MedEx search: Pirfedone 801 mg Tablet ৳125.00 (2 x 6: ৳1,500.00).'],
  ['576a346e-931e-4508-b202-c72e01d7aa93', 'STRIP_DIVISIBLE', '3 x 14', 42, 14, '6.00', '252.00', 'MedEx search: Prelizer-HTZ 2.5+6.25 Tablet ৳6.00 (3 x 14: ৳252.00).'],
  ['2867195f-5bd2-4737-b95e-5a9d169f76d2', 'STRIP_DIVISIBLE', '3 x 7', 21, 7, '8.00', '168.00', 'MedEx search: Presnor Plus 20+12.5 Tablet ৳8.00 (3 x 7: ৳168.00).'],
  ['eb5c48cf-e0de-432c-9e29-ff09fa50a3de', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '5.00', '150.00', 'MedEx search: Protium 20 mg EC Tablet ৳5.00 (3 x 10: ৳150.00).'],
  ['2b7b85c2-3e8b-47c9-91e3-a94a8546092f', 'STRIP_DIVISIBLE', '3 x 21', 63, 21, '10.00', '630.00', 'MedEx search: Queta 100 mg Tablet ৳10.00 (3 x 21: ৳630.00).'],
  ['bcfb7765-c58d-465c-a265-d59d30d3921a', 'STRIP_DIVISIBLE', '5 x 14', 70, 14, '3.00', '210.00', 'MedEx search: Queta 25 mg Tablet ৳3.00 (5 x 14: ৳210.00).'],
  ['fa4111ae-3efa-45ad-8fef-3cc490f7042b', 'STRIP_DIVISIBLE', '4 x 10', 40, 10, '8.00', '320.00', 'MedEx search: Rabenta 20 mg EC Capsule ৳8.00 (4 x 10: ৳320.00).'],
  ['1503cfad-a36d-4b0b-998b-9aa84cb568f0', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Rapasin 4 mg Capsule ৳12.00 (3 x 10: ৳360.00).'],
  ['4e687ed7-ea41-4ef3-904f-3d6651cc42db', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '25.00', '750.00', 'MedEx search: Rapasin 8 mg Capsule ৳25.00 (3 x 10: ৳750.00).'],
  ['c47fa58b-d96c-4979-98ea-5400558a5282', 'STRIP_DIVISIBLE', '3 x 6', 18, 6, '22.00', '396.00', 'MedEx search: Relanab 750 mg Tablet ৳22.00 (3 x 6: ৳396.00).'],
  ['ced089a5-5781-4a37-b7ec-dccbfa789bb8', 'STRIP_DIVISIBLE', '5 x 8', 40, 8, '40.00', '1600.00', 'MedEx search: Renolife 600 mg Tablet ৳40.00 (5 x 8: ৳1,600.00).'],
  ['04d518f7-63b4-4fc3-9d85-3203c3a7cbe7', 'STRIP_DIVISIBLE', '1 x 14', 14, 14, '24.00', '336.00', 'MedEx search: Resolax 2 mg Tablet ৳24.00 (1 x 14: ৳336.00 alongside 3 x 10).'],
  ['a75e3e24-0ca4-4452-863a-c085e0171950', 'STRIP_DIVISIBLE', '2 x 10', 20, 10, '23.00', '460.00', 'MedEx search: Rivadem 1.5 mg Capsule ৳23.00 (2 x 10: ৳460.00).'],
  ['ae75c2b5-84ad-4ad9-bdd1-a475ad4d5b38', 'STRIP_DIVISIBLE', '4 x 6', 24, 6, '7.75', '186.00', 'MedEx search: Sefacin 250 mg Capsule ৳7.75 (4 x 6: ৳186.00).'],
  ['9d3faece-1aad-41eb-8767-c706b4d867e8', 'STRIP_DIVISIBLE', '4 x 6', 24, 6, '12.50', '300.00', 'MedEx search: Sefacin 500 mg Capsule ৳12.50 (4 x 6: ৳300.00).'],
  ['d759932b-17e2-465b-b9f5-89aa6e898671', 'STRIP_DIVISIBLE', '12 x 4', 48, 4, '10.50', '504.00', 'MedEx search: Sinaflox 500 mg Capsule ৳10.50 (12 x 4: ৳504.00).'],
  ['a6bc102b-0964-4f08-9f7b-f496db991553', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Solicare 5 mg Tablet ৳15.00 (3 x 10: ৳450.00).'],
  ['72b4a2af-ac01-49a2-9c7d-e06d84dc160a', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '35.00', '420.00', 'MedEx search: Supraxim 200 mg Capsule ৳35.00 (2 x 6: ৳420.00).'],
  ['6e49fe5e-158c-41b5-a024-8342fdc22601', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Tamsin 0.4 mg MR Capsule ৳10.00 (3 x 10: ৳300.00).'],
  ['278481b3-417f-4358-9745-a791b9f3dcdd', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '12.50', '375.00', 'MedEx search: TelAmlo 5+40 Tablet ৳12.50 (3 x 10: ৳375.00).'],
  ['71a886c3-c37f-4a03-b944-9ec81bfd1a0d', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '12.50', '375.00', 'MedEx search: Telcardis 40 mg Tablet ৳12.50 (3 x 10: ৳375.00).'],
  ['e72f72cd-0884-496c-97c4-d27074269b8c', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Telcardis 80 mg Tablet ৳20.00 (3 x 10: ৳600.00).'],
  ['70819df0-b60b-4fe0-b315-f187c3350a9e', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '12.50', '375.00', 'MedEx search: Telcardis Plus 40+12.5 Tablet ৳12.50 (3 x 10: ৳375.00).'],
  ['90691001-7385-4118-a7f6-66cd1cf0bdec', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Telcardis Plus 80+12.5 Tablet ৳20.00 (3 x 10: ৳600.00).'],
  ['4433ef2a-039d-4fd2-9028-3443c94d3955', 'STRIP_DIVISIBLE', '3 x 10', 30, 10, '11.00', '330.00', 'MedEx search: Telmipres 80 mg Tablet ৳11.00 (3 x 10: ৳330.00).'],
  ['11d315c5-0414-438c-bcdd-722611eaaa60', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '6.05', '169.40', 'MedEx search: Tenobis Plus 2.5+6.25 Tablet ৳6.05 (2 x 14: ৳169.40).'],
  ['85893eab-2bd4-40dc-af1f-b54509ad7f5a', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '10.05', '281.40', 'MedEx search: Tenobis Plus 5+6.25 Tablet ৳10.05 (2 x 14: ৳281.40).'],
  ['07aae0f7-9091-445c-aa0a-4a8ea22f978b', 'CONTAINER_STRIP_CLEAR', "100's pack", 100, null, '1.11', '111.00', 'MedEx search: Thyrox 25 mcg lists 1 x 100 bottle (৳111.00) alongside 3 x 30 strips; clear stale stripUnits=30 copied from strip SKU.'],
  ['e42ea8e3-449e-4d4c-9f67-7091769d0a64', 'STRIP_DIVISIBLE', '2 x 14', 28, 14, '9.53', '266.84', 'MedEx search: Tritace 2.5 mg Tablet ৳9.53 (2 x 14: ৳266.84).'],
  ['e141691a-090d-44b2-a264-4385dcf08690', 'STRIP_DIVISIBLE', '4 x 8', 32, 8, '9.03', '288.96', 'MedEx search: Veripel SR 200 mg Capsule ৳9.03 (4 x 8: ৳288.96).'],
  ['f23b7554-cd3c-4d9b-8966-1ad37cfc9f91', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '50.15', '601.80', 'MedEx search: Vigorex 100 mg Tablet ৳50.15 (2 x 6: ৳601.80).'],
  ['8f65db04-1173-4b1e-bda7-49a107a93b32', 'STRIP_DIVISIBLE', '2 x 5', 10, 5, '20.06', '200.60', 'MedEx search: Vigorex 25 mg Tablet ৳20.06 (2 x 5: ৳200.60).'],
  ['980c279e-c1ac-483e-bb8c-0cc37625b1f0', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '30.10', '361.20', 'MedEx search: Vigorex 50 mg Tablet ৳30.10 (2 x 6: ৳361.20).'],
  ['f308f2df-eadb-491c-9a1b-5ed0a796950b', 'STRIP_DIVISIBLE', '6 x 10', 60, 10, '6.00', '360.00', 'MedEx search: Xelmet 500 mg Tablet ৳6.00 (6 x 10: ৳360.00).'],
  ['e8e9b8c2-8a3c-4e01-8c67-aef65dafa81a', 'STRIP_DIVISIBLE', '2 x 7', 14, 7, '40.00', '560.00', 'MedEx search: Xfin 250 mg Tablet ৳40.00 (2 x 7: ৳560.00).'],
  ['f7e80ec3-5138-40b7-b27d-6fed65315d81', 'STRIP_DIVISIBLE', '2 x 15', 30, 15, '10.00', '300.00', 'MedEx search: Xidolac 10 mg Tablet ৳10.00 (2 x 15: ৳300.00).'],
  ['9525689f-d772-4919-9ed0-055941309cf1', 'STRIP_DIVISIBLE', '2 x 6', 12, 6, '45.00', '540.00', 'MedEx search: Ximorox 500 mg Tablet ৳45.00 (2 x 6: ৳540.00).'],
  ['7820472a-4d68-4836-841a-b46bf97fd8cf', 'STRIP_DIVISIBLE', '3 x 4', 12, 4, '10.07', '120.84', 'MedEx search: Zoana 500 mg Tablet ৳10.07 (3 x 4: ৳120.84).'],
  ['3760f7c6-6261-43a8-a587-f07117f17231', 'STRIP_DIVISIBLE', '5 x 10', 50, 10, '10.07', '503.50', 'MedEx search: Zoxan 500 mg Tablet ৳10.07 (5 x 10: ৳503.50).'],
];

const OPTIONAL_OBSOLETE_2PACK_DELETES = [
  {
    packId: '874311ac-03a4-4b64-9e5b-81fce0cc9e17',
    brandId: 'a26fecc3-e41d-4a8b-b14c-08f42132e5dc',
    brandName: 'Deltasone',
    strength: '5 mg',
    dosageForm: 'Tablet',
    primaryKeptPackId: '266be55c-ed38-464e-aaaf-f97d820ad9b5',
    reason: 'Kaggle imported both 250s (৳1.72/430) and 500s (৳1.72/860); MedEx now lists only 17 x 30 (510 tabs @ ৳1.72 = ৳877.20) mapped onto sibling 266be55c. 0 InventoryTransaction rows reference this pack.',
  },
];

(async () => {
  const specPackIds = BATCH11_UPDATE_SPECS.map((s) => s[0]);
  const optionalDelIds = OPTIONAL_OBSOLETE_2PACK_DELETES.map((d) => d.packId);
  const allTargetIds = [...specPackIds, ...optionalDelIds];

  if (new Set(allTargetIds).size !== allTargetIds.length) {
    throw new Error('Duplicate packId detected across Batch 11 specs/deletes');
  }

  for (const [, subKind, pq, pu, su, unitStr, packStr] of BATCH11_UPDATE_SPECS) {
    if (subKind === 'STRIP_DIVISIBLE') {
      if (!Number.isInteger(su) || su <= 1 || su > 100 || !Number.isInteger(pu) || pu % su !== 0) {
        throw new Error(`Invalid strip/pack divisibility: ${pq} pu=${pu} su=${su}`);
      }
    } else if (subKind === 'CONTAINER_STRIP_CLEAR') {
      if (su !== null || !Number.isInteger(pu) || pu <= 0) {
        throw new Error(`Invalid container clear spec: ${pq} pu=${pu} su=${su}`);
      }
    } else {
      throw new Error(`Unknown subKind: ${subKind}`);
    }
    const relErr = Math.abs(Number(unitStr) * pu - Number(packStr)) / Number(packStr);
    if (relErr > 0.0001) {
      throw new Error(`Arithmetic mismatch >0.01% in ${pq}: ${unitStr} * ${pu} != ${packStr}`);
    }
  }

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const db = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [generics, brands, packs, dbPacks, delPacks, allNonDivPacks] = await Promise.all([
        tx.medicineGeneric.count(),
        tx.medicineBrand.count(),
        tx.medicinePack.count(),
        tx.medicinePack.findMany({
          where: { id: { in: specPackIds } },
          include: {
            brand: { select: { id: true, sourceId: true, name: true, strength: true, dosageForm: true, manufacturer: true } },
            _count: { select: { inventoryTransactions: true } },
          },
        }),
        tx.medicinePack.findMany({
          where: { id: { in: optionalDelIds } },
          include: {
            brand: { select: { id: true, sourceId: true, name: true, strength: true, dosageForm: true, manufacturer: true } },
            _count: { select: { inventoryTransactions: true } },
          },
        }),
        tx.$queryRawUnsafe(`
          SELECT id, "brandId", "packUnits", "stripUnits"
          FROM "MedicinePack"
          WHERE "stripUnits" IS NOT NULL AND "packUnits" IS NOT NULL
            AND "stripUnits" > 1 AND "packUnits" % "stripUnits" <> 0
        `),
      ]);
      return { counts: { generics, brands, packs }, dbPacks, delPacks, allNonDivPacks };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 120000 });

    const pMap = new Map(db.dbPacks.map((p) => [p.id, p]));
    const dMap = new Map(db.delPacks.map((p) => [p.id, p]));
    const nonDivSet = new Set(db.allNonDivPacks.map((r) => r.id));

    if (nonDivSet.size !== allTargetIds.length) {
      throw new Error(`Non-divisible count drift: DB=${nonDivSet.size} vs Batch11=${allTargetIds.length}`);
    }
    for (const id of allTargetIds) {
      if (!nonDivSet.has(id)) throw new Error(`Expected pack ${id} to be non-divisible in DB`);
    }

    const baselineRows = [];
    const stagedUpdates = BATCH11_UPDATE_SPECS.map(([packId, subKind, pq, pu, su, unitPrice, packPrice, evidence]) => {
      const p = pMap.get(packId);
      if (!p) throw new Error(`Missing target pack in DB: ${packId}`);

      baselineRows.push({
        packId: p.id,
        brandId: p.brandId,
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
          warnings: p.warnings,
        },
        inventoryTransactionsCount: p._count.inventoryTransactions,
        evidence,
      };
    });

    const optionalDeletes = OPTIONAL_OBSOLETE_2PACK_DELETES.map((del) => {
      const p = dMap.get(del.packId);
      if (!p || p.brandId !== del.brandId) throw new Error(`Missing optional delete pack: ${del.packId}`);
      if (p._count.inventoryTransactions !== 0) throw new Error(`Refusing optional delete with transactions: ${del.packId}`);
      return {
        ...del,
        sourceId: p.brand.sourceId,
        manufacturer: p.brand.manufacturer,
        currentValues: {
          packQuantity: p.packQuantity,
          packUnits: p.packUnits,
          stripUnits: p.stripUnits,
          unitPrice: p.unitPrice?.toString() ?? null,
          packPrice: p.packPrice?.toString() ?? null,
          warnings: p.warnings,
        },
        inventoryTransactionsCount: p._count.inventoryTransactions,
      };
    });

    const snapPath = path.join(STAGING_DIR, 'pre_batch11_baseline_snapshot.json');
    fs.writeFileSync(snapPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      counts: db.counts,
      nonDivisibleStripBaselineCount: db.allNonDivPacks.length,
      targetPackCount: baselineRows.length,
      baselineRows,
      optionalDeleteBaselineRows: optionalDeletes,
    }, null, 2));

    const sub11A = stagedUpdates.filter((x) => x.subKind === 'STRIP_DIVISIBLE');
    const sub11B = stagedUpdates.filter((x) => x.subKind === 'CONTAINER_STRIP_CLEAR');

    const manifest = {
      generatedAt: new Date().toISOString(),
      status: 'STAGED_READ_ONLY_NOT_EXECUTED',
      summary: {
        subbatch11A_divisibleStrip_updates: sub11A.length,
        subbatch11B_containerStripClear_updates: sub11B.length,
        optionalObsolete2PackDeletes: optionalDeletes.length,
        totalVerifiedUpdates: stagedUpdates.length,
        totalWritesWithOptionalDelete: stagedUpdates.length + optionalDeletes.length,
        postBatch11ProjectedNonDivisibleIfDeleteHeld: optionalDeletes.length,
        postBatch11ProjectedNonDivisibleIfDeleteApproved: 0,
      },
      batch11Updates: stagedUpdates,
      optionalObsolete2PackDeletes: optionalDeletes,
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch11_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const fmtRow = (x) => `- **${x.brandName} ${x.strength ?? ''} (${x.dosageForm})** [${x.subKind}]: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``;

    const mdLines = [
      '# CareDose — Staged Batch 11 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 11 Summary',
      `- **Coverage:** All **156** remaining non-divisible strip packs post-Batch-10 (\`151\` divisible \`N x M\` updates + \`4\` verified container packs with stale \`stripUnits\` cleared to \`null\` + \`1\` optional obsolete second-pack delete).`,
      `- **Sub-batch 11A — Verified Divisible \`N x M\` Strips (${sub11A.length}):** Aligned via individual MedEx search across every brand (catching live MedEx MRPs/pack changes such as \`Afix 200 Cap ৳45\`, \`Alagra 180 ৳10\`, \`Beklo 25 ৳20.14\`, \`Cefstar 500 1x8\`, \`Cosec 40 Cap ৳8.05\`, \`Dalatic 300 ৳15.05\`, \`Itracare SB 100 ৳20\`, \`Kilbac 250/500\`, \`Kilmax 125/250\`, \`Midita 50 1x4\`, \`Ngcef 200 ৳42\`, \`Piozena 15 5x10\`, \`Vigorex 25/50/100\`, \`Zoana 500 3x4\`).`,
      `- **Sub-batch 11B — Container Packs Clearing Stale \`stripUnits\` (${sub11B.length}):** \`Coralcin-DX 15's\` & \`30's\`, \`Greatnap 28's\`, and \`Thyrox 25 mcg 100's\` are active container packs on MedEx; clears \`stripUnits -> null\` while keeping verified unit/pack prices.`,
      `- **Optional Obsolete Second-Pack Delete (${optionalDeletes.length}):** \`Deltasone 5 mg 250's\` (\`874311ac\`, \`0\` \`InventoryTransaction\` refs; MedEx lists only \`17 x 30\`). Passing \`--delete-obsolete-deltasone250\` reduces remaining non-divisible strips to **0**!`,
      '',
      `## Sub-batch 11A — Divisible N x M Strip Updates (${sub11A.length})`,
      ...sub11A.map(fmtRow),
      '',
      `## Sub-batch 11B — Container Strip-Metadata Clears (${sub11B.length})`,
      ...sub11B.map(fmtRow),
      '',
      `## Optional Obsolete Second-Pack Delete (${optionalDeletes.length})`,
      ...optionalDeletes.map((d) => `- **${d.brandName} ${d.strength}** (\`${d.packId}\`, \`${d.currentValues.packQuantity}\` @ \`${d.currentValues.unitPrice}/${d.currentValues.packPrice}\`, \`inventoryTransactions=${d.inventoryTransactionsCount}\`): ${d.reason}`),
    ];

    const mdOut = path.join(STAGING_DIR, 'batch11_staging_report.md');
    fs.writeFileSync(mdOut, mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH11_STAGED_SUCCESSFULLY', summary: manifest.summary, snapPath, jsonOut, mdOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
