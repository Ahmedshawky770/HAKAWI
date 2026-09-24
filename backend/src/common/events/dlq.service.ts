import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';

import { ValkeyService } from '../services/valkey.service.ts';

export interface DLQEvent {
  id: string;
  eventName: string;
  payload: unknown;
  error: string;
  timestamp: Date;
  retryCount: number;
}

const DLQ_PREFIX = 'dlq:';
const DLQ_INDEX_KEY = 'dlq:index';
const DLQ_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class DLQService {
  private readonly logger = new Logger(DLQService.name);

  constructor(private readonly valkeyService: ValkeyService) {}

  async add(event: Omit<DLQEvent, 'id'>): Promise<string> {
    const id = createId();
    const dlqEvent: DLQEvent = {
      ...event,
      id,
    };

    const value = JSON.stringify(dlqEvent);
    await this.valkeyService.set(`${DLQ_PREFIX}${id}`, value, DLQ_TTL_SECONDS);
    await this.valkeyService.sadd(DLQ_INDEX_KEY, id);

    this.logger.warn(`Event sent to DLQ: ${event.eventName} (${id}) - ${event.error}`);
    return id;
  }

  async get(id: string): Promise<DLQEvent | null> {
    const value = await this.valkeyService.get(`${DLQ_PREFIX}${id}`);
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value) as DLQEvent;
    parsed.timestamp = new Date(parsed.timestamp);
    return parsed;
  }

  async retry(id: string): Promise<void> {
    const value = await this.valkeyService.get(`${DLQ_PREFIX}${id}`);
    if (!value) {
      return;
    }

    const dlqEvent = JSON.parse(value) as DLQEvent;
    dlqEvent.retryCount += 1;
    dlqEvent.timestamp = new Date(dlqEvent.timestamp);
    const updatedValue = JSON.stringify(dlqEvent);
    await this.valkeyService.set(`${DLQ_PREFIX}${id}`, updatedValue, DLQ_TTL_SECONDS);
    await this.valkeyService.sadd(DLQ_INDEX_KEY, id);
  }

  async delete(id: string): Promise<void> {
    await this.valkeyService.del(`${DLQ_PREFIX}${id}`);
    await this.valkeyService.srem(DLQ_INDEX_KEY, id);
  }

  async list(): Promise<DLQEvent[]> {
    const ids = await this.valkeyService.smembers(DLQ_INDEX_KEY);
    const events: DLQEvent[] = [];

    for (const id of ids) {
      const event = await this.get(id);
      if (event) {
        events.push(event);
      }
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async clear(): Promise<void> {
    const ids = await this.valkeyService.smembers(DLQ_INDEX_KEY);
    for (const id of ids) {
      await this.valkeyService.del(`${DLQ_PREFIX}${id}`);
    }
    await this.valkeyService.del(DLQ_INDEX_KEY);
    this.logger.log('DLQ cleared');
  }

  async getStats(): Promise<{ total: number; byEvent: Record<string, number> }> {
    const events = await this.list();
    const byEvent: Record<string, number> = {};
    for (const event of events) {
      byEvent[event.eventName] = (byEvent[event.eventName] || 0) + 1;
    }
    return {
      total: events.length,
      byEvent,
    };
  }
}
