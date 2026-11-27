/**
 * Strictly READ-ONLY builder for Batch 4 Staged Wave Manifest.
 * Verifies every target against live PostgreSQL before staging:
 *   - Sub-batch 4A (4 core + 1 optional duplicate-twin decision): Zero-Pack EXACT_MATCH inserts (3 held)
 *   - Sub-batch 4B (9): 13 CAPTCHA-paused REM_187 items unblocked via grounded web search (4 false positives excluded)
 *   - Sub-batch 4C (48): 54 VERIFY_REQ_55 strip + corrupted-template price repairs (4 H. pylori kits + 2 unclear held)
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const dbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch4_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Sub-batch 4A: Verified Zero-Pack EXACT_MATCH brands (no duplicate same-strength/form sibling in DB)
const SUBBATCH_4A_INSERTS = [
  {
    brandId: '7e49331f-af2b-4612-945d-1dd6b7299306',
    sourceId: '32382',
    brandName: 'Serivan',
    strength: '34 mg',
    dosageForm: 'Capsule',
    manufacturer: 'Incepta Pharmaceuticals Ltd.',
    packQuantity: '3 x 6',
    packUnits: 18,
    stripUnits: 6,
    unitPrice: '40.00',
    packPrice: '720.00',
    evidence: 'MedEx search: Unit Price ৳40.00 (3 x 6 capsules: ৳720.00) == Arogga #75914 (pv_mrp=40, Strip 6, Box 18)',
  },
  {
    brandId: '778cbd03-96cc-4ce6-88e6-a1a1225e879e',
    sourceId: '33171',
    brandName: 'Twincard',
    strength: '50 mg+25 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Incepta Pharmaceuticals Ltd.',
    packQuantity: '5 x 10',
    packUnits: 50,
    stripUnits: 10,
    unitPrice: '5.00',
    packPrice: '250.00',
    evidence: 'MedEx search: Unit Price ৳5.00 (5 x 10: ৳250.00) == Arogga #38460 (pv_mrp=5, Strip 10, Box 50)',
  },
  {
    brandId: '7154e9e3-20f7-40d0-aa6b-dfb0c70c6a6b',
    sourceId: '32469',
    brandName: 'Uroblock',
    strength: '25 mg',
    dosageForm: 'Tablet (Extended Release)',
    manufacturer: 'Nuvista Pharma Ltd.',
    packQuantity: '2 x 10',
    packUnits: 20,
    stripUnits: 10,
    unitPrice: '30.00',
    packPrice: '600.00',
    evidence: 'MedEx search: Unit Price ৳30.00 (2 x 10: ৳600.00) == Arogga #67878 (pv_mrp=30, Strip 10, Box 20)',
  },
  {
    brandId: '3f0715f5-9ff0-4b69-b2b7-c5cb6b080c1e',
    sourceId: '32470',
    brandName: 'Uroblock',
    strength: '50 mg',
    dosageForm: 'Tablet (Extended Release)',
    manufacturer: 'Nuvista Pharma Ltd.',
    packQuantity: '1 x 10',
    packUnits: 10,
    stripUnits: 10,
    unitPrice: '55.00',
    packPrice: '550.00',
    evidence: 'MedEx search: Unit Price ৳55.00 / Strip Price ৳550.00 (1 x 10) == Arogga #67885 (pv_mrp=55, Box 10)',
  },
];

const OPTIONAL_SALMOLIN_DUPLICATE = {
  brandId: '97b8bf53-48f7-47fa-9696-7085419dbeb8',
  sourceId: '32420',
  duplicateSiblingBrandId: 'b002bbcd-5e82-4755-9b6d-36a5cfdf809c',
  duplicateSiblingSourceId: '3505',
  brandName: 'Salmolin',
  strength: '100 mcg/puff',
  dosageForm: 'Inhaler',
  manufacturer: 'ACME Laboratories Ltd.',
  proposedInsert: {
    packQuantity: '200 metered doses (Refill)',
    packUnits: null,
    stripUnits: null,
    unitPrice: null,
    packPrice: '200.00',
  },
  note: 'Sibling sid=3505 already holds 200 metered doses @ ৳230.00; sid=32420 corresponds to Kaggle/MedEx Refill @ ৳200.00 (exact twin pattern of Sultolin #3514).',
};

const HELD_ZERO_PACK = [
  {
    brandId: 'e1d1a2d9-3231-4949-8fcf-e5731ae8a8a3',
    sourceId: '33089',
    brandName: 'Nilonib 200 mg Capsule',
    manufacturer: 'Drug International Ltd.',
    reason: 'Arogga #39689 (stock=0, pv_mrp=800, Box=30) agrees on ৳800/cap, but exact live MedEx Nilonib box format (e.g. 3 x 10 vs 1 x 10) was not directly confirmed in search snippets.',
  },
  {
    brandId: '05a01101-1caf-43b9-9af1-c5078f11fb28',
    sourceId: '15433',
    brandName: 'Ketoseem 10 mg Tablet',
    manufacturer: 'Seema Pharmaceuticals Ltd.',
    reason: 'Discontinued/inactive Seema SKU (Arogga #9954 stock=0, retail ~৳9.09-10.00) with no confirmed live MedEx pricing snippet.',
  },
  {
    brandId: '3b9ec6d6-1481-49e0-be02-cd7f09e4cdd1',
    sourceId: '33091',
    brandName: 'Prostalex 250 mg Tablet',
    manufacturer: 'Beacon Pharmaceuticals Ltd.',
    reason: 'MedEx has no fixed MRP; Arogga #15574 has dummy pv_mrp=1 (stock=0). Held permanently unless fixed MRP is published.',
  },
];

// Sub-batch 4B: 9 confirmed fixes from the 13 CAPTCHA-paused REM_187 tail items
const SUBBATCH_4B_UPDATES = [
  {
    packId: 'b58a18f0-4f1d-4662-b2aa-3fb2936ee9c0',
    subKind: 'SAME_BOX',
    proposedValues: { packPrice: '350.00' },
    evidence: 'MedEx search & Arogga #87411: 10 gm tube = ৳350.00 (was 50.19).',
  },
  {
    packId: '8e2bcc54-0236-4c01-907f-8edbcbf6cfb3',
    subKind: 'SAME_BOX',
    proposedValues: { packQuantity: '4 x 7', packUnits: 28, stripUnits: 7, unitPrice: '40.00', packPrice: '1120.00' },
    evidence: 'MedEx search & Arogga #80148: Unit Price ৳40.00 (4 x 7: ৳1,120.00, strip ৳280.00); was 92.78/2237.68.',
  },
  {
    packId: '99d14317-7de9-4c44-a32b-2c3e570cb83c',
    subKind: 'PACK_MIGRATION',
    proposedValues: { packQuantity: '2 x 4', packUnits: 8, stripUnits: 4, unitPrice: '150.00', packPrice: '1200.00' },
    evidence: 'MedEx search & Arogga #53345: Unit Price ৳150.00 (2 x 4: ৳1,200.00); was 30s 8.00/270.00.',
  },
  {
    packId: 'dd4a3751-e2e0-42ea-88a4-63aa0a7dce6a',
    subKind: 'PACK_MIGRATION',
    proposedValues: { packQuantity: '5 x 10', packUnits: 50, stripUnits: 10, unitPrice: '16.00', packPrice: '800.00' },
    evidence: 'MedEx search & Arogga #60666: Unit Price ৳16.00 (5 x 10: ৳800.00); was 30s 7.52/255.06.',
  },
  {
    packId: '1e48fd6c-7e57-44fd-8c7e-695c0779bce6',
    subKind: 'PACK_MIGRATION',
    proposedValues: { packQuantity: '1 x 10', packUnits: 10, stripUnits: 10, unitPrice: '70.00', packPrice: '700.00' },
    evidence: 'MedEx search & Arogga #40285: Unit Price ৳70.00 (1 x 10: ৳700.00); was 30s 27.50/600.00.',
  },
  {
    packId: 'cab20abf-09a2-4ca0-b3e7-a161f1b871f0',
    subKind: 'PACK_MIGRATION',
    proposedValues: { packQuantity: '2 x 6', packUnits: 12, stripUnits: 6, unitPrice: '95.00', packPrice: '1140.00' },
    evidence: 'MedEx search & Arogga #40286: Unit Price ৳95.00 (2 x 6: ৳1,140.00); was 30s 27.50/600.00.',
  },
  {
    packId: '218da6dc-e2ff-4b10-ba0c-17a49dbc6e66',
    subKind: 'PACK_MIGRATION',
    proposedValues: { packQuantity: '5 x 10', packUnits: 50, stripUnits: 10, unitPrice: '4.00', packPrice: '200.00' },
    evidence: 'MedEx search & Arogga #91778: Unit Price ৳4.00 (5 x 10: ৳200.00); was 30s 12.00/280.00.',
  },
  {
    packId: '0f608bc6-c7c9-4ba5-a70d-be34ab3a4ebe',
    subKind: 'PACK_MIGRATION',
    proposedValues: { packQuantity: '22.5 gm tube & applicator', packUnits: null, stripUnits: null, unitPrice: null, packPrice: '500.00' },
    evidence: 'MedEx search & Arogga #44421: 22.5 gm tube & applicator = ৳500.00; replaces bogus 15s pack 339.00/5085.00.',
  },
  {
    packId: 'a7b3a3b4-836a-4c28-8ce3-f68648f58d3b',
    subKind: 'PACK_MIGRATION',
    proposedValues: { packQuantity: '1 x 14', packUnits: 14, stripUnits: 14, unitPrice: '15.00', packPrice: '210.00' },
    evidence: 'MedEx search & Arogga #98322: Unit Price ৳15.00 (1 x 14: ৳210.00); was 10s 20.00/200.00.',
  },
];

const EXCLUDED_4_FALSE_POSITIVES = [
  { packId: '32905c0c-6092-4c3f-a267-2fdfd6e83462', name: 'Laxadil 3.5 gm/sachet', reason: 'DB (15s pack, 105.00) already matches MedEx (3.5 gm sachet: ৳7.00, 15s pack: ৳105.00).' },
  { packId: '08a04776-3cf2-41fe-abdf-c082dbf3a472', name: 'Renova 500 mg', reason: 'DB (8.03/80.30) already matches MedEx (2 x 5: ৳80.30); Arogga had strip=5 b2c_mrp=80.6.' },
  { packId: 'f8045f67-d604-406b-a12e-efa67fb1db26', name: 'Renova 250 mg', reason: 'DB (5.02/50.20) already matches MedEx (2 x 5: ৳50.20).' },
  { packId: '5215fcf7-ab62-4e03-a3bf-c9e97becd543', name: 'Fast 250 mg', reason: 'DB (5.03/50.30) already matches MedEx (2 x 5: ৳50.30).' },
];

// Sub-batch 4C: 48 confirmed MedEx A x B strip + price repairs out of 54 VERIFY_REQ_55 items
// Format: [packId, a, b, unitPrice, packPrice]
const SUBBATCH_4C_RAW = [
  ['087c47ac-1575-4761-9e66-730ceb7c0986', 4, 14, '5.00', '280.00'],    // Famotid 40
  ['d5e4d403-a00c-42ca-adea-cec447f77197', 6, 10, '5.00', '300.00'],    // Esoprol 20
  ['32827cef-d04e-451b-9d23-335afb6f1184', 2, 14, '50.50', '1414.00'],  // Exforge 5+80
  ['db345387-0a04-4bee-95be-6b6c8af3b151', 3, 7, '22.00', '462.00'],    // Renolina 5
  ['967d03b7-39b1-4734-8675-df86f14348f4', 2, 6, '35.00', '420.00'],    // Cefix 200 (Globe)
  ['e23069c1-be0a-4951-b8ab-9140e78fd487', 2, 6, '170.00', '2040.00'],  // Orili 150
  ['19a862ed-aa3c-424e-bc96-5641885862ad', 3, 14, '3.50', '147.00'],    // Nictoris 5
  ['32b4b4f2-d990-4b77-88c8-c5efaaac6173', 5, 7, '9.00', '315.00'],     // Presnor 20
  ['10ea2d92-e32a-4a54-b6d0-6f36384643da', 2, 14, '150.00', '4200.00'], // Exelon 6
  ['416c46d1-cdf2-4189-95cc-f7d5d2e1929f', 4, 8, '11.00', '352.00'],    // Ferromax 30
  ['1595651b-8556-48cd-ad5e-35c8c1d1d81d', 5, 6, '35.00', '1050.00'],   // Prelica CR 165
  ['e0af96ec-cf5c-41ea-8b23-5112afa9af03', 4, 8, '20.00', '640.00'],    // Dementa XR 14
  ['cffbe689-2d26-42d7-996c-3aea2572046c', 3, 14, '3.00', '126.00'],    // Disoral 300
  ['b57aec03-22c7-4850-8649-70c31cfbc601', 5, 4, '95.00', '1900.00'],   // Neopem 200
  ['18215358-eef4-470f-b807-1ceb95bb7dde', 5, 4, '75.00', '1500.00'],   // Neopem 150
  ['88e52ba0-0409-499e-996d-cda81b6b9892', 5, 4, '32.00', '640.00'],    // Fortimox 500+125
  ['7f68d2e7-8167-4843-9101-3194f5882441', 1, 14, '32.00', '448.00'],   // Neurolife 10
  ['85ca35bb-2a33-4889-b9e0-f39e5f27cd2f', 2, 14, '18.00', '504.00'],   // Neurolife 5
  ['1953e1ac-5356-4072-bc93-9024a22ad50e', 2, 6, '38.00', '456.00'],    // Leveron XR 750
  ['0b09e6a7-77c6-4410-bd40-cffab1d7a4eb', 3, 4, '75.00', '900.00'],    // Farpem 150
  ['f921f67e-0348-42b7-a9e1-fdd9c9b30c73', 2, 10, '40.00', '800.00'],   // Rivadem 3
  ['628c2a86-6724-415b-a857-ce244bc49ad0', 6, 10, '11.00', '660.00'],   // Othera 20
  ['d38f32bd-9fa8-4ec3-8504-187d723af744', 3, 14, '16.00', '672.00'],   // Bislol 7.5
  ['540d3d6a-1b1d-4398-9f19-c59b1c2d1ba9', 3, 6, '35.00', '630.00'],    // Lyric CR 165
  ['28c24c78-27b4-4b9c-aeac-6cd5b05bb12e', 2, 7, '95.00', '1330.00'],   // Orfanem 200
  ['62918224-3d5f-4033-86bf-32cdf65e3b11', 3, 14, '6.00', '252.00'],    // Itored 50
  ['d19d9984-1d2f-4e24-9e39-7bd0e447cd00', 2, 14, '12.00', '336.00'],   // Miragaba 2.5
  ['a5a8ad5c-e878-4149-be76-bf862110ead2', 2, 14, '20.00', '560.00'],   // Miragaba 5
  ['a13cfd18-c8f9-4fd3-b233-62411d8a8941', 3, 4, '95.00', '1140.00'],   // Nemotis 200
  ['8cb0caab-3a8d-4a3c-baad-56b9bd62ebfe', 3, 4, '75.00', '900.00'],    // Nemotis 150
  ['9de01de7-2a47-46e2-9cb0-32f275c272e8', 4, 7, '6.00', '168.00'],     // Belsar 10
  ['ccf1e970-e480-42c6-a7d4-bfedf71d11ca', 3, 10, '15.00', '450.00'],   // Denbac 50
  ['fa256ddb-68ed-404f-8abd-59eed2c95376', 3, 8, '90.00', '2160.00'],   // Merol-A 160
  ['ba4c3ff6-3fe4-475e-b66e-5b8e6e54e638', 4, 7, '14.00', '392.00'],    // Glipxen-M 2.5+850
  ['d41ec141-ea52-4e70-bbb2-c9702adffbf9', 2, 7, '200.00', '2800.00'],  // Daprosis 6
  ['9caf3757-cbdf-4aa0-bba8-d966911e5e63', 4, 5, '32.00', '640.00'],    // Evoxil CV 500+125
  ['356673b7-d109-4ead-ad83-0ccd2a44f8dd', 5, 4, '32.00', '640.00'],    // Co-Clav 500+125
  ['280438c9-e326-4391-a5a4-85ce10bab5eb', 2, 14, '22.00', '616.00'],   // Febuxit 80
  ['6714b984-ac6f-4829-b8f3-26b9add4ebfc', 3, 7, '32.00', '672.00'],    // Moxilin-CV 500+125
  ['c96ba392-bc54-49dc-bcf6-f3186dd5b96d', 2, 10, '30.00', '600.00'],   // Leveron XR 500
  ['2afb7489-4c3d-48e7-9433-6e43ed858710', 3, 4, '95.00', '1140.00'],   // Farpem 200
  ['75aeb5bb-0b39-4a7a-b7c8-5bdf142d0f20', 3, 10, '17.00', '510.00'],   // Othera 40
  ['68ed9306-4579-44b7-b6e7-511526f1cf35', 1, 4, '35.00', '140.00'],    // Provigor 10
  ['de6e854a-73ea-41ae-a99f-011b4f7414a4', 2, 7, '55.00', '770.00'],    // Adrox CV 250+62.5
  ['db6e9b4c-77b0-4426-9b26-efbfb76b3a56', 5, 4, '32.00', '640.00'],    // Novaclav 500+125
  ['78ee9ffe-671a-44fc-bf72-0be6ebd86814', 2, 4, '75.00', '600.00'],    // Farospec 150
  ['1bb194dd-00be-4719-95a4-bd0f61cb5ae4', 2, 4, '95.00', '760.00'],    // Farospec 200
  ['5cd397dc-6ae5-4272-9676-bdd3c15b89c8', 2, 7, '77.14', '1080.00'],   // Utrogestan 200 (also fixes pp=1!)
];

const HELD_VERIFY_REQ_55 = [
  { packId: 'e0b971d8-07fb-460c-b7b8-12c83a6c22fe', name: 'Helicon Kit 30 mg+1000 mg+500 mg', kind: 'H_PYLORI_KIT', reason: 'Already has 4-tab strip pack; 14s pack (৳775.17 = 14 strips) represents 14 regimen pouches rather than single-tablet divisibility. Decide whether to clear stripUnits=null (like Triokit) or convert to 14 x 4 (pu=56).' },
  { packId: '47b12ecc-9380-40eb-8a36-a23d086f95bd', name: 'Finix HP 20 mg+1000 mg+500 mg', kind: 'H_PYLORI_KIT', reason: 'Already has 4-tab strip (13.84/55.36); 7s pack (৳387.52 = 7 strips) represents 7 regimen pouches.' },
  { packId: 'f91dea84-8355-47bc-b53a-9d46cbf36e48', name: 'Pylotrip 30 mg+1000 mg+500 mg', kind: 'H_PYLORI_KIT', reason: 'Already has 4-tab strip (13.79/55.16); 14s pack (৳772.24 = 14 strips) represents 14 regimen pouches.' },
  { packId: '857a001e-dbad-45a1-82c9-a8e927a276d2', name: 'Pylotrip R 20 mg+1000 mg+500 mg', kind: 'H_PYLORI_KIT', reason: 'Already has 4-tab strip (13.75/55.00); 14s pack (৳770.00 = 14 strips) represents 14 regimen pouches.' },
  { packId: 'fdcf99b2-a190-4ccf-8e13-c90a82964353', name: 'Rabnil 20 mg EC Tablet (Benham)', kind: 'UNCONFIRMED_BOX', reason: 'Arogga #71246 has Strip=14, Box=70 (pv_mrp=6, stock=0), while MedEx search snippet mentioned 7 x 10 (৳420.00) alongside EC Capsule (৳7). Hold until exact 5 x 14 vs 7 x 10 verified.' },
  { packId: 'ede14c58-b5e1-49d2-864a-b25b28dd539a', name: 'Linamet ER 2.5 mg+1000 mg', kind: 'UNCONFIRMED_MRP', reason: 'Arogga #59270 shows pv_mrp=17 (Strip=6, Box=18) and discounted ৳15.30 online, but MedEx ER MRP snippet was not retrieved without login/direct hit.' },
];

function validateDivisibleAndArith(label, prop) {
  if (prop.packUnits !== null && prop.packUnits !== undefined && prop.stripUnits !== null && prop.stripUnits !== undefined) {
    if (prop.stripUnits <= 1 || prop.stripUnits > 100 || prop.packUnits % prop.stripUnits !== 0) {
      throw new Error(`Invalid strip/packUnits on ${label}: pu=${prop.packUnits}, su=${prop.stripUnits}`);
    }
  }
  if (prop.unitPrice !== null && prop.unitPrice !== undefined && prop.packUnits && prop.packPrice !== null) {
    const exp = Number(prop.unitPrice) * prop.packUnits;
    const act = Number(prop.packPrice);
    if (Math.abs(act - exp) / act > 0.001) {
      throw new Error(`Arithmetic mismatch on ${label}: ${prop.unitPrice} * ${prop.packUnits} = ${exp} vs ${act}`);
    }
  }
}

(async () => {
  const zpBrandIds = [...SUBBATCH_4A_INSERTS.map((x) => x.brandId), OPTIONAL_SALMOLIN_DUPLICATE.brandId];
  const allPackIds = [
    ...SUBBATCH_4B_UPDATES.map((x) => x.packId),
    ...SUBBATCH_4C_RAW.map((x) => x[0]),
  ];

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const db = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const brands = await tx.medicineBrand.findMany({
        where: { id: { in: zpBrandIds } },
        include: { packs: { select: { id: true } } },
      });
      const salmolinSibling = await tx.medicineBrand.findUnique({
        where: { id: OPTIONAL_SALMOLIN_DUPLICATE.duplicateSiblingBrandId },
        include: { packs: { select: { id: true, packQuantity: true, packPrice: true } } },
      });
      const packs = await tx.medicinePack.findMany({
        where: { id: { in: allPackIds } },
        include: { brand: { select: { sourceId: true, name: true, strength: true, dosageForm: true, manufacturer: true } } },
      });
      return { brands, salmolinSibling, packs };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 });

    const bMap = new Map(db.brands.map((b) => [b.id, b]));
    const pMap = new Map(db.packs.map((p) => [p.id, p]));

    const subbatch4A = SUBBATCH_4A_INSERTS.map((item) => {
      const b = bMap.get(item.brandId);
      if (!b || b.packs.length !== 0) {
        throw new Error(`Precondition failed on Zero-Pack ${item.brandName}: packs=${b?.packs?.length}`);
      }
      validateDivisibleAndArith(item.brandName, item);
      return {
        brandId: b.id,
        sourceId: b.sourceId,
        brandName: b.name,
        strength: b.strength,
        dosageForm: b.dosageForm,
        manufacturer: b.manufacturer,
        sourceUrl: b.productUrl,
        proposedInsert: {
          packQuantity: item.packQuantity,
          packUnits: item.packUnits,
          stripUnits: item.stripUnits,
          unitPrice: item.unitPrice,
          packPrice: item.packPrice,
          currency: 'BDT',
          unitPriceLabel: null,
          priceSource: 'brand_page',
          verification: 'UNVERIFIED',
          warnings: [],
        },
        evidence: item.evidence,
      };
    });

    const optSalmolinB = bMap.get(OPTIONAL_SALMOLIN_DUPLICATE.brandId);
    if (!optSalmolinB || optSalmolinB.packs.length !== 0) {
      throw new Error(`Unexpected Salmolin #32420 pack count: ${optSalmolinB?.packs?.length}`);
    }

    let staleWarningsToClear = 0;

    const enrichUpdate = (packId, proposedValues, meta) => {
      const p = pMap.get(packId);
      if (!p) throw new Error(`Missing packId in PostgreSQL: ${packId}`);
      const eff = {
        packUnits: 'packUnits' in proposedValues ? proposedValues.packUnits : p.packUnits,
        stripUnits: 'stripUnits' in proposedValues ? proposedValues.stripUnits : p.stripUnits,
        unitPrice: 'unitPrice' in proposedValues ? proposedValues.unitPrice : p.unitPrice?.toString() ?? null,
        packPrice: 'packPrice' in proposedValues ? proposedValues.packPrice : p.packPrice?.toString() ?? null,
      };
      validateDivisibleAndArith(`${p.brand.name} ${p.brand.strength ?? ''}`, eff);

      const finalProposed = { ...proposedValues };
      let clearsStaleInconsistentWarning = false;
      if ((p.warnings || []).includes('pack_price_inconsistent_with_unit_price')) {
        const nextWarnings = p.warnings.filter((w) => w !== 'pack_price_inconsistent_with_unit_price');
        finalProposed.warnings = nextWarnings;
        clearsStaleInconsistentWarning = true;
        staleWarningsToClear++;
      }

      return {
        packId: p.id,
        brandId: p.brandId,
        sourceId: p.brand.sourceId,
        brandName: p.brand.name,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        manufacturer: p.brand.manufacturer,
        ...meta,
        currentValues: {
          packQuantity: p.packQuantity,
          packUnits: p.packUnits,
          stripUnits: p.stripUnits,
          unitPrice: p.unitPrice?.toString() ?? null,
          packPrice: p.packPrice?.toString() ?? null,
          warnings: p.warnings,
        },
        proposedValues: finalProposed,
        clearsStaleInconsistentWarning,
      };
    };

    const subbatch4B = SUBBATCH_4B_UPDATES.map((item) =>
      enrichUpdate(item.packId, item.proposedValues, { subKind: item.subKind, evidence: item.evidence }),
    );

    const subbatch4C = SUBBATCH_4C_RAW.map(([packId, a, b, unitPrice, packPrice]) =>
      enrichUpdate(
        packId,
        {
          packQuantity: `${a} x ${b}`,
          packUnits: a * b,
          stripUnits: b,
          unitPrice,
          packPrice,
        },
        { subKind: 'VERIFY_REQ_55_AXB_AND_PRICE', evidence: `MedEx search + Arogga verified: ৳${unitPrice} (${a} x ${b}: ৳${packPrice})` },
      ),
    );

    const manifest = {
      generatedAt: new Date().toISOString(),
      status: 'STAGED_READ_ONLY_NOT_EXECUTED',
      summary: {
        subbatch4A_zeroPackInserts_count: subbatch4A.length,
        subbatch4A_optionalDuplicateSibling_count: 1,
        heldZeroPack_count: HELD_ZERO_PACK.length,
        subbatch4B_unblockedRem187_count: subbatch4B.length,
        excluded4B_falsePositives_count: EXCLUDED_4_FALSE_POSITIVES.length,
        subbatch4C_verifyReq55Repairs_count: subbatch4C.length,
        heldVerifyReq55_count: HELD_VERIFY_REQ_55.length,
        totalCoreWritesStaged: subbatch4A.length + subbatch4B.length + subbatch4C.length,
        totalWithOptionalSalmolin: subbatch4A.length + 1 + subbatch4B.length + subbatch4C.length,
        staleWarningsClearedAlongsideFixes: staleWarningsToClear,
      },
      subbatch4A_zeroPackInserts: subbatch4A,
      optional4A_duplicateSiblingInhaler: {
        ...OPTIONAL_SALMOLIN_DUPLICATE,
        sourceUrl: optSalmolinB.productUrl,
        duplicateSiblingExistingPacks: db.salmolinSibling?.packs ?? [],
      },
      heldZeroPack: HELD_ZERO_PACK,
      subbatch4B_unblockedRem187Fixes: subbatch4B,
      excludedRem187FalsePositives: EXCLUDED_4_FALSE_POSITIVES,
      subbatch4C_verifyReq55StripAndPriceRepairs: subbatch4C,
      heldVerifyReq55: HELD_VERIFY_REQ_55,
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch4_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const mdLines = [
      '# CareDose — Staged Batch 4 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 4 Summary',
      `- **Sub-batch 4A (${subbatch4A.length} core inserts + 1 optional duplicate-twin decision):** Verified Zero-Pack \`EXACT_MATCH\` inserts (\`Serivan 34 mg\`, \`Twincard 50+25\`, \`Uroblock 25 mg\`, \`Uroblock 50 mg\`). Optional duplicate sibling \`Salmolin 100 mcg/puff #32420\` (\`'200 metered doses (Refill)' @ ৳200.00\`) flagged for choice; **${HELD_ZERO_PACK.length} held** (\`Nilonib 200\`, \`Ketoseem 10\`, \`Prostalex 250\`).`,
      `- **Sub-batch 4B (${subbatch4B.length} updates):** Remaining CAPTCHA-paused \`REM_187\` tail unblocked via web search (\`2\` same-box + \`7\` pack/container migrations); **${EXCLUDED_4_FALSE_POSITIVES.length} false positives excluded** (\`Laxadil\`, \`Renova 500\`, \`Renova 250\`, \`Fast 250\`).`,
      `- **Sub-batch 4C (${subbatch4C.length} updates):** \`VERIFY_REQ_55\` non-divisible strip & corrupted-template repairs verified online (incl. \`Utrogestan 200 mg\` \`pp=1 -> 1080.00\` & \`2 x 7\`); **${HELD_VERIFY_REQ_55.length} held** (\`4\` H. pylori kits + \`Rabnil 20\` + \`Linamet ER 2.5+1000\`).`,
      `- **Total Core Staged Operations:** **${manifest.summary.totalCoreWritesStaged}** (\`${subbatch4A.length}\` inserts + \`${subbatch4B.length + subbatch4C.length}\` pack updates), clearing **${staleWarningsToClear}** stale \`pack_price_inconsistent_with_unit_price\` warnings in the same step (**${manifest.summary.totalWithOptionalSalmolin}** if optional \`Salmolin #32420\` Refill insert is approved).`,
      '',
      '## Sub-batch 4A — Clean Zero-Pack Inserts (4)',
      ...subbatch4A.map((x) => `- **${x.brandName} ${x.strength} (${x.dosageForm})** [\`sid=${x.sourceId}\`]: insert \`${x.proposedInsert.packQuantity}\` (\`pu=${x.proposedInsert.packUnits}, su=${x.proposedInsert.stripUnits}, u=${x.proposedInsert.unitPrice}, pp=${x.proposedInsert.packPrice}\`)`),
      '',
      '### Optional Duplicate-Twin Decision (1)',
      `- **${OPTIONAL_SALMOLIN_DUPLICATE.brandName} ${OPTIONAL_SALMOLIN_DUPLICATE.strength}** [\`sid=${OPTIONAL_SALMOLIN_DUPLICATE.sourceId}\`]: Sibling \`sid=3505\` already owns \`200 metered doses @ ৳230.00\`. Option A: insert \`'200 metered doses (Refill)' @ ৳200.00\`; Option B: leave held / consolidate later.`,
      '',
      '### Held Zero-Pack Brands (3)',
      ...HELD_ZERO_PACK.map((x) => `- **${x.brandName}** [\`sid=${x.sourceId}\`]: ${x.reason}`),
      '',
      '## Sub-batch 4B — Unblocked REM_187 Tail Fixes (9)',
      ...subbatch4B.map((x) => `- **${x.brandName} ${x.strength ?? ''}** [${x.subKind}]: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${JSON.stringify(x.proposedValues)}\``),
      '',
      '### Excluded REM_187 False Positives (4)',
      ...EXCLUDED_4_FALSE_POSITIVES.map((x) => `- **${x.name}**: ${x.reason}`),
      '',
      '## Sub-batch 4C — Verified VERIFY_REQ_55 Repairs (48)',
      ...subbatch4C.map((x) => `- **${x.brandName} ${x.strength ?? ''}**: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\`${x.clearsStaleInconsistentWarning ? ' [clears warning]' : ''}`),
      '',
      '### Held VERIFY_REQ_55 Items (6)',
      ...HELD_VERIFY_REQ_55.map((x) => `- **${x.name}** [${x.kind}]: ${x.reason}`),
    ];

    const mdOut = path.join(STAGING_DIR, 'batch4_staging_report.md');
    fs.writeFileSync(mdOut, mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH4_STAGED_SUCCESSFULLY', summary: manifest.summary, jsonOut, mdOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
