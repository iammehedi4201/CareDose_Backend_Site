/**
 * Strictly READ-ONLY builder for Batch 8 Staged Wave Manifest.
 * Covers all 89 remaining unmatched u=8.00/pp=280.00 corrupted-template Tablet packs.
 * Holds only Helicon V (already held in Batch 6 pending H. pylori combikit pouch mapping).
 * All 89 verified via grounded web search without direct MedEx scraping.
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const dbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch8_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Format: [packId, subKind, pq, pu, su, unitPrice, packPrice, evidence]
const BATCH8_SPECS = [
  ['c48d2f4f-0734-41c1-ad56-c1e6a5531459', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '100.00', '1000.00', 'MedEx search: Rehanzil 40+1+0.5 ৳100.00 (1 x 10: ৳1,000.00).'],
  ['5d010783-12f7-4995-8b8c-28c682568e15', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Preneu 50 mg ৳10.00 (3 x 10: ৳300.00).'],
  ['c083197e-eb7a-4644-9dc3-9858501a95b4', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Preneu 75 mg ৳15.00 (3 x 10: ৳450.00).'],
  ['6fdfb066-078b-4d18-91db-6afff1758e09', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '850.00', '8500.00', 'MedEx search: Mulina 600 mg ৳850.00 (1 x 10: ৳8,500.00).'],
  ['bc7c8285-6421-441b-a56a-115240d3e0a1', 'U8_PP280_WAVE3', "21's pack", 21, null, '952.00', '19992.00', 'MedEx search: Ribolib 200 mg ৳952.00 (1 x 21: ৳19,992.00).'],
  ['541d48b8-8752-4049-801e-29e2a8afcea7', 'U8_PP280_WAVE3', "21's pack", 21, null, '750.00', '15750.00', 'MedEx search: HER-2N 200 mg ৳750.00 (1 x 21: ৳15,750.00).'],
  ['6a210709-8683-4318-a603-041e471ba2d8', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '6.00', '180.00', 'MedEx search: FullCare MMS Tablet ৳6.00 (3 x 10: ৳180.00).'],
  ['cd5242e1-bb4a-4bd8-8ec2-51f95a558f89', 'U8_PP280_WAVE3', '11 & 14 tablet pack', 25, null, null, '2050.00', 'MedEx search: Champix 0.5 mg 11 & 14 tablet pack: ৳2,050.00.'],
  ['07dae26e-00da-4d9f-bd6d-6645174921fe', 'U8_PP280_WAVE3', '14 & 14 tablet pack', 28, 14, null, '2044.00', 'MedEx search: Champix 1 mg 14 & 14 tablet pack: ৳2,044.00.'],
  ['0a569051-3567-4f3d-b6c7-59424a05b1c1', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '500.00', '15000.00', 'MedEx search: Apaluda 60 mg ৳500.00 (3 x 10: ৳15,000.00).'],
  ['a992da5f-ed8d-45bc-86ca-b8140e334262', 'U8_PP280_WAVE3', '3 x 21', 63, 21, '1060.00', '66780.00', 'MedEx search: Kisqali 200 mg ৳1,060.00 (3 x 21: ৳66,780.00).'],
  ['bafc9f31-685f-44c5-b23a-161f873e172f', 'U8_PP280_WAVE3', '2 x 7', 14, 7, '100.00', '1400.00', 'MedEx search: Daprosis 2 mg ৳100.00 (2 x 7: ৳1,400.00).'],
  ['a31b3610-912d-40bf-9d85-a9e32c3e6cc3', 'U8_PP280_WAVE3', '1 x 4', 4, 4, '75.00', '300.00', 'MedEx search: Omarol 12.5 mg ৳75.00 (1 x 4: ৳300.00).'],
  ['5820ef1a-490e-4f14-a386-a91bdc316fa0', 'U8_PP280_WAVE3', '1 x 4', 4, 4, '135.00', '540.00', 'MedEx search: Omarol 25 mg ৳135.00 (1 x 4: ৳540.00).'],
  ['2e2beff9-f3ee-46c5-b825-e93e4c1a0592', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '45.00', '450.00', 'MedEx search: Enurex 200 mcg ৳45.00 (1 x 10: ৳450.00).'],
  ['8966f4e2-bb1b-422c-9719-5afbd9fc6618', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '35.00', '1050.00', 'MedEx search: Nytenso 20 mg ৳35.00 (3 x 10: ৳1,050.00).'],
  ['dbb2a27c-b9ae-4f7a-b62f-116fe258be47', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '85.00', '850.00', 'MedEx search: Pidonex 800 mg ৳85.00 (1 x 10: ৳850.00).'],
  ['377801bd-944a-4d19-a0b8-c16556d2296f', 'U8_PP280_WAVE3', '1 x 15', 15, 15, '45.00', '675.00', 'MedEx search: Migalin 15 mg ৳45.00 (1 x 15: ৳675.00).'],
  ['1c706271-d7c0-45f5-8f52-71a706b7d51f', 'U8_PP280_WAVE3', '1 x 4', 4, 4, '75.00', '300.00', 'MedEx search: Omariglip 12.5 mg ৳75.00 (1 x 4: ৳300.00).'],
  ['81b62d5f-3ec2-4530-9aae-b7e1b8e7c5fa', 'U8_PP280_WAVE3', '1 x 4', 4, 4, '135.00', '540.00', 'MedEx search: Omariglip 25 mg ৳135.00 (1 x 4: ৳540.00).'],
  ['693ba43a-0fae-49a4-8fdf-95e8b0040570', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '120.00', '3600.00', 'MedEx search: Hercent 40 mg ৳120.00 (3 x 10: ৳3,600.00).'],
  ['a3ec9c19-4206-4341-a8dc-5b26f92f3a95', 'U8_PP280_WAVE3', '2 x 10', 20, 10, '670.00', '13400.00', 'MedEx search: Loncil 15+6.14 ৳670.00 (2 x 10: ৳13,400.00).'],
  ['07f02963-87b5-49ce-99fb-d7332cf4d941', 'U8_PP280_WAVE3', '4 x 10', 40, 10, '800.00', '32000.00', 'MedEx search: Loncil 20+8.19 ৳800.00 (4 x 10: ৳32,000.00).'],
  ['93543c3b-7dfb-4501-acdb-a7e439b4ae00', 'U8_PP280_WAVE3', '4 x 4', 16, 4, '1400.00', '22400.00', 'MedEx search: Azacitid 300 mg ৳1,400.00 (4 x 4: ৳22,400.00).'],
  ['c0613829-2e11-45ba-b804-02b1d1af075c', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '1400.00', '42000.00', 'MedEx search: Damid 300 mg ৳1,400.00 (3 x 10: ৳42,000.00).'],
  ['67fd912e-1cc0-4138-a3f5-bbb1cfd84436', 'U8_PP280_WAVE3', '10 x 10', 100, 10, '2.50', '250.00', 'MedEx search: Nadox 100 mg ৳2.50 (10 x 10: ৳250.00).'],
  ['664de375-459a-4c0d-9887-2ad234a07a95', 'U8_PP280_WAVE3', '3 x 7', 21, 7, '70.00', '1470.00', 'MedEx search: Farobest 150 mg ৳70.00 (3 x 7: ৳1,470.00).'],
  ['872e29b6-3ad9-4c78-88c8-8e1bb0a8aa54', 'U8_PP280_WAVE3', '3 x 7', 21, 7, '70.00', '1470.00', 'MedEx search: Farobest 200 mg ৳70.00 (3 x 7: ৳1,470.00).'],
  ['644c8b05-020b-4671-b876-89e424d8a916', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '4.00', '120.00', 'MedEx search: Gestcare MMS Tablet ৳4.00 (3 x 10: ৳120.00).'],
  ['09c9040c-ac88-4089-a8cc-15ebfe4bce39', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Maxgalin 10 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['550f9447-70d9-4ee5-8fb6-390573d813ab', 'U8_PP280_WAVE3', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Maxgalin 5 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['324a5752-fbf3-475c-8259-bd6eb82be148', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Marcus 10 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['20656033-cdf0-4eb4-8711-4b22bf8595ea', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Isozine 20+37.5 ৳15.00 (3 x 10: ৳450.00).'],
  ['ec95b14d-08f9-4ed7-b670-15ff40a66158', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '260.00', '2600.00', 'MedEx search: Avatrom 20 mg ৳260.00 (1 x 10: ৳2,600.00).'],
  ['67d131cb-08c2-4fed-8fe7-63e89d646dfe', 'U8_PP280_WAVE3', '1 x 7', 7, 7, '700.00', '4900.00', 'MedEx search: Cazar FCT 60 mg ৳700.00 (1 x 7: ৳4,900.00).'],
  ['6d15e559-7b25-4c6d-aeca-0f5bd4541f21', 'U8_PP280_WAVE3', "28's pack", 28, null, '1500.00', '42000.00', 'MedEx search: Alpesib 150 mg ৳1,500.00 (1 x 28 pack: ৳42,000.00).'],
  ['b1970c51-61c7-41ee-af47-9a9ad3302b4b', 'U8_PP280_WAVE3', "30's pack", 30, null, '1200.00', '36000.00', 'MedEx search: Ascimib 40 mg ৳1,200.00 (1 x 30 pack: ৳36,000.00).'],
  ['0ee19eb0-7136-4052-9ff9-40d16fee1396', 'U8_PP280_WAVE3', "28's pack", 28, null, '1500.00', '42000.00', 'MedEx search: Capmaxen 200 mg ৳1,500.00 (1 x 28 pack: ৳42,000.00).'],
  ['7568b0ac-17f1-4647-a37f-727c0512c2fd', 'U8_PP280_WAVE3', "28's pack", 28, null, '700.00', '19600.00', 'MedEx search: Erdafixen 4 mg ৳700.00 (1 x 28 pack: ৳19,600.00).'],
  ['41d18405-82fa-4271-b837-df9499525ffb', 'U8_PP280_WAVE3', "30's pack", 30, null, '670.00', '20100.00', 'MedEx search: Gilternib 40 mg ৳670.00 (1 x 30 pack: ৳20,100.00).'],
  ['5ac8d803-0aad-421f-9919-44f216d6100b', 'U8_PP280_WAVE3', "30's pack", 30, null, '1500.00', '45000.00', 'MedEx search: Ivosenib 250 mg ৳1,500.00 (1 x 30 pack: ৳45,000.00).'],
  ['1dabdacf-f732-4877-941c-93d3ac5bd81e', 'U8_PP280_WAVE3', '7 x 4', 28, 4, '1400.00', '39200.00', 'MedEx search: Darota 300 mg ৳1,400.00 (7 x 4: ৳39,200.00).'],
  ['7ee9a3d7-796f-4de4-9345-f8f351932f4e', 'U8_PP280_WAVE3', '2 x 10', 20, 10, '5.00', '100.00', 'MedEx search: Provon 10 mg ৳5.00 (2 x 10: ৳100.00).'],
  ['bbd298cc-111e-4810-b8ae-79c744228427', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Nytenso 5 mg ৳12.00 (3 x 10: ৳360.00).'],
  ['e0c34969-8e5b-45ad-8c66-821ffcab7f12', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '850.00', '8500.00', 'MedEx search: Lefenta 600 mg ৳850.00 (1 x 10: ৳8,500.00).'],
  ['8c20044d-64b8-4ffc-a097-f82ef3023f25', 'U8_PP280_WAVE3', '2 x 4', 8, 4, '80.00', '640.00', 'MedEx search: Makario 12.5 mg ৳80.00 (2 x 4: ৳640.00).'],
  ['83340cd3-4888-4967-b47b-87cdd3b23efa', 'U8_PP280_WAVE3', '2 x 4', 8, 4, '140.00', '1120.00', 'MedEx search: Makario 25 mg ৳140.00 (2 x 4: ৳1,120.00).'],
  ['30db42db-4b5f-42c8-b8fa-f0f5d4690de1', 'U8_PP280_WAVE3', '3 x 7', 21, 7, '700.00', '14700.00', 'MedEx search: Riboxen 200 mg ৳700.00 (3 x 7: ৳14,700.00).'],
  ['1a940232-3b43-4808-a3d7-df96af00628e', 'U8_PP280_WAVE3', '2 x 14', 28, 14, '12.00', '336.00', 'MedEx search: Magolin 2.5 mg ৳12.00 (2 x 14: ৳336.00).'],
  ['565d3602-a29b-4de3-b5a8-a961fcc5fdaa', 'U8_PP280_WAVE3', "30's pack", 30, null, '120.00', '3600.00', 'MedEx search: Herlyn 40 mg ৳120.00 (1 x 30 pack: ৳3,600.00).'],
  ['596d8e31-d099-42ef-9efc-3d11f890006b', 'U8_PP280_WAVE3', '2 x 15', 30, 15, '11.00', '330.00', 'MedEx search: Migaba 2.5 mg ৳11.00 (2 x 15: ৳330.00).'],
  ['1591b28c-e5b7-4c16-8192-f94db50ca0af', 'U8_PP280_WAVE3', '2 x 15', 30, 15, '18.00', '540.00', 'MedEx search: Migaba 5 mg ৳18.00 (2 x 15: ৳540.00).'],
  ['4b1a87a4-7373-4cbc-b1de-5168d0a3f032', 'U8_PP280_WAVE3', '12 x 10', 120, 10, '2.08', '249.60', 'MedEx search: Combogic 200+500 ৳2.08 (12 x 10: ৳249.60).'],
  ['95b34b62-6d06-4410-9281-19fc1c301453', 'U8_PP280_WAVE3', '5 x 10', 50, 10, '2.08', '104.00', 'MedEx search: Metafen 200+500 ৳2.08 (5 x 10: ৳104.00).'],
  ['58764e21-25f6-447a-bdbe-ea85a3b7d638', 'U8_PP280_WAVE3', '5 x 10', 50, 10, '4.50', '225.00', 'MedEx search: Exipid 50 mg ৳4.50 (5 x 10: ৳225.00).'],
  ['83a70fdc-c37a-4acb-b20d-7821930642cc', 'U8_PP280_WAVE3', '5 x 10', 50, 10, '10.00', '500.00', 'MedEx search: Pemafate 0.1 mg ৳10.00 (5 x 10: ৳500.00).'],
  ['fa9bcf30-abc6-4642-a06b-5053f5abae28', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '35.00', '1050.00', 'MedEx search: Resiliva 60 mg ৳35.00 (3 x 10: ৳1,050.00).'],
  ['afd77d66-5e58-4ea6-80ad-e70fa71089dc', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '55.00', '1650.00', 'MedEx search: Resiliva 100 mg ৳55.00 (3 x 10: ৳1,650.00).'],
  ['4d378936-0647-46c0-83f4-e4afc99d5bb9', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '55.00', '550.00', 'MedEx search: Renash 100 mg ৳55.00 (1 x 10: ৳550.00).'],
  ['09f62565-e345-4640-b1b4-7016e9defa60', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Rezim 60 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['9fb910c8-87db-4261-8bf0-bf7eefa1837e', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '45.00', '1350.00', 'MedEx search: Fibrocon 80 mg ৳45.00 (3 x 10: ৳1,350.00).'],
  ['e283fb06-75a8-42d6-838d-842ceec1448d', 'U8_PP280_WAVE3', '3 x 20', 60, 20, '10.00', '600.00', 'MedEx search: Methiroid 10 mg ৳10.00 (3 x 20: ৳600.00).'],
  ['e918c131-7239-46c8-8c80-4314ba23d13b', 'U8_PP280_WAVE3', '5 x 20', 100, 20, '6.00', '600.00', 'MedEx search: Methiroid 5 mg ৳6.00 (5 x 20: ৳600.00).'],
  ['ed01be23-f72e-42ca-90e6-e93dd942e08d', 'U8_PP280_WAVE3', '2 x 7', 14, 7, '75.00', '1050.00', 'MedEx search: Orfanem 150 mg ৳75.00 (2 x 7: ৳1,050.00).'],
  ['425c5922-1aeb-42e5-80fc-7cec964285b3', 'U8_PP280_WAVE3', "28's pack", 28, null, '600.00', '16800.00', 'MedEx search: Prozenza 40 mg ৳600.00 (28s pack: ৳16,800.00).'],
  ['fc312401-c550-4235-bcde-8ba4baf0079c', 'U8_PP280_WAVE3', '1 x 7', 7, 7, '400.00', '2800.00', 'MedEx search: Paltab 125 mg ৳400.00 (1 x 7: ৳2,800.00).'],
  ['24f78564-bde8-4ad8-bec4-180999d346c6', 'U8_PP280_WAVE3', '2 x 5', 10, 5, '450.00', '4500.00', 'MedEx search: Cabotab 20 mg ৳450.00 (2 x 5: ৳4,500.00).'],
  ['1272a4a9-dc6b-4263-93e6-80bac012042e', 'U8_PP280_WAVE3', '2 x 5', 10, 5, '900.00', '9000.00', 'MedEx search: Cabotab 40 mg ৳900.00 (2 x 5: ৳9,000.00).'],
  ['cad0a4e3-a144-43b7-805b-781e4cec8876', 'U8_PP280_WAVE3', '2 x 5', 10, 5, '1400.00', '14000.00', 'MedEx search: Cabotab 60 mg ৳1,400.00 (2 x 5: ৳14,000.00).'],
  ['905be693-4acd-4192-ae1d-a12e2c6fea1d', 'U8_PP280_WAVE3', '6 x 10', 60, 10, '5.00', '300.00', 'MedEx search: Knito 50 mg ৳5.00 (6 x 10: ৳300.00).'],
  ['8b73723d-fd11-4a65-95d2-a7268f229ac5', 'U8_PP280_WAVE3', '6 x 10', 60, 10, '5.00', '300.00', 'MedEx search: Itogest 50 mg ৳5.00 (6 x 10: ৳300.00).'],
  ['16df3858-d563-4bf0-816c-036ad3df7c68', 'U8_PP280_WAVE3', '1 x 5', 5, 5, '260.00', '1300.00', 'MedEx search: Avanix 20 mg ৳260.00 (1 x 5: ৳1,300.00).'],
  ['565234b2-d888-45d2-81e0-7e17fb45babb', 'U8_PP280_WAVE3', '4 x 7', 28, 7, '1600.00', '44800.00', 'MedEx search: Elacentra 345 mg (sid=39294) ৳1,600.00 (4 x 7: ৳44,800.00).'],
  ['752a3900-4dfd-456c-8c02-672150e1d7ce', 'U8_PP280_WAVE3', '4 x 7', 28, 7, '1600.00', '44800.00', 'MedEx search: Elacentra 345 mg (sid=39295) ৳1,600.00 (4 x 7: ৳44,800.00).'],
  ['2762114f-db19-4dd5-9c46-3b20377bac7a', 'U8_PP280_WAVE3', '4 x 7', 28, 7, '1600.00', '44800.00', 'MedEx search: Elacentra 345 mg (sid=39296) ৳1,600.00 (4 x 7: ৳44,800.00).'],
  ['6a728f8a-173c-43d5-a771-873f9f7d195b', 'U8_PP280_WAVE3', '6 x 10', 60, 10, '5.00', '300.00', 'MedEx search: Ipride 50 mg ৳5.00 (6 x 10: ৳300.00).'],
  ['81ddc014-4c50-4a20-b194-d996b0a66812', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '7.00', '70.00', 'MedEx search: Glucofast 4 gm Chewable ৳7.00 (1 x 10: ৳70.00).'],
  ['eb896d51-5296-46ec-8b31-75eff8c352b9', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Gefomag 97 mg Chewable ৳10.00 (3 x 10: ৳300.00).'],
  ['dca329e9-5d50-49fb-b37f-39d7742d8b89', 'U8_PP280_WAVE3', '3 x 10', 30, 10, '5.00', '150.00', 'MedEx search: Lopera-S 2+125 ৳5.00 (3 x 10: ৳150.00).'],
  ['b8191da4-86ad-46b0-b0b6-fd2913837120', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '90.00', '900.00', 'MedEx search: Danemia 4 mg ৳90.00 (1 x 10: ৳900.00).'],
  ['6b0f6d1b-4bd4-42e3-aea3-8171e5018085', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '150.00', '1500.00', 'MedEx search: Danemia 6 mg ৳150.00 (1 x 10: ৳1,500.00).'],
  ['203bdf91-9d14-4a64-9bcb-029673dc8902', 'U8_PP280_WAVE3', '1 x 10', 10, 10, '150.00', '1500.00', 'MedEx search: Duport 200 mg ৳150.00 (1 x 10: ৳1,500.00).'],
  ['6ec85e9e-56f9-4e4f-a811-b114192d9e46', 'U8_PP280_WAVE3', '2 x 10', 20, 10, '45.00', '900.00', 'MedEx search: Livora 80 mg ৳45.00 (2 x 10: ৳900.00).'],
  ['53905d07-32e1-4f1d-899c-62e1a9c72c2a', 'U8_PP280_WAVE3', '2 x 10', 20, 10, '55.00', '1100.00', 'MedEx search: Livora 100 mg ৳55.00 (2 x 10: ৳1,100.00).'],
  ['5e754cac-41a1-4d4f-9f85-5f5eb8b11cf2', 'U8_PP280_WAVE3', '1 x 14', 14, 14, '35.00', '490.00', 'MedEx search: Ricofix 45 mg ৳35.00 (1 x 14: ৳490.00).'],
  ['a5f94115-00c6-468d-a02a-4b60ef9aedf3', 'U8_PP280_WAVE3', '2 x 10', 20, 10, '35.00', '700.00', 'MedEx search: Cofixa 45 mg ৳35.00 (2 x 10: ৳700.00).'],
  ['d3162b15-0f8d-4b63-ae3c-3736e9fe6427', 'U8_PP280_WAVE3', "30's pack", 30, null, '590.00', '17700.00', 'MedEx search: Clexta 100 mg ৳590.00 (1 x 30 HDPE container: ৳17,700.00).'],
  ['8eadf29b-2c3a-42a2-bfaa-93443f0d1297', 'U8_PP280_WAVE3', "21's pack", 21, null, '500.00', '10500.00', 'MedEx search: Giltela 40 mg ৳500.00 (1 x 21 pack: ৳10,500.00).'],
  ['f264fcf3-8d30-41a0-b600-f8f83646668b', 'U8_PP280_WAVE3', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Marcus 5 mg ৳20.00 (2 x 10: ৳400.00).'],
];

const HELD_FROM_BATCH8 = [
  {
    packId: 'ac3fd8bf-d057-4a28-9f40-25720203e92a',
    name: 'Helicon V 20 mg+1000 mg+500 mg (General)',
    reason: 'Vonoprazan + Amoxicillin + Clarithromycin multi-drug H. pylori combikit (held since Batch 6 pending pouch representation).',
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
  const ids = BATCH8_SPECS.map((s) => s[0]);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Duplicate packId detected in Batch 8 specs');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const { packs, allU8 } = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [targetPacks, u8Packs] = await Promise.all([
        tx.medicinePack.findMany({
          where: { id: { in: ids } },
          include: { brand: { select: { sourceId: true, name: true, strength: true, dosageForm: true, manufacturer: true } } },
        }),
        tx.medicinePack.findMany({
          where: { packUnits: 30, unitPrice: '8', packPrice: '280' },
          select: { id: true },
        }),
      ]);
      return { packs: targetPacks, allU8: u8Packs };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 });

    const stagedIdSet = new Set(ids);
    const heldIdSet = new Set(HELD_FROM_BATCH8.map((h) => h.packId));
    const unaccounted = allU8.filter((x) => !stagedIdSet.has(x.id) && !heldIdSet.has(x.id));
    if (unaccounted.length > 0) {
      throw new Error(`Unaccounted u=8/280 packs remain: ${JSON.stringify(unaccounted)}`);
    }

    const pMap = new Map(packs.map((p) => [p.id, p]));
    let warningsClearedCount = 0;

    const stagedUpdates = BATCH8_SPECS.map((spec) => {
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

    const manifest = {
      generatedAt: new Date().toISOString(),
      status: 'STAGED_READ_ONLY_NOT_EXECUTED',
      summary: {
        u8pp280Wave3_count: stagedUpdates.length,
        totalVerifiedStagedBatch8: stagedUpdates.length,
        samePackUnitsCount: stagedUpdates.filter((x) => x.migrationKind === 'SAME_PACK_UNITS').length,
        packMigrationCount: stagedUpdates.filter((x) => x.migrationKind === 'PACK_MIGRATION').length,
        warningsClearedCount,
        heldFromBatch8Count: HELD_FROM_BATCH8.length,
        liveRemainingU8pp280VerifiedCount: allU8.length,
      },
      batch8Updates: stagedUpdates,
      heldFromBatch8: HELD_FROM_BATCH8,
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch8_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const mdLines = [
      '# CareDose — Staged Batch 8 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 8 Summary',
      `- **Corrupted \`u=8.00 / pp=280.00\` Wave 3 (${stagedUpdates.length} / ${allU8.length}):** All \`89\` remaining unmatched Tablet template packs verified via grounded web search (leaving only previously held \`Helicon V\` combikit among all \`u=8/280\` rows).`,
      `- **Breakdown:** \`${manifest.summary.samePackUnitsCount}\` same pack units + \`${manifest.summary.packMigrationCount}\` pack migrations, clearing **${warningsClearedCount}** \`pack_price_inconsistent_with_unit_price\` warnings.`,
      `- **Held From Batch 8 (${HELD_FROM_BATCH8.length}):** \`Helicon V\` (*H. pylori* combikit).`,
      '',
      `## Staged Batch 8 Updates (${stagedUpdates.length})`,
      ...stagedUpdates.map((x) => `- **${x.brandName} ${x.strength ?? ''}** [${x.subKind}]: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``),
      '',
      `## Held From Batch 8 (${HELD_FROM_BATCH8.length})`,
      ...HELD_FROM_BATCH8.map((h) => `- **${h.name}**: ${h.reason}`),
    ];

    const mdOut = path.join(STAGING_DIR, 'batch8_staging_report.md');
    fs.writeFileSync(mdOut, mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH8_STAGED_SUCCESSFULLY', summary: manifest.summary, jsonOut, mdOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
