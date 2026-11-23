import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateInitialPurchaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  purchaseDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  packCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  unitsPerPack?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  amountPaid!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalInstructions?: string;

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
  @Max(1000000)
  enteredQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  enteredUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  selectedPackId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateInitialPurchaseDto)
  purchaseDetails?: CreateInitialPurchaseDto;

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
