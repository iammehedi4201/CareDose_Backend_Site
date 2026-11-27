import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePurchaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  purchaseDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  packCount!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  unitsPerPack!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  amountPaid!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['BDT'])
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cataloguePackId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  enteredUnit?: string;
}

export class ListPurchasesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  medicationId?: string;

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
