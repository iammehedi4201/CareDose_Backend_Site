import { MedicationStatus, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  computeIsLowStock,
  inferDefaultStockUnit,
  serializePatientMedication,
  PatientMedicationWithCatalogue,
} from './medications.serializers';

describe('Phase 5 — Medications serializers & low-stock rules', () => {
  it('infers stock units cleanly from dosage forms', () => {
    expect(inferDefaultStockUnit('Tablet')).toBe('tablets');
    expect(inferDefaultStockUnit('Capsule')).toBe('capsules');
    expect(inferDefaultStockUnit('Syrup')).toBe('ml');
    expect(inferDefaultStockUnit('Eye Drops')).toBe('bottle');
    expect(inferDefaultStockUnit('IV Injection')).toBe('vials');
    expect(inferDefaultStockUnit('Cream')).toBe('tube');
  });

  it('computes low-stock status only for ACTIVE meds at or below threshold', () => {
    expect(computeIsLowStock(MedicationStatus.ACTIVE, '5.00', '5.00')).toBe(true);
    expect(computeIsLowStock(MedicationStatus.ACTIVE, '4.00', '5.00')).toBe(true);
    expect(computeIsLowStock(MedicationStatus.ACTIVE, '6.00', '5.00')).toBe(false);
    expect(computeIsLowStock(MedicationStatus.ARCHIVED, '0.00', '5.00')).toBe(false);
  });

  it('serializes decimals to 2 fixed places accurately', () => {
    const mockMed: PatientMedicationWithCatalogue = {
      id: '11111111-1111-4111-8111-111111111111',
      patientId: '22222222-2222-4222-8222-222222222222',
      catalogueBrandId: null,
      name: 'Napa',
      genericName: 'Paracetamol',
      strength: '500 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Beximco',
      personalInstructions: '1 tablet when feverish',
      stockRemaining: new Prisma.Decimal('10'),
      stockUnit: 'tablets',
      lowStockThreshold: new Prisma.Decimal('5'),
      status: MedicationStatus.ACTIVE,
      createdAt: new Date('2026-11-22T00:00:00Z'),
      updatedAt: new Date('2026-11-22T00:00:00Z'),
      _count: { schedules: 0, purchases: 0 },
    };

    const out = serializePatientMedication(mockMed);
    expect(out.stockRemaining).toBe('10.00');
    expect(out.lowStockThreshold).toBe('5.00');
    expect(out.isLowStock).toBe(false);
    expect(out.schedulesCount).toBe(0);
  });
});
