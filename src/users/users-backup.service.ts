import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DoseEventStatus,
  GlucoseUnit,
  InventoryTransactionType,
  MedicationStatus,
  Prisma,
  ReadingContext,
  ScheduleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { formatDecimalFixed } from '../imports/catalogue-dataset.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CAREDOSE_BACKUP_SCHEMA_VERSION,
  RestoreAccountBackupDto,
} from './dto/account-backup.dto';
import { USER_SAFE_SELECT } from './user-select';

export interface AccountBackupSummary {
  profilesCount: number;
  medicationsCount: number;
  schedulesCount: number;
  doseEventsCount: number;
  purchasesCount: number;
  inventoryTransactionsCount: number;
  healthReadingsCount: number;
}

export interface SerializedBackupSchedule {
  id: string;
  doseAmount: string;
  doseUnit: string;
  frequency: string;
  intervalHours: number | null;
  weekdays: number[];
  scheduledTimes: string[];
  startDate: string;
  endDate: string | null;
  instructions: string | null;
  remindersEnabled: boolean;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedBackupDoseEvent {
  id: string;
  scheduleId: string;
  scheduledFor: string;
  status: DoseEventStatus;
  recordedAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface SerializedBackupPurchase {
  id: string;
  purchaseDate: string;
  packCount: number;
  unitsPerPack: string;
  totalUnitsAdded: string;
  amountPaid: string;
  currency: string;
  vendor: string | null;
  note: string | null;
  createdAt: string;
}

export interface SerializedBackupInventoryTx {
  id: string;
  doseEventId: string | null;
  purchaseId: string | null;
  cataloguePackId: string | null;
  type: InventoryTransactionType;
  enteredQuantity: string | null;
  enteredUnit: string | null;
  baseUnit: string | null;
  quantityDelta: string;
  balanceAfter: string;
  reason: string | null;
  note: string | null;
  createdAt: string;
}

export interface SerializedBackupMedication {
  id: string;
  catalogueBrandId: string | null;
  name: string;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  personalInstructions: string;
  stockRemaining: string;
  stockUnit: string;
  lowStockThreshold: string;
  status: MedicationStatus;
  schedules: SerializedBackupSchedule[];
  doseEvents: SerializedBackupDoseEvent[];
  purchases: SerializedBackupPurchase[];
  inventoryTransactions: SerializedBackupInventoryTx[];
  createdAt: string;
  updatedAt: string;
}

export interface SerializedBackupHealthReading {
  id: string;
  value: string;
  unit: GlucoseUnit;
  context: ReadingContext;
  measuredAt: string;
  note: string | null;
  createdAt: string;
}

export interface SerializedBackupPatientProfile {
  id: string;
  name: string;
  relationship: string;
  timezone: string;
  isDefault: boolean;
  medications: SerializedBackupMedication[];
  healthReadings: SerializedBackupHealthReading[];
}

export interface AccountBackupDocument {
  schemaVersion: typeof CAREDOSE_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  account: {
    email: string;
    displayName: string;
    glucoseUnit: GlucoseUnit;
    currency: string;
    monthlyBudget: string | null;
    remindersEnabled: boolean;
    soundEnabled: boolean;
    reminderLeadMins: number;
  };
  patientProfiles: SerializedBackupPatientProfile[];
  summary: AccountBackupSummary;
}

export interface RestoreAccountResult {
  restoredAt: string;
  schemaVersion: typeof CAREDOSE_BACKUP_SCHEMA_VERSION;
  summary: AccountBackupSummary;
}

export interface DeleteAccountResult {
  deletedUserId: string;
  deletedAt: string;
}

function toFixedDecimalString(
  raw: number | string | Prisma.Decimal | null | undefined,
  fallback = '0.00',
): string {
  const formatted = formatDecimalFixed(raw);
  return formatted ?? fallback;
}

function parseIsoDateOrThrow(raw: string, fieldName: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid ISO date for "${fieldName}".`);
  }
  return d;
}

@Injectable()
export class UsersBackupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exports all records owned by the authenticated user as a versioned JSON backup.
   * Excludes credential hashes and never includes other users' data or the catalogue.
   */
  async exportAccountData(userId: string): Promise<AccountBackupDocument> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SAFE_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User account not found');
    }

    const profiles = await this.prisma.patientProfile.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: {
        medications: {
          orderBy: { createdAt: 'asc' },
          include: {
            schedules: { orderBy: { createdAt: 'asc' } },
            doseEvents: { orderBy: { scheduledFor: 'asc' } },
            purchases: { orderBy: { purchaseDate: 'asc' } },
            inventoryTransactions: { orderBy: { createdAt: 'asc' } },
          },
        },
        healthReadings: {
          orderBy: { measuredAt: 'asc' },
        },
      },
    });

    let medicationsCount = 0;
    let schedulesCount = 0;
    let doseEventsCount = 0;
    let purchasesCount = 0;
    let inventoryTransactionsCount = 0;
    let healthReadingsCount = 0;

    const patientProfiles: SerializedBackupPatientProfile[] = profiles.map((p) => {
      healthReadingsCount += p.healthReadings.length;

      const medications: SerializedBackupMedication[] = p.medications.map((m) => {
        medicationsCount += 1;
        schedulesCount += m.schedules.length;
        doseEventsCount += m.doseEvents.length;
        purchasesCount += m.purchases.length;
        inventoryTransactionsCount += m.inventoryTransactions.length;

        return {
          id: m.id,
          catalogueBrandId: m.catalogueBrandId ?? null,
          name: m.name,
          genericName: m.genericName ?? null,
          strength: m.strength ?? null,
          dosageForm: m.dosageForm ?? null,
          manufacturer: m.manufacturer ?? null,
          personalInstructions: m.personalInstructions,
          stockRemaining: toFixedDecimalString(m.stockRemaining),
          stockUnit: m.stockUnit,
          lowStockThreshold: toFixedDecimalString(m.lowStockThreshold),
          status: m.status,
          schedules: m.schedules.map((s) => ({
            id: s.id,
            doseAmount: toFixedDecimalString(s.doseAmount, '1.00'),
            doseUnit: s.doseUnit,
            frequency: s.frequency,
            intervalHours: s.intervalHours ?? null,
            weekdays: [...(s.weekdays ?? [])],
            scheduledTimes: [...s.scheduledTimes],
            startDate: s.startDate.toISOString(),
            endDate: s.endDate ? s.endDate.toISOString() : null,
            instructions: s.instructions ?? null,
            remindersEnabled: s.remindersEnabled,
            status: s.status,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          })),
          doseEvents: m.doseEvents.map((ev) => ({
            id: ev.id,
            scheduleId: ev.scheduleId,
            scheduledFor: ev.scheduledFor.toISOString(),
            status: ev.status,
            recordedAt: ev.recordedAt ? ev.recordedAt.toISOString() : null,
            note: ev.note ?? null,
            createdAt: ev.createdAt.toISOString(),
          })),
          purchases: m.purchases.map((pur) => ({
            id: pur.id,
            purchaseDate: pur.purchaseDate.toISOString(),
            packCount: pur.packCount,
            unitsPerPack: toFixedDecimalString(pur.unitsPerPack, '1.00'),
            totalUnitsAdded: toFixedDecimalString(pur.totalUnitsAdded, '1.00'),
            amountPaid: toFixedDecimalString(pur.amountPaid),
            currency: pur.currency,
            vendor: pur.vendor ?? null,
            note: pur.note ?? null,
            createdAt: pur.createdAt.toISOString(),
          })),
          inventoryTransactions: m.inventoryTransactions.map((tx) => ({
            id: tx.id,
            doseEventId: tx.doseEventId ?? null,
            purchaseId: tx.purchaseId ?? null,
            cataloguePackId: tx.cataloguePackId ?? null,
            type: tx.type,
            enteredQuantity:
              tx.enteredQuantity !== null && tx.enteredQuantity !== undefined
                ? toFixedDecimalString(tx.enteredQuantity)
                : null,
            enteredUnit: tx.enteredUnit ?? null,
            baseUnit: tx.baseUnit ?? null,
            quantityDelta: toFixedDecimalString(tx.quantityDelta),
            balanceAfter: toFixedDecimalString(tx.balanceAfter),
            reason: tx.reason ?? null,
            note: tx.note ?? null,
            createdAt: tx.createdAt.toISOString(),
          })),
          createdAt: m.createdAt.toISOString(),
          updatedAt: m.updatedAt.toISOString(),
        };
      });

      return {
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        timezone: p.timezone,
        isDefault: p.isDefault,
        medications,
        healthReadings: p.healthReadings.map((r) => ({
          id: r.id,
          value: toFixedDecimalString(r.value),
          unit: r.unit,
          context: r.context,
          measuredAt: r.measuredAt.toISOString(),
          note: r.note ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });

    return {
      schemaVersion: CAREDOSE_BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        displayName: user.displayName,
        glucoseUnit: user.glucoseUnit,
        currency: user.currency,
        monthlyBudget:
          user.monthlyBudget !== null && user.monthlyBudget !== undefined
            ? toFixedDecimalString(user.monthlyBudget)
            : null,
        remindersEnabled: user.remindersEnabled,
        soundEnabled: user.soundEnabled,
        reminderLeadMins: user.reminderLeadMins,
      },
      patientProfiles,
      summary: {
        profilesCount: patientProfiles.length,
        medicationsCount,
        schedulesCount,
        doseEventsCount,
        purchasesCount,
        inventoryTransactionsCount,
        healthReadingsCount,
      },
    };
  }

  /**
   * Atomically replaces the authenticated user's patient profiles and tracked data
   * from a validated caredose.backup.v1 payload without affecting other accounts.
   */
  async restoreAccountData(
    userId: string,
    dto: RestoreAccountBackupDto,
  ): Promise<RestoreAccountResult> {
    if (dto.schemaVersion !== CAREDOSE_BACKUP_SCHEMA_VERSION) {
      throw new BadRequestException('Unsupported CareDose backup schema version.');
    }

    if (!dto.patientProfiles || dto.patientProfiles.length === 0) {
      throw new BadRequestException(
        'Backup must include at least one patient profile to restore.',
      );
    }

    const monthlyBudgetRaw = dto.account.monthlyBudget;
    const monthlyBudgetDec =
      monthlyBudgetRaw !== null && monthlyBudgetRaw !== undefined
        ? new Prisma.Decimal(Number(monthlyBudgetRaw).toFixed(2))
        : null;

    // Collect optional catalogue FK references before entering the transaction
    // lock to avoid dangling FK errors across environments and reduce tx time.
    const brandIds = Array.from(
      new Set(
        dto.patientProfiles
          .flatMap((p) => p.medications.map((m) => m.catalogueBrandId))
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
      ),
    );
    const packIds = Array.from(
      new Set(
        dto.patientProfiles
          .flatMap((p) =>
            p.medications.flatMap((m) =>
              m.inventoryTransactions.map((it) => it.cataloguePackId),
            ),
          )
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
      ),
    );

    const [brandRows, packRows] = await Promise.all([
      brandIds.length > 0 && this.prisma.medicineBrand?.findMany
        ? this.prisma.medicineBrand.findMany({
            where: { id: { in: brandIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
      packIds.length > 0 && this.prisma.medicinePack?.findMany
        ? this.prisma.medicinePack.findMany({
            where: { id: { in: packIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    const validBrandIds = new Set<string>(brandRows.map((r) => r.id));
    const validPackIds = new Set<string>(packRows.map((r) => r.id));

    return this.prisma.$transaction(
      async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!existingUser) {
          throw new NotFoundException('User account not found');
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            displayName: dto.account.displayName,
            glucoseUnit: dto.account.glucoseUnit,
            monthlyBudget: monthlyBudgetDec,
            remindersEnabled: dto.account.remindersEnabled,
            soundEnabled: dto.account.soundEnabled,
            reminderLeadMins: dto.account.reminderLeadMins,
          },
        });

      // Wipe ONLY this user's patient profiles; schema cascades owned records safely
      await tx.patientProfile.deleteMany({
        where: { ownerUserId: userId },
      });

      let medicationsCount = 0;
      let schedulesCount = 0;
      let doseEventsCount = 0;
      let purchasesCount = 0;
      let inventoryTransactionsCount = 0;
      let healthReadingsCount = 0;

      const hasExplicitDefault = dto.patientProfiles.some((p) => p.isDefault);

      for (let pIndex = 0; pIndex < dto.patientProfiles.length; pIndex += 1) {
        const prof = dto.patientProfiles[pIndex];
        const createdProfile = await tx.patientProfile.create({
          data: {
            ownerUserId: userId,
            name: prof.name,
            relationship: prof.relationship,
            timezone: prof.timezone,
            isDefault: hasExplicitDefault ? prof.isDefault : pIndex === 0,
          },
        });

        for (const med of prof.medications) {
          medicationsCount += 1;
          const safeBrandId =
            med.catalogueBrandId && validBrandIds.has(med.catalogueBrandId)
              ? med.catalogueBrandId
              : null;

          const createdMed = await tx.patientMedication.create({
            data: {
              patientId: createdProfile.id,
              catalogueBrandId: safeBrandId,
              name: med.name,
              genericName: med.genericName ?? null,
              strength: med.strength ?? null,
              dosageForm: med.dosageForm ?? null,
              manufacturer: med.manufacturer ?? null,
              personalInstructions: med.personalInstructions,
              stockRemaining: new Prisma.Decimal(
                Number(med.stockRemaining).toFixed(2),
              ),
              stockUnit: med.stockUnit,
              lowStockThreshold: new Prisma.Decimal(
                Number(med.lowStockThreshold).toFixed(2),
              ),
              status: med.status,
            },
          });

          const scheduleIdMap = new Map<string, string>();
          for (const sched of med.schedules) {
            schedulesCount += 1;
            const createdSched = await tx.medicationSchedule.create({
              data: {
                patientMedicationId: createdMed.id,
                doseAmount: new Prisma.Decimal(Number(sched.doseAmount).toFixed(2)),
                doseUnit: sched.doseUnit,
                frequency: sched.frequency,
                intervalHours: sched.intervalHours ?? null,
                weekdays: sched.weekdays ?? [],
                scheduledTimes: sched.scheduledTimes,
                startDate: parseIsoDateOrThrow(sched.startDate, 'schedule.startDate'),
                endDate: sched.endDate
                  ? parseIsoDateOrThrow(sched.endDate, 'schedule.endDate')
                  : null,
                instructions: sched.instructions ?? null,
                remindersEnabled: sched.remindersEnabled,
                status: sched.status,
              },
            });
            scheduleIdMap.set(sched.id, createdSched.id);
          }

          const doseEventIdMap = new Map<string, string>();
          for (const ev of med.doseEvents) {
            const targetScheduleId = scheduleIdMap.get(ev.scheduleId);
            if (!targetScheduleId) {
              throw new BadRequestException(
                `Backup dose event references unknown schedule "${ev.scheduleId}".`,
              );
            }
            doseEventsCount += 1;
            const createdEvent = await tx.doseEvent.create({
              data: {
                scheduleId: targetScheduleId,
                patientMedicationId: createdMed.id,
                scheduledFor: parseIsoDateOrThrow(
                  ev.scheduledFor,
                  'doseEvent.scheduledFor',
                ),
                status: ev.status,
                recordedAt: ev.recordedAt
                  ? parseIsoDateOrThrow(ev.recordedAt, 'doseEvent.recordedAt')
                  : null,
                note: ev.note ?? null,
              },
            });
            doseEventIdMap.set(ev.id, createdEvent.id);
          }

          const purchaseIdMap = new Map<string, string>();
          for (const pur of med.purchases) {
            purchasesCount += 1;
            const createdPurchase = await tx.purchase.create({
              data: {
                patientId: createdProfile.id,
                patientMedicationId: createdMed.id,
                purchaseDate: parseIsoDateOrThrow(
                  pur.purchaseDate,
                  'purchase.purchaseDate',
                ),
                packCount: pur.packCount,
                unitsPerPack: new Prisma.Decimal(Number(pur.unitsPerPack).toFixed(2)),
                totalUnitsAdded: new Prisma.Decimal(
                  Number(pur.totalUnitsAdded).toFixed(2),
                ),
                amountPaid: new Prisma.Decimal(Number(pur.amountPaid).toFixed(2)),
                currency: pur.currency || 'BDT',
                vendor: pur.vendor ?? null,
                note: pur.note ?? null,
              },
            });
            purchaseIdMap.set(pur.id, createdPurchase.id);
          }

          for (const invTx of med.inventoryTransactions) {
            inventoryTransactionsCount += 1;
            const mappedDoseEventId = invTx.doseEventId
              ? (doseEventIdMap.get(invTx.doseEventId) ?? null)
              : null;
            const mappedPurchaseId = invTx.purchaseId
              ? (purchaseIdMap.get(invTx.purchaseId) ?? null)
              : null;
            const safePackId =
              invTx.cataloguePackId && validPackIds.has(invTx.cataloguePackId)
                ? invTx.cataloguePackId
                : null;

            await tx.inventoryTransaction.create({
              data: {
                id: randomUUID(),
                patientMedicationId: createdMed.id,
                doseEventId: mappedDoseEventId,
                purchaseId: mappedPurchaseId,
                cataloguePackId: safePackId,
                type: invTx.type,
                enteredQuantity:
                  invTx.enteredQuantity !== null && invTx.enteredQuantity !== undefined
                    ? new Prisma.Decimal(Number(invTx.enteredQuantity).toFixed(2))
                    : null,
                enteredUnit: invTx.enteredUnit ?? null,
                baseUnit: invTx.baseUnit ?? null,
                quantityDelta: new Prisma.Decimal(
                  Number(invTx.quantityDelta).toFixed(2),
                ),
                balanceAfter: new Prisma.Decimal(Number(invTx.balanceAfter).toFixed(2)),
                reason: invTx.reason ?? null,
                note: invTx.note ?? null,
              },
            });
          }
        }

        if (prof.healthReadings.length > 0) {
          const healthReadingRows = prof.healthReadings.map((hr) => ({
            patientId: createdProfile.id,
            value: new Prisma.Decimal(Number(hr.value).toFixed(2)),
            unit: hr.unit,
            context: hr.context,
            measuredAt: parseIsoDateOrThrow(
              hr.measuredAt,
              'healthReading.measuredAt',
            ),
            note: hr.note ?? null,
          }));
          healthReadingsCount += healthReadingRows.length;

          if (typeof tx.healthReading?.createMany === 'function') {
            await tx.healthReading.createMany({ data: healthReadingRows });
          } else {
            for (const data of healthReadingRows) {
              await tx.healthReading.create({ data });
            }
          }
        }
      }

      return {
        restoredAt: new Date().toISOString(),
        schemaVersion: CAREDOSE_BACKUP_SCHEMA_VERSION,
        summary: {
          profilesCount: dto.patientProfiles.length,
          medicationsCount,
          schedulesCount,
          doseEventsCount,
          purchasesCount,
          inventoryTransactionsCount,
          healthReadingsCount,
        },
      };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  /**
   * Permanently deletes the authenticated user account and all cascading personal data.
   */
  async deleteAccount(
    userId: string,
    confirmation?: string,
  ): Promise<DeleteAccountResult> {
    if ((confirmation ?? '').trim() !== 'DELETE') {
      throw new BadRequestException(
        'Confirmation text "DELETE" is required to permanently delete your account.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User account not found');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return {
      deletedUserId: userId,
      deletedAt: new Date().toISOString(),
    };
  }
}
