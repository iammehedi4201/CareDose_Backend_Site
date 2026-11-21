import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

export interface RequestWithAuth {
  user?: AuthenticatedUser;
  headers?: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  patientProfile?: {
    id: string;
    ownerUserId: string;
    name: string;
    timezone: string;
    isDefault: boolean;
  };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
    return request.user;
  },
);
