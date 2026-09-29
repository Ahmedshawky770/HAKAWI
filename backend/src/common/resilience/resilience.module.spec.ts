import { describe, it, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';

import { ResilienceModule } from './resilience.module.ts';

describe('ResilienceModule', () => {
  it('should compile', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ResilienceModule],
    }).compile();

    expect(module).toBeDefined();
    expect(module.get(ResilienceModule)).toBeDefined();
  });
});
