import { describe, it, expect, vi } from 'vitest';
import { MessagesService } from './messages.service.js';

describe('MessagesService', () => {
  it('should be defined', () => {
    const service = new MessagesService();
    expect(service).toBeDefined();
  });
});
