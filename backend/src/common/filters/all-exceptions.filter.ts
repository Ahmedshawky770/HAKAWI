import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
import { Request, Response } from 'express';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { captureSentryException } from '../observability/sentry.config.ts';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(WinstonLoggerService) private readonly winstonLogger: WinstonLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';
    let details: unknown[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as { message?: string }).message || message;
        errorCode = (exceptionResponse as { error?: string }).error || errorCode;
        details = (exceptionResponse as { details?: unknown[] }).details || [];
      }
    } else if (exception instanceof Error) {
      // WHY the client gets a generic message and the log gets the real one.
      //
      // A non-HttpException reaching this filter is a defect — a Drizzle/Postgres error, a
      // TypeError, a failed assertion — and its `.message` is written in the vocabulary of the
      // thing that broke: `relation "users" does not exist`, `column "password_hash" does not
      // exist`, `invalid input syntax for type uuid`, `/srv/app/dist/modules/users/users.repository.js:52`,
      // and so on. Returning it turned every 500 into a schema dump: it told an unauthenticated or
      // merely curious caller the table names, the column names, the driver dialect and the
      // filesystem layout of the deployment. None of that helps the caller, who can only retry or
      // report the failure, and all of it helps someone probing for an injectable value or an
      // internal path.
      //
      // The real message is not lost, it is simply not for the response body: it goes to Winston
      // below with the stack, and to Sentry, which is where an operator debugging this looks.
      // The log line keeps the specific message; the body keeps the contract.
      message = 'Internal server error';
      this.winstonLogger.error(`Unhandled exception: ${exception.message}`, exception.stack, 'AllExceptionsFilter');
      captureSentryException(exception, {
        method: request.method,
        url: request.url,
      });
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

    this.winstonLogger.error(`${request.method} ${request.url} - ${status} - ${message}`, undefined, 'HTTP');

    response.status(status).json(errorResponse);
  }
}
