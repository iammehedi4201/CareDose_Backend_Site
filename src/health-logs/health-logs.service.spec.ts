import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GlucoseUnit, Prisma, ReadingContext } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  buildHealthChartPoints,
  convertGlucoseValue,
  serializeHealthReading,
} from './health-logs.serializers';
import {
  HealthLogsService,
  resolveReadingMeasuredAt,
  validateGlucoseValueBounds,
} from './health-logs.service';

describe('HealthLogsService & Serializers (Phase 8)', () => {
  it('converts glucose values accurately between mg/dL and mmol/L while keeping original reading values', () => {
    expect(convertGlucoseValue(106, GlucoseUnit.MG_DL, GlucoseUnit.MG_DL)).toBe(106);
    expect(convertGlucoseValue(5.9, GlucoseUnit.MMOL_L, GlucoseUnit.MG_DL)).toBe(106);
    expect(convertGlucoseValue(106, GlucoseUnit.MG_DL, GlucoseUnit.MMOL_L)).toBe(5.9);

    const measuredAt = new Date('2026-11-25T01:30:00.000Z'); // 07:30 AM Asia/Dhaka
    const serialized = serializeHealthReading(
      {
        id: 'hr-1',
        patientId: 'p-1',
        value: new Prisma.Decimal('5.90'),
        unit: GlucoseUnit.MMOL_L,
        context: ReadingContext.FASTING,
        measuredAt,
        note: 'Morning test',
        createdAt: measuredAt,
        updatedAt: measuredAt,
      },
      'Asia/Dhaka',
    );

    expect(serialized.displayValue).toBe('5.9');
    expect(serialized.unitLabel).toBe('mmol/L');
    expect(serialized.contextLabel).toBe('Fasting');
    expect(serialized.measuredDateYmd).toBe('2026-11-25');
    expect(serialized.measuredTime24).toBe('07:30');
    expect(serialized.measuredTime12).toBe('07:30 AM');
  });

  it('validates reading bounds, date/time resolution, and chronological 7-point chart ordering', () => {
    expect(() => validateGlucoseValueBounds(0, GlucoseUnit.MG_DL)).toThrow(
      BadRequestException,
    );
    expect(() => validateGlucoseValueBounds(150, GlucoseUnit.MMOL_L)).toThrow(
      BadRequestException,
    );
    expect(() => validateGlucoseValueBounds(2500, GlucoseUnit.MG_DL)).toThrow(
      BadRequestException,
    );

    const resolved = resolveReadingMeasuredAt(
      { date: '2026-11-25', time: '07:30 AM' },
      'Asia/Dhaka',
    );
    expect(resolved.toISOString()).toBe('2026-11-25T01:30:00.000Z');

    const newestFirst = [
      {
        id: 'r3',
        patientId: 'p-1',
        value: new Prisma.Decimal('115.00'),
        unit: GlucoseUnit.MG_DL,
        context: ReadingContext.AFTER_MEAL,
        measuredAt: new Date('2026-11-25T08:00:00.000Z'),
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'r2',
        patientId: 'p-1',
        value: new Prisma.Decimal('5.90'),
        unit: GlucoseUnit.MMOL_L,
        context: ReadingContext.FASTING,
        measuredAt: new Date('2026-11-24T01:30:00.000Z'),
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'r1',
        patientId: 'p-1',
        value: new Prisma.Decimal('98.00'),
        unit: GlucoseUnit.MG_DL,
        context: ReadingContext.BEFORE_MEAL,
        measuredAt: new Date('2026-11-23T06:00:00.000Z'),
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const chart = buildHealthChartPoints(
      newestFirst,
      GlucoseUnit.MG_DL,
      'Asia/Dhaka',
    );
    expect(chart.map((c) => c.id)).toEqual(['r1', 'r2', 'r3']);
    expect(chart[1].convertedValue).toBe(106);
    expect(chart[1].originalValue).toBe('5.9');
    expect(chart[1].originalUnitLabel).toBe('mmol/L');
    expect(chart[1].unitLabel).toBe('mg/dL');
  });

  it('rejects deleting a reading owned by another patient', async () => {
    const prismaMock = {
      healthReading: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'hr-1',
          patientId: 'other-patient',
        }),
        delete: vi.fn(),
      },
    };
    const svc = new HealthLogsService(prismaMock as never);
    await expect(svc.deleteForPatient('patient-1', 'hr-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prismaMock.healthReading.delete).not.toHaveBeenCalled();
  });
});
