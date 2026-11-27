import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  service: 'caredose-backend';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  database: {
    connected: boolean;
    error?: string;
  };
}

export interface LivenessCheckResult {
  status: 'alive';
  service: 'caredose-backend';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getLivenessStatus(): LivenessCheckResult {
    return {
      status: 'alive',
      service: 'caredose-backend',
      version: '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async getHealthStatus(): Promise<HealthCheckResult> {
    const dbStatus = await this.prisma.checkConnection();
    return {
      status: dbStatus.connected ? 'ok' : 'degraded',
      service: 'caredose-backend',
      version: '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  }
}
