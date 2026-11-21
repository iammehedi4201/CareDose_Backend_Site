import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

const PATIENT_SELECT = {
  id: true,
  ownerUserId: true,
  name: true,
  relationship: true,
  timezone: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PatientProfileRecord = Prisma.PatientProfileGetPayload<{
  select: typeof PATIENT_SELECT;
}>;

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<PatientProfileRecord[]> {
    return this.prisma.patientProfile.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: PATIENT_SELECT,
    });
  }

  async getByIdForUser(
    userId: string,
    patientId: string,
  ): Promise<PatientProfileRecord> {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: PATIENT_SELECT,
    });
    if (!profile) {
      throw new NotFoundException('Patient profile not found');
    }
    if (profile.ownerUserId !== userId) {
      throw new ForbiddenException('You do not have access to this patient profile');
    }
    return profile;
  }

  async create(
    userId: string,
    dto: CreatePatientDto,
  ): Promise<PatientProfileRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.patientProfile.count({
        where: { ownerUserId: userId },
      });

      const makeDefault = dto.isDefault ?? existingCount === 0;
      if (makeDefault && existingCount > 0) {
        await tx.patientProfile.updateMany({
          where: { ownerUserId: userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.patientProfile.create({
        data: {
          ownerUserId: userId,
          name: dto.name,
          relationship: dto.relationship ?? 'Family',
          timezone: dto.timezone ?? 'Asia/Dhaka',
          isDefault: makeDefault,
        },
        select: PATIENT_SELECT,
      });
    });
  }

  async update(
    userId: string,
    patientId: string,
    dto: UpdatePatientDto,
  ): Promise<PatientProfileRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.patientProfile.findUnique({
        where: { id: patientId },
        select: PATIENT_SELECT,
      });
      if (!existing) {
        throw new NotFoundException('Patient profile not found');
      }
      if (existing.ownerUserId !== userId) {
        throw new ForbiddenException('You do not have access to this patient profile');
      }

      if (dto.isDefault === true && !existing.isDefault) {
        await tx.patientProfile.updateMany({
          where: { ownerUserId: userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const data: Prisma.PatientProfileUpdateInput = {};
      if (dto.name !== undefined) {
        data.name = dto.name;
      }
      if (dto.relationship !== undefined) {
        data.relationship = dto.relationship;
      }
      if (dto.timezone !== undefined) {
        data.timezone = dto.timezone;
      }
      if (dto.isDefault !== undefined) {
        data.isDefault = dto.isDefault;
      }

      return tx.patientProfile.update({
        where: { id: patientId },
        data,
        select: PATIENT_SELECT,
      });
    });
  }

  async remove(userId: string, patientId: string): Promise<{ deletedId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.patientProfile.findUnique({
        where: { id: patientId },
        select: { id: true, ownerUserId: true, isDefault: true },
      });
      if (!existing) {
        throw new NotFoundException('Patient profile not found');
      }
      if (existing.ownerUserId !== userId) {
        throw new ForbiddenException('You do not have access to this patient profile');
      }

      const total = await tx.patientProfile.count({
        where: { ownerUserId: userId },
      });
      if (total <= 1) {
        throw new BadRequestException('Cannot delete your only remaining patient profile');
      }

      await tx.patientProfile.delete({
        where: { id: patientId },
      });

      if (existing.isDefault) {
        const nextDefault = await tx.patientProfile.findFirst({
          where: { ownerUserId: userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (nextDefault) {
          await tx.patientProfile.update({
            where: { id: nextDefault.id },
            data: { isDefault: true },
          });
        }
      }

      return { deletedId: patientId };
    });
  }
}
