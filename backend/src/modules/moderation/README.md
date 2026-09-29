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
- User restrictions with expiry
- Admin dashboard with stats and trends

## Caching Strategy
- Moderation stats are cached in Valkey
- Cache is invalidated when reports or actions change

## Repository Pattern
- Direct database access via Drizzle ORM
- No dedicated repository interfaces

## Events
- `moderation.action.taken` - Emitted when a moderator takes action
- `moderation.report.escalated` - Emitted when a report is auto-escalated
