import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { IS_PUBLIC_KEY } from '../decorators/roles.decorator.ts';
import { JwtPayload } from '../utils/jwt.util.ts';
import { ACCESS_TOKEN_COOKIE } from '../constants/auth-cookie.constants.ts';
import { parseCookieHeader } from '../constants/auth-cookie.constants.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';

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
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: AuthRequest): string | undefined {
    // WHY the header wins: the auth cookies are written with `path: '/'` and no `domain`, so any
    // host that can set a cookie for the parent domain — a sibling subdomain, a staging deploy on
    // a shared zone — can also write one named `access_token`. If the cookie were read first, that
    // attacker-chosen value would decide the caller's identity while the genuine header token was
    // ignored. The header is the credential the caller attached to this request on purpose, so it
    // takes precedence; the cookie is only the fallback for the browser that cannot set a header
    // on a cross-origin fetch. (Principle #15: assume the ambient credential can be poisoned.)
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && token !== undefined && token.length > 0) {
      return token;
    }

    return parseCookieHeader(request.headers.cookie)[ACCESS_TOKEN_COOKIE];
  }
}
