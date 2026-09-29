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
          const level = typeof info.level === 'string' ? info.level : String(info.level);
          const message = typeof info.message === 'string' ? info.message : String(info.message);
          const timestamp = typeof info.timestamp === 'string' ? info.timestamp : String(info.timestamp);
          return `${timestamp} ${level.toUpperCase()} ${contextStr} ${message}${stackStr}`;
        }),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.printf((info) => {
              const context = typeof info.context === 'string' ? info.context : undefined;
              const contextStr = context ? '[' + context + ']' : '';
              const level = typeof info.level === 'string' ? info.level : String(info.level);
              const message = typeof info.message === 'string' ? info.message : String(info.message);
              const timestamp = typeof info.timestamp === 'string' ? info.timestamp : String(info.timestamp);
              return `${timestamp} ${level} ${contextStr} ${message}`;
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