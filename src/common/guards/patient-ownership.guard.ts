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
 * Enforces patient-profile ownership before controller handlers run.
 * Never trusts a patientId from route parameters without verifying ownerUserId.
 */
@Injectable()
export class PatientOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required');
    }

    const patientId = request.params?.patientId;
    if (!isValidUuid(patientId)) {
      throw new BadRequestException('Invalid patientId UUID parameter');
    }

    const profile = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        ownerUserId: true,
        name: true,
        timezone: true,
        isDefault: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found');
    }

    if (profile.ownerUserId !== userId) {
      throw new ForbiddenException('You do not have permission to access this patient profile');
    }

    request.patientProfile = profile;
    return true;
  }
}
