import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WithdrawalsService } from './withdrawals.service.js';
import type { WithdrawalsRepository } from '../repositories/withdrawals.repository.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { CreateWithdrawalDto } from '../dto/withdrawals.dto.js';

type MockWithdrawalsRepository = Partial<WithdrawalsRepository>;

const createMockWithdrawal = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'withdrawal-123',
  userId: 'user-123',
  amount: 100,
  currency: 'EGP',
  status: 'pending',
  bankAccount: '****1234',
  notes: null,
  processedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('WithdrawalsService', () => {
  let withdrawalsService: WithdrawalsService;
  let withdrawalsRepository: MockWithdrawalsRepository;

  beforeEach(() => {
    withdrawalsRepository = {
      findById: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    withdrawalsService = new WithdrawalsService(
      withdrawalsRepository as WithdrawalsRepository,
    );
  });

  describe('findById', () => {
    it('should return withdrawal when found', async () => {
      const withdrawal = createMockWithdrawal();
      vi.mocked(withdrawalsRepository.findById).mockResolvedValue(withdrawal as any);

      const result = await withdrawalsService.findById('withdrawal-123');

      expect(result).toEqual(withdrawal);
    });

    it('should throw NotFoundException when withdrawal not found', async () => {
      vi.mocked(withdrawalsRepository.findById).mockResolvedValue(null);

      await expect(withdrawalsService.findById('withdrawal-123')).rejects.toThrow('Withdrawal not found');
    });
  });

  describe('findByUserId', () => {
    it('should return withdrawals by user', async () => {
      const withdrawals = [createMockWithdrawal()];
      vi.mocked(withdrawalsRepository.findByUserId).mockResolvedValue(withdrawals as any);

      const result = await withdrawalsService.findByUserId('user-123');

      expect(result).toEqual(withdrawals);
    });
  });

  describe('create', () => {
    it('should create withdrawal when amount >= 100', async () => {
      const withdrawal = createMockWithdrawal();
      const data: CreateWithdrawalDto = {
        amount: 100,
        currency: 'EGP',
        bankAccount: '****1234',
      };
      vi.mocked(withdrawalsRepository.create).mockResolvedValue(withdrawal as any);

      const result = await withdrawalsService.create('user-123', data);

      expect(result).toEqual(withdrawal);
    });

    it('should throw BadRequestException when amount < 100', async () => {
      const data: CreateWithdrawalDto = {
        amount: 50,
        currency: 'EGP',
        bankAccount: '****1234',
      };

      await expect(withdrawalsService.create('user-123', data)).rejects.toThrow('Minimum withdrawal amount is 100 EGP');
    });
  });

  describe('update', () => {
    it('should update withdrawal', async () => {
      const updatedWithdrawal = createMockWithdrawal({ status: 'completed' });
      vi.mocked(withdrawalsRepository.findById).mockResolvedValue(createMockWithdrawal() as any);
      vi.mocked(withdrawalsRepository.update).mockResolvedValue(updatedWithdrawal as any);

      const result = await withdrawalsService.update('withdrawal-123', { status: 'completed' } as any);

      expect(result).toEqual(updatedWithdrawal);
    });
  });
});
