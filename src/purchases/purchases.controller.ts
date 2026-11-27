import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RequestWithAuth } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MedicationOwnershipGuard } from '../common/guards/medication-ownership.guard';
import { PatientOwnershipGuard } from '../common/guards/patient-ownership.guard';
import { CreatePurchaseDto, ListPurchasesQueryDto } from './dto/purchase.dto';
import {
  SerializedPurchaseListResponse,
  SerializedRecordPurchaseResult,
} from './purchases.serializers';
import { PurchasesService } from './purchases.service';

@UseGuards(JwtAuthGuard, PatientOwnershipGuard)
@Controller('patients/:patientId/purchases')
export class PatientPurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  async listForPatient(
    @Param('patientId') patientId: string,
    @Query() query: ListPurchasesQueryDto,
    @Req() req: RequestWithAuth,
  ): Promise<SerializedPurchaseListResponse> {
    const timeZone = req.patientProfile?.timezone ?? 'Asia/Dhaka';
    return this.purchasesService.listForPatient(patientId, timeZone, query);
  }
}

@UseGuards(JwtAuthGuard, MedicationOwnershipGuard)
@Controller('patient-medications/:id/purchases')
export class MedicationPurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  async listForMedication(
    @Param('id') medicationId: string,
    @Query() query: ListPurchasesQueryDto,
  ): Promise<SerializedPurchaseListResponse> {
    return this.purchasesService.listForMedication(medicationId, query);
  }

  @Post()
  async create(
    @Param('id') medicationId: string,
    @Body() dto: CreatePurchaseDto,
  ): Promise<SerializedRecordPurchaseResult> {
    return this.purchasesService.recordForMedication(medicationId, dto);
  }
}
