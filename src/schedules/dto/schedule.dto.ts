import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListSchedulesQueryDto {
  @IsOptional()
  @IsIn(['ALL', 'ACTIVE', 'PAUSED', 'COMPLETED'])
  status?: 'ALL' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

export class CreateScheduleDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  doseAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  doseUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  frequency?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  scheduledTimes!: string[];

  @IsString()
  @MaxLength(40)
  startDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string | null;

  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;
}

export class UpdateScheduleDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  doseAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  doseUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  frequency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  scheduledTimes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string | null;

  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'COMPLETED'])
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}
