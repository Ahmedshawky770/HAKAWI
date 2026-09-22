import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../../common/utils/jwt.util.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.GOOGLE_CLIENT_ID || 'google-secret',
      issuer: 'https://accounts.google.com',
    });
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
