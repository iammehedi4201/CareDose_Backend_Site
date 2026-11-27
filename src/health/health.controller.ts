import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheckResult,
  HealthService,
  LivenessCheckResult,
} from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthCheckResult> {
    return this.healthService.getHealthStatus();
  }

  @Get('live')
  live(): LivenessCheckResult {
    return this.healthService.getLivenessStatus();
  }

  @Get('ready')
  async ready(): Promise<HealthCheckResult> {
    const status = await this.healthService.getHealthStatus();
    if (!status.database.connected) {
      throw new ServiceUnavailableException(status);
    }
    return status;
  }
}
