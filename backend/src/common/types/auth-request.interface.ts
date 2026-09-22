import type { Request } from 'express';

export interface AuthRequest extends Request {
  user: {
    sub: string;
    email?: string;
    accountType?: string;
    [key: string]: unknown;
  };
}
