import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import type { IRefundsRepository, CreateRefundData } from '../interfaces/refunds-repository.interface.js';
import { REFUNDS_REPOSITORY } from '../interfaces/refunds-repository.interface.js';
import { RefundsRepository } from '../repositories/refunds.repository.js';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @Inject(REFUNDS_REPOSITORY) private readonly refundsRepository: RefundsRepository,
  ) {}

  async findById(id: string): Promise<CreateRefundData> {
    const refund = await this.refundsRepository.findById(id);
    if (!refund) {
      throw new NotFoundException('Refund not found');
    }
    return refund;
  }

  async findByPaymentId(paymentId: string): Promise<CreateRefundData | null> {
    return this.refundsRepository.findByPaymentId(paymentId);
  }

  async findByRefundedBy(refundedBy: string): Promise<CreateRefundData[]> {
    return this.refundsRepository.findByRefundedBy(refundedBy);
  }

  async create(data: CreateRefundData): Promise<CreateRefundData> {
    return this.refundsRepository.create(data);
  }
}
