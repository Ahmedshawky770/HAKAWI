import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';

@Injectable()
export class WafMiddleware implements NestMiddleware {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  private readonly patterns = [
    /('|%27)(\s|%20)*(OR|or)(\s|%20)*('|%27)/i,
    /(%27)|(')|(--)|(%23)|(#)/i,
    /(<script>|<%|%3Cscript%3E)/i,
    /(\.\.(\/|%2F)|\.\.(\\|%5C))/i,
    /\b(eval|exec|system|shell_exec|passthru|popen|proc_open)\s*\(/i,
  ];

  use(req: Request, res: Response, next: NextFunction) {
    const url = req.url || '';
    const body = JSON.stringify(req.body);
    const query = JSON.stringify(req.query);
    const combined = `${url} ${body} ${query}`;

    for (const pattern of this.patterns) {
      if (pattern.test(combined)) {
        this.logger.warn(`Blocked suspicious request from ${String(req.ip)}: ${req.method} ${req.url}`, 'WafMiddleware');
        return res.status(403).json({
          statusCode: 403,
          message: 'Forbidden',
          error: 'Suspicious request blocked',
        });
      }
    }

    next();
  }
}
