import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { serializeUser, SerializedUser, USER_SAFE_SELECT } from './user-select';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(userId: string): Promise<SerializedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SAFE_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User account not found');
    }
    return serializeUser(user);
  }

  async updateSettings(
    userId: string,
    dto: UpdateUserSettingsDto,
  ): Promise<SerializedUser> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User account not found');
    }

    const updateData: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) {
      updateData.displayName = dto.displayName;
    }
    if (dto.glucoseUnit !== undefined) {
      updateData.glucoseUnit = dto.glucoseUnit;
    }
    if (dto.monthlyBudget !== undefined) {
      updateData.monthlyBudget =
        dto.monthlyBudget === null ? null : new Prisma.Decimal(dto.monthlyBudget.toFixed(2));
    }
    if (dto.remindersEnabled !== undefined) {
      updateData.remindersEnabled = dto.remindersEnabled;
    }
    if (dto.soundEnabled !== undefined) {
      updateData.soundEnabled = dto.soundEnabled;
    }
    if (dto.reminderLeadMins !== undefined) {
      updateData.reminderLeadMins = dto.reminderLeadMins;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SAFE_SELECT,
    });

    return serializeUser(updated);
  }
}
