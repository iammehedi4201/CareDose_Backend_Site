import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PatientOwnershipGuard } from '../common/guards/patient-ownership.guard';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientProfileRecord, PatientsService } from './patients.service';

@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<PatientProfileRecord[]> {
    return this.patientsService.listForUser(user.userId);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePatientDto,
  ): Promise<PatientProfileRecord> {
    return this.patientsService.create(user.userId, dto);
  }

  @UseGuards(PatientOwnershipGuard)
  @Get(':patientId')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
  ): Promise<PatientProfileRecord> {
    return this.patientsService.getByIdForUser(user.userId, patientId);
  }

  @UseGuards(PatientOwnershipGuard)
  @Patch(':patientId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Body() dto: UpdatePatientDto,
  ): Promise<PatientProfileRecord> {
    return this.patientsService.update(user.userId, patientId, dto);
  }

  @UseGuards(PatientOwnershipGuard)
  @Delete(':patientId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
  ): Promise<{ deletedId: string }> {
    return this.patientsService.remove(user.userId, patientId);
  }
}
