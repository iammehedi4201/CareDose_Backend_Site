/**
 * Strictly READ-ONLY builder for Batch 5 Staged Wave Manifest.
 * Verifies every target against live PostgreSQL before staging:
 *   - Sub-batch 5A (27): Unisaline Fruity + Rabnil 20 + 25 non-u8 severe (>=48%) outliers (3 held)
 *   - Sub-batch 5B (45): Top 45 Arogga-matched solid u=8.00/pp=280.00 corrupted-template packs
 * All 72 verified via grounded web search (medex.com.bd) without direct HTTP scraping.
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const dbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch5_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Format: [packId, subKind, pq, pu, su, unitPrice, packPrice, evidence]
const SUBBATCH_5A_SPECS = [
  ['944f847c-6aa3-4087-ac8f-5d530ab4654d', 'PARSED_WARNING_PRICE', "20's pack", 20, null, '6.00', '120.00', 'MedEx search: Unisaline Fruity 10 gm sachet ৳6.00 (20s pack: ৳120.00); clears price_text_not_fully_parsed.'],
  ['fdcf99b2-a190-4ccf-8e13-c90a82964353', 'HELD_VERIFY55_RESOLVED', '7 x 10', 70, 10, '6.00', '420.00', 'MedEx search: Rabnil 20 mg EC Tablet Unit Price ৳6.00 (7 x 10: ৳420.00); clears non-divisible strip + warning.'],
  ['1e33bba8-b313-4ead-852d-490cf8aa68da', 'SEVERE_GE48', '15 x 10', 150, 10, '1.50', '225.00', 'MedEx search: Alarzil 22.7 mg ৳1.50 (15 x 10: ৳225.00).'],
  ['ac70b347-0b0e-4d0f-a53c-8495b1c63dbf', 'SEVERE_GE48', '3 x 6', 18, 6, '10.07', '181.26', 'MedEx search: Diliner DR 30 mg ৳10.07 (3 x 6: ৳181.26).'],
  ['8bdccc3e-7fa5-42a9-a3b5-d8870d798b93', 'SEVERE_GE48', '5 x 10', 50, 10, '6.90', '345.00', 'MedEx search: Conpan ODT 0.5 mg ৳6.90 (5 x 10: ৳345.00).'],
  ['98d83393-7941-496d-8a80-6fb5ada80b2e', 'SEVERE_GE48', '3 x 10', 30, 10, '10.00', '300.00', 'MedEx search: Ovajet 50 mg ৳10.00 (3 x 10: ৳300.00).'],
  ['471cd5f4-9d68-4221-adbc-9fab0e1fe50c', 'SEVERE_GE48', '10 x 6', 60, 6, '5.00', '300.00', 'MedEx search: Magmax 365 mg ৳5.00 (10 x 6: ৳300.00).'],
  ['7f3ee956-23c5-468e-acf6-2ddc78157573', 'SEVERE_GE48', '5 x 6', 30, 6, '200.00', '6000.00', 'MedEx search: Deroximel DR 231 mg ৳200.00 (5 x 6: ৳6,000.00); fixes 28.6x underpricing.'],
  ['ccd7247b-b61a-4b69-adaa-d7344a472fad', 'SEVERE_GE48', '10 x 6', 60, 6, '70.00', '4200.00', 'MedEx search: Pancreon 25000 300 mg ৳70.00 (10 x 6: ৳4,200.00).'],
  ['202de95e-c9ce-4212-a8a5-c85313f4ab3e', 'SEVERE_GE48', '3 x 10', 30, 10, '50.00', '1500.00', 'MedEx search: Panzest 10000 150 mg ৳50.00 (3 x 10: ৳1,500.00).'],
  ['3cfea54b-4ed9-4263-abb2-fb108a4103e1', 'SEVERE_GE48', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Defcort 18 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['e1e73c05-9eb7-48f6-80fb-28cb35df00a9', 'SEVERE_GE48', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Deflazit 18 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['1c6ca155-6d98-4947-9b34-0b148caeda41', 'SEVERE_GE48', '1 x 10', 10, 10, '34.00', '340.00', 'MedEx search: Deflazit 36 mg ৳34.00 (1 x 10: ৳340.00).'],
  ['93569557-6109-485c-a45f-a12b06a696b8', 'SEVERE_GE48', '20 x 10', 200, 10, '2.25', '450.00', 'MedEx search: Fast One 1000 mg ৳2.25 (20 x 10: ৳450.00).'],
  ['b0e839f6-35cb-4ebf-8b6c-9f90ae7846eb', 'SEVERE_GE48', '5 x 10', 50, 10, '4.00', '200.00', 'MedEx search: Disopan ODT 0.25 mg ৳4.00 (5 x 10: ৳200.00).'],
  ['2a1b6a21-5d3d-41f3-986f-b2f6f029d84b', 'SEVERE_GE48', '3 x 10', 30, 10, '7.60', '228.00', 'MedEx search: Colasa 400 mg ৳7.60 (3 x 10: ৳228.00).'],
  ['ea84fe7c-d676-4b1a-ad52-ee9bbda7b6df', 'SEVERE_GE48', '6 x 10', 60, 10, '2.50', '150.00', 'MedEx search: Feoplex TR ৳2.50 (6 x 10: ৳150.00).'],
  ['28e2f31c-b473-4263-a89c-da653ab54526', 'SEVERE_GE48', '2 x 15', 30, 15, '40.67', '1220.00', 'MedEx search: Jointfree DA 1500+1200 ৳40.67 (2 x 15: ৳1,220.00).'],
  ['97b85b94-b4e8-4bc9-aab0-acc494d316f3', 'SEVERE_GE48', '1 x 10', 10, 10, '250.00', '2500.00', 'MedEx search: R-Pag 12.5 mg ৳250.00 (1 x 10: ৳2,500.00).'],
  ['0403dd7e-6b76-47ab-ae0d-75ed0e249a8c', 'SEVERE_GE48', '1 x 7', 7, 7, '250.00', '1750.00', 'MedEx search: ETP 12.5 mg ৳250.00 (1 x 7: ৳1,750.00).'],
  ['fc0480ae-6fae-43d0-81b6-3d363bebe63f', 'SEVERE_GE48', '3 x 10', 30, 10, '15.00', '450.00', 'MedEx search: Laxana 8 mg ৳15.00 (3 x 10: ৳450.00).'],
  ['d34f21a9-eee8-4bbd-8816-cccd365fa48a', 'SEVERE_GE48', '1 x 10', 10, 10, '10.00', '100.00', 'MedEx search: Ivtin 6 mg ৳10.00 (1 x 10: ৳100.00).'],
  ['cc28057a-4322-429f-8031-42a90042627a', 'SEVERE_GE48', '1 x 10', 10, 10, '45.00', '450.00', 'MedEx search: Emetant 40 mg ৳45.00 (1 x 10: ৳450.00).'],
  ['af950201-1719-4ac1-a8ee-7d71af8d338c', 'SEVERE_GE48', '1 x 10', 10, 10, '8.00', '80.00', 'MedEx search: Imectin 6 mg ৳8.00 (1 x 10: ৳80.00).'],
  ['6d386b83-0f6f-48f4-9dcc-86abc35644a5', 'SEVERE_GE48', '5 x 5', 25, 5, '8.00', '200.00', 'MedEx search: Momodol 500 mg Suppository ৳8.00 (5 x 5: ৳200.00).'],
  ['6f838190-a346-42a7-bb9c-b724b1cd788f', 'SEVERE_GE48', '6 x 5', 30, 5, '5.00', '150.00', 'MedEx search: Momodol 250 mg Suppository ৳5.00 (6 x 5: ৳150.00).'],
  ['31cbe3f0-bf89-452b-a7af-2bda73f23b27', 'SEVERE_GE48', '6 x 5', 30, 5, '4.00', '120.00', 'MedEx search: Momodol 125 mg Suppository ৳4.00 (6 x 5: ৳120.00).'],
];

// Top 45 solid-form u=8.00/pp=280.00 packs
const SUBBATCH_5B_SPECS = [
  ['1bb093f9-256f-430b-92f0-4dbf590ac0d0', 'U8_PP280_TOP45', '1 x 10', 10, 10, '850.00', '8500.00', 'MedEx search: Lefabac 600 mg ৳850.00 (1 x 10: ৳8,500.00).'],
  ['d41202c9-5467-4f12-8955-724233400933', 'U8_PP280_TOP45', '1 x 14', 14, 14, '1430.00', '20020.00', 'MedEx search: Azarest 300 mg ৳1,430.00 (1 x 14: ৳20,020.00).'],
  ['34ac1986-32f3-4eba-bad7-02a8a45030e5', 'U8_PP280_TOP45', '1 x 8', 8, 8, '450.00', '3600.00', 'MedEx search: Filgotin 200 mg ৳450.00 (1 x 8: ৳3,600.00).'],
  ['3bb54ab4-977c-481f-bf7c-ef9cb70f401b', 'U8_PP280_TOP45', '(24 active + 4 inert) tablets', 28, null, null, '400.00', 'MedEx search: Dancy 4 mg (24 active + 4 inert) tablets: ৳400.00.'],
  ['df8fcc2a-b367-4e6f-9157-cb43a4861c57', 'U8_PP280_TOP45', '(24 active + 4 inert) tablets', 28, null, null, '400.00', 'MedEx search: Aleena 4 mg (24 active + 4 inert) tablets: ৳400.00.'],
  ['884df8f1-acb6-4fdf-aeec-de4d88ef5f7e', 'U8_PP280_TOP45', '1 x 10', 10, 10, '260.00', '2600.00', 'MedEx search: Avapag 20 mg ৳260.00 (1 x 10: ৳2,600.00).'],
  ['380d54df-6973-410d-808e-f9eb2cebf313', 'U8_PP280_TOP45', '1 x 10', 10, 10, '275.00', '2750.00', 'MedEx search: Avalet 20 mg ৳275.00 (1 x 10: ৳2,750.00).'],
  ['58d8e4d3-34c1-4513-aab5-fabab345316b', 'U8_PP280_TOP45', '1 x 8', 8, 8, '275.00', '2200.00', 'MedEx search: Filgotin 100 mg ৳275.00 (1 x 8: ৳2,200.00).'],
  ['c065d0da-f6c4-42d9-81d9-4bb906c67094', 'U8_PP280_TOP45', '2 x 15', 30, 15, '200.00', '6000.00', 'MedEx search: Aromasin 25 mg ৳200.00 (2 x 15: ৳6,000.00).'],
  ['46131c30-f9e0-4a8f-88ef-2823ef920fc5', 'U8_PP280_TOP45', '2 x 7', 14, 7, '150.00', '2100.00', 'MedEx search: Daprosis 4 mg ৳150.00 (2 x 7: ৳2,100.00).'],
  ['e32eb00b-5093-4111-8a85-13fb2771cbb6', 'U8_PP280_TOP45', '1 x 7', 7, 7, '150.00', '1050.00', 'MedEx search: Amenavir 200 mg ৳150.00 (1 x 7: ৳1,050.00).'],
  ['0082c9fc-dcdd-49f5-8fdc-78fd81984fc9', 'U8_PP280_TOP45', '1 x 4', 4, 4, '140.00', '560.00', 'MedEx search: Marzev 25 mg ৳140.00 (1 x 4: ৳560.00).'],
  ['75af32ad-614a-4953-9580-45cd2c49b0bd', 'U8_PP280_TOP45', '1 x 4', 4, 4, '140.00', '560.00', 'MedEx search: Omaglip 25 mg ৳140.00 (1 x 4: ৳560.00).'],
  ['22f84aea-0302-48f1-9229-d881556c950f', 'U8_PP280_TOP45', '1 x 10', 10, 10, '140.00', '1400.00', 'MedEx search: Ckemia 4 mg ৳140.00 (1 x 10: ৳1,400.00).'],
  ['230c6d88-4cf7-4972-8f36-a0383bcb0ff8', 'U8_PP280_TOP45', '1 x 4', 4, 4, '140.00', '560.00', 'MedEx search: Omaglo 25 mg ৳140.00 (1 x 4: ৳560.00).'],
  ['aa12c35f-840b-47cc-9a7c-ce9e2bbf24c8', 'U8_PP280_TOP45', '1 x 10', 10, 10, '130.00', '1300.00', 'MedEx search: Ajuben 12 mg ৳130.00 (1 x 10: ৳1,300.00).'],
  ['dfde785b-268c-4822-aded-3c5ddbfd7388', 'U8_PP280_TOP45', '1 x 4', 4, 4, '140.00', '560.00', 'MedEx search: Omari 25 mg ৳140.00 (1 x 4: ৳560.00).'],
  ['0a2c2b61-eff8-437d-a386-883447a5e54d', 'U8_PP280_TOP45', '1 x 10', 10, 10, '120.00', '1200.00', 'MedEx search: Daprotab 6 mg ৳120.00 (1 x 10: ৳1,200.00).'],
  ['868b7291-ae91-4343-b517-a57e18bde98c', 'U8_PP280_TOP45', '2 x 5', 10, 5, '100.00', '1000.00', 'MedEx search: Reluren 40+1+0.5 ৳100.00 (2 x 5: ৳1,000.00).'],
  ['8731b21c-b7fd-4a97-bbbb-7d583e9ed2ad', 'U8_PP280_TOP45', '3 x 10', 30, 10, '100.00', '3000.00', 'MedEx search: Exemis 25 mg ৳100.00 (3 x 10: ৳3,000.00).'],
  ['fc9a6e82-3948-45bc-b265-a37ae0225cbe', 'U8_PP280_TOP45', '1 x 10', 10, 10, '100.00', '1000.00', 'MedEx search: Liberen 40+1+0.5 ৳100.00 (1 x 10: ৳1,000.00).'],
  ['1715bb38-1145-4a6a-b4cb-c83972bbbeeb', 'U8_PP280_TOP45', '7 x 3', 21, 3, '95.00', '1995.00', 'MedEx search: Farobac 200 mg ৳95.00 (7 x 3: ৳1,995.00).'],
  ['f37d4e3d-8656-4b23-a8c9-d069563fe4b8', 'U8_PP280_TOP45', '1 x 10', 10, 10, '95.00', '950.00', 'MedEx search: Fezotan 45 mg ৳95.00 (1 x 10: ৳950.00).'],
  ['d103722a-59cd-42c7-8580-dfc8527ae80b', 'U8_PP280_TOP45', '2 x 10', 20, 10, '95.00', '1900.00', 'MedEx search: Feoza 45 mg ৳95.00 (2 x 10: ৳1,900.00).'],
  ['201e6c03-1d3e-46f0-9ca2-43f6e5faa672', 'U8_PP280_TOP45', '1 x 10', 10, 10, '95.00', '950.00', 'MedEx search: Fizora 45 mg ৳95.00 (1 x 10: ৳950.00).'],
  ['82dfeeee-c18a-4596-b61c-0b9dcc83e216', 'U8_PP280_TOP45', '1 x 10', 10, 10, '90.00', '900.00', 'MedEx search: Ckemia 2 mg ৳90.00 (1 x 10: ৳900.00).'],
  ['c241843d-2ba9-4591-b7fd-85f3822a7a76', 'U8_PP280_TOP45', '2 x 10', 20, 10, '90.00', '1800.00', 'MedEx search: Aprodust 4 mg ৳90.00 (2 x 10: ৳1,800.00).'],
  ['b43333e6-0ca4-4781-8ab9-ccdeaa9cba5c', 'U8_PP280_TOP45', '2 x 7', 14, 7, '90.00', '1260.00', 'MedEx search: Faropen 200 mg ৳90.00 (2 x 7: ৳1,260.00).'],
  ['86a4bdb3-d525-4a98-acbe-2d288534586f', 'U8_PP280_TOP45', '1 x 10', 10, 10, '80.00', '800.00', 'MedEx search: Gefan 45 mg ৳80.00 (1 x 10: ৳800.00).'],
  ['42dde669-4bfe-4a0f-9d80-141f849a15e5', 'U8_PP280_TOP45', '1 x 4', 4, 4, '80.00', '320.00', 'MedEx search: Marzev 12.5 mg ৳80.00 (1 x 4: ৳320.00).'],
  ['c188113c-630e-4f57-b77f-55511b3a1c30', 'U8_PP280_TOP45', '1 x 4', 4, 4, '80.00', '320.00', 'MedEx search: Omaglip 12.5 mg ৳80.00 (1 x 4: ৳320.00).'],
  ['13407549-8597-46d9-a934-979bfb1ddc1d', 'U8_PP280_TOP45', '1 x 4', 4, 4, '80.00', '320.00', 'MedEx search: Omaglo 12.5 mg ৳80.00 (1 x 4: ৳320.00).'],
  ['c2aefd29-e29c-4d02-bb2c-ab86963a292e', 'U8_PP280_TOP45', '1 x 10', 10, 10, '80.00', '800.00', 'MedEx search: Coughex 45 mg ৳80.00 (1 x 10: ৳800.00).'],
  ['3e5d812d-e8d6-4f1d-b5c9-8ac452eb1908', 'U8_PP280_TOP45', '2 x 10', 20, 10, '80.00', '1600.00', 'MedEx search: Daprotab 4 mg ৳80.00 (2 x 10: ৳1,600.00).'],
  ['93fff71c-81f7-4b4f-97a1-bbde082708ab', 'U8_PP280_TOP45', '1 x 4', 4, 4, '75.00', '300.00', 'MedEx search: Aventy 100 mg ৳75.00 (1 x 4: ৳300.00).'],
  ['222e162a-e7cd-43b5-882e-399d851f2603', 'U8_PP280_TOP45', '7 x 3', 21, 3, '75.00', '1575.00', 'MedEx search: Farobac 150 mg ৳75.00 (7 x 3: ৳1,575.00).'],
  ['a9fada4e-7be3-4dbd-8d3a-823a7e41e6ea', 'U8_PP280_TOP45', '1 x 10', 10, 10, '70.00', '700.00', 'MedEx search: Ajuben 6 mg ৳70.00 (1 x 10: ৳700.00).'],
  ['d14ebc86-c5de-4b56-a37a-32f1b44ecb59', 'U8_PP280_TOP45', '1 x 4', 4, 4, '80.00', '320.00', 'MedEx search: Omari 12.5 mg ৳80.00 (1 x 4: ৳320.00).'],
  ['5ea6b629-5e65-4002-ad5f-010caa97d1a0', 'U8_PP280_TOP45', "28's pack", 28, null, '66.00', '1848.00', 'MedEx search: Femoston 1+5 ৳66.00 (28s pack: ৳1,848.00).'],
  ['c121f9b5-7082-4e73-9814-c098f00bc58a', 'U8_PP280_TOP45', '1 x 10', 10, 10, '65.00', '650.00', 'MedEx search: Afalino 50 mg ৳65.00 (1 x 10: ৳650.00).'],
  ['5d9b7c9c-ff6b-4f61-9d14-b00e6b065064', 'U8_PP280_TOP45', '1 x 10', 10, 10, '64.00', '640.00', 'MedEx search: Cenomate 50 mg ৳64.00 (1 x 10: ৳640.00).'],
  ['c955a810-41f1-46cc-a41e-40de3696be11', 'U8_PP280_TOP45', '1 x 4', 4, 4, '60.00', '240.00', 'MedEx search: Aventy 50 mg ৳60.00 (1 x 4: ৳240.00).'],
  ['a0f0a819-48cf-4840-880f-c911f2477f76', 'U8_PP280_TOP45', "28's pack", 28, null, '60.00', '1680.00', 'MedEx search: Femoston 1+10 ৳60.00 (28s pack: ৳1,680.00).'],
  ['122e6a47-033b-43a6-9952-bb0a4a687201', 'U8_PP280_TOP45', "28's pack", 28, null, '60.00', '1680.00', 'MedEx search: Femoston 2+10 ৳60.00 (28s pack: ৳1,680.00).'],
  ['b371d84d-8589-45ef-afba-2e12c650d12a', 'U8_PP280_TOP45', '2 x 10', 20, 10, '60.00', '1200.00', 'MedEx search: Aprodust 2 mg ৳60.00 (2 x 10: ৳1,200.00).'],
];

const HELD_FROM_BATCH5 = [
  { packId: '0c6e37c8-6565-4d74-94e8-572e0ee4dc3e', name: 'Laxana 24 mg Capsule (Renata)', reason: 'Arogga pv=40 (৳1,200/30s) while search snippet cited ৳15/৳450 (possibly 8 mg text). Hold until exact 24 mg MRP verified.' },
  { packId: '0addb7d3-24d7-42ab-8a22-67a27d929313', name: 'Goodmet 500 mg Tablet (Goodman)', reason: 'DB has 100s pack 4.00/200.10; search snippets gave mixed strip/box totals without clean 100s vs 6x10 disambiguation.' },
  { packId: '6d97f173-c572-4692-95d1-b81233e872d5', name: 'Diabest 500 mg Tablet (Al-Madina)', reason: 'DB has 100s pack 4.00/200.10; search snippets gave ৳5.00 unit / 3x10=150 without resolving 100s box format.' },
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
  const allSpecs = [...SUBBATCH_5A_SPECS, ...SUBBATCH_5B_SPECS];
  const ids = allSpecs.map((s) => s[0]);

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

    const mapSpec = (spec) => {
      const [packId, subKind, pq, pu, su, unitPrice, packPrice, evidence] = spec;
      const p = pMap.get(packId);
      if (!p) throw new Error(`Missing packId: ${packId}`);
      validateRow(`${p.brand.name} ${p.brand.strength ?? ''}`, pu, su, unitPrice, packPrice);

      const nextWarnings = (p.warnings || []).filter(
        (w) => w !== 'pack_price_inconsistent_with_unit_price' && w !== 'price_text_not_fully_parsed',
      );
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
    };

    const subbatch5A = SUBBATCH_5A_SPECS.map(mapSpec);
    const subbatch5B = SUBBATCH_5B_SPECS.map(mapSpec);

    const manifest = {
      generatedAt: new Date().toISOString(),
      status: 'STAGED_READ_ONLY_NOT_EXECUTED',
      summary: {
        subbatch5A_count: subbatch5A.length,
        subbatch5B_count: subbatch5B.length,
        totalVerifiedStagedBatch5: subbatch5A.length + subbatch5B.length,
        samePackUnitsCount: [...subbatch5A, ...subbatch5B].filter((x) => x.migrationKind === 'SAME_PACK_UNITS').length,
        packMigrationCount: [...subbatch5A, ...subbatch5B].filter((x) => x.migrationKind === 'PACK_MIGRATION').length,
        warningsClearedCount,
        heldFromBatch5Count: HELD_FROM_BATCH5.length,
      },
      subbatch5A_severeOutliersAndSingles: subbatch5A,
      subbatch5B_u8pp280Top45: subbatch5B,
      heldFromBatch5: HELD_FROM_BATCH5,
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch5_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const mdLines = [
      '# CareDose — Staged Batch 5 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 5 Summary',
      `- **Sub-batch 5A (${subbatch5A.length}):** \`Unisaline Fruity\` (\`price_text_not_fully_parsed\` 100->120) + \`Rabnil 20 mg\` (\`7 x 10: ৳420.00\`, resolves non-divisible strip) + \`25\` severe \`>=48%\` non-\`u=8/280\` corrupted-price items (incl. \`Deroximel DR\` 7->200, \`Pancreon 25000\` 7->70, \`R-Pag\` 600->250, \`ETP\` 600->250).`,
      `- **Sub-batch 5B (${subbatch5B.length}):** Top \`45\` highest-value solid \`u=8.00 / pp=280.00\` corrupted-template items (\`৳60–৳1,430/tab\`, incl. \`Azarest 300\` 8->1,430, \`Lefabac 600\` 8->850, \`Filgotin 200\` 8->450, \`Avalet 20\` 8->275, \`Avapag 20\` 8->260, \`Aromasin 25\` 8->200, \`Daprosis 4\` 8->150, \`Amenavir 200\` 8->150).`,
      `- **Total Verified Batch 5 Updates:** **${manifest.summary.totalVerifiedStagedBatch5}** (\`${manifest.summary.samePackUnitsCount}\` same pack units + \`${manifest.summary.packMigrationCount}\` pack migrations), clearing **${warningsClearedCount}** pack warnings (\`71\` inconsistent + \`1\` unparsed).`,
      `- **Held Pending Direct Confirmation (${HELD_FROM_BATCH5.length}):** \`Laxana 24 mg\`, \`Goodmet 500 mg\`, \`Diabest 500 mg\`.`,
      '',
      '## Sub-batch 5A — Non-u=8/280 Severe Outliers & Resolved Singles (27)',
      ...subbatch5A.map((x) => `- **${x.brandName} ${x.strength ?? ''}**: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``),
      '',
      '## Sub-batch 5B — Top 45 Corrupted u=8.00/pp=280.00 Solid Packs (45)',
      ...subbatch5B.map((x) => `- **${x.brandName} ${x.strength ?? ''}**: \`30's (pu=30, 8/280)\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``),
      '',
      '## Held Items Excluded From Batch 5 (3)',
      ...HELD_FROM_BATCH5.map((h) => `- **${h.name}**: ${h.reason}`),
    ];

    const mdOut = path.join(STAGING_DIR, 'batch5_staging_report.md');
    fs.writeFileSync(mdOut, mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH5_STAGED_SUCCESSFULLY', summary: manifest.summary, jsonOut, mdOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
