import { describe, it, expect, vi } from 'vitest';
import { MessageReadReceiptsService } from './message-read-receipts.service.js';

describe('MessageReadReceiptsService', () => {
  it('should be defined', () => {
    const service = new MessageReadReceiptsService();
    expect(service).toBeDefined();
  });
});
