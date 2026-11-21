import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_DB_CONNECT_ON_INIT === 'true') {
      return;
    }

    if (!process.env.DATABASE_URL?.trim()) {
      const msg =
        'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and configure PostgreSQL. Server running in degraded mode.';
      if (process.env.REQUIRE_DB_ON_STARTUP === 'true') {
        throw new Error(msg);
      }
      this.logger.warn(msg);
      return;
    }

    try {
      await this.$connect();
    } catch (err) {
      if (process.env.REQUIRE_DB_ON_STARTUP === 'true') {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Unknown database error';
      this.logger.warn(
        `Database connection failed on startup (${message}). Running in degraded mode until PostgreSQL is available.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch {
      // Ignore disconnect errors when database was never connected
    }
  }

  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    if (!process.env.DATABASE_URL?.trim()) {
      return { connected: false, error: 'DATABASE_URL is not configured' };
    }
    try {
      await this.$queryRaw`SELECT 1`;
      return { connected: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown database error';
      return { connected: false, error: message };
    }
  }
}
