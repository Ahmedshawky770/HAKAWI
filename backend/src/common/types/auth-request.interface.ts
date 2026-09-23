import type { Request } from 'express';

import type { JwtPayload } from '../utils/jwt.util.ts';

export interface AuthRequest extends Request {
  user: JwtPayload;
}
