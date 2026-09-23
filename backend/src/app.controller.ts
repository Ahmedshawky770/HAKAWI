import { Controller, Get, Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { AppService } from './app.service.ts';
import { db } from './db/index.ts';
import { ValkeyService } from './common/services/valkey.service.ts';

@Controller()
@Injectable()
export class AppController {
  constructor(
    @Inject(AppService) private readonly appService: AppService,
    private readonly valkeyService: ValkeyService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    const dbHealthy = await this.checkDatabase();
    const valkeyHealthy = await this.checkValkey();

    return {
      status: dbHealthy && valkeyHealthy ? 'healthy' : 'degraded',
      database: dbHealthy ? 'connected' : 'disconnected',
      valkey: valkeyHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await db.execute(sql.raw('SELECT 1'));
      return true;
    } catch {
      return false;
    }
  }

  private async checkValkey(): Promise<boolean> {
    try {
      await this.valkeyService.ping();
      return true;
    } catch {
      return false;
    }
  }
}
