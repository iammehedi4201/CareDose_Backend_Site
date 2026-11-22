import { Module } from '@nestjs/common';
import {
  MedicationSchedulesController,
  PatientSchedulesController,
  ScheduleItemController,
} from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  controllers: [
    PatientSchedulesController,
    MedicationSchedulesController,
    ScheduleItemController,
  ],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
