/**
 * Strictly READ-ONLY builder for Batch 7 Staged Wave Manifest.
 * Covers 141 verified repairs across all remaining >=25% non-(8/280) arithmetic outliers:
 *   - Sub-batch 7A (34): Corrupted u=12.04/pp=300.48 Capsule template packs (holds Carmin 2.5 & 5 mg: officially unpriced)
 *   - Sub-batch 7B (107): Remaining >=25% arithmetic mismatches (incl. 2 held Goodmet/Diabest, 17 Coral Calcium 500+200 u=10/400,
 *                         10 Aceclofenac 100 u=4/300, 9 Lenvatinib 4/10, 5 Injections u=10.2/65, 4 Empagliflozin 25 u=40/500, etc.)
 * All 141 verified via grounded web search without direct MedEx scraping.
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const dbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch7_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Format: [packId, subKind, pq, pu, su, unitPrice, packPrice, evidence]
const SUBBATCH_7A_SPECS = [
  ['f55d4bd2-12d5-4875-826f-e63ddf46067a', 'U12_04_PP300_48', '2 x 6', 12, 6, '900.00', '10800.00', 'MedEx search: Larocent 100 mg Capsule ৳900.00 (2 x 6: ৳10,800.00).'],
  ['2148d8a9-eb2a-4094-af9a-b448daa98330', 'U12_04_PP300_48', '2 x 6', 12, 6, '400.00', '4800.00', 'MedEx search: Larocent 25 mg Capsule ৳400.00 (2 x 6: ৳4,800.00).'],
  ['055a701e-f15c-4364-b47e-1da493423146', 'U12_04_PP300_48', '3 x 10', 30, 10, '40.00', '1200.00', 'MedEx search: FertilOva 25 mg Capsule ৳40.00 (3 x 10: ৳1,200.00).'],
  ['20774fa8-59d3-4e72-b261-aa1916d2acc3', 'U12_04_PP300_48', '3 x 10', 30, 10, '25.00', '750.00', 'MedEx search: Bioflora 10 billion Capsule ৳25.00 (3 x 10: ৳750.00).'],
  ['f90c4421-2104-4442-98c0-5260c0f39479', 'U12_04_PP300_48', '2 x 15', 30, 15, '40.00', '1200.00', 'MedEx search: ALA 500 mg Capsule ৳40.00 (2 x 15: ৳1,200.00).'],
  ['c0dc66bc-8104-4d26-a474-3ae219cefc08', 'U12_04_PP300_48', '3 x 10', 30, 10, '75.00', '2250.00', 'MedEx search: Gynositol 500 mg Capsule ৳75.00 (3 x 10: ৳2,250.00).'],
  ['a9242ab7-3451-4d54-87b2-85807816ff31', 'U12_04_PP300_48', '3 x 10', 30, 10, '25.00', '750.00', 'MedEx search & Arogga: Laxicarbon 500 mg Capsule ৳25.00 (3 x 10: ৳750.00).'],
  ['dcab2bde-5751-44fa-b256-22440b4773f3', 'U12_04_PP300_48', '2 x 10', 20, 10, '40.00', '800.00', 'MedEx search & Arogga: Linzela 72 mcg Capsule ৳40.00 (2 x 10: ৳800.00).'],
  ['db21f80d-372d-40bf-ac78-0497b4d6a985', 'U12_04_PP300_48', '10 x 5', 50, 5, '380.00', '19000.00', 'MedEx search & Arogga: Sandimmun Neoral 100 mg Capsule ৳380.00 (10 x 5: ৳19,000.00).'],
  ['68f5d606-57b9-454b-8ab0-8984f567a743', 'U12_04_PP300_48', '10 x 5', 50, 5, '95.00', '4750.00', 'MedEx search & Arogga: Sandimmun Neoral 25 mg Capsule ৳95.00 (10 x 5: ৳4,750.00).'],
  ['dcbf81b7-f709-40c1-a9ab-606bfcd3a5e6', 'U12_04_PP300_48', '10 x 5', 50, 5, '190.00', '9500.00', 'MedEx search & Arogga: Sandimmun Neoral 50 mg Capsule ৳190.00 (10 x 5: ৳9,500.00).'],
  ['8f6378f8-2971-4f40-ac63-07323e9b565d', 'U12_04_PP300_48', '3 x 10', 30, 10, '185.00', '5550.00', 'MedEx search: Broncho-Vaxom 7 mg Capsule ৳185.00 (3 x 10: ৳5,550.00).'],
  ['026da0e8-68c1-4a2f-ad7c-e9b3ad88d4f9', 'U12_04_PP300_48', '1 x 10', 10, 10, '150.00', '1500.00', 'MedEx search: Linzela 290 mcg Capsule ৳150.00 (1 x 10: ৳1,500.00).'],
  ['09f249dd-ba70-449e-ad41-46c27992d8ac', 'U12_04_PP300_48', '1 x 6', 6, 6, '200.00', '1200.00', 'MedEx search & Arogga: Otes 150 mg Capsule ৳200.00 (1 x 6: ৳1,200.00).'],
  ['a7526de2-f55c-43a1-a28d-e5346fd87cd3', 'U12_04_PP300_48', '3 x 10', 30, 10, '4.00', '120.00', 'MedEx search: Doset 100 mg Capsule ৳4.00 (3 x 10: ৳120.00).'],
  ['03b524cb-82e0-49ca-9cbd-666104f255ae', 'U12_04_PP300_48', '1 x 10', 10, 10, '1200.00', '12000.00', 'MedEx search: Lotenib 100 mg Capsule ৳1,200.00 (1 x 10: ৳12,000.00).'],
  ['0e29c6e8-7221-4bce-be19-4e98034f14c2', 'U12_04_PP300_48', '4 x 7', 28, 7, '60.00', '1680.00', 'MedEx search & Arogga: AREDS Capsule ৳60.00 (4 x 7: ৳1,680.00).'],
  ['8bb04bad-12fe-46a2-a48d-6850c6d19982', 'U12_04_PP300_48', '1 x 10', 10, 10, '190.00', '1900.00', 'MedEx search & Arogga: Otecon 150 mg Capsule ৳190.00 (1 x 10: ৳1,900.00).'],
  ['8cc28d92-28cf-47cd-b098-c3845f3fb390', 'U12_04_PP300_48', '3 x 10', 30, 10, '22.00', '660.00', 'MedEx search: Evatone 1+100 Capsule ৳22.00 (3 x 10: ৳660.00).'],
  ['7348249c-55d9-49e2-beee-264f4f129364', 'U12_04_PP300_48', '3 x 10', 30, 10, '128.00', '3840.00', 'MedEx search: Broncho-Vaxom 3.5 mg Capsule ৳128.00 (3 x 10: ৳3,840.00).'],
  ['2207d96d-d486-468e-938f-3f73fbfda7e4', 'U12_04_PP300_48', '2 x 6', 12, 6, '200.00', '2400.00', 'MedEx search & Arogga: Otezol 150 mg Capsule ৳200.00 (2 x 6: ৳2,400.00).'],
  ['5dfaa8ed-90f3-4db8-9671-6b95caae02a1', 'U12_04_PP300_48', '3 x 10', 30, 10, '150.00', '4500.00', 'MedEx search: BioRenal Capsule ৳150.00 (3 x 10: ৳4,500.00).'],
  ['8e59e690-7bff-4d80-8875-7968690cc076', 'U12_04_PP300_48', '1 x 10', 10, 10, '300.00', '3000.00', 'MedEx search & Arogga: Ravu 100 mg Capsule ৳300.00 (1 x 10: ৳3,000.00).'],
  ['f7b3009e-a014-4941-8ba2-26ec22faa8cd', 'U12_04_PP300_48', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Omnia 5 mg Capsule ৳20.00 (3 x 10: ৳600.00).'],
  ['f2ba2990-eedd-404c-b5cf-6019fadf5295', 'U12_04_PP300_48', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Omnia 2.5 mg Capsule ৳15.00 (3 x 10: ৳450.00).'],
  ['4cc9b534-2ab5-4e43-9b86-49d05ec4e36f', 'U12_04_PP300_48', '1 x 10', 10, 10, '170.00', '1700.00', 'MedEx search & Arogga: Otegal 150 mg Capsule ৳170.00 (1 x 10: ৳1,700.00).'],
  ['746e2a2f-363c-4842-b5e7-9602c2b7cc7b', 'U12_04_PP300_48', '3 x 6', 18, 6, '450.00', '8100.00', 'MedEx search: Pomide 2 mg Capsule ৳450.00 (3 x 6: ৳8,100.00).'],
  ['1eca7dd1-b8b7-40e3-be1c-862640c9adb7', 'U12_04_PP300_48', '3 x 6', 18, 6, '800.00', '14400.00', 'MedEx search: Pomide 4 mg Capsule ৳800.00 (3 x 6: ৳14,400.00).'],
  ['5581385a-f855-4daf-9172-b58ec05d8133', 'U12_04_PP300_48', '2 x 10', 20, 10, '50.00', '1000.00', 'MedEx search: Icosa 1 gm Capsule ৳50.00 (2 x 10: ৳1,000.00).'],
  ['e0c9cee4-ad81-4ee4-96e0-da400b61abd6', 'U12_04_PP300_48', '3 x 10', 30, 10, '8.00', '240.00', 'MedEx search: Inferin 30 mg Capsule ৳8.00 (3 x 10: ৳240.00).'],
  ['f1699bb8-31d6-4741-a2e8-015f01fb52d0', 'U12_04_PP300_48', '4 x 15', 60, 15, '3.50', '210.00', 'MedEx search: Leroid 50 mcg Capsule ৳3.50 (4 x 15: ৳210.00).'],
  ['d514e5c3-990f-4f38-94ba-c762532bf1c4', 'U12_04_PP300_48', '1 x 7', 7, 7, '200.00', '1400.00', 'MedEx search & Arogga: Otenox 150 mg Capsule ৳200.00 (1 x 7: ৳1,400.00).'],
  ['fcb87d68-9315-40e5-9d88-092af95d7dba', 'U12_04_PP300_48', '5 x 6', 30, 6, '11.00', '330.00', 'MedEx search: Maltol 30 mg Capsule ৳11.00 (5 x 6: ৳330.00).'],
  ['0a1eb915-8358-4707-ba26-dfd3320c898a', 'U12_04_PP300_48', '4 x 15', 60, 15, '2.50', '150.00', 'MedEx search & Arogga: Leroid 25 mcg Capsule ৳2.50 (4 x 15: ৳150.00).'],
];

const SUBBATCH_7B_SPECS = [
  ['0addb7d3-24d7-42ab-8a22-67a27d929313', 'OTHER_GE25', '6 x 10', 60, 10, '3.00', '180.00', 'MedEx search: Goodmet 500 mg Tablet ৳3.00 (6 x 10: ৳180.00); resolves held Batch 5 item.'],
  ['6d97f173-c572-4692-95d1-b81233e872d5', 'OTHER_GE25', '3 x 10', 30, 10, '5.00', '150.00', 'MedEx search: Diabest 500 mg Tablet ৳5.00 (3 x 10: ৳150.00); resolves held Batch 5 item.'],
  ['91f827e1-5a0b-46df-9702-9bbc9cd10858', 'OTHER_GE25', '3 x 10', 30, 10, '3.00', '90.00', 'MedEx search: Hemotin Plus Tablet ৳3.00 (3 x 10: ৳90.00).'],
  ['564f1af0-5563-4dd2-90f8-0f67a2d4948a', 'OTHER_GE25', '6 x 10', 60, 10, '2.75', '165.00', 'MedEx search: Imuzin 20 mg Tablet ৳2.75 (6 x 10: ৳165.00).'],
  ['96a1f66f-ee68-4e07-8c2b-3306630d3b99', 'OTHER_GE25', '2 x 7', 14, 7, '1500.00', '21000.00', 'MedEx search: Lenvakin 10 mg Capsule ৳1,500.00 (2 x 7: ৳21,000.00).'],
  ['82d1ea34-71e4-4665-a3c2-ff622d9a8eda', 'OTHER_GE25', "30's pack", 30, null, '900.00', '27000.00', 'MedEx search: Levagen 10 mg Capsule ৳900.00 (1 x 30 pack: ৳27,000.00).'],
  ['3aee8e2a-b576-48e4-b60d-7a651fe369ff', 'OTHER_GE25', '1 x 10', 10, 10, '1730.00', '17300.00', 'MedEx search: Enatinib 10 mg Capsule ৳1,730.00 (1 x 10: ৳17,300.00).'],
  ['4ce1b173-a6c5-4ea5-825c-085c96d71f80', 'OTHER_GE25', "30's pack", 30, null, '1550.00', '46500.00', 'MedEx search: Enva 10 mg Capsule ৳1,550.00 (1 x 30 pack: ৳46,500.00).'],
  ['0714fc7b-bbe4-4dc0-94b7-a2dfdcb63da3', 'OTHER_GE25', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Hepalola 550 mg Tablet ৳20.00 (3 x 10: ৳600.00).'],
  ['f8e4b080-de01-41ba-bc84-ac666b717bd1', 'OTHER_GE25', "12's pack", 12, null, '400.00', '4800.00', 'MedEx search: Dasvir 60 mg Tablet ৳400.00 (1 x 12 box: ৳4,800.00).'],
  ['435f5d43-83fe-4806-96fc-d61ba26e016e', 'OTHER_GE25', '1 x 10', 10, 10, '200.00', '2000.00', 'MedEx search: G-Daclatasvir 60 mg Tablet ৳200.00 (1 x 10: ৳2,000.00).'],
  ['1a364045-7778-46b2-bbed-fc234b28d125', 'OTHER_GE25', '3 x 10', 30, 10, '5.00', '150.00', 'MedEx search: Dopair 50+12.5 Tablet ৳5.00 (3 x 10: ৳150.00).'],
  ['0ccbbc9a-e590-4d78-af3d-27d311c63b60', 'OTHER_GE25', '1 x 10', 10, 10, '4.00', '40.00', 'MedEx search & Arogga: D-Fill 2000 IU Capsule ৳4.00 (1 x 10: ৳40.00).'],
  ['c12ec6b4-f743-452e-9ca7-5b9ae8c9b900', 'OTHER_GE25', '3 x 4', 12, 4, '50.00', '600.00', 'MedEx search: Epicet XR 1500 mg Tablet ৳50.00 (3 x 4: ৳600.00).'],
  ['ab347720-e269-4d18-8404-3aa289f80bb6', 'OTHER_GE25', '10 x 10', 100, 10, '3.50', '350.00', 'MedEx search: Gastridine 20 mg EC Tablet ৳3.50 (10 x 10: ৳350.00).'],
  ['a5b2adae-048e-4bd7-8ec3-aeac3c954df3', 'OTHER_GE25', '2 x 6', 12, 6, '130.00', '1560.00', 'MedEx search: Dabigat 150 mg Capsule ৳130.00 (2 x 6: ৳1,560.00).'],
  ['a638a96e-1502-4bee-a26f-96286eab0951', 'OTHER_GE25', '4 x 10', 40, 10, '1100.00', '44000.00', 'MedEx search: Afaz 40 mg Tablet ৳1,100.00 (4 x 10: ৳44,000.00).'],
  ['4a2810b7-ac86-4b1d-805c-bb67d25a18c3', 'OTHER_GE25', '3 x 10', 30, 10, '16.00', '480.00', 'MedEx search: Linaglip-M 2.5+1000 Tablet ৳16.00 (3 x 10: ৳480.00).'],
  ['8b7a8d41-b99e-48fc-ae59-6c0ba1039ea1', 'OTHER_GE25', '2 x 10', 20, 10, '24.00', '480.00', 'MedEx search: Quiet XR 400 mg Tablet ৳24.00 (2 x 10: ৳480.00).'],
  ['6dd38062-dbaa-4b78-ba01-a28d76d22ba5', 'OTHER_GE25', '10 x 10', 100, 10, '1.15', '115.00', 'MedEx search: G-Metoprolol 50 mg Tablet ৳1.15 (10 x 10: ৳115.00).'],
  ['6a03216a-f4e6-444e-ae89-a8b95cb38571', 'OTHER_GE25', '2 x 7', 14, 7, '650.00', '9100.00', 'MedEx search: Lenvakin 4 mg Capsule ৳650.00 (2 x 7: ৳9,100.00).'],
  ['9e5270c6-774b-4ffb-b217-313378d09acd', 'OTHER_GE25', "30's pack", 30, null, '465.00', '13950.00', 'MedEx search: Levat 4 mg Capsule ৳465.00 (1 x 30 pack: ৳13,950.00).'],
  ['011ddd42-8a40-4b75-9f41-bd9994bee896', 'OTHER_GE25', "30's pack", 30, null, '400.00', '12000.00', 'MedEx search: Levagen 4 mg Capsule ৳400.00 (1 x 30 pack: ৳12,000.00).'],
  ['8b30e265-96fd-4352-b1e8-8ab1c4e9ff00', 'OTHER_GE25', '1 x 10', 10, 10, '670.00', '6700.00', 'MedEx search: Enatinib 4 mg Capsule ৳670.00 (1 x 10: ৳6,700.00).'],
  ['387c66c3-ad93-4c16-bca4-d7c0bec00d07', 'OTHER_GE25', "30's pack", 30, null, '650.00', '19500.00', 'MedEx search: Enva 4 mg Capsule ৳650.00 (1 x 30 pack: ৳19,500.00).'],
  ['5c32d4c5-3886-4448-a125-6605b5ffc048', 'OTHER_GE25', '7 x 2', 14, 2, '38.00', '532.00', 'MedEx search: Rith 500 mg Tablet ৳38.00 (7 x 2: ৳532.00).'],
  ['2b3f781d-93eb-4a9b-9880-f6e3b2a9785c', 'OTHER_GE25', '1 x 10', 10, 10, '50.00', '500.00', 'MedEx search: Pneumoclar 500 mg Tablet ৳50.00 (1 x 10: ৳500.00).'],
  ['74a7cba3-e4ec-4460-a802-14c50294fe11', 'OTHER_GE25', "30's pack", 30, null, '700.00', '21000.00', 'MedEx search: Olakin 150 mg Tablet ৳700.00 (1 x 30 pack: ৳21,000.00).'],
  ['f71702ec-e899-42e5-876a-30589d42d025', 'OTHER_GE25', '1 x 10', 10, 10, '2000.00', '20000.00', 'MedEx search: Lynparib 150 mg Tablet ৳2,000.00 (1 x 10: ৳20,000.00).'],
  ['d77c6921-20ae-42d2-906d-a87fe9abfbc0', 'OTHER_GE25', '2 x 5', 10, 5, '15.00', '150.00', 'MedEx search: Kingdol 100 mg Suppository ৳15.00 (2 x 5: ৳150.00).'],
  ['a11cec24-46ab-4a56-ae86-241a4e4c63d6', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Olida 200 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['992380d2-7406-4805-88e1-4b9bb57c1212', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search & Arogga: Coralbest-D Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['b67365fc-5e28-4c12-b303-e114a360dbe2', 'OTHER_GE25', "30's pack", 30, null, '10.00', '300.00', 'MedEx search: Ocenic-D Tablet ৳10.00 (30s pack: ৳300.00).'],
  ['bb57252f-3195-415f-a74f-492f888db85c', 'OTHER_GE25', "30's pack", 30, null, '10.00', '300.00', 'MedEx search: Egical-D Tablet ৳10.00 (30s pack: ৳300.00).'],
  ['2496f28a-658a-4f7f-8b80-38b947a37f91', 'OTHER_GE25', "30's pack", 30, null, '10.00', '300.00', 'MedEx search: Osticor D Tablet ৳10.00 (30s pack: ৳300.00).'],
  ['9a25808d-25c1-4ebc-96cc-6aafc963a645', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: D-Coral Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['d6a3ce5a-af51-41d3-90a9-8610658ca5f5', 'OTHER_GE25', '6 x 10', 60, 10, '9.00', '540.00', 'MedEx search: Corast-D Tablet ৳9.00 (6 x 10: ৳540.00).'],
  ['d567cdae-535b-45bc-a496-4048f010eaf1', 'OTHER_GE25', '3 x 10', 30, 10, '23.00', '690.00', 'MedEx search: D-Fozin 10 mg Tablet ৳23.00 (3 x 10: ৳690.00).'],
  ['ca847f0a-c3e6-46cf-bc92-0b27e6b318ec', 'OTHER_GE25', '1 x 10', 10, 10, '25.00', '250.00', 'MedEx search: Emglit 10 mg Tablet ৳25.00 (1 x 10: ৳250.00).'],
  ['0daa8a6e-d59f-4d2f-aead-3ad3c4d66444', 'OTHER_GE25', '3 x 10', 30, 10, '11.00', '330.00', 'MedEx search: Boncoral Tablet ৳11.00 (3 x 10: ৳330.00).'],
  ['34bc8dde-4203-403f-a8fd-643437987779', 'OTHER_GE25', '3 x 10', 30, 10, '14.00', '420.00', 'MedEx search: D-Lina M 2.5+850 Tablet ৳14.00 (3 x 10: ৳420.00).'],
  ['365b5336-56ca-448b-83b1-58df170cdafb', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search & Arogga: Osto-Coral Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['2603454d-5c14-47dd-b743-d970d535d2c7', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Cocavit D Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['28c71fe4-5968-4bc3-b07a-0d325813ceb0', 'OTHER_GE25', '1 x 10', 10, 10, '250.00', '2500.00', 'MedEx search: Religox 120 mg Tablet ৳250.00 (1 x 10: ৳2,500.00).'],
  ['87a8335f-376d-48e5-9db3-dbf213fe5f96', 'OTHER_GE25', '3 x 10', 30, 10, '22.00', '660.00', 'MedEx search: Febout 80 mg Tablet ৳22.00 (3 x 10: ৳660.00).'],
  ['af713bc2-3e41-4490-b976-906c708b1350', 'OTHER_GE25', '10 x 10', 100, 10, '3.00', '300.00', 'MedEx search: Parafenac TR 100 mg Capsule ৳3.00 (10 x 10: ৳300.00).'],
  ['41af103e-e389-41ba-8b1b-89aeff5f2739', 'OTHER_GE25', '2 x 10', 20, 10, '25.00', '500.00', 'MedEx search: Empastar 10 mg Tablet ৳25.00 (2 x 10: ৳500.00).'],
  ['45470bf8-bc2d-4f36-afe2-c0c82d0f9683', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Ostocare D Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['2ca81643-1396-4e39-beb4-ff5b22a2b72b', 'OTHER_GE25', '10 x 10', 100, 10, '2.50', '250.00', 'MedEx search: Nasfen TR 100 mg Capsule ৳2.50 (10 x 10: ৳250.00).'],
  ['8bab192f-0d1f-436c-a46a-4d237c79c1d9', 'OTHER_GE25', '3 x 10', 30, 10, '11.00', '330.00', 'MedEx search: Aseral-D Tablet ৳11.00 (3 x 10: ৳330.00).'],
  ['8e973e5a-a254-4caf-8485-0ce3a80bddf2', 'OTHER_GE25', '3 x 10', 30, 10, '250.00', '7500.00', 'MedEx search: R-Lix 120 mg Tablet ৳250.00 (3 x 10: ৳7,500.00).'],
  ['cc3468a6-57aa-49bb-9740-8e7a3684cb47', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Coralbon D (Pristine) Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['01decbf1-3a62-4d22-b3a3-409bba26382f', 'OTHER_GE25', '3 x 10', 30, 10, '9.00', '270.00', 'MedEx search: Coral Calcium D (Pharmik) Tablet ৳9.00 (3 x 10: ৳270.00).'],
  ['9261f96c-09a0-4ce5-8adc-3360b44fb908', 'OTHER_GE25', '3 x 10', 30, 10, '11.00', '330.00', 'MedEx search: Corarif D Tablet ৳11.00 (3 x 10: ৳330.00).'],
  ['98ebe34a-c1e3-447f-8453-67e7c33f9994', 'OTHER_GE25', '5 x 10', 50, 10, '10.00', '500.00', 'MedEx search: Cicol-D Tablet ৳10.00 (5 x 10: ৳500.00).'],
  ['82d09623-0b94-45e8-9905-710da4eea084', 'OTHER_GE25', '3 x 10', 30, 10, '30.00', '900.00', 'MedEx search: Citazar XR 500 mg Tablet ৳30.00 (3 x 10: ৳900.00).'],
  ['a7f9fa3b-1de5-43a2-90fa-c2de209a991f', 'OTHER_GE25', '2 x 10', 20, 10, '25.00', '500.00', 'MedEx search & Arogga: Empoli 10 mg Tablet ৳25.00 (2 x 10: ৳500.00).'],
  ['b777c968-f58c-4ccf-85a6-95d66a42ee84', 'OTHER_GE25', '1 x 14', 14, 14, '35.00', '490.00', 'MedEx search: Jakrif 5 mg Tablet ৳35.00 (1 x 14: ৳490.00).'],
  ['41c443b9-075f-47d9-9b11-1024b08a81fa', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Conate D Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['4a0f04bc-2acc-47cd-9ca4-39b216625811', 'OTHER_GE25', '3 x 10', 30, 10, '25.00', '750.00', 'MedEx search: Myrica ER 82.5 mg Tablet ৳25.00 (3 x 10: ৳750.00).'],
  ['20222c6f-7836-48c5-9ced-11024eb49095', 'OTHER_GE25', '3 x 10', 30, 10, '35.00', '1050.00', 'MedEx search: Myrica ER 165 mg Tablet ৳35.00 (3 x 10: ৳1,050.00).'],
  ['1d3cd625-7194-465a-bec4-a31c3d5f4ba2', 'OTHER_GE25', '2 x 10', 20, 10, '12.00', '240.00', 'MedEx search: Epaglin 10 mg Tablet ৳12.00 (2 x 10: ৳240.00).'],
  ['73c57b39-93db-40fb-b509-d5be5a46677d', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Coramin-D Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['69a70433-94ad-41fb-88d1-2326b3764a36', 'OTHER_GE25', '1 x 10', 10, 10, '20.00', '200.00', 'MedEx search: Febutek 80 mg Tablet ৳20.00 (1 x 10: ৳200.00).'],
  ['3cb682cb-37a0-40b8-ab01-87826e942e30', 'OTHER_GE25', '5 x 10', 50, 10, '3.50', '175.00', 'MedEx search: Axidin 40 mg Tablet ৳3.50 (5 x 10: ৳175.00).'],
  ['d43ba62c-0a61-4b06-954a-2244769dc2bf', 'OTHER_GE25', '5 x 10', 50, 10, '4.00', '200.00', 'MedEx search: Famas 40 mg Tablet ৳4.00 (5 x 10: ৳200.00).'],
  ['8a0f0a1d-d18e-4261-b014-1d3d09fab70b', 'OTHER_GE25', '10 x 10', 100, 10, '3.80', '380.00', 'MedEx search: NCR FAST 40 mg Tablet ৳3.80 (10 x 10: ৳380.00).'],
  ['a6770155-4ff8-467b-b453-813040f62f88', 'OTHER_GE25', '3 x 6', 18, 6, '9.00', '162.00', 'MedEx search: Albizox 500 mg Tablet ৳9.00 (3 x 6: ৳162.00).'],
  ['3a362dd8-4446-4585-9a69-dbe2795daaa7', 'OTHER_GE25', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Parazox 500 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['ec7c7ec1-cdc2-4c6e-91f5-72a0b69e1b49', 'OTHER_GE25', '3 x 6', 18, 6, '10.00', '180.00', 'MedEx search: NTZ 500 mg Tablet ৳10.00 (3 x 6: ৳180.00).'],
  ['e8fc47b5-ba57-4a73-93fb-6539b1e9dc5c', 'OTHER_GE25', "7's pack", 7, null, '1200.00', '8400.00', 'MedEx search: ALK 90 mg Tablet ৳1,200.00 (7s box: ৳8,400.00).'],
  ['e5ed897c-36a9-4823-96fd-d4cb95f6b712', 'OTHER_GE25', '1 x 10', 10, 10, '500.00', '5000.00', 'MedEx search & Arogga: R-Pag 25 mg Tablet ৳500.00 (1 x 10: ৳5,000.00).'],
  ['2765d45a-0169-42f8-8957-b54369c3b67b', 'OTHER_GE25', '1 x 10', 10, 10, '500.00', '5000.00', 'MedEx search: Olapag 25 mg Tablet ৳500.00 (1 x 10: ৳5,000.00).'],
  ['33d85c2c-79a6-4af3-8b6f-36a5a9c845b2', 'OTHER_GE25', '3 x 10', 30, 10, '4.00', '120.00', 'MedEx search: Risponex 2 mg Tablet ৳4.00 (3 x 10: ৳120.00).'],
  ['0da1b7d9-5be2-4465-bbf1-24b2971240e2', 'OTHER_GE25', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Rislock 2 mg Tablet ৳5.00 (5 x 10: ৳250.00).'],
  ['c608030d-2c15-4d4b-9dc5-55725ce846ec', 'OTHER_GE25', '3 x 10', 30, 10, '2.50', '75.00', 'MedEx search: Azmasol 200 mcg DPI Capsule ৳2.50 (3 x 10: ৳75.00).'],
  ['1c9078d7-cd4a-4b76-96da-1f2debbf586b', 'OTHER_GE25', '1 x 10', 10, null, '240.00', '2400.00', 'MedEx search: Amiodarone Hameln 150 mg/3 ml Injection ৳240.00 (1 x 10 ampoules: ৳2,400.00).'],
  ['8389dcc0-e820-4a8b-88af-0b0b4b8d6195', 'OTHER_GE25', '50 ml vial', null, null, null, '2500.00', 'MedEx search & Arogga: Dixanol 50 ml/vial Injection ৳2,500.00 per 50 ml vial.'],
  ['b4497bd1-890f-4928-a12c-95df579f4cb9', 'OTHER_GE25', '1 x 5', 5, null, '34.50', '172.50', 'MedEx search: G-Pethidine 50 mg/ml Injection ৳34.50 (1 x 5 ampoules: ৳172.50).'],
  ['a84118ef-c904-4273-a831-f8a3e497fd6a', 'OTHER_GE25', '4 mg vial', null, null, null, '9000.00', 'MedEx search: Opocan 4 mg/4 ml Injection ৳9,000.00 per 4 mg vial.'],
  ['9d806911-e487-49ca-998a-4999d9561749', 'OTHER_GE25', '10 ml vial', null, null, null, '2300.00', 'MedEx search & Arogga: Gadosol 0.5 mmol/ml Injection ৳2,300.00 per 10 ml vial.'],
  ['8acd9a46-796e-468c-b646-3d4ab4cc2fc7', 'OTHER_GE25', '3 x 10', 30, 10, '5.27', '158.10', 'MedEx search: Amlotol Plus 5+50 Tablet ৳5.27 (3 x 10: ৳158.10).'],
  ['f33c71b5-ae2a-4bcf-9fc0-9f944d430814', 'OTHER_GE25', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Amdepin AT 5+50 Tablet ৳5.00 (5 x 10: ৳250.00).'],
  ['cd31d926-447f-4373-ac56-8237155e073c', 'OTHER_GE25', '5 x 10', 50, 10, '3.50', '175.00', 'MedEx search: Fol-Z Capsule ৳3.50 (5 x 10: ৳175.00).'],
  ['aea6bcd7-fe37-46c7-9c19-3ab44afbd053', 'OTHER_GE25', '3 x 10', 30, 10, '6.00', '180.00', 'MedEx search: Ifoliz Capsule ৳6.00 (3 x 10: ৳180.00).'],
  ['a67ffcb2-0dde-45a4-95f8-52f3993bc05c', 'OTHER_GE25', '5 x 10', 50, 10, '4.00', '200.00', 'MedEx search: Carepain 100 mg Tablet ৳4.00 (5 x 10: ৳200.00).'],
  ['23662f27-ade4-478b-a63d-ce543f5824f1', 'OTHER_GE25', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Alodia 12.5 mg Tablet ৳12.00 (3 x 10: ৳360.00).'],
  ['54f45770-2ac8-475e-acae-b19661a934d3', 'OTHER_GE25', '2 x 10', 20, 10, '35.00', '700.00', 'MedEx search: Broklin CR 165 mg Tablet ৳35.00 (2 x 10: ৳700.00).'],
  ['56b9d31e-2c9b-433e-b924-38fb8af9a7df', 'OTHER_GE25', '3 x 10', 30, 10, '40.00', '1200.00', 'MedEx search: D-Fozin 25 mg Tablet ৳40.00 (3 x 10: ৳1,200.00).'],
  ['f03e1799-3c54-4bb5-80d1-0813fe7d9ddf', 'OTHER_GE25', '1 x 10', 10, 10, '40.00', '400.00', 'MedEx search: Emglit 25 mg Tablet ৳40.00 (1 x 10: ৳400.00).'],
  ['77989026-12da-4468-8d67-6808e6c933ac', 'OTHER_GE25', '1 x 10', 10, 10, '20.00', '200.00', 'MedEx search: Ivtin 12 mg Tablet ৳20.00 (1 x 10: ৳200.00).'],
  ['22b38009-dd00-4f34-959d-05dc02a248cb', 'OTHER_GE25', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Aceflex 100 mg Tablet ৳5.00 (5 x 10: ৳250.00).'],
  ['7f12595d-6359-498c-badb-99d173b511f4', 'OTHER_GE25', '2 x 10', 20, 10, '30.00', '600.00', 'MedEx search: Myfene 60 mg Tablet ৳30.00 (2 x 10: ৳600.00).'],
  ['5aaf387d-6fc9-4628-be1f-dca90209a086', 'OTHER_GE25', '2 x 14', 28, 14, '12.00', '336.00', 'MedEx search: Ligotin 12.5 mg Tablet ৳12.00 (2 x 14: ৳336.00).'],
  ['b669624a-4057-4340-94d9-de21b1d86031', 'OTHER_GE25', '10 x 10', 100, 10, '3.00', '300.00', 'MedEx search: Aceclofenac 100 mg Tablet (Pristine) ৳3.00 (10 x 10: ৳300.00).'],
  ['dec1b231-6dc4-4023-95c0-3404a51a88a4', 'OTHER_GE25', '1 x 10', 10, 10, '40.00', '400.00', 'MedEx search: Empastar 25 mg Tablet ৳40.00 (1 x 10: ৳400.00).'],
  ['5cb866f6-e7b5-44b3-b36e-dc64b82bc163', 'OTHER_GE25', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Lyca CR 165 mg Tablet ৳20.00 (3 x 10: ৳600.00).'],
  ['50c0adb4-79f7-49fa-a753-049aec93ecda', 'OTHER_GE25', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Nepco CR 165 mg Tablet ৳35.00 (1 x 10: ৳350.00).'],
  ['449352e3-0139-4525-b549-aef6dc023660', 'OTHER_GE25', '6 x 10', 60, 10, '5.00', '300.00', 'MedEx search: Reofen 100 mg Tablet ৳5.00 (6 x 10: ৳300.00).'],
  ['999ffa57-d04d-43dd-8b45-08f2822d1e91', 'OTHER_GE25', '1 x 10', 10, 10, '18.00', '180.00', 'MedEx search: Imectin 12 mg Tablet ৳18.00 (1 x 10: ৳180.00).'],
  ['417c6bf6-70d0-4313-bc4e-1fb9f3caa32e', 'OTHER_GE25', '10 x 10', 100, 10, '4.50', '450.00', 'MedEx search: Aceclosic 100 mg Tablet ৳4.50 (10 x 10: ৳450.00).'],
  ['f64ff006-8927-4476-a3cc-95fc27cb433c', 'OTHER_GE25', '10 x 10', 100, 10, '4.00', '400.00', 'MedEx search: Painles 100 mg Tablet ৳4.00 (10 x 10: ৳400.00).'],
  ['8f17fb75-64d0-4afb-a733-7ddacc5ec309', 'OTHER_GE25', '10 x 10', 100, 10, '3.00', '300.00', 'MedEx search: Maclo 100 mg Tablet ৳3.00 (10 x 10: ৳300.00).'],
  ['e7c3ac9a-d483-4cd9-8187-c84b0ac3c0b3', 'OTHER_GE25', '1 x 10', 10, 10, '30.00', '300.00', 'MedEx search: Eflow 25 mg Tablet ৳30.00 (1 x 10: ৳300.00).'],
  ['40148f39-7de1-41f2-bce5-2af832e0ae6e', 'OTHER_GE25', '10 x 10', 100, 10, '4.00', '400.00', 'MedEx search: Aceron 100 mg Tablet ৳4.00 (10 x 10: ৳400.00).'],
  ['1dffad69-6931-41ab-bdda-90fc232c45fb', 'OTHER_GE25', '10 x 10', 100, 10, '4.00', '400.00', 'MedEx search: Acxi 100 mg Tablet ৳4.00 (10 x 10: ৳400.00).'],
  ['7e64dad5-c6e0-4bff-96de-1d39724e30f3', 'OTHER_GE25', '10 x 10', 100, 10, '4.00', '400.00', 'MedEx search: Aceclofenac 100 mg Tablet (Pharmik) ৳4.00 (10 x 10: ৳400.00).'],
];

const HELD_FROM_BATCH7 = [
  {
    packId: '74f470df-8e0d-40b4-bf50-c1b234470fcf',
    name: 'Carmin 2.5 mg Capsule (Eskayef)',
    reason: 'Officially marked price unavailable / pending DGDA pricing on MedEx & Arogga (template 30s u=12.04/pp=300.48 retained for manual pricing).',
  },
  {
    packId: 'fef5a0c4-4abd-4796-8488-7ab08de55c02',
    name: 'Carmin 5 mg Capsule (Eskayef)',
    reason: 'Officially marked price unavailable / pending DGDA pricing on MedEx & Arogga (template 30s u=12.04/pp=300.48 retained for manual pricing).',
  },
];

function validateRow(label, pu, su, u, pp) {
  if (pu !== null && su !== null) {
    if (su <= 1 || su > 100 || pu % su !== 0) {
      throw new Error(`Invalid strip/packUnits on ${label}: pu=${pu}, su=${su}`);
    }
  }
  if (u !== null && pu && pp !== null) {
    const exp = Number(u) * pu;
    const act = Number(pp);
    if (Math.abs(act - exp) / act > 0.001) {
      throw new Error(`Arithmetic mismatch on ${label}: ${u} * ${pu} = ${exp} vs ${act}`);
    }
  }
}

(async () => {
  const allSpecs = [...SUBBATCH_7A_SPECS, ...SUBBATCH_7B_SPECS];
  const ids = allSpecs.map((s) => s[0]);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Duplicate packId detected in Batch 7 specs');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const packs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.medicinePack.findMany({
        where: { id: { in: ids } },
        include: { brand: { select: { sourceId: true, name: true, strength: true, dosageForm: true, manufacturer: true } } },
      });
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 });

    const pMap = new Map(packs.map((p) => [p.id, p]));
    let warningsClearedCount = 0;

    const stagedUpdates = allSpecs.map((spec) => {
      const [packId, subKind, pq, pu, su, unitPrice, packPrice, evidence] = spec;
      const p = pMap.get(packId);
      if (!p) throw new Error(`Missing packId: ${packId}`);
      validateRow(`${p.brand.name} ${p.brand.strength ?? ''}`, pu, su, unitPrice, packPrice);

      const nextWarnings = (p.warnings || []).filter((w) => w !== 'pack_price_inconsistent_with_unit_price');
      if (nextWarnings.length < (p.warnings || []).length) warningsClearedCount++;

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

    const sub7A = stagedUpdates.filter((x) => x.subKind === 'U12_04_PP300_48');
    const sub7B = stagedUpdates.filter((x) => x.subKind === 'OTHER_GE25');

    const manifest = {
      generatedAt: new Date().toISOString(),
      status: 'STAGED_READ_ONLY_NOT_EXECUTED',
      summary: {
        subbatch7A_u12_04_pp300_48_count: sub7A.length,
        subbatch7B_otherGe25_count: sub7B.length,
        totalVerifiedStagedBatch7: stagedUpdates.length,
        samePackUnitsCount: stagedUpdates.filter((x) => x.migrationKind === 'SAME_PACK_UNITS').length,
        packMigrationCount: stagedUpdates.filter((x) => x.migrationKind === 'PACK_MIGRATION').length,
        warningsClearedCount,
        heldFromBatch7Count: HELD_FROM_BATCH7.length,
      },
      batch7Updates: stagedUpdates,
      heldFromBatch7: HELD_FROM_BATCH7,
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch7_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const fmtRow = (x) => `- **${x.brandName} ${x.strength ?? ''}** [${x.subKind}]: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``;

    const mdLines = [
      '# CareDose — Staged Batch 7 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 7 Summary',
      `- **Sub-batch 7A — Corrupted \`u=12.04 / pp=300.48\` Capsule Template (${sub7A.length}):** All verified Capsule template packs (holding only \`Carmin 2.5 mg\` & \`5 mg\` which have no official published MRP), incl. \`Larocent 25/100\`, \`Neoral 25/50/100\`, \`Broncho-Vaxom 3.5/7\`, \`Linzela 72/290\`, \`Otes/Otecon/Otezol/Otegal/Otenox\`, \`Lotenib 100\`, \`Pomide 2/4\`, \`BioRenal\`, \`Ravu 100\`, \`AREDS\`, \`Omnia 2.5/5\`, \`Leroid 25/50\`, etc.`,
      `- **Sub-batch 7B — All Remaining \`>=25%\` Non-(\`8/280\`) Outliers (${sub7B.length}):** Includes the 2 resolved held Batch 5 items (\`Goodmet 500\`, \`Diabest 500\`), 17 Coral Calcium+VitD3 (\`u=10/pp=400\`), 10 Aceclofenac 100 (\`u=4/pp=300\`), 9 Lenvatinib 4/10 (\`Lenvakin/Levagen/Levat/Enatinib/Enva\`), 5 Injections (\`u=10.2/pp=65\` -> \`Amiodarone Hameln\`, \`Dixanol\`, \`G-Pethidine\`, \`Opocan\`, \`Gadosol\`), 4 Empagliflozin 25 (\`u=40/pp=500\`), 5 Empagliflozin 10, 4 Pregabalin CR/ER, 3 Famotidine 40, 3 Nitazoxanide 500, \`Olakin\`, \`Lynparib\`, \`Afaz 40\`, \`ALK 90\`, \`R-Pag 25\`, \`Olapag 25\`, \`Dasvir 60\`, \`Dabigat 150\`, \`Religox\`, \`R-Lix\`, etc.`,
      `- **Total Verified Batch 7 Updates:** **${manifest.summary.totalVerifiedStagedBatch7}** (\`${manifest.summary.samePackUnitsCount}\` same pack units + \`${manifest.summary.packMigrationCount}\` pack migrations), clearing **${warningsClearedCount}** \`pack_price_inconsistent_with_unit_price\` warnings.`,
      `- **Held From Batch 7 (${HELD_FROM_BATCH7.length}):** \`Carmin 2.5 mg\` & \`Carmin 5 mg\` (officially unpriced).`,
      '',
      `## Sub-batch 7A (${sub7A.length})`,
      ...sub7A.map(fmtRow),
      '',
      `## Sub-batch 7B (${sub7B.length})`,
      ...sub7B.map(fmtRow),
      '',
      `## Held From Batch 7 (${HELD_FROM_BATCH7.length})`,
      ...HELD_FROM_BATCH7.map((h) => `- **${h.name}**: ${h.reason}`),
    ];

    const mdOut = path.join(STAGING_DIR, 'batch7_staging_report.md');
    fs.writeFileSync(mdOut, mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH7_STAGED_SUCCESSFULLY', summary: manifest.summary, jsonOut, mdOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
