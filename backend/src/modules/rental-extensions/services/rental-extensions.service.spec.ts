import { describe, it, expect, vi } from 'vitest';
import { RentalExtensionsService } from './rental-extensions.service.js';

describe('RentalExtensionsService', () => {
  it('should be defined', () => {
    const service = new RentalExtensionsService();
    expect(service).toBeDefined();
  });
});
