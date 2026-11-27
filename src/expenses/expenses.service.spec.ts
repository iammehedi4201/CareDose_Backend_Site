import { FieldStatus, MedicationStatus, Prisma, ScheduleStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from './expenses.service';

describe('Phase 7 — ExpensesService', () => {
  it('separates actual monthly spending from estimated future costs and handles unknown/AS_NEEDED cleanly', async () => {
    const now = new Date('2026-11-24T12:00:00Z');
    const med1 = {
      id: 'med-1',
      name: 'Corvalen 5 mg',
      strength: '5 mg',
      dosageForm: 'Tablet',
      stockUnit: 'tablets',
      status: MedicationStatus.ACTIVE,
      schedules: [
        {
          id: 'sched-1',
          doseAmount: new Prisma.Decimal('1'),
          doseUnit: 'tablet',
          frequency: 'TWICE_DAILY',
          weekdays: [],
          scheduledTimes: ['08:00', '20:00'],
          startDate: new Date('2026-11-01T00:00:00Z'),
          endDate: null,
          status: ScheduleStatus.ACTIVE,
        },
      ],
      purchases: [
        {
          id: 'pur-1',
          amountPaid: new Prisma.Decimal('555.00'),
          totalUnitsAdded: new Prisma.Decimal('30.00'),
        },
      ],
      catalogueBrand: null,
    };

    const med2 = {
      id: 'med-2',
      name: 'Napa 500 mg',
      strength: '500 mg',
      dosageForm: 'Tablet',
      stockUnit: 'tablets',
      status: MedicationStatus.ACTIVE,
      schedules: [
        {
          id: 'sched-2',
          doseAmount: new Prisma.Decimal('1'),
          doseUnit: 'tablet',
          frequency: 'AS_NEEDED',
          weekdays: [],
          scheduledTimes: ['09:00'],
          startDate: new Date('2026-11-01T00:00:00Z'),
          endDate: null,
          status: ScheduleStatus.ACTIVE,
        },
      ],
      purchases: [],
      catalogueBrand: {
        priceFieldStatus: FieldStatus.PRESENT,
        packs: [
          {
            packUnits: 10,
            unitPrice: new Prisma.Decimal('1.20'),
            packPrice: new Prisma.Decimal('12.00'),
            warnings: [],
          },
        ],
      },
    };

    const med3 = {
      id: 'med-3',
      name: 'Glymexa 500 mg',
      strength: '500 mg',
      dosageForm: 'Tablet',
      stockUnit: 'tablets',
      status: MedicationStatus.ACTIVE,
      schedules: [
        {
          id: 'sched-3',
          doseAmount: new Prisma.Decimal('1'),
          doseUnit: 'tablet',
          frequency: 'DAILY',
          weekdays: [],
          scheduledTimes: ['08:00'],
          startDate: new Date('2026-11-01T00:00:00Z'),
          endDate: null,
          status: ScheduleStatus.ACTIVE,
        },
      ],
      purchases: [],
      catalogueBrand: null,
    };

    const purchasesInWindow = [
      {
        id: 'pur-1',
        patientId: 'pat-1',
        patientMedicationId: 'med-1',
        purchaseDate: new Date('2026-11-10T06:00:00Z'),
        packCount: 1,
        unitsPerPack: new Prisma.Decimal('30.00'),
        totalUnitsAdded: new Prisma.Decimal('30.00'),
        amountPaid: new Prisma.Decimal('555.00'),
        currency: 'BDT',
        vendor: 'Lazz Pharma',
        note: null,
        createdAt: new Date('2026-11-10T06:00:00Z'),
        patientMedication: {
          id: 'med-1',
          name: 'Corvalen 5 mg',
          strength: '5 mg',
          dosageForm: 'Tablet',
          stockUnit: 'tablets',
        },
      },
      {
        id: 'pur-old',
        patientId: 'pat-1',
        patientMedicationId: 'med-1',
        purchaseDate: new Date('2026-10-12T06:00:00Z'),
        packCount: 1,
        unitsPerPack: new Prisma.Decimal('30.00'),
        totalUnitsAdded: new Prisma.Decimal('30.00'),
        amountPaid: new Prisma.Decimal('500.00'),
        currency: 'BDT',
        vendor: null,
        note: null,
        createdAt: new Date('2026-10-12T06:00:00Z'),
        patientMedication: {
          id: 'med-1',
          name: 'Corvalen 5 mg',
          strength: '5 mg',
          dosageForm: 'Tablet',
          stockUnit: 'tablets',
        },
      },
    ];

    const prisma = {
      patientProfile: {
        findUnique: vi.fn(async () => ({
          id: 'pat-1',
          timezone: 'Asia/Dhaka',
          ownerUser: {
            monthlyBudget: new Prisma.Decimal('2500.00'),
            currency: 'BDT',
          },
        })),
      },
      purchase: {
        findMany: vi.fn(async ({ take }: { take?: number }) =>
          take ? purchasesInWindow.slice(0, take) : purchasesInWindow,
        ),
      },
      patientMedication: {
        findMany: vi.fn(async () => [med1, med2, med3]),
      },
    } as unknown as PrismaService;

    const service = new ExpensesService(prisma);
    const summary = await service.getSummaryForPatient(
      'pat-1',
      { month: '2026-11', monthsCount: 4 },
      now,
    );

    expect(summary.actualSpent).toBe('555.00');
    expect(summary.monthlyBudget).toBe('2500.00');
    expect(summary.budgetRemaining).toBe('1945.00');
    expect(summary.budgetUtilizationPercent).toBe(22.2);
    expect(summary.monthlySeries).toHaveLength(4);
    expect(summary.monthlySeries.find((m) => m.month === '2026-10')?.totalSpent).toBe('500.00');
    expect(summary.monthlySeries.find((m) => m.month === '2026-11')?.totalSpent).toBe('555.00');

    // Estimate for med-1: 2/day * 30 days = 60 tablets * (555/30 = 18.50) = 1110.00
    expect(summary.estimatedMonthlyCost.hasEstimate).toBe(true);
    expect(summary.estimatedMonthlyCost.totalEstimatedCost).toBe('1110.00');
    expect(summary.estimatedMonthlyCost.includedCount).toBe(1);
    expect(summary.estimatedMonthlyCost.excludedCount).toBe(2);
    expect(summary.estimatedMonthlyCost.excludedItems.map((i) => i.medicationId)).toEqual([
      'med-2',
      'med-3',
    ]);
  });
});
