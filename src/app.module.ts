import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestContextMiddleware } from './common/logging/request-context';
import { rateLimitMiddleware } from './common/security/rate-limit.middleware';
import { securityHeadersMiddleware } from './common/security/security-headers.middleware';
import { DoseLogsModule } from './dose-logs/dose-logs.module';
import { ExpensesModule } from './expenses/expenses.module';
import { HealthLogsModule } from './health-logs/health-logs.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { InventoryModule } from './inventory/inventory.module';
import { MedicationsModule } from './medications/medications.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SchedulesModule } from './schedules/schedules.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    CatalogueModule,
    MedicationsModule,
    SchedulesModule,
    DoseLogsModule,
    InventoryModule,
    PurchasesModule,
    ExpensesModule,
    HealthLogsModule,
    ImportsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        requestContextMiddleware,
        securityHeadersMiddleware,
        rateLimitMiddleware,
      )
      .forRoutes('*');
  }
}
