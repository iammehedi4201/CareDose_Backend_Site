import {
  DoseEventStatus,
  GlucoseUnit,
  InventoryTransactionType,
  MedicationStatus,
  ReadingContext,
  ScheduleStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const CAREDOSE_BACKUP_SCHEMA_VERSION = 'caredose.backup.v1';

export class BackupAccountSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;

  @IsEnum(GlucoseUnit)
  glucoseUnit!: GlucoseUnit;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10000000)
  monthlyBudget?: number | string | null;

  @IsBoolean()
  remindersEnabled!: boolean;

  @IsBoolean()
  soundEnabled!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  reminderLeadMins!: number;
}

export class BackupScheduleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(10000)
  doseAmount!: number | string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  doseUnit!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  frequency!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  intervalHours?: number | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  weekdays?: number[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(24)
  scheduledTimes!: string[];

  @IsString()
  @MinLength(4)
  @MaxLength(50)
  startDate!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(50)
  endDate?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  instructions?: string | null;

  @IsBoolean()
  remindersEnabled!: boolean;

  @IsEnum(ScheduleStatus)
  status!: ScheduleStatus;

  @IsOptional()
  @IsString()
  createdAt?: string;

  @IsOptional()
  @IsString()
  updatedAt?: string;
}

export class BackupDoseEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  scheduleId!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(50)
  scheduledFor!: string;

  @IsEnum(DoseEventStatus)
  status!: DoseEventStatus;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(50)
  recordedAt?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  note?: string | null;

  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class BackupPurchaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(50)
  purchaseDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  packCount!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  unitsPerPack!: number | string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  totalUnitsAdded!: number | string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  amountPaid!: number | string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  vendor?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  note?: string | null;

  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class BackupInventoryTransactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100)
  doseEventId?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100)
  purchaseId?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100)
  cataloguePackId?: string | null;

  @IsEnum(InventoryTransactionType)
  type!: InventoryTransactionType;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  enteredQuantity?: number | string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(40)
  enteredUnit?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(40)
  baseUnit?: string | null;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  quantityDelta!: number | string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  balanceAfter!: number | string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  reason?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  note?: string | null;

  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class BackupMedicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100)
  catalogueBrandId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(160)
  genericName?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100)
  strength?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100)
  dosageForm?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(160)
  manufacturer?: string | null;

  @IsString()
  @MaxLength(500)
  personalInstructions!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  stockRemaining!: number | string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  stockUnit!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  lowStockThreshold!: number | string;

  @IsEnum(MedicationStatus)
  status!: MedicationStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackupScheduleDto)
  schedules!: BackupScheduleDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackupDoseEventDto)
  doseEvents!: BackupDoseEventDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackupPurchaseDto)
  purchases!: BackupPurchaseDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackupInventoryTransactionDto)
  inventoryTransactions!: BackupInventoryTransactionDto[];

  @IsOptional()
  @IsString()
  createdAt?: string;

  @IsOptional()
  @IsString()
  updatedAt?: string;
}

export class BackupHealthReadingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.1)
  @Max(2000)
  value!: number | string;

  @IsEnum(GlucoseUnit)
  unit!: GlucoseUnit;

  @IsEnum(ReadingContext)
  context!: ReadingContext;

  @IsString()
  @MinLength(4)
  @MaxLength(50)
  measuredAt!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  note?: string | null;

  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class BackupPatientProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  relationship!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  timezone!: string;

  @IsBoolean()
  isDefault!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackupMedicationDto)
  medications!: BackupMedicationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackupHealthReadingDto)
  healthReadings!: BackupHealthReadingDto[];
}

export class BackupSummaryMetadataDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  profilesCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  medicationsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  schedulesCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  doseEventsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  purchasesCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  inventoryTransactionsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  healthReadingsCount?: number;
}

export class RestoreAccountBackupDto {
  @Matches(/^caredose\.backup\.v1$/, {
    message: 'schemaVersion must equal caredose.backup.v1',
  })
  schemaVersion!: string;

  @IsOptional()
  @IsString()
  exportedAt?: string;

  @ValidateNested()
  @Type(() => BackupAccountSectionDto)
  account!: BackupAccountSectionDto;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BackupPatientProfileDto)
  patientProfiles!: BackupPatientProfileDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BackupSummaryMetadataDto)
  summary?: BackupSummaryMetadataDto;
}

export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  confirmation?: string;
}
