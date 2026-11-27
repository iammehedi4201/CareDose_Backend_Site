import { Injectable, NotFoundException } from '@nestjs/common';
import { FieldStatus, MedicationStatus, Prisma, ScheduleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { serializePurchase } from '../purchases/purchases.serializers';
import {
  canDeductDoseUnitFromStockUnit,
  formatLocalDateYmd,
  zonedDateTimeToUtc,
} from '../schedules/schedule-time.util';
import { GetExpensesSummaryQueryDto } from './dto/expenses.dto';
import {
  SerializedEstimatedMedicationCostItem,
  SerializedEstimatedMedicationExcludedItem,
  SerializedExpensesSummaryResponse,
  SerializedMedicationSpendBreakdownItem,
  SerializedMonthlySpendPoint,
} from './expenses.serializers';

const MONTH_SHORT_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const DISCRETE_UNITS = new Set([
  'tablet',
  'tablets',
  'capsule',
  'capsules',
  'piece',
  'pieces',
  'sachet',
  'sachets',
  'suppository',
  'suppositories',
  'puff',
  'puffs',
]);

const CONTAINER_UNITS = new Set([
  'bottle',
  'bottles',
  'vial',
  'vials',
  'ampoule',
  'ampoules',
  'syringe',
  'syringes',
  'tube',
  'tubes',
  'pen',
  'pens',
  'bag',
  'bags',
]);

function parseYmParts(ym: string): { year: number; month: number } {
  const [yStr, mStr] = ym.split('-');
  return { year: Number(yStr), month: Number(mStr) };
}

function shiftYm(ym: string, deltaMonths: number): string {
  const { year, month } = parseYmParts(ym);
  const d = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  const nextYear = d.getUTCFullYear();
  const nextMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

function formatYmShort(ym: string): { shortLabel: string; yearLabel: string } {
  const { year, month } = parseYmParts(ym);
  return {
    shortLabel: MONTH_SHORT_LABELS[month - 1] ?? ym,
    yearLabel: String(year),
  };
}

function computeMonthlyDosesMultiplier(
  frequency: string,
  timesPerDay: number,
  weekdays: number[],
): { factor: Prisma.Decimal | null; summary: string } {
  const freq = frequency.trim().toUpperCase();
  const safeTimes = Math.max(timesPerDay, 1);

  if (freq === 'AS_NEEDED') {
    return { factor: null, summary: 'As needed' };
  }
  if (freq === 'ALTERNATE_DAYS') {
    return {
      factor: new Prisma.Decimal(safeTimes).mul(15),
      summary: `${safeTimes}x every 2 days`,
    };
  }
  if (freq === 'WEEKLY') {
    return {
      factor: new Prisma.Decimal(safeTimes).mul(30).div(7),
      summary: `${safeTimes}x weekly`,
    };
  }
  if (freq === 'SELECTED_WEEKDAYS') {
    const daysPerWeek = Math.max(weekdays.length, 1);
    return {
      factor: new Prisma.Decimal(safeTimes).mul(daysPerWeek).mul(30).div(7),
      summary: `${safeTimes}x · ${daysPerWeek} days/wk`,
    };
  }
  return {
    factor: new Prisma.Decimal(safeTimes).mul(30),
    summary: `${safeTimes}x daily`,
  };
}

function hasInconsistentPackPriceWarning(warnings?: string[] | null): boolean {
  if (!Array.isArray(warnings)) return false;
  return warnings.some((w) => w.includes('inconsistent'));
}

function resolveCatalogueUnitPrice(
  stockUnit: string,
  brandPriceFieldStatus: FieldStatus | undefined,
  packs: Array<{
    packUnits: number | null;
    unitPrice: Prisma.Decimal | null;
    packPrice: Prisma.Decimal | null;
    warnings: string[];
  }>,
): Prisma.Decimal | null {
  if (brandPriceFieldStatus === FieldStatus.INVALID) {
    return null;
  }
  const normStockUnit = stockUnit.trim().toLowerCase();
  for (const pack of packs) {
    if (hasInconsistentPackPriceWarning(pack.warnings)) {
      continue;
    }
    if (DISCRETE_UNITS.has(normStockUnit)) {
      if (pack.unitPrice && new Prisma.Decimal(pack.unitPrice.toString()).gt(0)) {
        return new Prisma.Decimal(pack.unitPrice.toString());
      }
      if (
        pack.packPrice &&
        pack.packUnits &&
        pack.packUnits > 0 &&
        new Prisma.Decimal(pack.packPrice.toString()).gt(0)
      ) {
        return new Prisma.Decimal(pack.packPrice.toString())
          .div(pack.packUnits)
          .toDecimalPlaces(4);
      }
    } else if (CONTAINER_UNITS.has(normStockUnit)) {
      if (
        pack.packPrice &&
        new Prisma.Decimal(pack.packPrice.toString()).gt(0) &&
        (!pack.packUnits || pack.packUnits === 1)
      ) {
        return new Prisma.Decimal(pack.packPrice.toString());
      }
    }
  }
  return null;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummaryForPatient(
    patientId: string,
    query: GetExpensesSummaryQueryDto,
    now: Date = new Date(),
  ): Promise<SerializedExpensesSummaryResponse> {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        timezone: true,
        ownerUser: {
          select: {
            monthlyBudget: true,
            currency: true,
          },
        },
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    const timeZone = patient.timezone || 'Asia/Dhaka';
    const currentYm = formatLocalDateYmd(now, timeZone).slice(0, 7);
    const selectedMonth = query.month?.trim() || currentYm;
    const monthsCount = Math.min(Math.max(query.monthsCount ?? 6, 1), 12);

    const monthKeys: string[] = [];
    for (let offset = -(monthsCount - 1); offset <= 0; offset += 1) {
      monthKeys.push(shiftYm(selectedMonth, offset));
    }

    const seriesStartYm = monthKeys[0];
    const nextAfterSelectedYm = shiftYm(selectedMonth, 1);
    const seriesStartUtc = zonedDateTimeToUtc(`${seriesStartYm}-01`, '00:00', timeZone);
    const seriesEndUtc = zonedDateTimeToUtc(`${nextAfterSelectedYm}-01`, '00:00', timeZone);

    const [windowPurchases, recentPurchases, activeMedications] = await Promise.all([
      this.prisma.purchase.findMany({
        where: {
          patientId,
          purchaseDate: {
            gte: seriesStartUtc,
            lt: seriesEndUtc,
          },
        },
        include: {
          patientMedication: {
            select: {
              id: true,
              name: true,
              strength: true,
              dosageForm: true,
              stockUnit: true,
            },
          },
        },
        orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.purchase.findMany({
        where: { patientId },
        include: {
          patientMedication: {
            select: {
              id: true,
              name: true,
              strength: true,
              dosageForm: true,
              stockUnit: true,
            },
          },
        },
        orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      this.prisma.patientMedication.findMany({
        where: {
          patientId,
          status: MedicationStatus.ACTIVE,
        },
        include: {
          schedules: {
            where: { status: ScheduleStatus.ACTIVE },
            orderBy: { createdAt: 'asc' },
          },
          purchases: {
            orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
            take: 10,
          },
          catalogueBrand: {
            include: {
              packs: {
                orderBy: [{ packUnits: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const monthlyAccum = new Map<string, { spent: Prisma.Decimal; count: number }>();
    for (const ym of monthKeys) {
      monthlyAccum.set(ym, { spent: new Prisma.Decimal(0), count: 0 });
    }

    const medBreakdownMap = new Map<
      string,
      {
        medicationId: string;
        medicationName: string;
        strength: string | null;
        dosageForm: string | null;
        stockUnit: string;
        spent: Prisma.Decimal;
        units: Prisma.Decimal;
        count: number;
      }
    >();

    for (const purchase of windowPurchases) {
      const purchaseYm = formatLocalDateYmd(purchase.purchaseDate, timeZone).slice(0, 7);
      const amountDec = new Prisma.Decimal(purchase.amountPaid.toString());
      const bucket = monthlyAccum.get(purchaseYm);
      if (bucket) {
        bucket.spent = bucket.spent.add(amountDec);
        bucket.count += 1;
      }

      if (purchaseYm === selectedMonth) {
        const medMeta = purchase.patientMedication;
        const medId = purchase.patientMedicationId;
        const existing = medBreakdownMap.get(medId) ?? {
          medicationId: medId,
          medicationName: medMeta?.name ?? 'Medication',
          strength: medMeta?.strength ?? null,
          dosageForm: medMeta?.dosageForm ?? null,
          stockUnit: medMeta?.stockUnit ?? 'units',
          spent: new Prisma.Decimal(0),
          units: new Prisma.Decimal(0),
          count: 0,
        };
        existing.spent = existing.spent.add(amountDec);
        existing.units = existing.units.add(
          new Prisma.Decimal(purchase.totalUnitsAdded.toString()),
        );
        existing.count += 1;
        medBreakdownMap.set(medId, existing);
      }
    }

    const monthlySeries: SerializedMonthlySpendPoint[] = monthKeys.map((ym) => {
      const bucket = monthlyAccum.get(ym) ?? { spent: new Prisma.Decimal(0), count: 0 };
      const { shortLabel, yearLabel } = formatYmShort(ym);
      return {
        month: ym,
        shortLabel,
        yearLabel,
        totalSpent: bucket.spent.toDecimalPlaces(2).toFixed(2),
        purchaseCount: bucket.count,
        isSelected: ym === selectedMonth,
      };
    });

    const selectedBucket = monthlyAccum.get(selectedMonth) ?? {
      spent: new Prisma.Decimal(0),
      count: 0,
    };
    const actualSpentDec = selectedBucket.spent.toDecimalPlaces(2);

    const budgetRaw = patient.ownerUser?.monthlyBudget;
    const budgetDec =
      budgetRaw !== null && budgetRaw !== undefined
        ? new Prisma.Decimal(budgetRaw.toString()).toDecimalPlaces(2)
        : null;
    const budgetRemainingDec = budgetDec ? budgetDec.sub(actualSpentDec).toDecimalPlaces(2) : null;
    const budgetUtilizationPercent =
      budgetDec && budgetDec.gt(0)
        ? Number(actualSpentDec.div(budgetDec).mul(100).toDecimalPlaces(1).toString())
        : null;

    const medicationBreakdown: SerializedMedicationSpendBreakdownItem[] = [...medBreakdownMap.values()]
      .sort((a, b) => b.spent.comparedTo(a.spent))
      .map((entry) => ({
        medicationId: entry.medicationId,
        medicationName: entry.medicationName,
        strength: entry.strength,
        dosageForm: entry.dosageForm,
        stockUnit: entry.stockUnit,
        totalSpent: entry.spent.toDecimalPlaces(2).toFixed(2),
        totalUnitsAdded: entry.units.toDecimalPlaces(2).toFixed(2),
        purchaseCount: entry.count,
      }));

    // Strictly separate Estimated Monthly Cost (only when schedule + unit + price are known)
    const estimatedItems: SerializedEstimatedMedicationCostItem[] = [];
    const excludedItems: SerializedEstimatedMedicationExcludedItem[] = [];
    let totalEstimatedDec = new Prisma.Decimal(0);
    const selectedMonthStartYmd = `${selectedMonth}-01`;

    for (const med of activeMedications) {
      const activeSchedules = med.schedules.filter(
        (s) =>
          s.status === ScheduleStatus.ACTIVE &&
          (!s.endDate || formatLocalDateYmd(s.endDate, timeZone) >= selectedMonthStartYmd),
      );
      if (activeSchedules.length === 0) {
        continue;
      }

      const confirmedPurchase = med.purchases.find(
        (p) =>
          new Prisma.Decimal(p.amountPaid.toString()).gt(0) &&
          new Prisma.Decimal(p.totalUnitsAdded.toString()).gt(0),
      );
      let unitPriceDec: Prisma.Decimal | null = null;
      let priceSource: 'confirmed_purchase' | 'catalogue_reference' | null = null;

      if (confirmedPurchase) {
        unitPriceDec = new Prisma.Decimal(confirmedPurchase.amountPaid.toString())
          .div(new Prisma.Decimal(confirmedPurchase.totalUnitsAdded.toString()))
          .toDecimalPlaces(4);
        priceSource = 'confirmed_purchase';
      } else if (med.catalogueBrand?.packs && med.catalogueBrand.packs.length > 0) {
        const refPrice = resolveCatalogueUnitPrice(
          med.stockUnit,
          med.catalogueBrand.priceFieldStatus,
          med.catalogueBrand.packs,
        );
        if (refPrice) {
          unitPriceDec = refPrice;
          priceSource = 'catalogue_reference';
        }
      }

      if (!unitPriceDec || !priceSource) {
        excludedItems.push({
          medicationId: med.id,
          medicationName: med.name,
          reason: 'Unit price unknown — record a purchase to confirm price.',
        });
        continue;
      }

      let medMonthlyUnitsDec = new Prisma.Decimal(0);
      const summaryParts: string[] = [];
      let exclusionReason: string | null = null;

      for (const schedule of activeSchedules) {
        if (!canDeductDoseUnitFromStockUnit(schedule.doseUnit, med.stockUnit)) {
          exclusionReason = `Dose unit (${schedule.doseUnit}) differs from stock unit (${med.stockUnit}).`;
          break;
        }
        const doseAmountDec = new Prisma.Decimal(schedule.doseAmount.toString());
        if (doseAmountDec.lte(0)) {
          exclusionReason = 'Dose amount unknown.';
          break;
        }
        const { factor, summary } = computeMonthlyDosesMultiplier(
          schedule.frequency,
          schedule.scheduledTimes.length,
          schedule.weekdays ?? [],
        );
        if (!factor) {
          exclusionReason = 'As-needed schedule has variable usage.';
          break;
        }
        medMonthlyUnitsDec = medMonthlyUnitsDec.add(doseAmountDec.mul(factor));
        summaryParts.push(summary);
      }

      if (exclusionReason || medMonthlyUnitsDec.lte(0)) {
        excludedItems.push({
          medicationId: med.id,
          medicationName: med.name,
          reason: exclusionReason ?? 'No fixed dose frequency found.',
        });
        continue;
      }

      const medEstCostDec = medMonthlyUnitsDec.mul(unitPriceDec).toDecimalPlaces(2);
      totalEstimatedDec = totalEstimatedDec.add(medEstCostDec);

      estimatedItems.push({
        medicationId: med.id,
        medicationName: med.name,
        strength: med.strength ?? null,
        estimatedCost: medEstCostDec.toFixed(2),
        monthlyUnits: medMonthlyUnitsDec.toDecimalPlaces(2).toFixed(2),
        stockUnit: med.stockUnit,
        unitPriceUsed: unitPriceDec.toDecimalPlaces(2).toFixed(2),
        priceSource,
        scheduleSummary: summaryParts.join(', '),
      });
    }

    estimatedItems.sort((a, b) => Number(b.estimatedCost) - Number(a.estimatedCost));

    return {
      patientId: patient.id,
      timezone: timeZone,
      selectedMonth,
      currency: patient.ownerUser?.currency || 'BDT',
      actualSpent: actualSpentDec.toFixed(2),
      monthlyBudget: budgetDec ? budgetDec.toFixed(2) : null,
      budgetRemaining: budgetRemainingDec ? budgetRemainingDec.toFixed(2) : null,
      budgetUtilizationPercent,
      monthlySeries,
      medicationBreakdown,
      recentPurchases: recentPurchases.map((p) => serializePurchase(p, timeZone)),
      estimatedMonthlyCost: {
        hasEstimate: estimatedItems.length > 0,
        totalEstimatedCost:
          estimatedItems.length > 0 ? totalEstimatedDec.toDecimalPlaces(2).toFixed(2) : null,
        includedCount: estimatedItems.length,
        excludedCount: excludedItems.length,
        disclaimer:
          'Estimated 30-day cost from active fixed schedules and confirmed purchase or verified reference prices. Kept separate from actual recorded spending.',
        items: estimatedItems,
        excludedItems,
      },
    };
  }
}
