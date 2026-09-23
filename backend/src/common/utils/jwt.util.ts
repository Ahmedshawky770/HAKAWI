import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

export interface JwtPayload {
  sub: string;
  email: string;
  accountType: string;
  adminRole?: string;
}

@Injectable()
export class JwtHelper {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign({ ...payload }, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiry', '15m') as StringValue,
    });
  }

  generateRefreshToken(payload: JwtPayload): string {
    return this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiry', '7d') as StringValue,
      },
    );
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwtService.verify(token, {
      secret: this.configService.get<string>('jwt.secret'),
    });
  }

  verifyRefreshToken(token: string): JwtPayload & { type: string } {
    return this.jwtService.verify(token, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
    });
  }
}
