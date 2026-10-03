import { Injectable, Inject } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { comments } from '../../../db/schema/social.schema.ts';
import { stories } from '../../../db/schema/stories.schema.ts';
import { reports } from '../../../db/schema/moderation.schema.ts';
import { db } from '../../../db/index.ts';

import type { ContentModerationTargetType, RuleViolation } from './rules.config.ts';
import { CONTENT_MODERATION_RULES, evaluateContent, rulesForTarget } from './rules.config.ts';

export const AUTO_REPORT_SYSTEM_MARKER = 'Content moderation';
export const AUTO_REPORT_SOURCE = 'auto';

export interface AutoReportInput {
  readonly targetId: string;
  readonly targetType: ContentModerationTargetType;
  readonly violation: RuleViolation;
}

export interface AutoReportOutcome {
  readonly filed: boolean;
  readonly reason: string;
  readonly violation: RuleViolation;
}

interface ReviewableContent {
  readonly id: string;
  readonly text: string;
}

/**
 * Fills the Phase 2 "content moderation hooks" gap. Stories and comments arrive
 * as events, are evaluated against the data-driven rule set, and a report is
 * filed for every rule they trip. High-severity hits escalate the whole target
 * immediately instead of waiting for the sweep.
 */
@Injectable()
export class ContentModerationService {
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async reviewStory(storyId: string): Promise<AutoReportOutcome[]> {
    const content = await this.loadStoryContent(storyId);
    if (!content) {
      return [];
    }
    return this.review('story', content);
  }

  async reviewComment(commentId: string): Promise<AutoReportOutcome[]> {
    const content = await this.loadCommentContent(commentId);
    if (!content) {
      return [];
    }
    return this.review('comment', content);
  }

  private async review(
    targetType: ContentModerationTargetType,
    content: ReviewableContent,
  ): Promise<AutoReportOutcome[]> {
    const violations = evaluateContent(targetType, content.text, rulesForTarget(targetType));
    if (violations.length === 0) {
      return [];
    }

    const outcomes: AutoReportOutcome[] = [];
    for (const violation of violations) {
      outcomes.push(await this.fileReport({ targetId: content.id, targetType, violation }));
    }

    this.logger.warn(
      `Auto-moderation flagged ${content.id} (${targetType}) for ${violations.length} rule(s): ${violations
        .map((violation) => violation.ruleId)
        .join(', ')}`,
      'ContentModerationService',
    );

    return outcomes;
  }

  private async fileReport(input: AutoReportInput): Promise<AutoReportOutcome> {
    const { targetId, targetType, violation } = input;

    const alreadyFiled = await db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.targetId, targetId),
          eq(reports.reason, violation.reason),
          sql`${reports.createdAt} > ${new Date(Date.now() - AUTO_REPORT_DEDUPE_WINDOW_MS)}`,
        ),
      )
      .limit(1);

    if (alreadyFiled.length > 0) {
      return { filed: false, reason: 'duplicate', violation };
    }

    const [report] = await db
      .insert(reports)
      .values({
        reporterId: null,
        targetId,
        targetType,
        reason: violation.reason,
        description: `${AUTO_REPORT_SYSTEM_MARKER}: ${violation.detail}`,
        status: 'open',
        source: AUTO_REPORT_SOURCE,
      })
      .returning();

    await this.eventBus.emit('moderation.report.created', {
      reportId: report.id,
      reporterId: null,
      targetId,
      targetType,
      reason: violation.reason,
      source: AUTO_REPORT_SOURCE,
    });

    if (violation.autoEscalate) {
      await this.escalate(targetId);
    }

    return { filed: true, reason: violation.reason, violation };
  }

  /**
   * Escalates every open report against a target and announces each one it actually moved.
   *
   * Two statements, deliberately. The SELECT is what makes the audit trail truthful: the
   * UPDATE's `RETURNING` can only report the new `status` and `updated_at`, so without the
   * read there is no honest `previousStatus` / `previousUpdatedAt` to publish. The UPDATE
   * re-asserts `status = 'open'` and returns the rows it changed, so a report an admin
   * resolved in the gap between the two statements is left alone and produces no event.
   */
  private async escalate(targetId: string): Promise<number> {
    const open = await db
      .select({ id: reports.id, status: reports.status, updatedAt: reports.updatedAt })
      .from(reports)
      .where(and(eq(reports.targetId, targetId), eq(reports.status, 'open')))
      .orderBy(reports.createdAt);

    if (open.length === 0) {
      return 0;
    }

    const now = new Date();
    const escalated = await db
      .update(reports)
      .set({ status: 'escalated', escalatedAt: now, updatedAt: now })
      .where(and(eq(reports.targetId, targetId), eq(reports.status, 'open')))
      .returning({ id: reports.id });

    const escalatedIds = new Set(escalated.map((row) => row.id));
    for (const report of open) {
      if (!escalatedIds.has(report.id)) {
        continue;
      }
      await this.eventBus.emit('moderation.report.escalated', {
        reportId: report.id,
        targetId,
        previousStatus: report.status,
        previousUpdatedAt: report.updatedAt,
      });
    }

    return escalatedIds.size;
  }

  private async loadStoryContent(storyId: string): Promise<ReviewableContent | null> {
    const [story] = await db
      .select({ id: stories.id, title: stories.title, excerpt: stories.excerpt, content: stories.content })
      .from(stories)
      .where(and(eq(stories.id, storyId), isNull(stories.deletedAt)))
      .limit(1);
    if (!story) {
      return null;
    }
    return {
      id: story.id,
      text: [story.title, story.excerpt, story.content]
        .filter((part): part is string => typeof part === 'string')
        .join('\n'),
    };
  }

  private async loadCommentContent(commentId: string): Promise<ReviewableContent | null> {
    const [comment] = await db
      .select({ id: comments.id, content: comments.content })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.isDeleted, false)))
      .limit(1);
    if (!comment) {
      return null;
    }
    return { id: comment.id, text: comment.content };
  }
}

export const AUTO_REPORT_DEDUPE_WINDOW_MS = 60 * 60 * 1000;

export { CONTENT_MODERATION_RULES };
