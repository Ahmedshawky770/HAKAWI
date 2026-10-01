import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import paymobConfig, { PAYMOB_CONFIG, type PaymobConfig } from '../../config/paymob.config.ts';

import { PaymentsService } from './payments.service.ts';
import { PaymentsController } from './controllers/payments.controller.ts';
import { PaymentsRepository } from './repositories/payments.repository.ts';
import { PAYMENTS_REPOSITORY } from './interfaces/payments-repository.interface.ts';
import { PaymentsEventHandler } from './events/payments.event-handler.ts';
import { PaymobClient, PAYMOB_CLIENT } from './clients/paymob.client.ts';

@Module({
  imports: [CommonModule, DatabaseModule, ConfigModule.forFeature(paymobConfig)],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    PaymentsEventHandler,
    PaymobClient,
    { provide: PAYMENTS_REPOSITORY, useExisting: PaymentsRepository },
    {
      provide: PAYMOB_CLIENT,
      useExisting: PaymobClient,
    },
    {
      provide: PAYMOB_CONFIG,
      useFactory: (configService: ConfigService): PaymobConfig => {
        const config = configService.get<PaymobConfig>('paymob');
        if (config === undefined) {
          throw new Error('Paymob configuration is not registered under the "paymob" config namespace');
        }
        return config;
      },
      inject: [ConfigService],
    },
  ],
  exports: [PaymentsService, PaymobClient],
})
export class PaymentsModule {}
