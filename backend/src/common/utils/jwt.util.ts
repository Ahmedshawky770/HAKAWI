import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  accountType: string;
  adminRole?: string;
}

@Injectable()
export class JwtHelper {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiry', '15m')!,
    });
  }

  generateRefreshToken(payload: JwtPayload): string {
    return this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiry', '7d')!,
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
