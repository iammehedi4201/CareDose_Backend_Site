import { Module } from '@nestjs/common';
import {
  DoseEventActionsController,
  PatientDoseLogsController,
} from './dose-logs.controller';
import { DoseLogsService } from './dose-logs.service';

@Module({
  controllers: [PatientDoseLogsController, DoseEventActionsController],
  providers: [DoseLogsService],
  exports: [DoseLogsService],
})
export class DoseLogsModule {}
