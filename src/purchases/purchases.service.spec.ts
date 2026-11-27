import { BadRequestException } from '@nestjs/common';
import { InventoryTransactionType, MedicationStatus, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PurchasesService } from './purchases.service';

describe('Phase 7 — PurchasesService', () => {
  it('computes exact Decimal unit totals and writes Purchase + InventoryTransaction atomically', async () => {
    let stockRemaining = new Prisma.Decimal('12.00');

    const txClient = {
      patientMedication: {
        findUnique: vi.fn(async () => ({
          id: 'med-1',
          patientId: 'pat-1',
          name: 'Napa',
          strength: '500 mg',
          dosageForm: 'Tablet',
          stockRemaining,
          stockUnit: 'tablets',
          lowStockThreshold: new Prisma.Decimal('15.00'),
          status: MedicationStatus.ACTIVE,
        })),
        update: vi.fn(async ({ data }: { data: { stockRemaining: Prisma.Decimal } }) => {
          stockRemaining = data.stockRemaining;
          return {
            id: 'med-1',
            status: MedicationStatus.ACTIVE,
            stockRemaining,
            stockUnit: 'tablets',
            lowStockThreshold: new Prisma.Decimal('15.00'),
          };
        }),
      },
      purchase: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'pur-1',
          createdAt: new Date('2026-11-24T06:00:00Z'),
          ...data,
          patientMedication: {
            id: 'med-1',
            name: 'Napa',
            strength: '500 mg',
            dosageForm: 'Tablet',
            stockUnit: 'tablets',
          },
        })),
      },
      inventoryTransaction: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'tx-1',
          doseEventId: null,
          createdAt: new Date('2026-11-24T06:00:00Z'),
          ...data,
        })),
      },
    };

    const prisma = {
      patientMedication: {
        findUnique: vi.fn(async () => ({
          id: 'med-1',
          patientId: 'pat-1',
          catalogueBrandId: null,
          patient: { timezone: 'Asia/Dhaka' },
        })),
      },
      $transaction: vi.fn(async (cb: (client: typeof txClient) => Promise<unknown>) =>
        cb(txClient),
      ),
    } as unknown as PrismaService;

    const service = new PurchasesService(prisma);
    const result = await service.recordForMedication('med-1', {
      purchaseDate: '2026-11-24',
      packCount: 3,
      unitsPerPack: 10,
      amountPaid: 36,
      vendor: 'Lazz Pharma',
    });

    expect(result.newStockRemaining).toBe('42.00');
    expect(result.isLowStock).toBe(false);
    expect(result.purchase.totalUnitsAdded).toBe('30.00');
    expect(result.purchase.amountPaid).toBe('36.00');
    expect(result.purchase.unitPrice).toBe('1.20');
    expect(result.purchase.vendor).toBe('Lazz Pharma');
    expect(result.inventoryTransaction.type).toBe(InventoryTransactionType.PURCHASE);
    expect(result.inventoryTransaction.purchaseId).toBe('pur-1');
    expect(result.inventoryTransaction.balanceAfter).toBe('42.00');
  });

  it('rejects invalid purchaseDate strings cleanly', async () => {
    const prisma = {
      patientMedication: {
        findUnique: vi.fn(async () => ({
          id: 'med-1',
          patientId: 'pat-1',
          catalogueBrandId: null,
          patient: { timezone: 'Asia/Dhaka' },
        })),
      },
    } as unknown as PrismaService;

    const service = new PurchasesService(prisma);
    await expect(
      service.recordForMedication('med-1', {
        purchaseDate: 'not-a-date',
        packCount: 1,
        unitsPerPack: 10,
        amountPaid: 12,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
