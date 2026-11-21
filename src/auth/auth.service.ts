import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GlucoseUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { serializeUser, SerializedUser, USER_SAFE_SELECT } from '../users/user-select';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password.util';
import { TokenService } from './token.service';

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: SerializedUser;
  defaultPatientProfile?: {
    id: string;
    name: string;
    relationship: string;
    timezone: string;
    isDefault: boolean;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = hashPassword(dto.password);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { email: dto.email },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException('An account with this email already exists');
        }

        const user = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            displayName: dto.displayName,
            glucoseUnit: dto.glucoseUnit ?? GlucoseUnit.MG_DL,
          },
          select: USER_SAFE_SELECT,
        });

        const defaultProfile = await tx.patientProfile.create({
          data: {
            ownerUserId: user.id,
            name: dto.displayName,
            relationship: 'Self',
            timezone: dto.timezone ?? 'Asia/Dhaka',
            isDefault: true,
          },
          select: {
            id: true,
            name: true,
            relationship: true,
            timezone: true,
            isDefault: true,
          },
        });

        return { user, defaultProfile };
      });

      const accessToken = this.tokenService.signAccessToken(
        result.user.id,
        result.user.email,
      );

      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.tokenService.getExpiresInSeconds(),
        user: serializeUser(result.user),
        defaultPatientProfile: result.defaultProfile,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        ...USER_SAFE_SELECT,
        passwordHash: true,
      },
    });

    if (!user || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = this.tokenService.signAccessToken(user.id, user.email);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.getExpiresInSeconds(),
      user: serializeUser(user),
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_SAFE_SELECT,
        patientProfiles: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            name: true,
            relationship: true,
            timezone: true,
            isDefault: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    return {
      user: serializeUser(user),
      patientProfiles: user.patientProfiles,
    };
  }
}
