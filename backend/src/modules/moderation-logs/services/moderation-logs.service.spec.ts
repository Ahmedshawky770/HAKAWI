import { describe, it, expect, vi } from 'vitest';
import { ModerationLogsService } from './moderation-logs.service.js';

describe('ModerationLogsService', () => {
  it('should be defined', () => {
    const service = new ModerationLogsService();
    expect(service).toBeDefined();
  });
});
