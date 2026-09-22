import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../../common/utils/jwt.util.ts';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.GITHUB_CLIENT_ID || 'github-secret',
      issuer: 'https://github.com',
    });
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
