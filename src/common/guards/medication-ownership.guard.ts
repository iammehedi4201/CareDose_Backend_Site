import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestWithAuth } from '../decorators/current-user.decorator';
import { isValidUuid } from '../utils/uuid.util';

/**
 * Verifies that the requested PatientMedication belongs to a PatientProfile
 * owned by the authenticated user.
 */
@Injectable()
export class MedicationOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required');
    }

    const medicationId = request.params?.id ?? request.params?.medicationId;
    if (!isValidUuid(medicationId)) {
      throw new BadRequestException('Invalid patient medication UUID parameter');
    }

    const medication = await this.prisma.patientMedication.findUnique({
      where: { id: medicationId },
      select: {
        id: true,
        patientId: true,
        patient: {
          select: {
            ownerUserId: true,
          },
        },
      },
    });

    if (!medication) {
      throw new NotFoundException('Patient medication not found');
    }

    if (medication.patient.ownerUserId !== userId) {
      throw new ForbiddenException('You do not have permission to access this medication');
    }

    request.patientMedication = {
      id: medication.id,
      patientId: medication.patientId,
      ownerUserId: medication.patient.ownerUserId,
    };

    return true;
  }
}
