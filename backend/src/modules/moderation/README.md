# Moderation Module

## Overview
Provides content moderation, reporting, and admin dashboard functionality.

## Endpoints
- `POST /moderation/reports` - Create a content report (authenticated)
- `GET /moderation/reports` - List reports (authenticated)
- `PATCH /moderation/reports/:id` - Update report status (moderator+)
- `POST /moderation/reports/:id/actions` - Take moderation action (moderator+)
- `GET /moderation/stats` - Get moderation statistics (super admin)
- `GET /moderation/reports/trends` - Get report trends (super admin)
- `GET /moderation/users/:id/restrictions` - Get user restrictions (authenticated)
- `GET /moderation/actions` - Get moderation actions (super admin)

## Features
- User-generated content reporting
- Report status tracking (open, in_review, resolved, dismissed, escalated)
- Moderation actions (warning, mute, ban)
- Auto-escalation for repeat offenders (3+ reports in 1 hour)
- Scheduled auto-escalation of stale reports (24+ hours old)
- User restrictions with expiry — one authority for how long one lasts
- Admin dashboard with stats and trends

## Caching Strategy
- Moderation stats are cached in Valkey
- Cache is invalidated when reports or actions change

## Repository Pattern
- Direct database access via Drizzle ORM
- No dedicated repository interfaces

## Events
- `moderation.action.taken` - Emitted when a moderator takes action; the payload carries
  `durationMinutes` so the store and the enforcement cache expire on the same clock
- `moderation.report.escalated` - Emitted when a report is auto-escalated

## Restriction policy
`restriction-policy.ts` is the single answer to both questions a restriction raises. **What** the
action means: only `ban` and `mute` restrict an account; `warn`, `content_removal` and `no_action`
are recorded in `moderation_actions` and touch no cache key. **How long** it lasts: a positive
`durationMinutes` on the action is what gets enforced — `ModerationService` derives
`user_restrictions.expires_at` from it and `ModerationEventHandler` writes the same value as the
Valkey TTL, so the audit trail and the enforcement can no longer disagree (a seven-day ban used
to lift after a fixed twenty-four hours). The service is the single writer of
`user_restrictions`; the handler owns the cache and nothing else.
