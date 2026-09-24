import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WafMiddleware } from './waf.middleware';
import { WinstonLoggerService } from '../services/winston-logger.service';

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

describe('WafMiddleware', () => {
  let middleware: WafMiddleware;
  let logger: MockWinstonLoggerService;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    middleware = new WafMiddleware(logger as unknown as WinstonLoggerService);

    mockRequest = {
      url: '/api/v1/test',
      body: {},
      query: {},
      ip: '127.0.0.1',
      method: 'GET',
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('clean requests', () => {
    it('should pass clean GET requests through', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should pass clean POST requests with body through', () => {
      mockRequest.body = { name: 'Test', email: 'test@example.com' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should pass requests with query parameters through', () => {
      mockRequest.query = { page: '1', limit: '10' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('SQL injection protection', () => {
    it('should block SQL injection in URL', () => {
      mockRequest.url = "/api/v1/search?q=' OR '1'='1";
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 403,
        message: 'Forbidden',
        error: 'Suspicious request blocked',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block SQL injection in body', () => {
      mockRequest.body = { username: "admin' OR '1'='1", password: 'test' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block SQL injection with comments', () => {
      mockRequest.url = '/api/v1/users?id=1--';
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block SQL injection with hash comments', () => {
      mockRequest.url = '/api/v1/users?id=1#';
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('XSS protection', () => {
    it('should block XSS in URL', () => {
      mockRequest.url = '/api/v1/search?q=<script>alert(1)</script>';
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block XSS in body', () => {
      mockRequest.body = { content: '<script>alert("xss")</script>' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block encoded script tags', () => {
      mockRequest.url = '/api/v1/search?q=%3Cscript%3Ealert(1)%3C/script%3E';
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('path traversal protection', () => {
    it('should block path traversal with forward slashes', () => {
      mockRequest.url = '/api/v1/files/../../../etc/passwd';
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block path traversal with encoded slashes', () => {
      mockRequest.url = '/api/v1/files/..%2F..%2Fetc%2Fpasswd';
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block path traversal with backslashes', () => {
      mockRequest.url = '/api/v1/files/..\\..\\windows\\system32';
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block path traversal with encoded backslashes', () => {
      mockRequest.url = '/api/v1/files/..%5C..%5Cwindows%5Csystem32';
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('command injection protection', () => {
    it('should block eval in request', () => {
      mockRequest.body = { input: 'test; eval("malicious")' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block exec in request', () => {
      mockRequest.body = { cmd: 'exec("rm -rf /")' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block system in request', () => {
      mockRequest.body = { cmd: 'system("ls")' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block shell_exec in request', () => {
      mockRequest.body = { cmd: 'shell_exec("whoami")' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block passthru in request', () => {
      mockRequest.body = { cmd: 'passthru("id")' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block popen in request', () => {
      mockRequest.body = { cmd: 'popen("cat /etc/passwd")' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block proc_open in request', () => {
      mockRequest.body = { cmd: 'proc_open("ls", $descriptors, $pipes)' };
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('should log suspicious requests', () => {
      mockRequest.url = "/api/v1/search?q=' OR '1'='1";
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Blocked suspicious request'),
        'WafMiddleware',
      );
    });
  });
});
