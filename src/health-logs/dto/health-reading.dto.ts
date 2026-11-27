import { GlucoseUnit, ReadingContext } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export function normalizeGlucoseUnitInput(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned === 'MGDL') return GlucoseUnit.MG_DL;
  if (cleaned === 'MMOLL') return GlucoseUnit.MMOL_L;
  return raw.trim().toUpperCase();
}

export function normalizeReadingContextInput(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (cleaned === 'FASTING') return ReadingContext.FASTING;
  if (cleaned === 'BEFORE_MEAL' || cleaned === 'BEFOREMEAL') {
    return ReadingContext.BEFORE_MEAL;
  }
  if (cleaned === 'AFTER_MEAL' || cleaned === 'AFTERMEAL') {
    return ReadingContext.AFTER_MEAL;
  }
  if (cleaned === 'OTHER') return ReadingContext.OTHER;
  return raw.trim().toUpperCase();
}

export class CreateHealthReadingDto {
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(2000)
  value!: number;

  @IsOptional()
  @Transform(({ value }) => normalizeGlucoseUnitInput(value))
  @IsEnum(GlucoseUnit)
  unit?: GlucoseUnit;

  @IsOptional()
  @Transform(({ value }) => normalizeReadingContextInput(value))
  @IsEnum(ReadingContext)
  context?: ReadingContext;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  measuredAt?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be formatted as YYYY-MM-DD',
  })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  time?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListHealthReadingsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from must be formatted as YYYY-MM-DD',
  })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to must be formatted as YYYY-MM-DD',
  })
  to?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeReadingContextInput(value))
  @IsEnum(ReadingContext)
  context?: ReadingContext;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}
