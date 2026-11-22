import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GetDailyDosesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  days?: number;
}

export class RecordDoseEventDto {
  @IsUUID()
  scheduleId!: string;

  @IsString()
  @MaxLength(60)
  scheduledFor!: string;

  @IsIn(['TAKEN', 'SKIPPED'])
  action!: 'TAKEN' | 'SKIPPED';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class DoseActionNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListDoseHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  to?: string;

  @IsOptional()
  @IsIn(['ALL', 'TAKEN', 'SKIPPED'])
  status?: 'ALL' | 'TAKEN' | 'SKIPPED';

  @IsOptional()
  @IsUUID()
  medicationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
