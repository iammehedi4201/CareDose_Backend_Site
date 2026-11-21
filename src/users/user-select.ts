import { GlucoseUnit, Prisma } from '@prisma/client';

export const USER_SAFE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  glucoseUnit: true,
  currency: true,
  monthlyBudget: true,
  remindersEnabled: true,
  soundEnabled: true,
  reminderLeadMins: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface SafeUserRecord {
  id: string;
  email: string;
  displayName: string;
  glucoseUnit: GlucoseUnit;
  currency: string;
  monthlyBudget: { toString(): string } | null;
  remindersEnabled: boolean;
  soundEnabled: boolean;
  reminderLeadMins: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedUser {
  id: string;
  email: string;
  displayName: string;
  glucoseUnit: GlucoseUnit;
  currency: string;
  monthlyBudget: string | null;
  remindersEnabled: boolean;
  soundEnabled: boolean;
  reminderLeadMins: number;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeUser(user: SafeUserRecord): SerializedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    glucoseUnit: user.glucoseUnit,
    currency: user.currency,
    monthlyBudget:
      user.monthlyBudget === null || user.monthlyBudget === undefined
        ? null
        : new Prisma.Decimal(user.monthlyBudget.toString()).toFixed(2),
    remindersEnabled: user.remindersEnabled,
    soundEnabled: user.soundEnabled,
    reminderLeadMins: user.reminderLeadMins,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
