/**
 * Strictly READ-ONLY builder for Batch 6 Staged Wave Manifest.
 * Covers all 64 online-verified repairs:
 *   - 1 held Batch 5 item resolved (Laxana 24 mg Capsule: 2 x 10 @ 40.00/800.00)
 *   - 63 remaining Arogga-matched solid u=8.00/pp=280.00 corrupted-template packs
 * Excludes Helicon V combikit (held alongside H. pylori multi-drug kits).
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const dbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch6_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Format: [packId, subKind, pq, pu, su, unitPrice, packPrice, evidence]
const BATCH6_SPECS = [
  ['0c6e37c8-6565-4d74-94e8-572e0ee4dc3e', 'HELD_BATCH5_RESOLVED', '2 x 10', 20, 10, '40.00', '800.00', 'MedEx search & Arogga: Laxana 24 mg ৳40.00 (2 x 10: ৳800.00).'],
  ['edcdae12-f8a9-4f40-bea1-5ba465f50f70', 'U8_PP280_WAVE2', '1 x 4', 4, 4, '60.00', '240.00', 'MedEx search: Provigor 20 mg ৳60.00 (1 x 4: ৳240.00).'],
  ['c3b48e19-b81e-4053-a220-86965fb8dcc4', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '55.00', '550.00', 'MedEx search: Livheal 100 mg ৳55.00 (1 x 10: ৳550.00).'],
  ['bd245a2b-5a3a-43ef-8bec-bec9fe9f8893', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '55.00', '550.00', 'MedEx search: Rezim 100 mg ৳55.00 (1 x 10: ৳550.00).'],
  ['ec6ed07d-a0aa-4fa1-8960-4f30e3cb13af', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '55.00', '550.00', 'MedEx search: Resmit 100 mg ৳55.00 (1 x 10: ৳550.00).'],
  ['62e0ef8f-0e5d-48f6-9795-423c1f7ea3f1', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '55.00', '550.00', 'MedEx search: Remeliv 100 mg ৳55.00 (1 x 10: ৳550.00).'],
  ['ff5cc547-9681-452e-929a-2d67596353d0', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '55.00', '1100.00', 'MedEx search: Fibrocon 100 mg ৳55.00 (2 x 10: ৳1,100.00).'],
  ['aaacfd5c-5271-4f9f-aaae-ec1c7f37b2f8', 'U8_PP280_WAVE2', 'tablet kit', null, null, null, '1700.00', 'MedEx search: Biocal Kit (1 x Ibandronic 150 + 30 x Algae Ca/D3) tablet kit: ৳1,700.00.'],
  ['3e314f26-6115-40b5-8df9-57fe08238461', 'U8_PP280_WAVE2', '(24 active + 4 inert) tablets', 28, null, null, '1500.00', 'MedEx search: Liana 3 mg+14.2 mg (24 active + 4 inert) tablets: ৳1,500.00.'],
  ['001fcba0-ed70-43fe-b8c6-09b2e6af5b42', 'U8_PP280_WAVE2', '(24 active + 4 inert) tablets', 28, null, null, '1500.00', 'MedEx search: Estellis 3 mg+14.2 mg (24 active + 4 inert) tablets: ৳1,500.00.'],
  ['3c186fd6-63e1-4535-8493-25f6d7027fa6', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '50.00', '500.00', 'MedEx search: Adimod 400 mg ৳50.00 (1 x 10: ৳500.00).'],
  ['607d9743-f539-4f56-9bde-ee352578259b', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '50.00', '500.00', 'MedEx search: Pidonex 400 mg ৳50.00 (1 x 10: ৳500.00).'],
  ['2197678a-6dc7-4a55-b084-cfbbbe449f80', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '50.00', '1000.00', 'MedEx search: Cystnil 150+550 ৳50.00 (2 x 10: ৳1,000.00).'],
  ['5365c645-ce61-487e-b83a-3f4d1d506c50', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '50.00', '1000.00', 'MedEx search: D-Myo 150+550 ৳50.00 (2 x 10: ৳1,000.00).'],
  ['090fe9da-8519-45c1-a80d-6978f68e4b89', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '50.00', '1000.00', 'MedEx search: Lipodes-L 100 mg ৳50.00 (2 x 10: ৳1,000.00).'],
  ['7feca1ae-e64c-4950-b3e1-96f9a9f4143b', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '45.00', '900.00', 'MedEx search: Minocin 100 mg ৳45.00 (2 x 10: ৳900.00).'],
  ['28db4d3f-9b53-4096-8afd-ddf14f4ad9a8', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '45.00', '450.00', 'MedEx search: Nocpres 200 mcg ৳45.00 (1 x 10: ৳450.00).'],
  ['5a805ad7-80ff-4407-aa32-44d82c694ac7', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '45.00', '900.00', 'MedEx search: Nervion 15 mg ৳45.00 (2 x 10: ৳900.00).'],
  ['7a5e86ee-9562-4f20-9e74-d5ec1eaa628d', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '45.00', '450.00', 'MedEx search: Renash 80 mg ৳45.00 (1 x 10: ৳450.00).'],
  ['dfd1d444-a127-45d9-8095-78f80e5719f3', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '45.00', '450.00', 'MedEx search: Resmit 80 mg ৳45.00 (1 x 10: ৳450.00).'],
  ['b792f470-0e43-44f0-9654-d376555bcd2e', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '45.00', '450.00', 'MedEx search: Remeliv 80 mg ৳45.00 (1 x 10: ৳450.00).'],
  ['51967380-57e6-41e0-82c3-314b73f40d94', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '45.00', '900.00', 'MedEx search: Rezim 80 mg ৳45.00 (2 x 10: ৳900.00).'],
  ['9fa89174-67cb-4f11-92b6-611ef1ee501d', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '45.00', '900.00', 'MedEx search: Livheal 80 mg ৳45.00 (2 x 10: ৳900.00).'],
  ['04598d59-e2fc-4e12-9e70-bd1ade065190', 'U8_PP280_WAVE2', '1 x 14', 14, 14, '40.00', '560.00', 'MedEx search: Magolin 15 mg ৳40.00 (1 x 14: ৳560.00).'],
  ['dd5ae335-f972-4707-9b43-be9e193c049a', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '40.00', '800.00', 'MedEx search: Lipodes-L 80 mg ৳40.00 (2 x 10: ৳800.00).'],
  ['9adeff05-7ca9-4ccd-bc32-139fbec9de7f', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Mig 10 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['4cd11ab5-5a75-4e13-8a1f-2d21f91f13a5', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Merolin 10 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['8e8bbb9f-aca6-48b2-a096-f60d0e9548c1', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '35.00', '700.00', 'MedEx search: Afalino 25 mg ৳35.00 (2 x 10: ৳700.00).'],
  ['d5da706d-99e4-46fa-9971-14d133873737', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '35.00', '700.00', 'MedEx search: Mirovan 10 mg ৳35.00 (2 x 10: ৳700.00).'],
  ['237cc6b7-0bb1-4b85-98ad-7f534d960451', 'U8_PP280_WAVE2', '1 x 15', 15, 15, '35.00', '525.00', 'MedEx search: Migalin 10 mg ৳35.00 (1 x 15: ৳525.00).'],
  ['3b8c855e-e441-4c26-9425-24fadc2c75f5', 'U8_PP280_WAVE2', '1 x 15', 15, 15, '35.00', '525.00', 'MedEx search: Numira 10 mg ৳35.00 (1 x 15: ৳525.00).'],
  ['f8893f78-ff46-4aff-a20f-46b7b74b4ad7', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Neumig 10 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['1c1266e0-ebaf-4536-a353-2f93de1468c1', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '35.00', '700.00', 'MedEx search: Gefapix 45 mg ৳35.00 (2 x 10: ৳700.00).'],
  ['ffeee7bf-655f-4ffc-80f7-9847ec664b3d', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '35.00', '700.00', 'MedEx search: Miroflex 10 mg ৳35.00 (2 x 10: ৳700.00).'],
  ['6c987656-8408-4fda-9d05-2de469a8424e', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Renash 60 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['239fbdd8-5b6e-455b-98d3-3c1bb6b362a9', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Remeliv 60 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['5b61479d-54e3-47db-a546-9468588c1471', 'U8_PP280_WAVE2', '1 x 15', 15, 15, '35.00', '525.00', 'MedEx search: Mirotop 10 mg ৳35.00 (1 x 15: ৳525.00).'],
  ['8c422d23-cf8d-4d60-8a5e-f02052a2128a', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '35.00', '700.00', 'MedEx search: Arthera 25 mg ৳35.00 (2 x 10: ৳700.00).'],
  ['8121148a-eb11-436f-b1f4-7c78aba476a7', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '35.00', '700.00', 'MedEx search: Igura 25 mg ৳35.00 (2 x 10: ৳700.00).'],
  ['302d6e54-b0de-4090-ad5a-eda3faf8e6b3', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '35.00', '350.00', 'MedEx search: Neumir 10 mg ৳35.00 (1 x 10: ৳350.00).'],
  ['68db289f-b901-44fa-ad02-8e8c77ad6c9c', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '32.00', '640.00', 'MedEx search: Cholcut EZ 20+10 ৳32.00 (2 x 10: ৳640.00).'],
  ['fb4e4c26-1d73-44aa-82d1-2cd47dd4aef5', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '30.00', '600.00', 'MedEx search: Lipodes-L 60 mg ৳30.00 (2 x 10: ৳600.00).'],
  ['32a8e0bb-abf5-49cc-9aa7-49e0fbf49843', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '30.00', '600.00', 'MedEx search: Nocpres 100 mcg ৳30.00 (2 x 10: ৳600.00).'],
  ['c6f77caf-2a6c-440e-a6bb-d5aebfe403ef', 'U8_PP280_WAVE2', '1 x 14', 14, 14, '28.00', '392.00', 'MedEx search: Magolin 10 mg ৳28.00 (1 x 14: ৳392.00).'],
  ['20ebbd73-9b4b-4284-bd9c-d8650e19e14d', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '25.00', '500.00', 'MedEx search: Etragut 2 mg ৳25.00 (2 x 10: ৳500.00).'],
  ['1f3bcdf2-9195-4f7e-8069-931d123f9d27', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '24.00', '480.00', 'MedEx search: Cenomate 12.5 mg ৳24.00 (2 x 10: ৳480.00).'],
  ['8f4f4b56-cffb-488e-b9a2-bf6ebd3df766', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '24.00', '480.00', 'MedEx search: Dotfix 2 mg ৳24.00 (2 x 10: ৳480.00).'],
  ['e5bfbc65-2679-4c1f-889c-8a2fc2fe2e41', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '22.00', '440.00', 'MedEx search: Lacomax 100 mg ৳22.00 (2 x 10: ৳440.00).'],
  ['4bd64776-879c-4f5e-9f30-c63c1192dc72', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '22.00', '440.00', 'MedEx search: Naftol 75 mg ৳22.00 (2 x 10: ৳440.00).'],
  ['68cf8edd-6e11-4189-9b98-2ea79c4018df', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '22.00', '440.00', 'MedEx search: Creston EZ 10+10 ৳22.00 (2 x 10: ৳440.00).'],
  ['380f50cb-3b2a-4aa3-b60a-acf2d4f73fa0', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Miralin 5 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['ec3f5675-d5bb-4ab8-bc8f-721b44e25122', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: GabaFix 5 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['2df8e4df-aab8-4ee3-8294-165fd94dd224', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Dumeg 500 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['29e6e6d3-e4b2-4842-a262-365bd63c0db0', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Neumig 5 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['ff3ea0f0-ee59-41d6-b628-19cfeb62bfe9', 'U8_PP280_WAVE2', '3 x 10', 30, 10, '20.00', '600.00', 'MedEx search: Ramos 5 mcg ৳20.00 (3 x 10: ৳600.00).'],
  ['c47efed8-1229-4ddd-b58b-c58636bd7fd6', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Insumin 500 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['09f41f40-c7c6-4852-9509-8067df9179e6', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Mirovan 5 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['b2962a5f-82fe-4d88-b799-26d290890ec6', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '20.00', '400.00', 'MedEx search: Imeg 500 mg ৳20.00 (2 x 10: ৳400.00).'],
  ['87a59d85-1a23-4268-aa6d-9a76ffc91aa2', 'U8_PP280_WAVE2', '2 x 10', 20, 10, '19.00', '380.00', 'MedEx search: Evamax 2 mg ৳19.00 (2 x 10: ৳380.00).'],
  ['fd796955-bbc2-4f27-b8fb-e51338b381dc', 'U8_PP280_WAVE2', '1 x 10', 10, 10, '18.00', '180.00', 'MedEx search: Evadol 2 mg ৳18.00 (1 x 10: ৳180.00).'],
  ['7a627367-d90f-420d-8d23-cb1bcb32be07', 'U8_PP280_WAVE2', '1 x 14', 14, 14, '16.00', '224.00', 'MedEx search: Magolin 5 mg ৳16.00 (1 x 14: ৳224.00).'],
  ['750c7553-7c42-4c67-8569-6fcdcf381e40', 'U8_PP280_WAVE2', '3 x 10', 30, 10, '12.00', '360.00', 'MedEx search: Ramos 2.5 mcg ৳12.00 (3 x 10: ৳360.00).'],
  ['f2c5dd9e-bb3a-40dd-bd8b-843499c04ad5', 'U8_PP280_WAVE2', '6 x 10', 60, 10, '2.08', '124.80', 'MedEx search: N-MAX 200+500 ৳2.08 (6 x 10: ৳124.80).'],
  ['4b8a5eeb-05ef-4da4-af16-88caa395e9dc', 'U8_PP280_WAVE2', '5 x 10', 50, 10, '2.08', '104.00', 'MedEx search: Flamex Duo 200+500 ৳2.08 (5 x 10: ৳104.00).'],
];

const HELD_FROM_BATCH6 = [
  {
    packId: 'ac3fd8bf-d057-4a28-9f40-25720203e92a',
    name: 'Helicon V 20 mg+1000 mg+500 mg (General)',
    reason: 'Vonoprazan + Amoxicillin + Clarithromycin multi-drug H. pylori combikit (Arogga Box 4 / Box 14 / Strip 4, ৳210-৳840). Held alongside H. pylori kits pending exact pouch representation.',
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
  const ids = BATCH6_SPECS.map((s) => s[0]);
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

    const stagedUpdates = BATCH6_SPECS.map((spec) => {
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
        heldBatch5Resolved_count: stagedUpdates.filter((x) => x.subKind === 'HELD_BATCH5_RESOLVED').length,
        u8pp280Wave2_count: stagedUpdates.filter((x) => x.subKind === 'U8_PP280_WAVE2').length,
        totalVerifiedStagedBatch6: stagedUpdates.length,
        samePackUnitsCount: stagedUpdates.filter((x) => x.migrationKind === 'SAME_PACK_UNITS').length,
        packMigrationCount: stagedUpdates.filter((x) => x.migrationKind === 'PACK_MIGRATION').length,
        warningsClearedCount,
        heldFromBatch6Count: HELD_FROM_BATCH6.length,
      },
      batch6Updates: stagedUpdates,
      heldFromBatch6: HELD_FROM_BATCH6,
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch6_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const mdLines = [
      '# CareDose — Staged Batch 6 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 6 Summary',
      `- **Resolved Held Batch 5 Item (1):** \`Laxana 24 mg Capsule\` (\`2 x 10: ৳40.00 / ৳800.00\`).`,
      `- **Corrupted \`u=8.00 / pp=280.00\` Wave 2 (63):** Every verified remaining Arogga-matched solid SKU (\`63 / 64\`, holding only \`Helicon V\` combikit), incl. \`Liana\`/\`Estellis\` (\`1,500\`), \`Biocal Kit\` (\`1,700\`), \`Livheal\`/\`Rezim\`/\`Resmit\`/\`Remeliv\`/\`Renash\`/\`Lipodes-L\`, \`D-Myo\`/\`Cystnil\`, \`Ramos\`, \`Mig\`/\`Merolin\`/\`Mirovan\`/\`Neumig\`/\`Neumir\`/\`Magolin\`, \`Lacomax 100\`, \`Insumin\`/\`Dumeg\`/\`Imeg\`, and \`N-MAX\`/\`Flamex Duo\` (\`2.08\`).`,
      `- **Total Verified Batch 6 Updates:** **${manifest.summary.totalVerifiedStagedBatch6}** (\`${manifest.summary.samePackUnitsCount}\` same pack units + \`${manifest.summary.packMigrationCount}\` pack migrations), clearing **${warningsClearedCount}** \`pack_price_inconsistent_with_unit_price\` warnings.`,
      `- **Held (1):** \`Helicon V\` (*H. pylori* combikit).`,
      '',
      '## Staged Batch 6 Updates (64)',
      ...stagedUpdates.map((x) => `- **${x.brandName} ${x.strength ?? ''}** [${x.subKind}]: \`${x.currentValues.packQuantity} (pu=${x.currentValues.packUnits}, su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``),
      '',
      '## Held From Batch 6 (1)',
      ...HELD_FROM_BATCH6.map((h) => `- **${h.name}**: ${h.reason}`),
    ];

    const mdOut = path.join(STAGING_DIR, 'batch6_staging_report.md');
    fs.writeFileSync(mdOut, mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH6_STAGED_SUCCESSFULLY', summary: manifest.summary, jsonOut, mdOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
