import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IPrizeTransactionsRepository, CreatePrizeTransactionData, UpdatePrizeTransactionData } from '../interfaces/prize-transactions-repository.interface.js';
import { PRIZE_TRANSACTIONS_REPOSITORY } from '../interfaces/prize-transactions-repository.interface.js';
import { PrizeTransactionsRepository } from '../repositories/prize-transactions.repository.js';

@Injectable()
export class PrizeTransactionsService {
  private readonly logger = new Logger(PrizeTransactionsService.name);

  constructor(
    @Inject(PRIZE_TRANSACTIONS_REPOSITORY) private readonly transactionsRepository: PrizeTransactionsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<CreatePrizeTransactionData> {
    const transaction = await this.transactionsRepository.findById(id);
    if (!transaction) {
      throw new NotFoundException('Prize transaction not found');
    }
    return transaction;
  }

  async findByContestId(contestId: string): Promise<CreatePrizeTransactionData[]> {
    return this.transactionsRepository.findByContestId(contestId);
  }

  async findByUserId(userId: string): Promise<CreatePrizeTransactionData[]> {
    return this.transactionsRepository.findByUserId(userId);
  }

  async create(data: CreatePrizeTransactionData): Promise<CreatePrizeTransactionData> {
    return this.transactionsRepository.create(data);
  }

  async update(id: string, data: Partial<UpdatePrizeTransactionData>): Promise<CreatePrizeTransactionData> {
    return this.transactionsRepository.update(id, data);
  }
}
