import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import type { ITransactionsRepository, Transaction, CreateTransactionData } from '../interfaces/transactions-repository.interface.js';
import { TRANSACTIONS_REPOSITORY } from '../interfaces/transactions-repository.interface.js';
import { TransactionsRepository } from '../repositories/transactions.repository.js';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactionsRepository: TransactionsRepository,
  ) {}

  async findById(id: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findById(id);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async findByPaymentId(paymentId: string): Promise<Transaction[]> {
    return this.transactionsRepository.findByPaymentId(paymentId);
  }

  async findByUserId(userId: string): Promise<Transaction[]> {
    return this.transactionsRepository.findByUserId(userId);
  }

  async create(data: CreateTransactionData): Promise<Transaction> {
    return this.transactionsRepository.create(data);
  }
}
