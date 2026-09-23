import { Injectable } from '@nestjs/common';
import * as winston from 'winston';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
  fatal: 5,
} as const;

@Injectable()
export class WinstonLoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      levels: logLevels,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf((info) => {
          const context = typeof info.context === 'string' ? info.context : undefined;
          const stack = typeof info.stack === 'string' ? info.stack : undefined;
          const contextStr = context ? '[' + context + ']' : '';
          const stackStr = stack ? '\n' + stack : '';
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `${info.timestamp} ${info.level.toUpperCase()} ${contextStr} ${info.message}${stackStr}`;
        }),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.printf((info) => {
              const context = typeof info.context === 'string' ? info.context : undefined;
              const contextStr = context ? '[' + context + ']' : '';
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              return `${info.timestamp} ${info.level} ${contextStr} ${info.message}`;
            }),
          ),
        }),
      ],
    });
  }

  info(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, { context, stack: trace });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string): void {
    this.logger.verbose(message, { context });
  }
}