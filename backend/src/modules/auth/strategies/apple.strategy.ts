import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../../common/utils/jwt.util.ts';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.APPLE_CLIENT_ID || 'apple-secret',
      issuer: 'https://appleid.apple.com',
    });
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
