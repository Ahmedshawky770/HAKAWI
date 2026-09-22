import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../../common/utils/jwt.util.ts';

@Injectable()
export class TiktokStrategy extends PassportStrategy(Strategy, 'tiktok-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.TIKTOK_CLIENT_KEY || 'tiktok-secret',
      issuer: 'https://www.tiktok.com',
    });
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
