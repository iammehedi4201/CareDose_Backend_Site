import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, MedicationStatus, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('Phase 7 — InventoryService', () => {
  function createMockPrisma(initialStock = '10.00') {
    let currentStock = new Prisma.Decimal(initialStock);
    const txRows: Array<Record<string, unknown>> = [];

    const txClient = {
      patientMedication: {
        findUnique: vi.fn(async () => ({
          id: '11111111-1111-4111-8111-111111111111',
          status: MedicationStatus.ACTIVE,
          stockRemaining: currentStock,
          stockUnit: 'tablets',
          lowStockThreshold: new Prisma.Decimal('5.00'),
        })),
        update: vi.fn(async ({ data }: { data: { stockRemaining: Prisma.Decimal } }) => {
          currentStock = data.stockRemaining;
          return {
            id: '11111111-1111-4111-8111-111111111111',
            status: MedicationStatus.ACTIVE,
            stockRemaining: currentStock,
            stockUnit: 'tablets',
            lowStockThreshold: new Prisma.Decimal('5.00'),
          };
        }),
      },
      inventoryTransaction: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `tx-${txRows.length + 1}`,
            doseEventId: null,
            purchaseId: null,
            cataloguePackId: null,
            createdAt: new Date('2026-11-24T06:00:00Z'),
            ...data,
          };
          txRows.push(row);
          return row;
        }),
      },
    };

    const prisma = {
      patientMedication: {
        findUnique: txClient.patientMedication.findUnique,
      },
      inventoryTransaction: {
        findMany: vi.fn(async () => txRows),
      },
      $transaction: vi.fn(async (cb: (client: typeof txClient) => Promise<unknown>) =>
        cb(txClient),
      ),
    } as unknown as PrismaService;

    return { prisma, txRows };
  }

  it('adds stock atomically and writes an ADJUSTMENT transaction', async () => {
    const { prisma } = createMockPrisma('10.00');
    const service = new InventoryService(prisma);

    const res = await service.adjustForMedication(
      '11111111-1111-4111-8111-111111111111',
      {
        mode: 'ADD',
        quantity: 20,
        enteredQuantity: 2,
        enteredUnit: 'strips',
        reason: 'Refill',
      },
    );

    expect(res.stockRemaining).toBe('30.00');
    expect(res.isLowStock).toBe(false);
    expect(res.transaction.type).toBe(InventoryTransactionType.ADJUSTMENT);
    expect(res.transaction.quantityDelta).toBe('20.00');
    expect(res.transaction.balanceAfter).toBe('30.00');
    expect(res.transaction.enteredQuantity).toBe('2.00');
    expect(res.transaction.enteredUnit).toBe('strips');
  });

  it('deducts wastage and computes negative quantityDelta accurately', async () => {
    const { prisma } = createMockPrisma('10.00');
    const service = new InventoryService(prisma);

    const res = await service.adjustForMedication(
      '11111111-1111-4111-8111-111111111111',
      {
        mode: 'DEDUCT',
        quantity: 6,
        reason: 'Damaged / wasted',
      },
    );

    expect(res.stockRemaining).toBe('4.00');
    expect(res.isLowStock).toBe(true);
    expect(res.transaction.type).toBe(InventoryTransactionType.WASTAGE);
    expect(res.transaction.quantityDelta).toBe('-6.00');
  });

  it('rejects deductions that exceed stockRemaining', async () => {
    const { prisma } = createMockPrisma('4.00');
    const service = new InventoryService(prisma);

    await expect(
      service.adjustForMedication('11111111-1111-4111-8111-111111111111', {
        mode: 'DEDUCT',
        quantity: 5,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('supports SET balance to 0 with exact negative delta', async () => {
    const { prisma } = createMockPrisma('8.50');
    const service = new InventoryService(prisma);

    const res = await service.adjustForMedication(
      '11111111-1111-4111-8111-111111111111',
      {
        mode: 'SET',
        quantity: 0,
        reason: 'Physical count',
      },
    );

    expect(res.stockRemaining).toBe('0.00');
    expect(res.transaction.quantityDelta).toBe('-8.50');
    expect(res.transaction.type).toBe(InventoryTransactionType.ADJUSTMENT);
  });

  it('throws NotFoundException when medication does not exist', async () => {
    const prisma = {
      patientMedication: {
        findUnique: vi.fn(async () => null),
      },
    } as unknown as PrismaService;
    const service = new InventoryService(prisma);

    await expect(
      service.listForMedication('11111111-1111-4111-8111-111111111111', {}),
    ).rejects.toThrow(NotFoundException);
  });
});
