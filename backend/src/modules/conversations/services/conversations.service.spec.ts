import { describe, it, expect, vi } from 'vitest';
import { ConversationsService } from './conversations.service.js';

describe('ConversationsService', () => {
  it('should be defined', () => {
    const service = new ConversationsService();
    expect(service).toBeDefined();
  });
});
