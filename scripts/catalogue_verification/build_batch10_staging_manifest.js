/**
 * Strictly READ-ONLY builder for Batch 10 Staged Wave Manifest.
 * Covers all 130 non-divisible strip packs in ar_divBox_AND_priceDiff (115) + noAr (15),
 * plus a complete grounded audit of all 24 remaining zero-pack brands:
 *   - Sub-batch 10A (113 updates + 2 optional obsolete 2nd-pack deletes):
 *       Verified MedEx replacements for all 115 ar_divBox_AND_priceDiff non-divisible strips.
 *       Detonix 20 mg (50's) and Ecosprin 75 mg (100's) are staged separately as optional
 *       obsolete duplicate-pack deletes (0 InventoryTransaction refs; MedEx lists only 10x15 & 20x14).
 *   - Sub-batch 10B (15 updates):
 *       Verified MedEx replacements clearing 100% of remaining noAr non-divisible strip packs (15 -> 0).
 *   - Sub-batch 10C (3 zero-pack inserts + 21 documented unpriced exclusions):
 *       Adds MedEx-verified packs for Semaglut 3 mg, Semaglut 7 mg, and Tamsulin 0.4 mg
 *       (and updates brand.priceFieldStatus = PRESENT); documents all 21 unpriced/excluded brands.
 *   - Deferred Batch 11 Candidate (156):
 *       Remaining ar_divBox_samePrice non-divisible strip packs (156) require dedicated single-brand
 *       MedEx checks (audit sample found 18 with MedEx/Arogga unit price drift incl. Cefstar 500 8's,
 *       Midita 50 1x4, Alagra 180 3x10@10).
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

const STAGING_DIR = path.join(REPO, 'backend/reports/batch10_staging');
const PROFILE_JSON = 'C:/Users/Mehedi Hasan/.gemini/antigravity/brain/1e1c9592-14c9-449f-9741-aee3d98c6d1c/scratch/batch10_candidates_structured.json';
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Format: [packId, subKind, packQuantity, packUnits, stripUnits, unitPrice, packPrice, evidence]
const SUBBATCH_10A_SPECS = [
  ['a27684dd-4890-48f8-87a5-73c38f625b2c', 'AR_PRICE_DIFF', '3 x 6', 18, 6, '40.00', '720.00', 'MedEx search: Cefadyl 200 mg Capsule ৳40.00 (3 x 6: ৳720.00).'],
  ['fac95023-d5ce-4d5f-b37d-4261ab526547', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '65.00', '910.00', 'MedEx search: Cefixime-A 400 mg Capsule ৳65.00 (2 x 7: ৳910.00).'],
  ['0d87fd94-4c97-4ee3-935d-aa035bf0b655', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '60.00', '840.00', 'MedEx search: Starcef 400 mg Capsule ৳60.00 (2 x 7: ৳840.00).'],
  ['59646b3d-c066-4808-bc5d-0d25efd489d6', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '45.00', '630.00', 'MedEx search: Starcef 200 mg Capsule ৳45.00 (2 x 7: ৳630.00).'],
  ['73e3d414-b99e-4770-b79e-919529e6cc88', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '60.00', '840.00', 'MedEx search: Tocef 400 mg Capsule ৳60.00 (2 x 7: ৳840.00).'],
  ['ae5f01f9-4674-441f-b82d-aa0e10fbc836', 'AR_PRICE_DIFF', '1 x 6', 6, 6, '33.00', '198.00', 'MedEx search: D-up 40000 IU Capsule ৳33.00 (1 x 6: ৳198.00).'],
  ['1c523999-6b2f-41b4-bef5-18e295aafe8d', 'AR_PRICE_DIFF', '2 x 6', 12, 6, '44.00', '528.00', 'MedEx search: Ceficap 200 mg Capsule ৳44.00 (2 x 6: ৳528.00).'],
  ['5d36db38-1b02-406d-a20d-04c8786ccb1d', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '38.00', '532.00', 'MedEx search: Orgaxim 200 mg Capsule ৳38.00 (2 x 7: ৳532.00).'],
  ['a34849ed-3b0f-40d2-add1-b16143b4af7d', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '45.00', '630.00', 'MedEx search: Tocef 200 mg Capsule ৳45.00 (2 x 7: ৳630.00).'],
  ['f06806b3-6f21-40ae-91b1-273627ce92d3', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '40.00', '560.00', 'MedEx search: Truso 200 mg Capsule ৳40.00 (2 x 7: ৳560.00).'],
  ['c27739b7-725b-43c4-b97a-b7c7c9dc2c4f', 'AR_PRICE_DIFF', '5 x 6', 30, 6, '15.00', '450.00', 'MedEx search: Itrafun 100 mg Capsule ৳15.00 (5 x 6: ৳450.00).'],
  ['f24ed48c-40a3-464b-a75f-0099043858f3', 'AR_PRICE_DIFF', '1 x 15', 15, 15, '10.05', '150.75', 'MedEx search: Asta King 2 mg Capsule ৳10.05 (1 x 15: ৳150.75).'],
  ['5411471a-8f71-4920-b873-7318dc435212', 'AR_PRICE_DIFF', '3 x 7', 21, 7, '20.00', '420.00', 'MedEx search: Azonox Ultra 65 mg Capsule ৳20.00 (3 x 7: ৳420.00).'],
  ['5dfd044a-b5db-43ba-9b00-bfaaf1c2bde7', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Candifast 50 mg Capsule ৳10.00 (3 x 10: ৳300.00).'],
  ['9f060d72-cf81-459d-adec-51fe6d823aae', 'AR_PRICE_DIFF', '5 x 10', 50, 10, '20.00', '1000.00', 'MedEx search: Candifast SB 65 mg Capsule ৳20.00 (5 x 10: ৳1,000.00).'],
  ['1c6c0116-337c-403b-af50-d2d018288611', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '17.00', '510.00', 'MedEx search: Eloza SB 65 mg Capsule ৳17.00 (3 x 10: ৳510.00).'],
  ['67db25b3-b526-421d-91a9-b79b4af0315f', 'AR_PRICE_DIFF', '2 x 10', 20, 10, '16.00', '320.00', 'MedEx search: Itazol 100 mg Capsule ৳16.00 (2 x 10: ৳320.00).'],
  ['a1bbe3f3-7070-4400-a803-2a72810b820f', 'AR_PRICE_DIFF', '2 x 10', 20, 10, '14.00', '280.00', 'MedEx search: Itcon 100 mg Capsule ৳14.00 (2 x 10: ৳280.00).'],
  ['d2616d0b-7002-469f-bad9-b4215ef7bfec', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Itra Nova 65 mg Capsule ৳20.00 (3 x 10: ৳600.00).'],
  ['e33fead0-b2ca-4c2b-b831-d554914195f4', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '17.00', '510.00', 'MedEx search: Itracon 100 mg Capsule ৳17.00 (3 x 10: ৳510.00).'],
  ['9af3e842-e17b-4268-bbbe-7b00e9a29f72', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Itracon SUBA 65 mg Capsule ৳20.00 (3 x 10: ৳600.00).'],
  ['4e917a17-fed1-4895-8797-fb16c9cbfc7e', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Itrader SB 65 mg Capsule ৳20.00 (3 x 10: ৳600.00).'],
  ['b549c13e-743b-473c-b07f-9b84fd7e7a81', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Itrakill SB 65 mg Capsule ৳20.00 (3 x 10: ৳600.00).'],
  ['0f186510-8bab-4d37-bd96-bf78bfc343bf', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Itrazen SB 65 mg Capsule ৳20.00 (3 x 10: ৳600.00).'],
  ['a2ec6492-170f-4a29-9935-2e53f34215ed', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '17.00', '510.00', 'MedEx search: Nocandia 100 mg Capsule ৳17.00 (3 x 10: ৳510.00).'],
  ['22ea58d5-472d-47b8-8570-44026a8d79a3', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Nocandia SB 65 mg Capsule ৳20.00 (3 x 10: ৳600.00).'],
  ['3297d993-c6ba-4d2d-8a84-e8ccd23e4957', 'AR_PRICE_DIFF', '6 x 5', 30, 5, '23.00', '690.00', 'MedEx search: Uromax-D 0.4+0.5 Capsule ৳23.00 (6 x 5: ৳690.00).'],
  ['6bd01d25-4e81-4b8c-85f9-6a7bd4f35c3a', 'AR_PRICE_DIFF', '5 x 6', 30, 6, '6.50', '195.00', 'MedEx search: Luf 250 mg Capsule ৳6.50 (5 x 6: ৳195.00).'],
  ['88045bc7-5f13-4093-86c1-7ea376ab3d75', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '23.00', '690.00', 'MedEx search: Demelon 1.5 mg Capsule ৳23.00 (3 x 10: ৳690.00).'],
  ['baeb884f-a44a-4ebf-973c-b86897380d60', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Myrica 25 mg Capsule ৳10.00 (3 x 10: ৳300.00).'],
  ['2b58b300-841c-4815-81b0-045429d9e3ad', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '13.50', '405.00', 'MedEx search: Myrica 50 mg Capsule ৳13.50 (3 x 10: ৳405.00).'],
  ['7ceca8a5-1d14-4599-9f67-b6ea038e8d9e', 'AR_PRICE_DIFF', '4 x 7', 28, 7, '22.00', '616.00', 'MedEx search: Myrica 100 mg Capsule ৳22.00 (4 x 7: ৳616.00).'],
  ['5723dbe4-d516-4efb-af0f-5d80ec015fa2', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '14.00', '420.00', 'MedEx search: Nervica 50 mg Capsule ৳14.00 (3 x 10: ৳420.00).'],
  ['98a7176f-fa1f-4599-8628-aed779f383b2', 'AR_PRICE_DIFF', '3 x 12', 36, 12, '19.00', '684.00', 'MedEx search: GABA-P 75 mg Capsule ৳19.00 (3 x 12: ৳684.00).'],
  ['d55d4436-b216-4bb1-bb6a-d3f682ac903b', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '15.00', '630.00', 'MedEx search: GABA-P 50 mg Capsule ৳15.00 (3 x 14: ৳630.00).'],
  ['d85378c1-a43d-4d51-a35c-815643486646', 'AR_PRICE_DIFF', '5 x 10', 50, 10, '12.00', '600.00', 'MedEx search: Azecol Capsule ৳12.00 (5 x 10: ৳600.00).'],
  ['8f90c844-918b-4573-8c11-98ccbfad0fd1', 'AR_PRICE_DIFF', '6 x 10', 60, 10, '11.50', '690.00', 'MedEx search: Optagold Capsule ৳11.50 (6 x 10: ৳690.00).'],
  ['60cba7d1-40d6-44fa-9edc-8bb6e21164ea', 'AR_PRICE_DIFF', '3 x 7', 21, 7, '11.50', '241.50', 'MedEx search: Flupen 500 mg Capsule ৳11.50 (3 x 7: ৳241.50).'],
  ['1c725179-6455-4e21-984a-5f3a16df49d9', 'AR_PRICE_DIFF', '4 x 10', 40, 10, '12.00', '480.00', 'MedEx search: Peptex 40 mg Capsule ৳12.00 (4 x 10: ৳480.00).'],
  ['c64646d8-128d-4860-9483-099928578d20', 'AR_PRICE_DIFF', '5 x 7', 35, 7, '6.50', '227.50', 'MedEx search: Luminus 4 mg Chewable Tablet ৳6.50 (5 x 7: ৳227.50).'],
  ['046bf8ab-c426-46b6-b25a-b183daa10e16', 'AR_PRICE_DIFF', '5 x 7', 35, 7, '8.50', '297.50', 'MedEx search: Luminus 5 mg Chewable Tablet ৳8.50 (5 x 7: ৳297.50).'],
  ['d961b8a1-34ee-44b8-8b38-ee410052f9a9', 'AR_PRICE_DIFF', '4 x 10', 40, 10, '16.50', '660.00', 'MedEx search: Exium MUPS 40 mg Tablet ৳16.50 (4 x 10: ৳660.00).'],
  ['9d90ae43-323b-4851-be7d-bdf2cbca00eb', 'AR_PRICE_DIFF', '5 x 14', 70, 14, '11.00', '770.00', 'MedEx search: Zo-MUPS 20 mg Tablet ৳11.00 (5 x 14: ৳770.00).'],
  ['bb4320b4-3924-4615-8288-5d1078460545', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '85.00', '1190.00', 'MedEx search: Adrox CV 500+125 Tablet ৳85.00 (2 x 7: ৳1,190.00).'],
  ['a466cebe-77d5-489b-a1d8-cfa0e29de89b', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '60.00', '840.00', 'MedEx search: Athexim CV 500+125 Tablet ৳60.00 (2 x 7: ৳840.00).'],
  ['cc279dbc-3196-40c2-af32-c7101e460ba9', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '65.00', '910.00', 'MedEx search: Axim CV 500+125 Tablet ৳65.00 (2 x 7: ৳910.00).'],
  ['e88f5438-ad6c-49dd-99b3-51c0113920a0', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '45.00', '630.00', 'MedEx search: Claricin 500 mg Tablet ৳45.00 (2 x 7: ৳630.00).'],
  ['a21f15db-2325-4a8a-8785-b43a1e638a09', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '50.00', '700.00', 'MedEx search: Furex 500 mg Tablet ৳50.00 (2 x 7: ৳700.00).'],
  ['f8b21fb1-918f-469d-9828-d8b548345956', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '65.00', '910.00', 'MedEx search: Secoclav 500+125 Tablet ৳65.00 (2 x 7: ৳910.00).'],
  ['066195de-c79f-4581-a0f7-5f050f52faff', 'AR_PRICE_DIFF', '2 x 6', 12, 6, '350.00', '4200.00', 'MedEx search: Pazoren 200 mg Tablet ৳350.00 (2 x 6: ৳4,200.00).'],
  ['3b7b50ae-54c3-435f-8dc4-73cb6f5c9d81', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '35.00', '490.00', 'MedEx search: Axim CV 250+62.5 Tablet ৳35.00 (2 x 7: ৳490.00).'],
  ['c50ac0cc-536b-4ae1-848c-b8eb8c25a2d2', 'AR_PRICE_DIFF', '3 x 4', 12, 4, '50.00', '600.00', 'MedEx search: Duo-5 200+125 Tablet ৳50.00 (3 x 4: ৳600.00).'],
  ['2cd55560-603b-4b78-824f-3fbe7c9e4325', 'AR_PRICE_DIFF', '3 x 6', 18, 6, '50.00', '900.00', 'MedEx search: Thiza 500 mg Tablet ৳50.00 (3 x 6: ৳900.00).'],
  ['40cff304-6942-42d6-bd2b-5d2d929804fe', 'AR_PRICE_DIFF', '2 x 7', 14, 7, '32.00', '448.00', 'MedEx search: Ceforan 200 mg Tablet ৳32.00 (2 x 7: ৳448.00).'],
  ['8e04c0d4-b49b-4a0a-8318-861716f09776', 'AR_PRICE_DIFF', '3 x 6', 18, 6, '25.00', '450.00', 'MedEx search: Axita 200 mg Capsule ৳25.00 (3 x 6: ৳450.00).'],
  ['d84a936b-fd7a-4d64-8232-f2dfae62dcc6', 'AR_PRICE_DIFF', '5 x 6', 30, 6, '12.00', '360.00', 'MedEx search: Myosit 750 mg Tablet ৳12.00 (5 x 6: ৳360.00).'],
  ['c266ff81-3f62-492b-9083-0b896923a30b', 'AR_PRICE_DIFF', '5 x 6', 30, 6, '18.00', '540.00', 'MedEx search: Siglimet 50+1000 Tablet ৳18.00 (5 x 6: ৳540.00).'],
  ['92cdaa6f-2b54-431b-b986-ef68572b9bce', 'AR_PRICE_DIFF', '5 x 4', 20, 4, '35.00', '700.00', 'MedEx search: Co-Axet 250+62.5 Tablet ৳35.00 (5 x 4: ৳700.00).'],
  ['75ad658a-3aa1-4c24-b601-07af58372024', 'AR_PRICE_DIFF', '4 x 6', 24, 6, '125.00', '3000.00', 'MedEx search: Caparen 500 mg Tablet ৳125.00 (4 x 6: ৳3,000.00).'],
  ['de347c0e-ae54-49b6-8d7e-681f1d290918', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Tiginor 20 mg Tablet ৳20.00 (3 x 10: ৳600.00).'],
  ['7223a611-d84b-40d3-9cbe-1cd449422892', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Tenicar 20 mg Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['c117309d-d227-4ad6-8e79-c0b5cb74a10c', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Tenivasc 5+20 Tablet ৳10.00 (3 x 10: ৳300.00).'],
  ['f4d34753-fdd6-4207-b6bb-c1553939c54b', 'AR_PRICE_DIFF', '4 x 7', 28, 7, '11.04', '309.12', 'MedEx search: Belsar Plus 20+12.5 Tablet ৳11.04 (4 x 7: ৳309.12).'],
  ['937a71de-ef36-4575-aa80-f56fbde59070', 'AR_PRICE_DIFF', '4 x 7', 28, 7, '17.00', '476.00', 'MedEx search: Belsar Plus 40+12.5 Tablet ৳17.00 (4 x 7: ৳476.00).'],
  ['78251612-c7fa-4887-9499-c82232572efc', 'AR_PRICE_DIFF', '4 x 7', 28, 7, '12.00', '336.00', 'MedEx search: Belsar-M 5+20 Tablet ৳12.00 (4 x 7: ৳336.00).'],
  ['36119a89-0b0e-4942-affd-d7b316df72be', 'AR_PRICE_DIFF', '4 x 7', 28, 7, '20.00', '560.00', 'MedEx search: Belsar-M 5+40 Tablet ৳20.00 (4 x 7: ৳560.00).'],
  ['fa621f44-64da-43a8-bf91-025aaea3787e', 'AR_PRICE_DIFF', '4 x 7', 28, 7, '9.00', '252.00', 'MedEx search: Cardisan 50 mg Tablet ৳9.00 (4 x 7: ৳252.00).'],
  ['6d2b65c3-744a-4ec5-857b-73aa96588946', 'AR_PRICE_DIFF', '4 x 7', 28, 7, '12.00', '336.00', 'MedEx search: Nebinex 5 mg Tablet ৳12.00 (4 x 7: ৳336.00).'],
  ['016f304e-6f32-48d9-80c8-004758b6c64e', 'AR_PRICE_DIFF', '3 x 7', 21, 7, '17.00', '357.00', 'MedEx search: Presnor 40 mg Tablet ৳17.00 (3 x 7: ৳357.00).'],
  ['c5549d9e-d77f-40a8-b01b-684f85508d6d', 'AR_PRICE_DIFF', '4 x 8', 32, 8, '16.00', '512.00', 'MedEx search: Calgi-DX 600+400 Tablet ৳16.00 (4 x 8: ৳512.00).'],
  ['39dfc698-d324-4da1-aa91-44fecaff8e2f', 'AR_PRICE_DIFF', '4 x 8', 32, 8, '23.00', '736.00', 'MedEx search: EmpaMet 5+1000 Tablet ৳23.00 (4 x 8: ৳736.00).'],
  ['1757cd38-5529-43e9-ad38-2cf08fb5b8bb', 'AR_PRICE_DIFF', '4 x 8', 32, 8, '30.00', '960.00', 'MedEx search: EmpaMet 12.5+850 Tablet ৳30.00 (4 x 8: ৳960.00).'],
  ['b203209d-0c40-4821-a2fc-9d100a2108f4', 'AR_PRICE_DIFF', '4 x 8', 32, 8, '22.00', '704.00', 'MedEx search: EmpaMet 5+850 Tablet ৳22.00 (4 x 8: ৳704.00).'],
  ['8fbd5600-b02b-43e6-8873-24319ebaebb9', 'AR_PRICE_DIFF', '2 x 14', 28, 14, '20.00', '560.00', 'MedEx search: Azoren 5+40 Tablet ৳20.00 (2 x 14: ৳560.00).'],
  ['c25c7f29-017d-4301-88ed-d64533324ce2', 'AR_PRICE_DIFF', '2 x 14', 28, 14, '12.50', '350.00', 'MedEx search: Azoren 5+20 Tablet ৳12.50 (2 x 14: ৳350.00).'],
  ['76260a6a-df00-4a7f-b81c-d84025c515b4', 'AR_PRICE_DIFF', '2 x 14', 28, 14, '10.00', '280.00', 'MedEx search: Cardicil 10 mg Tablet ৳10.00 (2 x 14: ৳280.00).'],
  ['2fd92b37-dc9a-4afc-a515-ad7f0a92e918', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '8.00', '336.00', 'MedEx search: Cardicil 5 mg Tablet ৳8.00 (3 x 14: ৳336.00).'],
  ['870d762c-8efd-4dc3-ab23-5d774d71e886', 'AR_PRICE_DIFF', '2 x 14', 28, 14, '16.00', '448.00', 'MedEx search: Disartan 5+40 Tablet ৳16.00 (2 x 14: ৳448.00).'],
  ['06dac862-207e-40e0-bdb2-966327491c6d', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '7.00', '294.00', 'MedEx search: Ebanil 10 mg Tablet ৳7.00 (3 x 14: ৳294.00).'],
  ['a77c6358-c8ac-4e1d-825b-631f9c6d02a8', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '16.00', '672.00', 'MedEx search: Loctril 10 mg Tablet ৳16.00 (3 x 14: ৳672.00).'],
  ['ab37f97c-4467-44c6-8078-336a7b0476df', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '6.00', '252.00', 'MedEx search: Olsart 10 mg Tablet ৳6.00 (3 x 14: ৳252.00).'],
  ['c918409b-34f0-4724-9e7f-f9349ce2b533', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '10.00', '420.00', 'MedEx search: Olsart 20 mg Tablet ৳10.00 (3 x 14: ৳420.00).'],
  ['fccd0217-bc3b-4061-a6e3-42bcc66809a7', 'AR_PRICE_DIFF', '2 x 14', 28, 14, '22.00', '616.00', 'MedEx search: Prestorin 10 mg Tablet ৳22.00 (2 x 14: ৳616.00).'],
  ['97c32ae7-2bf4-4792-8a6d-cdb533236670', 'AR_PRICE_DIFF', '2 x 14', 28, 14, '11.00', '308.00', 'MedEx search: Prestorin 5 mg Tablet ৳11.00 (2 x 14: ৳308.00).'],
  ['bbef26fc-a918-4381-99a1-0705833c23c7', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '12.00', '504.00', 'MedEx search: Torosic 10 mg Tablet ৳12.00 (3 x 14: ৳504.00).'],
  ['e4220064-a4f3-4cef-9cd5-14993cda5c50', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '7.00', '294.00', 'MedEx search: Losita 5 mg Tablet ৳7.00 (3 x 14: ৳294.00).'],
  ['596fa36c-d523-40a7-8d9b-54fdc7483aa8', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '4.00', '120.00', 'MedEx search: Bisoren 1.25 mg Tablet ৳4.00 (3 x 10: ৳120.00).'],
  ['70aca884-5dd8-42c3-aa28-dcdec6fa7460', 'AR_PRICE_DIFF', '3 x 15', 45, 15, '6.00', '270.00', 'MedEx search: Ethinor 5 mg Tablet ৳6.00 (3 x 15: ৳270.00).'],
  ['fab7bebe-dd5a-42b3-8c88-f34fb830e26b', 'AR_PRICE_DIFF', '2 x 14', 28, 14, '12.00', '336.00', 'MedEx search: Amilin Max 25+10 Tablet ৳12.00 (2 x 14: ৳336.00).'],
  ['3ef30570-7a29-429f-b5ee-0b170317ddce', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '150.00', '4500.00', 'MedEx search: Extals 50 mg Tablet ৳150.00 (3 x 10: ৳4,500.00).'],
  ['6e035a11-4005-4721-9a48-8ed04f2e8c67', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '150.00', '4500.00', 'MedEx search: Riluzol 50 mg Tablet ৳150.00 (3 x 10: ৳4,500.00).'],
  ['ea704217-3955-4b73-98c7-7f80007399cc', 'AR_PRICE_DIFF', '10 x 14', 140, 14, '4.00', '560.00', 'MedEx search: Dudon 10 mg Tablet ৳4.00 (10 x 14: ৳560.00).'],
  ['a304f32c-c639-4f8c-b273-6a795d1c1edd', 'AR_PRICE_DIFF', '2 x 14', 28, 14, '15.00', '420.00', 'MedEx search: Griso Ultra 125 mg Tablet ৳15.00 (2 x 14: ৳420.00).'],
  ['a09db3a9-6517-4156-ad1e-9a5b9b896690', 'AR_PRICE_DIFF', '10 x 15', 150, 15, '2.50', '375.00', 'MedEx search: Domfix 10 mg Tablet ৳2.50 (10 x 15: ৳375.00).'],
  ['2c890bad-2971-414d-be20-193d490e1bdc', 'AR_PRICE_DIFF', '10 x 15', 150, 15, '3.50', '525.00', 'MedEx search: Famodin 20 mg Tablet ৳3.50 (10 x 15: ৳525.00).'],
  ['2faac261-b4cf-4afb-b9b8-cc72c8cda7bb', 'AR_PRICE_DIFF', '6 x 15', 90, 15, '1.10', '99.00', 'MedEx search: Leroid 25 mcg Tablet ৳1.10 (6 x 15: ৳99.00).'],
  ['79df0511-c8b0-474b-9958-ab5e1bd18022', 'AR_PRICE_DIFF', '10 x 15', 150, 15, '4.00', '600.00', 'MedEx search: Omidon 10 mg Tablet ৳4.00 (10 x 15: ৳600.00).'],
  ['9ddadc09-b7ee-434b-b3f6-b745af55d364', 'AR_PRICE_DIFF', '10 x 10', 100, 10, '2.00', '200.00', 'MedEx search: Carvista 3.125 mg Tablet ৳2.00 (10 x 10: ৳200.00).'],
  ['b9108adc-604d-4532-b7b6-0240c5296bb1', 'AR_PRICE_DIFF', '10 x 15', 150, 15, '3.00', '450.00', 'MedEx search: Famomax 20 mg Tablet ৳3.00 (10 x 15: ৳450.00).'],
  ['950cde88-fb14-4e93-89f0-7c6e518ee621', 'AR_PRICE_DIFF', '3 x 10', 30, 10, '13.00', '390.00', 'MedEx search: Valex CR 500 mg Tablet ৳13.00 (3 x 10: ৳390.00).'],
  ['f2c88aca-5e3d-45d0-acd8-85b5faba7b29', 'AR_PRICE_DIFF', '5 x 10', 50, 10, '5.00', '250.00', 'MedEx search: Pantoprazole 20 mg EC (Pristine) ৳5.00 (5 x 10: ৳250.00).'],
  // Primary pack update for Detonix 20 mg (obsolete 50's staged in OPTIONAL_OBSOLETE_2PACK_DELETES):
  ['f9c6027a-860c-4d98-87f4-3e0ac13be221', 'AR_PRICE_DIFF', '10 x 15', 150, 15, '4.00', '600.00', 'MedEx search: Detonix 20 mg EC Tablet ৳4.00 (10 x 15: ৳600.00); replaces Kaggle 100s pack.'],
  ['695adb09-73cf-4b07-a3d6-9f51f4bc404d', 'AR_PRICE_DIFF', '8 x 14', 112, 14, '7.00', '784.00', 'MedEx search: Esoral 20 mg EC Tablet ৳7.00 (8 x 14: ৳784.00).'],
  // Primary pack update for Ecosprin 75 mg (obsolete 100's staged in OPTIONAL_OBSOLETE_2PACK_DELETES):
  ['508701bc-fb9c-4664-9e24-0a7dbc5eb7c8', 'AR_PRICE_DIFF', '20 x 14', 280, 14, '0.80', '224.00', 'MedEx search: Ecosprin 75 mg EC Tablet ৳0.80 (20 x 14: ৳224.00); replaces Kaggle 200s pack.'],
  ['9c0f2397-8874-4890-b015-1714e78b9138', 'AR_PRICE_DIFF', '5 x 4', 20, 4, '30.00', '600.00', 'MedEx search: Emjard M XR 10+1000 Tablet ৳30.00 (5 x 4: ৳600.00).'],
  ['017681ad-be4a-40fb-905e-e7d1bd348323', 'AR_PRICE_DIFF', '5 x 4', 20, 4, '50.00', '1000.00', 'MedEx search: Emjard M XR 25+1000 Tablet ৳50.00 (5 x 4: ৳1,000.00).'],
  ['92735a3a-210e-4c0f-ae72-ddf721add00b', 'AR_PRICE_DIFF', '5 x 4', 20, 4, '25.00', '500.00', 'MedEx search: Emjard M XR 5+1000 Tablet ৳25.00 (5 x 4: ৳500.00).'],
  ['1d3faa11-52a6-47f4-a745-ddbbcb0faa3d', 'AR_PRICE_DIFF', '2 x 8', 16, 8, '35.00', '560.00', 'MedEx search: EmpaMet XR 10+1000 Tablet ৳35.00 (2 x 8: ৳560.00).'],
  ['434d260a-49c5-47c5-86c3-5755256134a6', 'AR_PRICE_DIFF', '2 x 8', 16, 8, '55.00', '880.00', 'MedEx search: EmpaMet XR 25+1000 Tablet ৳55.00 (2 x 8: ৳880.00).'],
  ['9afd3b68-846b-43d4-bb94-6ad39251a674', 'AR_PRICE_DIFF', '2 x 8', 16, 8, '25.00', '400.00', 'MedEx search: EmpaMet XR 5+1000 Tablet ৳25.00 (2 x 8: ৳400.00).'],
  ['c5d783f8-8694-4fc0-a3c2-70177b06657b', 'AR_PRICE_DIFF', '2 x 21', 42, 21, '7.00', '294.00', 'MedEx search: Antoris MR 35 mg Tablet ৳7.00 (2 x 21: ৳294.00).'],
  ['bcfc4569-87ec-47e5-a4a5-867788def45d', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '5.00', '210.00', 'MedEx search: Nitrofix SR 2.6 mg Tablet ৳5.00 (3 x 14: ৳210.00).'],
  ['c8032672-e257-4968-89a3-0b670bd3ed6e', 'AR_PRICE_DIFF', '3 x 14', 42, 14, '6.00', '252.00', 'MedEx search: Indapa-SR 1.5 mg Tablet ৳6.00 (3 x 14: ৳252.00).'],
];

// Obsolete second packs on DB where manufacturer/MedEx now lists only the single primary box updated above:
const OPTIONAL_OBSOLETE_2PACK_DELETES = [
  {
    packId: '9aa9ff80-1456-43e1-979b-a6abc8275588',
    brandId: '42d8fe28-5eaf-4a6d-b7ce-4d95c7b64550',
    brandName: 'Detonix',
    strength: '20 mg',
    dosageForm: 'Tablet (Enteric Coated)',
    primaryKeptPackId: 'f9c6027a-860c-4d98-87f4-3e0ac13be221',
    reason: 'Kaggle imported both 50s (৳5/250) and 100s (৳5/500); MedEx now sells only 10 x 15 (৳4.00 / ৳600.00) mapped onto pack f9c6027a. 0 InventoryTransaction rows reference this pack.',
  },
  {
    packId: '024deba8-4dc3-44d1-8bd0-e0bda390845e',
    brandId: '92d43a47-db69-4d42-9fde-9b5bd5309d3f',
    brandName: 'Ecosprin',
    strength: '75 mg',
    dosageForm: 'Tablet (Enteric Coated)',
    primaryKeptPackId: '508701bc-fb9c-4664-9e24-0a7dbc5eb7c8',
    reason: 'Kaggle imported both 100s (৳0.63/63) and 200s (৳0.63/126); MedEx now lists 20 x 14 (৳0.80 / ৳224.00) mapped onto pack 508701bc. 0 InventoryTransaction rows reference this pack.',
  },
];

// All 15 remaining noAr non-divisible strip packs:
const SUBBATCH_10B_SPECS = [
  ['5df3155b-5f80-40ab-a968-d23930f121ce', 'NO_AR_STRIP', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Benkinson 100+25 Tablet ৳12.00 (3 x 10: ৳360.00).'],
  ['a6de2c55-3add-4e64-a19b-196dbdb2bf75', 'NO_AR_STRIP', '2 x 10', 20, 10, '18.00', '360.00', 'MedEx search: Benkinson 200+50 Tablet ৳18.00 (2 x 10: ৳360.00).'],
  ['5e243165-a496-49f1-9970-7d0bf7935f21', 'NO_AR_STRIP', '5 x 10', 50, 10, '9.00', '450.00', 'MedEx search: Esogel 40 mg Capsule ৳9.00 (5 x 10: ৳450.00).'],
  ['6b9494b7-617a-4832-93ac-b7c286b2f920', 'NO_AR_STRIP', '2 x 5', 10, 5, '17.00', '170.00', 'MedEx search: D-Zole 1000 mg Tablet ৳17.00 (2 x 5 / strip ৳85: ৳170.00).'],
  ['37c52d1b-b921-4416-94b6-09aba571b7e0', 'NO_AR_STRIP', '2 x 7', 14, 7, '45.00', '630.00', 'MedEx search: Moxilin-CV 875+125 Tablet ৳45.00 (2 x 7: ৳630.00).'],
  ['936d124d-9016-4327-91de-dfebc37b92db', 'NO_AR_STRIP', '2 x 7', 14, 7, '15.00', '210.00', 'MedEx search: Emparol-M 5+500 Tablet ৳15.00 (2 x 7: ৳210.00).'],
  ['7acd6493-8afe-4b44-8412-39bff745d906', 'NO_AR_STRIP', '3 x 7', 21, 7, '25.00', '525.00', 'MedEx search: Moxilin-CV 250+125 Tablet ৳25.00 (3 x 7: ৳525.00).'],
  ['89cf8687-adca-4e72-ba86-8ff419ce67f3', 'NO_AR_STRIP', '3 x 10', 30, 10, '18.00', '540.00', 'MedEx search: Emjard M 5+500 Tablet ৳18.00 (3 x 10: ৳540.00).'],
  ['ac5d6948-18d1-406e-b2a2-1c8f9630793a', 'NO_AR_STRIP', '2 x 10', 20, 10, '16.00', '320.00', 'MedEx search: Ligazid M 2.5+1000 Tablet ৳16.00 (2 x 10: ৳320.00).'],
  ['d297fc72-421c-4b7c-a957-b1e7abb8411a', 'NO_AR_STRIP', '3 x 10', 30, 10, '13.00', '390.00', 'MedEx search: Liglimet 2.5+500 Tablet ৳13.00 (3 x 10: ৳390.00).'],
  ['dfe55fd9-bffd-402d-a8c3-49ca7b9fd137', 'NO_AR_STRIP', '3 x 7', 21, 7, '32.00', '672.00', 'MedEx search: Demoxiclave 500+125 Tablet ৳32.00 (3 x 7: ৳672.00).'],
  ['4f3c00aa-cb69-492d-a35d-adc6e3745b5b', 'NO_AR_STRIP', '3 x 7', 21, 7, '25.00', '525.00', 'MedEx search: Demoxiclave 250+125 Tablet ৳25.00 (3 x 7: ৳525.00).'],
  ['1156286d-a817-4895-b99d-b3d1c4e44d14', 'NO_AR_STRIP', '4 x 9', 36, 9, '22.00', '792.00', 'MedEx search: Carticare Max 750+50 Tablet ৳22.00 (4 x 9: ৳792.00).'],
  ['691400f8-4092-42f5-aa60-801984194f52', 'NO_AR_STRIP', '6 x 15', 90, 15, '2.00', '180.00', 'MedEx search: Leroid 50 mcg Tablet ৳2.00 (6 x 15: ৳180.00).'],
  ['0b2b5e4c-160d-404d-aec0-cb57bdc86d60', 'NO_AR_STRIP', '10 x 15', 150, 15, '2.00', '300.00', 'MedEx search: Reset ER 665 mg Tablet ৳2.00 (10 x 15 / strip ৳30: ৳300.00).'],
];

// Sub-batch 10C: 3 Actionable Zero-Pack Brands (verified MedEx MRP published):
const SUBBATCH_10C_INSERTS = [
  {
    brandId: 'e8b0421a-d11e-42c2-9016-3c0c80837a13',
    sourceId: '32530',
    brandName: 'Semaglut',
    strength: '3 mg',
    dosageForm: 'Tablet',
    manufacturer: 'NIPRO JMI Pharma Ltd.',
    proposedInsert: {
      packQuantity: '1 x 10',
      packUnits: 10,
      stripUnits: 10,
      unitPrice: '450.00',
      packPrice: '4500.00',
      unitPriceLabel: 'Unit Price',
    },
    evidence: 'MedEx search: Semaglut 3 mg Tablet ৳450.00 (1 x 10: ৳4,500.00).',
  },
  {
    brandId: '6ec63e2f-a2ff-4c4e-a0dc-21dea43fc406',
    sourceId: '32529',
    brandName: 'Semaglut',
    strength: '7 mg',
    dosageForm: 'Tablet',
    manufacturer: 'NIPRO JMI Pharma Ltd.',
    proposedInsert: {
      packQuantity: '1 x 10',
      packUnits: 10,
      stripUnits: 10,
      unitPrice: '800.00',
      packPrice: '8000.00',
      unitPriceLabel: 'Unit Price',
    },
    evidence: 'MedEx search: Semaglut 7 mg Tablet ৳800.00 (1 x 10: ৳8,000.00).',
  },
  {
    brandId: 'd346b71d-af9d-4d22-8dda-5c02183a41b5',
    sourceId: '32894',
    brandName: 'Tamsulin',
    strength: '0.4 mg',
    dosageForm: 'Capsule (Modified Release)',
    manufacturer: 'Team Pharmaceuticals Ltd.',
    proposedInsert: {
      packQuantity: '3 x 10',
      packUnits: 30,
      stripUnits: 10,
      unitPrice: '9.00',
      packPrice: '270.00',
      unitPriceLabel: 'Unit Price',
    },
    evidence: 'MedEx search: Tamsulin 0.4 mg MR Capsule ৳9.00 (3 x 10: ৳270.00).',
  },
];

// All 21 remaining zero-pack brands confirmed unpriced / institutional / inactive on MedEx:
const DOCUMENTED_UNPRICED_ZERO_PACK = [
  { brandId: '84e97c0c-4064-4a6c-a2ee-7da0004b966b', sourceId: '33022', name: 'Baloflu 20 mg Tablet (Navana)', category: 'OFFICIALLY_UNPRICED', reason: 'MedEx/retail listings show Price Unavailable (unpriced specialty antiviral).' },
  { brandId: '8df1cbda-bcbe-4808-8884-368c43b59e3b', sourceId: '33023', name: 'Baloflu 40 mg Tablet (Navana)', category: 'OFFICIALLY_UNPRICED', reason: 'MedEx lists Price Unavailable.' },
  { brandId: 'bf72b62b-44f9-4c71-88a2-6487431e8f28', sourceId: '14885', name: 'Cholera Fluid IV Infusion (IPH)', category: 'GOVERNMENT_IPH_NOT_FOR_SALE', reason: 'Government Institute of Public Health supply (Not for sale / unpriced on MedEx).' },
  { brandId: '9b57365f-805f-4381-8c7d-3782d5bad057', sourceId: '29433', name: 'Covishield IM Injection (Serum Institute)', category: 'GOVERNMENT_INSTITUTIONAL_VACCINE', reason: 'Public immunization vaccine (Price Unavailable on MedEx).' },
  { brandId: '9a6db8d7-f7a5-4274-a4eb-0552892160c4', sourceId: '14904', name: 'Dextran 10%+5% IV Infusion (IPH)', category: 'GOVERNMENT_IPH_NOT_FOR_SALE', reason: 'Government IPH institutional IV infusion (Not for sale / unpriced).' },
  { brandId: 'c691811c-bc5a-48a6-a758-151e67217a19', sourceId: '19759', name: 'Dextran 6%+5% IV Infusion (IPH)', category: 'GOVERNMENT_IPH_NOT_FOR_SALE', reason: 'Government IPH institutional IV infusion (Not for sale / unpriced).' },
  { brandId: '56d750b2-a6c3-4add-a86d-9556bcc9a25b', sourceId: '14905', name: 'Dextran 40 10%+0.9% IV Infusion (IPH)', category: 'GOVERNMENT_IPH_NOT_FOR_SALE', reason: 'Government IPH institutional IV infusion (Not for sale / unpriced).' },
  { brandId: '4945af15-c202-42e2-b411-b53c3dc79c0b', sourceId: '14906', name: 'Dextran 70 6%+0.9% IV Infusion (IPH)', category: 'GOVERNMENT_IPH_NOT_FOR_SALE', reason: 'Government IPH institutional IV infusion (Not for sale / unpriced).' },
  { brandId: '8329eab9-4f9d-4435-81c3-65627590a03a', sourceId: '14883', name: 'Glucose Saline 0.9%+5% IV Infusion (IPH)', category: 'GOVERNMENT_IPH_NOT_FOR_SALE', reason: 'Government IPH institutional IV infusion (Not for sale / unpriced).' },
  { brandId: '728e212b-d88b-438a-b92d-b90ff84e753e', sourceId: '33126', name: 'Hertinib 40 mg Tablet (Drug International)', category: 'OFFICIALLY_UNPRICED', reason: 'MedEx lists Price Unavailable (specialist oncology).' },
  { brandId: '05a01101-1caf-43b9-9af1-c5078f11fb28', sourceId: '15433', name: 'Ketoseem 10 mg Tablet (Seema Pharma)', category: 'SEEMA_PHARMA_UNPRICED', reason: 'Discontinued/inactive Seema SKU; MedEx lists Price Unavailable.' },
  { brandId: 'e1d1a2d9-3231-4949-8fcf-e5731ae8a8a3', sourceId: '33089', name: 'Nilonib 200 mg Capsule (Drug International)', category: 'OFFICIALLY_UNPRICED_ON_MEDEX', reason: 'MedEx lists Price Unavailable for Nilonib 200 mg (Arogga #39689 stock=0 lists ৳800 Box=30; kept held pending official MedEx MRP).' },
  { brandId: 'd88018a3-a58e-4a86-aca5-a566aa7e62d3', sourceId: '23361', name: 'Panto SP 40 mg EC Tablet (Seema Pharma)', category: 'SEEMA_PHARMA_UNPRICED', reason: 'MedEx only prices 20 mg; 40 mg SKU has no published MRP.' },
  { brandId: '3001bb35-c55e-49e3-aa3c-a9c05885b691', sourceId: '23531', name: 'Paramol 500 mg Tablet (Seema Pharma)', category: 'SEEMA_PHARMA_UNPRICED', reason: 'MedEx only prices Oral Suspension; 500 mg tablet is Price Unavailable.' },
  { brandId: '3b9ec6d6-1481-49e0-be02-cd7f09e4cdd1', sourceId: '33091', name: 'Prostalex 250 mg Tablet (Beacon)', category: 'OFFICIALLY_UNPRICED', reason: 'MedEx lists Price Unavailable (Arogga #15574 dummy pv_mrp=1).' },
  { brandId: '769a9604-1366-4727-8a51-f7da1fde7bda', sourceId: '24243', name: 'Riboseem 5 mg Tablet (Seema Pharma)', category: 'SEEMA_PHARMA_UNPRICED', reason: 'MedEx lists Price Unavailable.' },
  { brandId: '656f5857-2b5d-4ffa-b8cf-4efc8eb2b150', sourceId: '25382', name: 'Seema-C 250 mg Chewable Tablet (Seema Pharma)', category: 'SEEMA_PHARMA_UNPRICED', reason: 'MedEx lists Price Unavailable.' },
  { brandId: '75aa1890-ec4b-43d4-820f-6291d94c1074', sourceId: '22437', name: 'Seemagyl 400 mg Tablet (Seema Pharma)', category: 'SEEMA_PHARMA_UNPRICED', reason: 'MedEx only prices Suspension; 400 mg tablet is Price Unavailable.' },
  { brandId: 'bc440e25-6c8b-4a0b-b136-a7aa1223a04f', sourceId: '21938', name: 'Seemaldrat 400 mg/5 ml Oral Suspension (Seema Pharma)', category: 'SEEMA_PHARMA_UNPRICED', reason: 'MedEx lists Price Unavailable.' },
  { brandId: '58787748-7fe7-49ed-963f-7da65aec6afa', sourceId: '17050', name: 'Seematrin DS 800+160 Tablet (Seema Pharma)', category: 'SEEMA_PHARMA_UNPRICED', reason: 'MedEx only prices Suspension; DS tablet is Price Unavailable.' },
  { brandId: '4ca26482-0a4c-4451-9aad-705de25c1554', sourceId: '25624', name: 'Soto 250 mg Tablet (Hudson)', category: 'OFFICIALLY_UNPRICED', reason: 'MedEx explicitly shows price not officially listed / Price Unavailable.' },
];

(async () => {
  const allSpecs = [...SUBBATCH_10A_SPECS, ...SUBBATCH_10B_SPECS];
  const specPackIds = allSpecs.map((s) => s[0]);
  const optionalDelIds = OPTIONAL_OBSOLETE_2PACK_DELETES.map((d) => d.packId);
  const allNonDivTargetIds = [...specPackIds, ...optionalDelIds];

  if (new Set(allNonDivTargetIds).size !== allNonDivTargetIds.length) {
    throw new Error('Duplicate packId detected across Batch 10 specs/deletes');
  }

  for (const [, subKind, pq, pu, su, unitStr, packStr] of allSpecs) {
    if (!Number.isInteger(su) || su <= 1 || su > 100 || !Number.isInteger(pu) || pu % su !== 0) {
      throw new Error(`Invalid strip/pack divisibility in ${subKind}: ${pq} pu=${pu} su=${su}`);
    }
    const u = Number(unitStr);
    const p = Number(packStr);
    const relErr = Math.abs(u * pu - p) / p;
    if (relErr > 0.0001) {
      throw new Error(`Arithmetic mismatch >0.01% in ${pq}: ${unitStr} * ${pu} != ${packStr}`);
    }
  }

  for (const ins of SUBBATCH_10C_INSERTS) {
    const { packUnits: pu, stripUnits: su, unitPrice: unitStr, packPrice: packStr } = ins.proposedInsert;
    if (!Number.isInteger(su) || su <= 1 || su > 100 || !Number.isInteger(pu) || pu % su !== 0) {
      throw new Error(`Invalid zero-pack divisibility for ${ins.brandName}`);
    }
    const relErr = Math.abs(Number(unitStr) * pu - Number(packStr)) / Number(packStr);
    if (relErr > 0.0001) {
      throw new Error(`Zero-pack arithmetic mismatch for ${ins.brandName}`);
    }
  }

  const profileJson = JSON.parse(fs.readFileSync(PROFILE_JSON, 'utf8'));
  const samePriceDeferred = profileJson.buckets.ar_divBox_samePrice;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const db = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [generics, brands, packs, dbPacks, delPacks, allNonDivPacks, allZeroBrands] = await Promise.all([
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
        tx.medicineBrand.findMany({
          where: { packs: { none: {} } },
          select: { id: true, sourceId: true, name: true, strength: true, dosageForm: true, manufacturer: true, priceFieldStatus: true, productUrl: true },
          orderBy: [{ name: 'asc' }, { sourceId: 'asc' }],
        }),
      ]);
      return { counts: { generics, brands, packs }, dbPacks, delPacks, allNonDivPacks, allZeroBrands };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 120000 });

    const pMap = new Map(db.dbPacks.map((p) => [p.id, p]));
    const dMap = new Map(db.delPacks.map((p) => [p.id, p]));
    const zMap = new Map(db.allZeroBrands.map((b) => [b.id, b]));

    if (db.allZeroBrands.length !== SUBBATCH_10C_INSERTS.length + DOCUMENTED_UNPRICED_ZERO_PACK.length) {
      throw new Error(`Zero-pack brand count drift: DB=${db.allZeroBrands.length}, expected=${SUBBATCH_10C_INSERTS.length + DOCUMENTED_UNPRICED_ZERO_PACK.length}`);
    }

    const nonDivSet = new Set(db.allNonDivPacks.map((r) => r.id));
    if (nonDivSet.size !== specPackIds.length + optionalDelIds.length + samePriceDeferred.length) {
      throw new Error(`Non-divisible count drift: DB=${nonDivSet.size} vs staged=${specPackIds.length}+${optionalDelIds.length}+deferred=${samePriceDeferred.length}`);
    }

    const baselineRows = [];
    const stagedUpdates = allSpecs.map(([packId, subKind, pq, pu, su, unitPrice, packPrice, evidence]) => {
      const p = pMap.get(packId);
      if (!p) throw new Error(`Missing target pack in DB: ${packId}`);
      if (!nonDivSet.has(packId)) throw new Error(`Expected pack ${packId} (${p.brand.name}) to be non-divisible`);

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

    const stagedZeroInserts = SUBBATCH_10C_INSERTS.map((ins) => {
      const b = zMap.get(ins.brandId);
      if (!b) throw new Error(`Zero-pack brand missing or already has packs: ${ins.brandId} (${ins.brandName})`);
      return {
        ...ins,
        sourceUrl: b.productUrl,
        currentPriceFieldStatus: b.priceFieldStatus,
        proposedPriceFieldStatus: 'PRESENT',
      };
    });

    const documentedExclusions = DOCUMENTED_UNPRICED_ZERO_PACK.map((ex) => {
      const b = zMap.get(ex.brandId);
      if (!b) throw new Error(`Documented excluded zero-pack brand missing or changed: ${ex.brandId} (${ex.name})`);
      return {
        ...ex,
        currentPriceFieldStatus: b.priceFieldStatus,
        sourceUrl: b.productUrl,
      };
    });

    const snapPath = path.join(STAGING_DIR, 'pre_batch10_baseline_snapshot.json');
    fs.writeFileSync(snapPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      counts: db.counts,
      nonDivisibleStripBaselineCount: db.allNonDivPacks.length,
      zeroPackBrandsBaselineCount: db.allZeroBrands.length,
      targetPackCount: baselineRows.length,
      baselineRows,
      optionalDeleteBaselineRows: optionalDeletes,
      zeroPackInsertsBaseline: stagedZeroInserts.map((z) => ({
        brandId: z.brandId,
        name: z.brandName,
        strength: z.strength,
        priceFieldStatus: z.currentPriceFieldStatus,
      })),
    }, null, 2));

    const sub10A = stagedUpdates.filter((x) => x.subKind === 'AR_PRICE_DIFF');
    const sub10B = stagedUpdates.filter((x) => x.subKind === 'NO_AR_STRIP');

    const manifest = {
      generatedAt: new Date().toISOString(),
      status: 'STAGED_READ_ONLY_NOT_EXECUTED',
      summary: {
        subbatch10A_arDivBoxPriceDiff_updates: sub10A.length,
        subbatch10A_optionalObsolete2PackDeletes: optionalDeletes.length,
        subbatch10B_noArStrips_updates: sub10B.length,
        subbatch10C_zeroPackInserts: stagedZeroInserts.length,
        subbatch10C_documentedUnpricedZeroPack: documentedExclusions.length,
        totalVerifiedUpdates: stagedUpdates.length,
        totalCoreWritesWithoutOptionalDelete: stagedUpdates.length + stagedZeroInserts.length,
        totalWritesWithOptionalDelete: stagedUpdates.length + stagedZeroInserts.length + optionalDeletes.length,
        deferredSamePriceSliceCount: samePriceDeferred.length,
        postBatch10ProjectedNonDivisibleIfDeletesHeld: samePriceDeferred.length + optionalDeletes.length,
        postBatch10ProjectedNonDivisibleIfDeletesApproved: samePriceDeferred.length,
        postBatch10ProjectedZeroPackBrands: documentedExclusions.length,
      },
      batch10Updates: stagedUpdates,
      optionalObsolete2PackDeletes: optionalDeletes,
      batch10ZeroPackInserts: stagedZeroInserts,
      documentedUnpricedZeroPack: documentedExclusions,
      deferredSamePriceSummary: {
        count: samePriceDeferred.length,
        unitPriceDriftVsAroggaCount: samePriceDeferred.filter((x) => Math.abs(Number(x.unitPrice) - Number(x.ar.pv_mrp)) > 0.01).length,
        sidGe33000Count: samePriceDeferred.filter((x) => Number(x.sourceId) >= 33000).length,
        sidLt33000Count: samePriceDeferred.filter((x) => Number(x.sourceId) < 33000).length,
        auditNote: 'Sample web check of the 18 unit-drift items proved Arogga cannot be trusted blindly for Batch 11 (e.g., Cefstar 500 genuinely has 8s pack @ ৳45.16=৳361.28 on MedEx; Midita 50 is 1x4 @ ৳42=৳168 not Arogga Box 30; Alagra 180 is 3x10 @ ৳10=৳300 not Arogga ৳8.50).',
      },
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch10_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const fmtRow = (x) => `- **${x.brandName} ${x.strength ?? ''}** [${x.subKind}]: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``;

    const mdLines = [
      '# CareDose — Staged Batch 10 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 10 Summary',
      `- **Sub-batch 10A — \`ar_divBox_AND_priceDiff\` Non-Divisible Strips (${sub10A.length} updates + ${optionalDeletes.length} optional duplicate-pack deletes):** Verified MedEx pack sizes and MRPs for all 115 packs in this slice (clearing corrupted \`sid >= 33xxx\` box guesses and migrated legacy box sizes). \`Detonix 20 mg\` \`50's\` and \`Ecosprin 75 mg\` \`100's\` are staged separately for optional deletion because MedEx now lists only \`10 x 15\` and \`20 x 14\`.`,
      `- **Sub-batch 10B — \`noAr\` Non-Divisible Strips (${sub10B.length} updates):** Clears 100% of remaining non-divisible strip packs lacking an Arogga match (15 -> 0).`,
      `- **Sub-batch 10C — Remaining Zero-Pack Brands Audit (${stagedZeroInserts.length} verified inserts + ${documentedExclusions.length} documented exclusions = 24):** Creates verified MedEx packs (and sets \`brand.priceFieldStatus = PRESENT\`) for \`Semaglut 3 mg\`, \`Semaglut 7 mg\`, and \`Tamsulin 0.4 mg\`; documents all 21 unpriced / institutional / Seema Pharma exclusions.`,
      `- **Deferred Batch 11 Slice (\`ar_divBox_samePrice\`, ${samePriceDeferred.length} packs):** Reduces total non-divisible strip packs from **286** to **${samePriceDeferred.length}** (if optional duplicate deletes approved) or **${samePriceDeferred.length + optionalDeletes.length}** (if kept).`,
      '',
      `## Sub-batch 10A (${sub10A.length})`,
      ...sub10A.map(fmtRow),
      '',
      `## Optional Obsolete Second-Pack Deletes (${optionalDeletes.length})`,
      ...optionalDeletes.map((d) => `- **${d.brandName} ${d.strength}** (\`${d.packId}\`, \`${d.currentValues.packQuantity}\` @ \`${d.currentValues.unitPrice}/${d.currentValues.packPrice}\`, \`inventoryTransactions=${d.inventoryTransactionsCount}\`): ${d.reason}`),
      '',
      `## Sub-batch 10B (${sub10B.length})`,
      ...sub10B.map(fmtRow),
      '',
      `## Sub-batch 10C — Verified Zero-Pack Inserts (${stagedZeroInserts.length})`,
      ...stagedZeroInserts.map((z) => `- **${z.brandName} ${z.strength}** (${z.dosageForm}, ${z.manufacturer}, \`priceFieldStatus: ${z.currentPriceFieldStatus} -> ${z.proposedPriceFieldStatus}\`): INSERT \`${z.proposedInsert.packQuantity} (pu=${z.proposedInsert.packUnits}, su=${z.proposedInsert.stripUnits}, ${z.proposedInsert.unitPrice}/${z.proposedInsert.packPrice})\``),
      '',
      `## Documented Unpriced / Excluded Zero-Pack Brands (${documentedExclusions.length})`,
      ...documentedExclusions.map((e) => `- **${e.name}** [\`${e.category}\`]: ${e.reason}`),
    ];

    const mdOut = path.join(STAGING_DIR, 'batch10_staging_report.md');
    fs.writeFileSync(mdOut, mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH10_STAGED_SUCCESSFULLY', summary: manifest.summary, snapPath, jsonOut, mdOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
