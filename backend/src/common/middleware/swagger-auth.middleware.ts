import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { extractAccessToken, verifyAccessToken } from '../guards/access-token.ts';
import { adminRoleAtLeast, normalizeAdminRole } from '../constants/roles.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

/**
 * AUTHENTICATION MIDDLEWARE FOR SWAGGER DOCUMENTATION.
 *
 * The OpenAPI UI at `/api/v1/api/docs` exposes every route, every request body,
 * and every response shape of the API. An unauthenticated visitor can use it for
 * reconnaissance: parameter fuzzing, hidden endpoint discovery, version
 * fingerprinting. This middleware requires a valid JWT before any Swagger route
 * is served.
 *
 * The middleware is registered once in `main.ts` for the Swagger path prefix,
 * before `setupSwagger()` mounts the document handlers. It runs outside the
 * Nest guard chain because `SwaggerModule.setup()` registers raw Express routes
 * that bypass `@UseGuards()` decorators.
 *
 * ENVIRONMENT BEHAVIOUR:
 *   - Any environment: a valid access token is required. Requests without one
 *     receive 401.
 *   - Production (`NODE_ENV === 'production`): the token must carry the
 *     `super_admin` role. Any other authenticated role receives 403. This is
 *     controlled by `SWAGGER_REQUIRE_SUPER_ADMIN` (default `true` in
 *     production, `false` elsewhere).
 *
 * The admin role check reads `adminRole` from the verified JWT payload, not
 * from a cookie, so a stolen cookie alone cannot reach the docs.
 */
@Injectable()
export class SwaggerAuthMiddleware implements NestMiddleware {
  readonly requireSuperAdmin: boolean;

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    const production = configService.get<string>('NODE_ENV') === 'production';
    const configured = configService.get<string>('SWAGGER_REQUIRE_SUPER_ADMIN');
    this.requireSuperAdmin =
      configured === undefined ? production : configured === 'true';
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const path = req.path;

    // Only paths under the Swagger prefix are protected. Everything else
    // passes through untouched.
    if (!path.startsWith(`/api/v1/${this.configService.get<string>('SWAGGER_API_PATH') ?? 'api/docs'}`)) {
      next();
      return;
    }

    const token = extractAccessToken(req);
    if (!token) {
      res.status(401).json({
        statusCode: 401,
        message: 'No token provided',
        error: 'Unauthorized',
      });
      return;
    }

    verifyAccessToken(this.jwtService, this.configService, token)
      .then((payload: JwtPayload) => {
        if (this.requireSuperAdmin) {
          const adminRole =
            typeof payload.adminRole === 'string' ? normalizeAdminRole(payload.adminRole) : undefined;
          if (adminRole === undefined || !adminRoleAtLeast(adminRole, 'super_admin')) {
            res.status(403).json({
              statusCode: 403,
              message: 'Insufficient admin privileges',
              error: 'Forbidden',
            });
            return;
          }
        }
        next();
      })
      .catch(() => {
        res.status(401).json({
          statusCode: 401,
          message: 'Invalid or expired token',
          error: 'Unauthorized',
        });
      });
  }
}
