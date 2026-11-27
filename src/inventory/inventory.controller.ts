import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MedicationOwnershipGuard } from '../common/guards/medication-ownership.guard';
import { AdjustStockDto, ListInventoryQueryDto } from './dto/inventory.dto';
import {
  SerializedInventoryLedgerResponse,
  SerializedStockAdjustmentResult,
} from './inventory.serializers';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, MedicationOwnershipGuard)
@Controller('patient-medications/:id/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(
    @Param('id') medicationId: string,
    @Query() query: ListInventoryQueryDto,
  ): Promise<SerializedInventoryLedgerResponse> {
    return this.inventoryService.listForMedication(medicationId, query);
  }

  @Post('adjust')
  @HttpCode(HttpStatus.OK)
  async adjust(
    @Param('id') medicationId: string,
    @Body() dto: AdjustStockDto,
  ): Promise<SerializedStockAdjustmentResult> {
    return this.inventoryService.adjustForMedication(medicationId, dto);
  }
}
