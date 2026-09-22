import { describe, it, expect, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

describe('PaymentsService', () => {
  it('should be defined', () => {
    const service = new PaymentsService();
    expect(service).toBeDefined();
  });
});
