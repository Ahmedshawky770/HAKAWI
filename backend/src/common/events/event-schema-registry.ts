import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { EVENT_SCHEMAS } from './event-schemas.ts';
import type { DLQService } from './dlq.service.ts';

export interface ValidationResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

@Injectable()
export class EventSchemaRegistry {
  private readonly schemas: Map<string, { schema: z.ZodSchema; version: string }> = new Map();
  private readonly defaultVersions: Map<string, string> = new Map();

  constructor(private readonly dlqService?: DLQService) {
    for (const [eventName, { schema, version }] of Object.entries(EVENT_SCHEMAS)) {
      this.registerSchema(eventName, schema, version);
    }
  }

  registerSchema(eventName: string, schema: z.ZodSchema, version = 'v1'): void {
    const key = `${eventName}:${version}`;
    this.schemas.set(key, { schema, version });
    this.defaultVersions.set(eventName, version);
  }

  validateEvent(eventName: string, payload: unknown, version?: string): ValidationResult {
    const resolvedVersion = version ?? this.defaultVersions.get(eventName) ?? 'v1';
    const key = `${eventName}:${resolvedVersion}`;
    const entry = this.schemas.get(key);

    if (!entry) {
      const error = `No schema registered for event ${eventName} with version ${resolvedVersion}`;
      return { success: false, error };
    }

    const result = entry.schema.safeParse(payload);
    if (result.success) {
      return { success: true, data: result.data };
    }

    const error = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { success: false, error };
  }

  async sendToDLQ(eventName: string, payload: unknown, error: string): Promise<void> {
    if (!this.dlqService) {
      return;
    }
    await this.dlqService.add({
      eventName,
      payload,
      error,
      timestamp: new Date(),
      retryCount: 0,
    });
  }

  async retryDLQ(eventId: string): Promise<boolean> {
    if (!this.dlqService) {
      return false;
    }
    const dlqEvent = await this.dlqService.get(eventId);
    if (!dlqEvent) {
      return false;
    }

    const result = this.validateEvent(dlqEvent.eventName, dlqEvent.payload);
    if (result.success) {
      await this.dlqService.delete(eventId);
      return true;
    }

    await this.dlqService.retry(eventId);
    return false;
  }

  async getDLQStats(): Promise<{ total: number; events: Array<{ id: string; eventName: string; error: string; retryCount: number }> }> {
    if (!this.dlqService) {
      return { total: 0, events: [] };
    }
    const events = await this.dlqService.list();
    return {
      total: events.length,
      events: events.map((e) => ({ id: e.id, eventName: e.eventName, error: e.error, retryCount: e.retryCount })),
    };
  }
}
