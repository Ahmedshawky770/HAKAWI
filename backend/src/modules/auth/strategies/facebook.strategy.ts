import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../../common/utils/jwt.util.ts';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.FACEBOOK_APP_SECRET || 'facebook-secret',
      issuer: 'https://www.facebook.com',
    });
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
