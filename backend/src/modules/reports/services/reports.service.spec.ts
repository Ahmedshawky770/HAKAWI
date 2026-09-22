import { describe, it, expect, vi } from 'vitest';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  it('should be defined', () => {
    const service = new ReportsService();
    expect(service).toBeDefined();
  });
});
