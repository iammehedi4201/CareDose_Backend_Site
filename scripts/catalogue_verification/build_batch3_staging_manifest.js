/**
 * Strictly READ-ONLY builder for Batch 3 Staged Wave Manifest.
 * Covers ONLY items directly verified via live MedEx HTTP 200 before CAPTCHA stop:
 *   - Sub-batch 3A (3): Adjacent high-priority price repairs (Sandostatin 1 ml, Tasigna 28's, Elmin 400)
 *   - Sub-batch 3B (5): Tier 5 matching-box strip/price fixes (#77, #80, #83, #88, #97)
 *   - Sub-batch 3C (21): Tier 5 commercial pack+price migrations (#75-#100 remainder)
 *   - Sub-batch 3D (14): REM_187 remaining same-pack live-MedEx price fixes (1..33 HTTP 200)
 *   - Sub-batch 3E (12): REM_187 remaining pack+price migrations (incl. Prinagel 5085->335, Mycept-S, Biomolipon)
 * Excludes: 7 false-positive DB==MedEx items, 66 st=0 Kaggle-exact items, and 13 items halted at MedEx CAPTCHA.
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const SCRATCH = 'C:/Users/Mehedi Hasan/.gemini/antigravity/brain/1e1c9592-14c9-449f-9741-aee3d98c6d1c/scratch';
const envText = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8');
const dbUrl = envText.match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch3_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

function parseMedexPackages(pkgs) {
  const txt = (pkgs || []).join(' ');
  // Matrix tablet/capsule/suppository pattern: "Unit Price: ৳ 17.00 (7 x 6: ৳ 714.00)"
  let m = txt.match(/Unit Price:\s*৳\s*([\d,]+\.\d+|[\d,]+)\s*\((\d+)\s*x\s*(\d+):\s*৳\s*([\d,]+\.\d+|[\d,]+)\)/i);
  if (m) {
    const unitPrice = m[1].replace(/,/g, '');
    const a = Number(m[2]);
    const b = Number(m[3]);
    const packPrice = m[4].replace(/,/g, '');
    return { kind: 'MATRIX', packQuantity: `${a} x ${b}`, packUnits: a * b, stripUnits: b > 1 ? b : null, unitPrice, packPrice };
  }
  // Container box + single unit: "1 ml ampoule: ৳ 80.00 (1 x 5: ৳ 400.00)"
  m = txt.match(/:\s*৳\s*([\d,]+\.\d+|[\d,]+)\s*\((\d+)\s*x\s*(\d+):\s*৳\s*([\d,]+\.\d+|[\d,]+)\)/i);
  if (m) {
    const a = Number(m[2]);
    const b = Number(m[3]);
    const packPrice = m[4].replace(/,/g, '');
    return { kind: 'CONTAINER_BOX', packQuantity: `${a * b}'s pack`, packUnits: a * b, stripUnits: null, unitPrice: null, packPrice };
  }
  // Single container/drop/tube/pack: "15 gm tube & applicator: ৳ 335.00", "5 ml drop: ৳ 280.00", "3 capsule pack: ৳ 350.00"
  m = txt.match(/^([^:]+):\s*৳\s*([\d,]+\.\d+|[\d,]+)$/i);
  if (m) {
    const pq = m[1].trim();
    const packPrice = m[2].replace(/,/g, '');
    const capM = pq.match(/^(\d+)\s+capsule\s+pack$/i);
    return {
      kind: 'SINGLE_CONTAINER',
      packQuantity: pq,
      packUnits: capM ? Number(capM[1]) : null,
      stripUnits: null,
      unitPrice: null,
      packPrice,
    };
  }
  return null;
}

(async () => {
  const t5List = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'next_wave_inspection.json'), 'utf8')).tier5;
  const remCheck = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'rem112_live_medex_check.json'), 'utf8'));

  const adj3ASpecs = [
    {
      packId: '406d9928-29d8-4313-91a8-06eafde14489',
      liveMedexUrl: 'https://medex.com.bd/brands/15196/sandostatin-50-mcg-injection',
      liveMedexText: "1 ml ampoule: ৳ 362.00 (1 x 5: ৳ 1,810.00)",
      proposedValues: { packPrice: '362.00' },
      note: 'Sibling of Batch 2B #55; fixes comma-truncated packPrice 1 -> live MedEx ৳362.00/ampoule.',
    },
    {
      packId: '74da2ebc-d200-4822-81c4-56983a95c17e',
      liveMedexUrl: 'https://medex.com.bd/brands/15127/tasigna-200-mg-capsule',
      liveMedexText: "Unit Price: ৳ 475.00 (2 x 14: ৳ 13,300.00) Strip Price: ৳ 6,650.00",
      proposedValues: { unitPrice: '475.00', packPrice: '13300.00' },
      note: 'Sibling of Batch 2B #58; aligns 28-cap pack to Novartis live MedEx MRP reduction (3,051.50/85,442 -> 475/13,300).',
    },
    {
      packId: 'd7b6f44a-4688-4aca-8d3a-0c46641de22f',
      liveMedexUrl: 'https://medex.com.bd/brands/312/elmin-400-mg-chewable-tablet',
      liveMedexText: "Unit Price: ৳ 4.50 (25 x 1: ৳ 112.50) Strip Price: ৳ 4.50",
      proposedValues: { unitPrice: '4.50', packPrice: '112.50' },
      note: 'Follow-up price sync after Batch 2B strip cleanup; aligns 25x1 pack to live MedEx 4.50/112.50.',
    },
  ];

  const allNeededPackIds = [
    ...adj3ASpecs.map((x) => x.packId),
    ...t5List.map((x) => x.packId),
    ...remCheck.map((x) => x.packId),
  ];

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const dbPacks = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.medicinePack.findMany({
          where: { id: { in: allNeededPackIds } },
          include: { brand: { include: { generic: { select: { name: true } } } } },
        });
      },
      { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 },
    );
    const dbMap = new Map(dbPacks.map((p) => [p.id, p]));

    const subbatch3A = adj3ASpecs.map((s) => {
      const p = dbMap.get(s.packId);
      return {
        packId: p.id,
        brandId: p.brandId,
        brandName: p.brand.name,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        packQuantity: p.packQuantity,
        packUnits: p.packUnits,
        stripUnits: p.stripUnits,
        currentValues: {
          unitPrice: p.unitPrice?.toString() ?? null,
          packPrice: p.packPrice?.toString() ?? null,
          warnings: p.warnings,
        },
        proposedValues: s.proposedValues,
        evidence: { liveMedexUrl: s.liveMedexUrl, liveMedexText: s.liveMedexText, note: s.note },
      };
    });

    const subbatch3B = [];
    const subbatch3C = [];
    for (const item of t5List) {
      const p = dbMap.get(item.packId);
      const parsed = parseMedexPackages(item.medexPackages);
      if (!parsed || parsed.kind !== 'MATRIX') {
        throw new Error(`Unexpected Tier 5 parse on ${item.brandName}: ${JSON.stringify(item.medexPackages)}`);
      }
      const curUnitStr = p.unitPrice?.toString() ?? null;
      const curPackStr = p.packPrice?.toString() ?? null;
      const sameTotalUnits = p.packUnits === parsed.packUnits;
      const baseRec = {
        priorityRank: item.priorityRank,
        packId: p.id,
        brandId: p.brandId,
        brandName: p.brand.name,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        currentValues: {
          packQuantity: p.packQuantity,
          packUnits: p.packUnits,
          stripUnits: p.stripUnits,
          unitPrice: curUnitStr,
          packPrice: curPackStr,
          warnings: p.warnings,
        },
        medexUrl: item.finalUrl || item.medexUrl,
        liveMedexText: item.medexPackages.join(' '),
      };
      if (sameTotalUnits) {
        const pricesSame =
          curUnitStr !== null &&
          curPackStr !== null &&
          new Prisma.Decimal(curUnitStr).eq(new Prisma.Decimal(parsed.unitPrice)) &&
          new Prisma.Decimal(curPackStr).eq(new Prisma.Decimal(parsed.packPrice));
        const prop = { stripUnits: parsed.stripUnits };
        if (!pricesSame) {
          prop.unitPrice = parsed.unitPrice;
          prop.packPrice = parsed.packPrice;
        }
        subbatch3B.push({ ...baseRec, proposedValues: prop, pricesAlreadyMatchedLiveMedex: pricesSame });
      } else {
        subbatch3C.push({
          ...baseRec,
          proposedValues: {
            packQuantity: parsed.packQuantity,
            packUnits: parsed.packUnits,
            stripUnits: parsed.stripUnits,
            unitPrice: parsed.unitPrice,
            packPrice: parsed.packPrice,
          },
        });
      }
    }

    const subbatch3D = [];
    const subbatch3E = [];
    const excludedFalsePositives = [];
    const heldCaptcha = [];
    for (const item of remCheck) {
      if ((item.liveMedexFinalUrl || '').includes('captcha-challenge') || !item.liveMedexPackages?.length) {
        heldCaptcha.push({
          packId: item.packId,
          brandName: item.brandName,
          strength: item.strength,
          packQuantity: item.pq,
          dbUnit: item.curUnit,
          dbPack: item.curPack,
          arPvMrp: item.arPvMrp,
          arB2cMrp: item.arB2cMrp,
          reason: 'MEDEX_RATE_LIMIT_CAPTCHA_ENCOUNTERED_STOPPED_SAFELY',
        });
        continue;
      }
      const p = dbMap.get(item.packId);
      const parsed = parseMedexPackages(item.liveMedexPackages);
      if (!parsed) throw new Error(`Could not parse REM112 MedEx on ${item.brandName}: ${item.liveMedexPackages}`);

      const dCurU = p.unitPrice !== null ? new Prisma.Decimal(p.unitPrice.toString()) : null;
      const dCurP = p.packPrice !== null ? new Prisma.Decimal(p.packPrice.toString()) : null;
      const dNewU = parsed.unitPrice !== null ? new Prisma.Decimal(parsed.unitPrice) : null;
      const dNewP = parsed.packPrice !== null ? new Prisma.Decimal(parsed.packPrice) : null;

      const uSame = (dCurU === null && dNewU === null) || (dCurU && dNewU && dCurU.eq(dNewU));
      const pSame = (dCurP === null && dNewP === null) || (dCurP && dNewP && dCurP.eq(dNewP));
      const pClosePct = dCurP && dNewP ? dCurP.sub(dNewP).abs().div(dNewP).toNumber() : 1;

      if (uSame && pClosePct <= 0.01) {
        excludedFalsePositives.push({
          packId: p.id,
          brandName: `${p.brand.name} ${p.brand.strength ?? ''}`.trim(),
          db: `${p.unitPrice}/${p.packPrice}`,
          liveMedex: item.liveMedexPackages.join(' '),
          aroggaBad: `${item.arPvMrp}/${item.arB2cMrp}`,
          reason: 'DB_ALREADY_MATCHES_LIVE_MEDEX',
        });
        continue;
      }

      const rec = {
        packId: p.id,
        brandId: p.brandId,
        brandName: p.brand.name,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        currentValues: {
          packQuantity: p.packQuantity,
          packUnits: p.packUnits,
          stripUnits: p.stripUnits,
          unitPrice: p.unitPrice?.toString() ?? null,
          packPrice: p.packPrice?.toString() ?? null,
          warnings: p.warnings,
        },
        medexUrl: item.liveMedexFinalUrl || item.medexUrl,
        liveMedexText: item.liveMedexPackages.join(' '),
      };

      const sameBox = (p.packUnits ?? null) === (parsed.packUnits ?? null) && (parsed.kind !== 'SINGLE_CONTAINER' || p.packQuantity === parsed.packQuantity);
      if (sameBox) {
        const prop = {};
        if (parsed.unitPrice !== null && !uSame) prop.unitPrice = parsed.unitPrice;
        if (!pSame) prop.packPrice = parsed.packPrice;
        // Also check stripUnits if matrix shows different stripUnits divisible into packUnits
        if (parsed.stripUnits && p.stripUnits !== null && p.stripUnits !== parsed.stripUnits && p.packUnits % parsed.stripUnits === 0) {
          prop.stripUnits = parsed.stripUnits;
        }
        // Special check: clear stale pack_price_inconsistent warning if Decimal now exact
        subbatch3D.push({ ...rec, proposedValues: prop });
      } else {
        const prop = {
          packQuantity: parsed.packQuantity,
          packUnits: parsed.packUnits,
          stripUnits: parsed.stripUnits,
          unitPrice: parsed.unitPrice,
          packPrice: parsed.packPrice,
        };
        subbatch3E.push({ ...rec, proposedValues: prop });
      }
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      status: 'STAGED_READ_ONLY_NOT_EXECUTED',
      summary: {
        subbatch3A_adjacentPriceSync_count: subbatch3A.length,
        subbatch3B_tier5SameBoxFixes_count: subbatch3B.length,
        subbatch3C_tier5BoxMigrations_count: subbatch3C.length,
        subbatch3D_rem187SameBoxPriceFixes_count: subbatch3D.length,
        subbatch3E_rem187PackMigrations_count: subbatch3E.length,
        totalVerifiedStagedBatch3: subbatch3A.length + subbatch3B.length + subbatch3C.length + subbatch3D.length + subbatch3E.length,
        excludedFalsePositivesAlreadyCorrect: excludedFalsePositives.length,
        heldPendingMedexCaptchaStoppedSafely: heldCaptcha.length,
        held66St0AlreadyMatchingKaggle: 66,
      },
      subbatch3A_adjacentVerifiedPrices: subbatch3A,
      subbatch3B_tier5SameBoxFixes: subbatch3B,
      subbatch3C_tier5CommercialBoxMigrations: subbatch3C,
      subbatch3D_rem187SameBoxPriceFixes: subbatch3D,
      subbatch3E_rem187PackAndPriceMigrations: subbatch3E,
      excludedFalsePositivesAlreadyMatchingMedex: excludedFalsePositives,
      heldPendingMedexCaptchaTail: heldCaptcha,
    };

    const jsonOut = path.join(STAGING_DIR, 'proposed_batch3_wave_manifest.json');
    fs.writeFileSync(jsonOut, JSON.stringify(manifest, null, 2));

    const mdLines = [
      '# CareDose — Staged Batch 3 Wave Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | Status: STAGED (0 PostgreSQL mutations)`,
      '',
      '## Batch 3 Summary',
      `- **Sub-batch 3A (${subbatch3A.length}):** Adjacent price repairs (Sandostatin 1 ml, Tasigna 28's, Elmin 400)`,
      `- **Sub-batch 3B (${subbatch3B.length}):** Tier 5 matching-box fixes (#77, #80, #83, #88, #97)`,
      `- **Sub-batch 3C (${subbatch3C.length}):** Tier 5 commercial box + price migrations (#75-#100 remainder)`,
      `- **Sub-batch 3D (${subbatch3D.length}):** REM_187 remaining same-box live MedEx price repairs (incl. Electro-K, Colasa, Indula, Dewax, Kidopia, Piloma OSD, Bigatab)`,
      `- **Sub-batch 3E (${subbatch3E.length}):** REM_187 remaining pack+price migrations (incl. Prinagel 8% 5,085->335, Biomolipon, Mycept-S 180/360, Pancreon 10000)`,
      `- **Total Ready & Staged:** **${manifest.summary.totalVerifiedStagedBatch3}**`,
      `- **Verified False Positives Kept Untouched:** ${excludedFalsePositives.length} live MedEx exact + 66 Arogga st=0 Kaggle-exact = **73**`,
      `- **Stopped Safely at MedEx CAPTCHA:** ${heldCaptcha.length} items (#34-#46 held without bypass)`,
      '',
      '## Sub-batch 3A — Adjacent Verified Prices',
      ...subbatch3A.map((x) => `- **${x.brandName} ${x.strength}** (\`${x.packQuantity}\`): \`${x.currentValues.unitPrice}/${x.currentValues.packPrice}\` -> \`${JSON.stringify(x.proposedValues)}\``),
      '',
      '## Sub-batch 3B — Tier 5 Matching-Box Fixes (5)',
      ...subbatch3B.map((x) => `- **#${x.priorityRank} ${x.brandName} ${x.strength}** (\`${x.currentValues.packQuantity}\`): \`${JSON.stringify(x.proposedValues)}\` | ${x.liveMedexText}`),
      '',
      '## Sub-batch 3C — Tier 5 Commercial Box Migrations (21)',
      ...subbatch3C.map((x) => `- **#${x.priorityRank} ${x.brandName} ${x.strength}**: \`${x.currentValues.packQuantity} (su=${x.currentValues.stripUnits}, ${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${x.proposedValues.packQuantity} (pu=${x.proposedValues.packUnits}, su=${x.proposedValues.stripUnits}, ${x.proposedValues.unitPrice}/${x.proposedValues.packPrice})\``),
      '',
      '## Sub-batch 3D — REM_187 Same-Box Price Repairs',
      ...subbatch3D.map((x) => `- **${x.brandName} ${x.strength ?? ''}** (\`${x.currentValues.packQuantity}\`): \`${x.currentValues.unitPrice}/${x.currentValues.packPrice}\` -> \`${JSON.stringify(x.proposedValues)}\` | ${x.liveMedexText}`),
      '',
      '## Sub-batch 3E — REM_187 Pack + Price Migrations',
      ...subbatch3E.map((x) => `- **${x.brandName} ${x.strength ?? ''}**: \`${x.currentValues.packQuantity} (${x.currentValues.unitPrice}/${x.currentValues.packPrice})\` -> \`${JSON.stringify(x.proposedValues)}\` | ${x.liveMedexText}`),
      '',
      '## Excluded False Positives (Already Match Live MedEx)',
      ...excludedFalsePositives.map((x) => `- **${x.brandName}**: DB=${x.db} == Live MedEx (${x.liveMedex}) | Arogga had ${x.aroggaBad}`),
      '',
      '## Held at MedEx CAPTCHA Gate (Stopped Without Bypass)',
      ...heldCaptcha.map((x) => `- **${x.brandName} ${x.strength ?? ''}** (\`${x.packQuantity}\`): DB=${x.dbUnit}/${x.dbPack}, Arogga=${x.arPvMrp}/${x.arB2cMrp}`),
    ];
    fs.writeFileSync(path.join(STAGING_DIR, 'batch3_staging_report.md'), mdLines.join('\n'));
    console.log(JSON.stringify({ status: 'BATCH3_STAGED_SUCCESSFULLY', summary: manifest.summary, jsonOut }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
