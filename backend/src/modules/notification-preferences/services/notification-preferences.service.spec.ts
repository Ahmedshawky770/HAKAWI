import { describe, it, expect, vi } from 'vitest';
import { NotificationPreferencesService } from './notification-preferences.service.js';

describe('NotificationPreferencesService', () => {
  it('should be defined', () => {
    const service = new NotificationPreferencesService();
    expect(service).toBeDefined();
  });
});
