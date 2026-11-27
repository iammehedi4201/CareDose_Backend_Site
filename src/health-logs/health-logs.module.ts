import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PatientsModule } from '../patients/patients.module';
import { HealthLogsController } from './health-logs.controller';
import { HealthLogsService } from './health-logs.service';

@Module({
  imports: [AuthModule, PatientsModule],
  controllers: [HealthLogsController],
  providers: [HealthLogsService],
  exports: [HealthLogsService],
})
export class HealthLogsModule {}
