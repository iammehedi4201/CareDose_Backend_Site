import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MedicationOwnershipGuard } from '../common/guards/medication-ownership.guard';
import { PatientOwnershipGuard } from '../common/guards/patient-ownership.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    PatientOwnershipGuard,
    MedicationOwnershipGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    PatientOwnershipGuard,
    MedicationOwnershipGuard,
  ],
})
export class AuthModule {}
