-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "FieldStatus" AS ENUM ('PRESENT', 'MISSING', 'UNAVAILABLE', 'INVALID');

-- CreateEnum
CREATE TYPE "MedicationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DoseEventStatus" AS ENUM ('PLANNED', 'TAKEN', 'SKIPPED');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING_STOCK', 'PURCHASE', 'DOSE_CONSUMPTION', 'WASTAGE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "GlucoseUnit" AS ENUM ('MG_DL', 'MMOL_L');

-- CreateEnum
CREATE TYPE "ReadingContext" AS ENUM ('FASTING', 'BEFORE_MEAL', 'AFTER_MEAL', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "glucoseUnit" "GlucoseUnit" NOT NULL DEFAULT 'MG_DL',
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "monthlyBudget" DECIMAL(12,2),
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderLeadMins" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'Self',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogueImportBatch" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceBaseUrl" TEXT,
    "schemaVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "genericsCount" INTEGER NOT NULL DEFAULT 0,
    "brandsCount" INTEGER NOT NULL DEFAULT 0,
    "packsCount" INTEGER NOT NULL DEFAULT 0,
    "groupsCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,

    CONSTRAINT "CatalogueImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineGeneric" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idSource" TEXT NOT NULL DEFAULT 'site',
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "slug" TEXT,
    "sourceUrl" TEXT,
    "collectedAt" TIMESTAMP(3),
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineGeneric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineBrand" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "genericId" TEXT,
    "strength" TEXT,
    "strengthNorm" TEXT,
    "dosageForm" TEXT,
    "dosageFormNorm" TEXT,
    "manufacturer" TEXT,
    "manufacturerSourceId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'allopathic',
    "releaseMarker" TEXT,
    "productUrl" TEXT,
    "collectedAt" TIMESTAMP(3),
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "genericFieldStatus" "FieldStatus" NOT NULL DEFAULT 'PRESENT',
    "strengthFieldStatus" "FieldStatus" NOT NULL DEFAULT 'PRESENT',
    "formFieldStatus" "FieldStatus" NOT NULL DEFAULT 'PRESENT',
    "mfrFieldStatus" "FieldStatus" NOT NULL DEFAULT 'PRESENT',
    "priceFieldStatus" "FieldStatus" NOT NULL DEFAULT 'PRESENT',
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicinePack" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "packQuantity" TEXT,
    "packUnits" INTEGER,
    "unitPrice" DECIMAL(12,2),
    "packPrice" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "unitPriceLabel" TEXT,
    "priceSource" TEXT NOT NULL DEFAULT 'brand_page',
    "sourceUrl" TEXT,
    "collectedAt" TIMESTAMP(3),
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicinePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlternativeGroup" (
    "id" TEXT NOT NULL,
    "sourceGroupId" TEXT NOT NULL,
    "genericId" TEXT NOT NULL,
    "strengthNorm" TEXT NOT NULL,
    "dosageFormNorm" TEXT NOT NULL,
    "releaseMarker" TEXT,
    "isCombination" BOOLEAN NOT NULL DEFAULT false,
    "requiresReviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlternativeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlternativeGroupBrand" (
    "id" TEXT NOT NULL,
    "alternativeGroupId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,

    CONSTRAINT "AlternativeGroupBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineImage" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT 'Arogga',
    "sourcePageUrl" TEXT,
    "permissionStatus" TEXT NOT NULL DEFAULT 'UNRECORDED',
    "matchStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMedication" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "catalogueBrandId" TEXT,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "strength" TEXT,
    "dosageForm" TEXT,
    "manufacturer" TEXT,
    "personalInstructions" TEXT NOT NULL,
    "stockRemaining" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stockUnit" TEXT NOT NULL DEFAULT 'tablets',
    "lowStockThreshold" DECIMAL(12,2) NOT NULL DEFAULT 5,
    "status" "MedicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationSchedule" (
    "id" TEXT NOT NULL,
    "patientMedicationId" TEXT NOT NULL,
    "doseAmount" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "doseUnit" TEXT NOT NULL DEFAULT 'tablet',
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "scheduledTimes" TEXT[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "instructions" TEXT,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoseEvent" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "patientMedicationId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "DoseEventStatus" NOT NULL DEFAULT 'PLANNED',
    "recordedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "patientMedicationId" TEXT NOT NULL,
    "doseEventId" TEXT,
    "purchaseId" TEXT,
    "type" "InventoryTransactionType" NOT NULL,
    "quantityDelta" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "patientMedicationId" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "packCount" INTEGER NOT NULL,
    "unitsPerPack" DECIMAL(12,2) NOT NULL,
    "totalUnitsAdded" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "vendor" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthReading" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "unit" "GlucoseUnit" NOT NULL DEFAULT 'MG_DL',
    "context" "ReadingContext" NOT NULL DEFAULT 'FASTING',
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "PatientProfile_ownerUserId_idx" ON "PatientProfile"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineGeneric_sourceId_key" ON "MedicineGeneric"("sourceId");

-- CreateIndex
CREATE INDEX "MedicineGeneric_normalizedName_idx" ON "MedicineGeneric"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineBrand_sourceId_key" ON "MedicineBrand"("sourceId");

-- CreateIndex
CREATE INDEX "MedicineBrand_normalizedName_idx" ON "MedicineBrand"("normalizedName");

-- CreateIndex
CREATE INDEX "MedicineBrand_genericId_dosageFormNorm_strengthNorm_idx" ON "MedicineBrand"("genericId", "dosageFormNorm", "strengthNorm");

-- CreateIndex
CREATE INDEX "MedicinePack_brandId_idx" ON "MedicinePack"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "AlternativeGroup_sourceGroupId_key" ON "AlternativeGroup"("sourceGroupId");

-- CreateIndex
CREATE INDEX "AlternativeGroup_genericId_strengthNorm_dosageFormNorm_idx" ON "AlternativeGroup"("genericId", "strengthNorm", "dosageFormNorm");

-- CreateIndex
CREATE INDEX "AlternativeGroupBrand_brandId_idx" ON "AlternativeGroupBrand"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "AlternativeGroupBrand_alternativeGroupId_brandId_key" ON "AlternativeGroupBrand"("alternativeGroupId", "brandId");

-- CreateIndex
CREATE INDEX "MedicineImage_brandId_idx" ON "MedicineImage"("brandId");

-- CreateIndex
CREATE INDEX "PatientMedication_patientId_status_idx" ON "PatientMedication"("patientId", "status");

-- CreateIndex
CREATE INDEX "MedicationSchedule_patientMedicationId_status_idx" ON "MedicationSchedule"("patientMedicationId", "status");

-- CreateIndex
CREATE INDEX "DoseEvent_patientMedicationId_scheduledFor_idx" ON "DoseEvent"("patientMedicationId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "DoseEvent_scheduleId_scheduledFor_key" ON "DoseEvent"("scheduleId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_doseEventId_key" ON "InventoryTransaction"("doseEventId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_purchaseId_key" ON "InventoryTransaction"("purchaseId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_patientMedicationId_createdAt_idx" ON "InventoryTransaction"("patientMedicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_patientId_purchaseDate_idx" ON "Purchase"("patientId", "purchaseDate");

-- CreateIndex
CREATE INDEX "Purchase_patientMedicationId_purchaseDate_idx" ON "Purchase"("patientMedicationId", "purchaseDate");

-- CreateIndex
CREATE INDEX "HealthReading_patientId_measuredAt_idx" ON "HealthReading"("patientId", "measuredAt");

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineGeneric" ADD CONSTRAINT "MedicineGeneric_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "CatalogueImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineBrand" ADD CONSTRAINT "MedicineBrand_genericId_fkey" FOREIGN KEY ("genericId") REFERENCES "MedicineGeneric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineBrand" ADD CONSTRAINT "MedicineBrand_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "CatalogueImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePack" ADD CONSTRAINT "MedicinePack_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "MedicineBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativeGroup" ADD CONSTRAINT "AlternativeGroup_genericId_fkey" FOREIGN KEY ("genericId") REFERENCES "MedicineGeneric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativeGroupBrand" ADD CONSTRAINT "AlternativeGroupBrand_alternativeGroupId_fkey" FOREIGN KEY ("alternativeGroupId") REFERENCES "AlternativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativeGroupBrand" ADD CONSTRAINT "AlternativeGroupBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "MedicineBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineImage" ADD CONSTRAINT "MedicineImage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "MedicineBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedication" ADD CONSTRAINT "PatientMedication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedication" ADD CONSTRAINT "PatientMedication_catalogueBrandId_fkey" FOREIGN KEY ("catalogueBrandId") REFERENCES "MedicineBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_patientMedicationId_fkey" FOREIGN KEY ("patientMedicationId") REFERENCES "PatientMedication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_patientMedicationId_fkey" FOREIGN KEY ("patientMedicationId") REFERENCES "PatientMedication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_patientMedicationId_fkey" FOREIGN KEY ("patientMedicationId") REFERENCES "PatientMedication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_doseEventId_fkey" FOREIGN KEY ("doseEventId") REFERENCES "DoseEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_patientMedicationId_fkey" FOREIGN KEY ("patientMedicationId") REFERENCES "PatientMedication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthReading" ADD CONSTRAINT "HealthReading_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
