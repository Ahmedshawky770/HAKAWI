import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { IS_PUBLIC_KEY } from '../decorators/roles.decorator.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';

import { extractAccessToken, verifyAccessToken } from './access-token.ts';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    // WHY the delegation and not a local implementation: `OptionalJwtAuthGuard` needs the same two
    // steps on routes where a missing credential is legal, and a second copy of "where does the
    // token come from" is a second answer to "whose identity does this request have" — the header
    // before the cookie is a security property (see `access-token.ts`), and two implementations of
    // it eventually disagree. Nothing about this guard's behaviour moved: same extraction, same
    // messages, same thrown exceptions, same order.
    const token = extractAccessToken(request);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await verifyAccessToken(this.jwtService, this.configService, token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
