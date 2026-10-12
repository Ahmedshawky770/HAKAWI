import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { ArgumentsHost, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { captureSentryException } from '../observability/sentry.config.ts';

import { AllExceptionsFilter, statusFromException } from './all-exceptions.filter.ts';

vi.mock('../observability/sentry.config.ts', () => ({
  captureSentryException: vi.fn(),
}));

interface CapturedBody {
  error: string;
  message: string;
  details: unknown[];
  statusCode: number;
  path: string;
  correlationId?: string;
}

const buildHost = (overrides: { method?: string; url?: string } = {}): ArgumentsHost => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  const request = {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? '/api/v1/comments/abc',
    headers: {},
  } as unknown as Request;

  const response = { status } as unknown as Response;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
};

const bodyOf = (host: ArgumentsHost): CapturedBody => {
  const response = host.switchToHttp().getResponse<Response>();
  const captured = (response.status as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
    json: Mock;
  };
  return captured.json.mock.calls[0]?.[0] as CapturedBody;
};

const statusOf = (host: ArgumentsHost): number =>
  (host.switchToHttp().getResponse<Response>().status as unknown as Mock).mock.calls[0]?.[0] as number;

describe('AllExceptionsFilter', () => {
  let logger: WinstonLoggerService;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    vi.clearAllMocks();

    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
    } as unknown as WinstonLoggerService;

    filter = new AllExceptionsFilter(logger);
  });

  /**
   * The leak this closes. `exception.message` for a non-HttpException is written by whatever broke —
   * Drizzle, Postgres, Node — so it carries SQL fragments, table and column names, the driver
   * dialect and sometimes a build path. None of that helps the caller, and all of it helps somebody
   * probing for an injectable value.
   */
  describe('non-HttpException errors', () => {
    const SQL_LEAK = 'column "password_hash" does not exist';

    it('does not put the database message in the response body', () => {
      const host = buildHost();
      filter.catch(new Error(SQL_LEAK), host);

      const body = bodyOf(host);
      expect(statusOf(host)).toBe(500);
      expect(body.message).toBe('Internal server error');
      expect(body.error).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('password_hash');
      expect(JSON.stringify(body)).not.toContain(SQL_LEAK);
    });

    it('does not leak a filesystem path from the stack-bearing message', () => {
      const host = buildHost();
      filter.catch(new Error('ENOENT: no such file or directory, open /srv/hakawi/dist/secret.js'), host);

      expect(JSON.stringify(bodyOf(host))).not.toContain('/srv/hakawi');
    });

    it('still logs the real message and stack', () => {
      const error = new Error(SQL_LEAK);
      error.stack = 'Error: message\n    at UsersRepository.findById (/srv/app/users.repository.js:52:11)';

      filter.catch(error, buildHost());

      expect(logger.error).toHaveBeenCalledWith(`Unhandled exception: ${SQL_LEAK}`, error.stack, 'AllExceptionsFilter');
    });

    it('still reports the error to Sentry with the request context', () => {
      const error = new Error(SQL_LEAK);

      filter.catch(error, buildHost({ method: 'PATCH', url: '/api/v1/users/1' }));

      expect(vi.mocked(captureSentryException)).toHaveBeenCalledWith(error, {
        method: 'PATCH',
        url: '/api/v1/users/1',
      });
    });

    it('does not change the response for a thrown string', () => {
      // Not an `Error`, so it is neither an HttpException nor a logged error. It already answered
      // with the generic message before this change; pinned so that stays true.
      const host = buildHost();
      filter.catch('plain string failure', host);

      expect(bodyOf(host).message).toBe('Internal server error');
      expect(vi.mocked(captureSentryException)).not.toHaveBeenCalled();
    });
  });

  /**
   * An `HttpException` message was written by this codebase on purpose — `ForbiddenException('You do
   * not own this resource')` is the guard telling the caller what happened. Masking it would destroy
   * the API contract to hide information that was never internal.
   */
  describe('HttpExceptions keep their message', () => {
    it('passes through a 403 message verbatim', () => {
      const host = buildHost();
      filter.catch(new ForbiddenException('You do not own this resource'), host);

      const body = bodyOf(host);
      expect(statusOf(host)).toBe(403);
      expect(body.message).toBe('You do not own this resource');
    });

    it('passes through a 404 message verbatim', () => {
      const host = buildHost();
      filter.catch(new NotFoundException('Story not found'), host);

      expect(statusOf(host)).toBe(404);
      expect(bodyOf(host).message).toBe('Story not found');
    });

    it('keeps the structured error code and validation details of a 400', () => {
      const host = buildHost();
      filter.catch(new BadRequestException({ message: 'title must be a string', error: 'Bad Request' }), host);

      const body = bodyOf(host);
      expect(statusOf(host)).toBe(400);
      expect(body.message).toBe('title must be a string');
      expect(body.error).toBe('Bad Request');
    });
  });

  /**
   * The shared mapping, asserted on its own because its second consumer is somewhere else entirely.
   *
   * `MetricsInterceptor` imports this function to decide the `status` label on
   * `http_requests_total`, and it runs BEFORE this filter writes anything — so the counter and the
   * response are two different measurements of one decision. Asserting the decision here, where the
   * response is also asserted, is what keeps them from drifting apart in a refactor: a change to this
   * mapping that the metric did not follow would fail the interceptor's own spec, and a change to the
   * interceptor that stopped calling this would fail here.
   */
  describe('statusFromException', () => {
    it('uses the status an HttpException carries', () => {
      expect(statusFromException(new NotFoundException('Story not found'), 500)).toBe(404);
      expect(statusFromException(new ForbiddenException('nope'), 500)).toBe(403);
      expect(
        statusFromException(new BadRequestException({ message: 'bad', error: 'Bad Request' }), 500),
      ).toBe(400);
    });

    it('uses the fallback for anything that carries no status of its own', () => {
      expect(statusFromException(new Error('column "stories" does not exist'), 500)).toBe(500);
      expect(statusFromException('thrown string', 429)).toBe(429);
      expect(statusFromException(undefined, 503)).toBe(503);
    });

    it('prefers the exception over the fallback, which is what stops a 404 counting as a 500', () => {
      // The interceptor's response still holds the 200 express initialised it with at the moment it
      // records. If the exception lost to the fallback, every 404 in the deployment would be counted
      // as a server error and the error-rate alert would fire on nothing.
      expect(statusFromException(new NotFoundException('nope'), 500)).toBe(404);
    });
  });

  it('correlates the response with the request so an operator can trace it', () => {
    const host = buildHost({ method: 'PATCH', url: '/api/v1/users/1' });
    filter.catch(new Error('column "password_hash" does not exist'), host);

    const body = bodyOf(host);
    expect(body.path).toBe('/api/v1/users/1');
    expect(body.statusCode).toBe(500);
    expect(body.correlationId).toBeUndefined();
  });
});
