import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import type { IWithdrawalsRepository, UpdateWithdrawalData } from '../interfaces/withdrawals-repository.interface.js';
import { WITHDRAWALS_REPOSITORY } from '../interfaces/withdrawals-repository.interface.js';
import { WithdrawalsRepository } from '../repositories/withdrawals.repository.js';
import { CreateWithdrawalDto } from '../dto/withdrawals.dto.js';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    @Inject(WITHDRAWALS_REPOSITORY) private readonly withdrawalsRepository: WithdrawalsRepository,
  ) {}

  async findById(id: string): Promise<unknown> {
    const withdrawal = await this.withdrawalsRepository.findById(id);
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }
    return withdrawal;
  }

  async findByUserId(userId: string): Promise<unknown[]> {
    return this.withdrawalsRepository.findByUserId(userId);
  }

  async create(userId: string, data: CreateWithdrawalDto): Promise<unknown> {
    if (data.amount < 100) {
      throw new BadRequestException('Minimum withdrawal amount is 100 EGP');
    }
    return this.withdrawalsRepository.create({ ...data, userId, status: 'pending' });
  }

  async update(id: string, data: Partial<UpdateWithdrawalData>): Promise<unknown> {
    return this.withdrawalsRepository.update(id, data);
  }
}
