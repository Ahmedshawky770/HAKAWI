import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly winstonLogger: WinstonLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';
    let details: unknown[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else       if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as { message?: string }).message || message;
        errorCode = (exceptionResponse as { error?: string }).error || errorCode;
        details = (exceptionResponse as { details?: unknown[] }).details || [];
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.winstonLogger.error(
        `Unhandled exception: ${message}`,
        exception.stack,
        'AllExceptionsFilter',
      );
    }

    const errorResponse = {
      error: errorCode,
      message,
      details,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId: request.headers['x-correlation-id'] || undefined,
    };

    this.winstonLogger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      undefined,
      'HTTP',
    );

    response.status(status).json(errorResponse);
  }
}
