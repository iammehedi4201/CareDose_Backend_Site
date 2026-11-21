import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  service: 'caredose-backend';
  version: string;
  timestamp: string;
  database: {
    connected: boolean;
    error?: string;
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealthStatus(): Promise<HealthCheckResult> {
    const dbStatus = await this.prisma.checkConnection();
    return {
      status: dbStatus.connected ? 'ok' : 'degraded',
      service: 'caredose-backend',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  }
}
