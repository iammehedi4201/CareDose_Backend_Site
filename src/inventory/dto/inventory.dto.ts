import { InventoryTransactionType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export type AdjustStockMode = 'ADD' | 'SET' | 'DEDUCT';

export class ListInventoryQueryDto {
  @IsOptional()
  @IsEnum(InventoryTransactionType)
  type?: InventoryTransactionType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdjustStockDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['ADD', 'SET', 'DEDUCT'])
  mode!: AdjustStockMode;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  enteredQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  enteredUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['ADJUSTMENT', 'WASTAGE'])
  transactionType?: 'ADJUSTMENT' | 'WASTAGE';
}
