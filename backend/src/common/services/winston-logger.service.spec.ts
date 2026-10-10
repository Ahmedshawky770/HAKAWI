import { Writable } from 'stream';

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import * as winston from 'winston';

import { WinstonLoggerService } from './winston-logger.service.ts';

const MESSAGE = Symbol.for('message');
const LEVEL = Symbol.for('level');
const ESC = String.fromCharCode(27);
const TIMESTAMP = '2026-01-02 03:04:05';
const ANSI_PATTERN = new RegExp(ESC + String.raw`\[\d+m`, 'g');

type TransformableInfo = winston.Logform.TransformableInfo;

type LoggerInternals = { logger: winston.Logger };

function internals(service: WinstonLoggerService): winston.Logger {
  return (service as unknown as LoggerInternals).logger;
}

type ConsoleInfoInput = {
  level: string;
  message: string;
  context?: string;
  stack?: string;
  timestamp?: string;
};

function consoleInfo(input: ConsoleInfoInput): TransformableInfo {
  const info: TransformableInfo = {
    [LEVEL]: input.level,
    level: input.level,
    message: input.message,
  };
  if (input.context !== undefined) {
    info.context = input.context;
  }
  if (input.stack !== undefined) {
    info.stack = input.stack;
  }
  if (input.timestamp !== undefined) {
    info.timestamp = input.timestamp;
  }
  return info;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function renderWithTransportFormat(format: winston.Logform.Format, info: TransformableInfo): string {
  const transformed = format.transform(info, format.options);
  if (typeof transformed === 'boolean' || transformed === null) {
    throw new Error('the console format did not return an info object');
  }
  return String(transformed[MESSAGE] ?? '');
}

describe('WinstonLoggerService', () => {
  let service: WinstonLoggerService;
  let logger: winston.Logger;
  let lines: string[];
  let consoleFormat: winston.Logform.Format;

  function emit(level: keyof winston.Logger, message: string, ...meta: unknown[]): void {
    const method = logger[level] as unknown as (message: string, ...rest: unknown[]) => winston.Logger;
    method.call(logger, message, ...meta);
  }

  beforeEach(() => {
    lines = [];
    service = new WinstonLoggerService();
    logger = internals(service);
    consoleFormat = logger.transports[0]?.format ?? winston.format.json();
    logger.clear();
    logger.add(
      new winston.transports.Stream({
        eol: '',
        stream: new Writable({
          write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
            lines.push(String(chunk));
            callback();
          },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('level forwarding', () => {
    it('should route info to the winston info level', () => {
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

      service.info('hello world');

      expect(infoSpy).toHaveBeenCalledWith('hello world', { context: undefined });
    });

    it('should route log to the same winston info level', () => {
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

      service.log('aliased message', 'AuthService');

      expect(infoSpy).toHaveBeenCalledWith('aliased message', { context: 'AuthService' });
    });

    it('should route warn to the winston warn level with the context', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

      service.warn('careful', 'WafService');

      expect(warnSpy).toHaveBeenCalledWith('careful', { context: 'WafService' });
    });

    it('should route error to the winston error level with the trace and context', () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

      service.error('boom', 'Error: boom\n    at handler', 'ModerationService');

      expect(errorSpy).toHaveBeenCalledWith('boom', {
        context: 'ModerationService',
        stack: 'Error: boom\n    at handler',
      });
    });

    it('should send an error with no trace as an undefined stack', () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

      service.error('bare error');

      expect(errorSpy).toHaveBeenCalledWith('bare error', { context: undefined, stack: undefined });
    });

    it('should route debug to the winston debug level', () => {
      const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);

      service.debug('details', 'DebugService');

      expect(debugSpy).toHaveBeenCalledWith('details', { context: 'DebugService' });
    });

    it('should route verbose to the winston verbose level', () => {
      const verboseSpy = vi.spyOn(logger, 'verbose').mockImplementation(() => logger);

      service.verbose('chatty', 'VerboseService');

      expect(verboseSpy).toHaveBeenCalledWith('chatty', { context: 'VerboseService' });
    });
  });

  describe('rendered output', () => {
    beforeEach(() => {
      logger.level = 'verbose';
    });

    it('should render timestamp, level and message', () => {
      service.info('rendered message');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} INFO {2}rendered message$/);
    });

    it('should wrap the context in square brackets when one is given', () => {
      service.warn('with context', 'ModerationService');

      expect(lines[0]).toContain('WARN [ModerationService] with context');
    });

    it('should leave the context slot empty when no context is given', () => {
      service.info('no context');

      expect(lines[0]).not.toContain('undefined');
      expect(lines[0]).not.toContain('[]');
      expect(lines[0]).toMatch(/ {2}no context$/);
    });

    it('should append the stack on its own line for an error with a trace', () => {
      service.error('failed to verify', 'TypeError: bad token\n    at verify', 'JwtHelper');

      expect(lines[0]).toContain('ERROR [JwtHelper] failed to verify');
      expect(lines[0]).toContain('\nTypeError: bad token');
      expect(lines[0]).toContain('at verify');
    });

    it('should not append a stack line for an error without a trace', () => {
      service.error('no trace here');

      expect(lines[0]).not.toContain('\n');
      expect(lines[0]).toContain('ERROR  no trace here');
    });

    it('should uppercase the level for warn, debug and verbose', () => {
      service.warn('w');
      service.debug('d');
      service.verbose('v');

      expect(lines[0]).toContain(' WARN ');
      expect(lines[1]).toContain(' DEBUG ');
      expect(lines[2]).toContain(' VERBOSE ');
    });

    it('should keep every call as its own line', () => {
      service.info('one');
      service.info('two');
      service.info('three');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('one');
      expect(lines[1]).toContain('two');
      expect(lines[2]).toContain('three');
    });

    it('should string-coerce a non-string message instead of dropping it', () => {
      emit('info', 12345 as unknown as string);

      expect(lines[0]).toContain('12345');
    });

    it('should ignore a non-string context rather than printing undefined', () => {
      emit('info', 'numeric context', { context: 99 });

      expect(lines[0]).not.toContain('undefined');
      expect(lines[0]).not.toContain('99');
      expect(lines[0]).toContain('numeric context');
    });
  });

  describe('shipped log level', () => {
    it('should default the winston level to info', () => {
      expect(logger.level).toBe('info');
    });

    it('should emit error, warn and info', () => {
      service.error('e');
      service.warn('w');
      service.info('i');

      expect(lines).toHaveLength(3);
    });

    it('should silently drop debug output at the shipped level', () => {
      service.debug('never rendered');

      expect(lines).toEqual([]);
    });

    it('should silently drop verbose output at the shipped level', () => {
      service.verbose('never rendered either');

      expect(lines).toEqual([]);
    });

    it('should still render debug output once the level is lowered', () => {
      logger.level = 'verbose';
      service.debug('now rendered');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('now rendered');
    });
  });

  describe('console transport format', () => {
    it('should colourise the level and render the context', () => {
      const rendered = renderWithTransportFormat(
        consoleFormat,
        consoleInfo({ level: 'info', message: 'console line', context: 'AuthService', timestamp: TIMESTAMP }),
      );

      expect(rendered).toContain('info');
      expect(rendered).not.toContain('INFO');
      expect(stripAnsi(rendered)).toBe(`${TIMESTAMP} info [AuthService] console line`);
    });

    it('should wrap the level in ANSI colour codes', () => {
      const rendered = renderWithTransportFormat(
        consoleFormat,
        consoleInfo({ level: 'error', message: 'coloured', timestamp: TIMESTAMP }),
      );

      expect(rendered).toContain(ESC + '[31m');
      expect(rendered).toContain(ESC + '[39m');
    });

    it('should leave the context slot empty when none was supplied', () => {
      const rendered = renderWithTransportFormat(
        consoleFormat,
        consoleInfo({ level: 'error', message: 'no ctx', timestamp: TIMESTAMP }),
      );

      expect(rendered).toContain('no ctx');
      expect(rendered).not.toContain('undefined');
      expect(stripAnsi(rendered)).toBe(`${TIMESTAMP} error  no ctx`);
    });

    it('should render every level the service uses', () => {
      for (const level of ['error', 'warn', 'info', 'debug', 'verbose'] as const) {
        const rendered = renderWithTransportFormat(
          consoleFormat,
          consoleInfo({ level, message: `msg-${level}`, timestamp: TIMESTAMP }),
        );
        expect(rendered).toContain(`msg-${level}`);
      }
    });

    it('should stringify a missing timestamp rather than dropping the field', () => {
      const rendered = renderWithTransportFormat(
        consoleFormat,
        consoleInfo({ level: 'info', message: 'no timestamp' }),
      );

      expect(rendered).toContain('msg-no timestamp'.replace('msg-', ''));
      expect(rendered.startsWith('undefined ')).toBe(true);
    });

    it('should not render a stack line, because the console format omits it', () => {
      const rendered = renderWithTransportFormat(
        consoleFormat,
        consoleInfo({ level: 'error', message: 'with stack', stack: 'Error: nope', timestamp: TIMESTAMP }),
      );

      expect(rendered).toContain('with stack');
      expect(rendered).not.toContain('Error: nope');
    });
  });

  describe('error object metadata', () => {
    beforeEach(() => {
      logger.level = 'verbose';
    });

    it('should surface the stack of an Error handed to the logger', () => {
      const infoSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

      service.error('wrapped failure', 'at line 1', 'UploadService');

      expect(infoSpy).toHaveBeenCalledWith('wrapped failure', {
        context: 'UploadService',
        stack: 'at line 1',
      });
    });

    it('should never throw when a message is an empty string', () => {
      expect(() => service.error('', '', '')).not.toThrow();
      expect(lines[0]).toContain('ERROR');
    });
  });

  describe('isolated instances', () => {
    it('should give each service its own winston logger', () => {
      const first = new WinstonLoggerService();
      const second = new WinstonLoggerService();

      expect(internals(first)).not.toBe(internals(second));
    });

    it('should keep one service instance usable for repeated calls', () => {
      logger.level = 'verbose';
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

      service.info('a');
      service.info('b');

      const mock: Mock = infoSpy;
      expect(mock).toHaveBeenCalledTimes(2);
    });
  });
});
