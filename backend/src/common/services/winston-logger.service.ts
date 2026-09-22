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

type WinstonLogLevel = keyof typeof logLevels;

@Injectable()
export class WinstonLoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      levels: logLevels,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, context, stack }) => {
          const contextStr = context ? `[${context}]` : '';
          return `${timestamp} ${level.toUpperCase()} ${contextStr} ${message}${stack ? `\n${stack}` : ''}`;
        }),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.printf(({ timestamp, level, message, context }) => {
              const contextStr = context ? `[${context}]` : '';
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