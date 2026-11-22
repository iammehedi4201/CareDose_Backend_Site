import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListMedicationsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['ALL', 'ACTIVE', 'ARCHIVED'])
  status?: 'ALL' | 'ACTIVE' | 'ARCHIVED';

  @IsOptional()
  @IsIn(['true', 'false'])
  lowStock?: 'true' | 'false';
}

export class CreateMedicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  catalogueBrandId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  genericName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  strength?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dosageForm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  manufacturer?: string;

  @IsString()
  @IsNotEmpty({ message: 'Personal instructions are required.' })
  @MaxLength(500)
  personalInstructions!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  startingStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  stockUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  lowStockThreshold?: number;
}

export class UpdateMedicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  genericName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  strength?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dosageForm?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  manufacturer?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  stockUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  lowStockThreshold?: number;
}
