import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ScheduleStatus } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
  type RequestWithAuth,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MedicationOwnershipGuard } from '../common/guards/medication-ownership.guard';
import { PatientOwnershipGuard } from '../common/guards/patient-ownership.guard';
import {
  CreateScheduleDto,
  ListSchedulesQueryDto,
  UpdateScheduleDto,
} from './dto/schedule.dto';
import { SerializedMedicationSchedule } from './schedules.serializers';
import { SchedulesService } from './schedules.service';

@UseGuards(JwtAuthGuard, PatientOwnershipGuard)
@Controller('patients/:patientId/schedules')
export class PatientSchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  async listForPatient(
    @Param('patientId') patientId: string,
    @Query() query: ListSchedulesQueryDto,
    @Req() req: RequestWithAuth,
  ): Promise<SerializedMedicationSchedule[]> {
    const timeZone = req.patientProfile?.timezone ?? 'Asia/Dhaka';
    return this.schedulesService.listForPatient(patientId, timeZone, query);
  }
}

@UseGuards(JwtAuthGuard, MedicationOwnershipGuard)
@Controller('patient-medications/:id/schedules')
export class MedicationSchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  async listForMedication(
    @Param('id') medicationId: string,
    @Query() query: ListSchedulesQueryDto,
  ): Promise<SerializedMedicationSchedule[]> {
    return this.schedulesService.listForMedication(medicationId, query);
  }

  @Post()
  async create(
    @Param('id') medicationId: string,
    @Body() dto: CreateScheduleDto,
  ): Promise<SerializedMedicationSchedule> {
    return this.schedulesService.createForMedication(medicationId, dto);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('schedules')
export class ScheduleItemController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ): Promise<SerializedMedicationSchedule> {
    if (!user) throw new UnauthorizedException('Authentication is required');
    return this.schedulesService.updateForUser(user.userId, id, dto);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  async pause(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
  ): Promise<SerializedMedicationSchedule> {
    if (!user) throw new UnauthorizedException('Authentication is required');
    return this.schedulesService.updateForUser(user.userId, id, {
      status: ScheduleStatus.PAUSED,
    });
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
  ): Promise<SerializedMedicationSchedule> {
    if (!user) throw new UnauthorizedException('Authentication is required');
    return this.schedulesService.updateForUser(user.userId, id, {
      status: ScheduleStatus.ACTIVE,
    });
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
  ): Promise<SerializedMedicationSchedule> {
    if (!user) throw new UnauthorizedException('Authentication is required');
    return this.schedulesService.archiveForUser(user.userId, id);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
  ): Promise<{ deleted: true; id: string }> {
    if (!user) throw new UnauthorizedException('Authentication is required');
    return this.schedulesService.deleteForUser(user.userId, id);
  }
}
