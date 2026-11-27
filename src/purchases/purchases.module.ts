import { Module } from '@nestjs/common';
import {
  MedicationPurchasesController,
  PatientPurchasesController,
} from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  controllers: [PatientPurchasesController, MedicationPurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
