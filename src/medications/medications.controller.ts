import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MedicationOwnershipGuard } from '../common/guards/medication-ownership.guard';
import { PatientOwnershipGuard } from '../common/guards/patient-ownership.guard';
import {
  CreateMedicationDto,
  ListMedicationsQueryDto,
  UpdateMedicationDto,
} from './dto/medication.dto';
import {
  SerializedPatientMedication,
  SerializedPatientMedicationDetail,
} from './medications.serializers';
import { MedicationsService } from './medications.service';

@UseGuards(JwtAuthGuard, PatientOwnershipGuard)
@Controller('patients/:patientId/medications')
export class PatientMedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Get()
  async list(
    @Param('patientId') patientId: string,
    @Query() query: ListMedicationsQueryDto,
  ): Promise<SerializedPatientMedication[]> {
    return this.medicationsService.listForPatient(patientId, query);
  }

  @Post()
  async create(
    @Param('patientId') patientId: string,
    @Body() dto: CreateMedicationDto,
  ): Promise<SerializedPatientMedication> {
    return this.medicationsService.createForPatient(patientId, dto);
  }
}

@UseGuards(JwtAuthGuard, MedicationOwnershipGuard)
@Controller('patient-medications')
export class PatientMedicationItemController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Get(':id')
  async getOne(@Param('id') id: string): Promise<SerializedPatientMedicationDetail> {
    return this.medicationsService.getById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMedicationDto,
  ): Promise<SerializedPatientMedication> {
    return this.medicationsService.updateById(id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id') id: string): Promise<SerializedPatientMedication> {
    return this.medicationsService.archiveById(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(@Param('id') id: string): Promise<SerializedPatientMedication> {
    return this.medicationsService.restoreById(id);
  }
}
