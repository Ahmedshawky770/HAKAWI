import { describe, it, expect, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  it('should be defined', () => {
    const service = new NotificationsService();
    expect(service).toBeDefined();
  });
});
