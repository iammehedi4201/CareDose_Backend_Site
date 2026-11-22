import { Module } from '@nestjs/common';
import {
  PatientMedicationItemController,
  PatientMedicationsController,
} from './medications.controller';
import { MedicationsService } from './medications.service';

@Module({
  controllers: [PatientMedicationsController, PatientMedicationItemController],
  providers: [MedicationsService],
  exports: [MedicationsService],
})
export class MedicationsModule {}
