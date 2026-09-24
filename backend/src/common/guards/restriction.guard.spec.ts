import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { RestrictionGuard } from './restriction.guard.ts';

describe('RestrictionGuard', () => {
  let guard: RestrictionGuard;
  let mockValkeyService: { exists: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let mockContext: { switchToHttp: () => { getRequest: () => { user: { sub: string } } } };

  beforeEach(() => {
    mockValkeyService = {
      exists: vi.fn(),
      get: vi.fn(),
    };

    guard = new RestrictionGuard(mockValkeyService as unknown as ValkeyService);

    mockContext = {
      switchToHttp: vi.fn(() => ({
        getRequest: vi.fn(),
      })),
    };
  });

  describe('canActivate', () => {
    it('should return true when user has no restrictions', async () => {
      const req = { user: { sub: 'user-1' } };
      mockContext.switchToHttp = vi.fn(() => ({
        getRequest: vi.fn(() => req),
      }));

      mockValkeyService.exists.mockResolvedValue(false);

      const result = await guard.canActivate(mockContext as unknown as ExecutionContext);
      expect(result).toBe(true);
      expect(mockValkeyService.exists).toHaveBeenCalledWith('restriction:user-1');
    });

    it('should throw ForbiddenException when user has active restriction', async () => {
      const req = { user: { sub: 'user-1' } };
      mockContext.switchToHttp = vi.fn(() => ({
        getRequest: vi.fn(() => req),
      }));

      mockValkeyService.exists.mockResolvedValue(true);
      mockValkeyService.get.mockResolvedValue('ban');

      await expect(guard.canActivate(mockContext as unknown as ExecutionContext)).rejects.toThrow(ForbiddenException);
    });

    it('should return true when user is null', async () => {
      const req = { user: null };
      mockContext.switchToHttp = vi.fn(() => ({
        getRequest: vi.fn(() => req),
      }));

      const result = await guard.canActivate(mockContext as unknown as ExecutionContext);
      expect(result).toBe(true);
    });

    it('should return true when user has no sub', async () => {
      const req = { user: {} };
      mockContext.switchToHttp = vi.fn(() => ({
        getRequest: vi.fn(() => req),
      }));

      const result = await guard.canActivate(mockContext as unknown as ExecutionContext);
      expect(result).toBe(true);
    });

    it('should handle mute restriction correctly', async () => {
      const req = { user: { sub: 'user-1' } };
      mockContext.switchToHttp = vi.fn(() => ({
        getRequest: vi.fn(() => req),
      }));

      mockValkeyService.exists.mockResolvedValue(true);
      mockValkeyService.get.mockResolvedValue('mute');

      await expect(guard.canActivate(mockContext as unknown as ExecutionContext)).rejects.toThrow(ForbiddenException);
    });
  });
});
