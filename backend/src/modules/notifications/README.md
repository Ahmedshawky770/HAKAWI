# Notifications Module

## Overview
Manages in-app notifications and user notification preferences.

## Endpoints
- `GET /notifications` - Get current user's notifications
- `GET /notifications/unread` - Get unread notifications
- `GET /notifications/unread-count` - Get unread notification count
- `GET /notifications/preferences` - Get notification preferences
- `PATCH /notifications/preferences` - Update notification preferences
- `PATCH /notifications/:id/read` - Mark notification as read
- `PATCH /notifications/read-all` - Mark all notifications as read
- `DELETE /notifications/:id` - Delete notification

One route per behaviour. `GET unread/count` and `PUT read-all` used to sit alongside the entries
above as aliases of the same two handlers; both were removed rather than kept in sync.

## Features
- Notification listing with pagination
- Unread notification tracking
- Granular notification preferences (email, push, reactions, comments, follows, mentions, **messages**, system)
- Bulk mark-as-read support

`messages` was added by migration `0023`. A direct message had no preference column at all, so a
recipient could not silence one by any means — `PREFERENCE_FOR_TYPE` had nothing to resolve `message`
to and `PATCH /notifications/preferences` had no field to accept. It is its own family rather than part
of `system` so that muting contest announcements and prize payments is not the price of a quiet inbox.
The type → family mapping lives in exactly one place, `./preference-family.ts`.

## Notification ownership
Contest notifications are **not** written here. `contest.created`, `winner.selected` and
`prize.distributed` are answered only by the contests module, which is the module that knows the rules
and has stated in writing that a contest author is told nothing about their own contest. This module
used to answer all three as well, which sent a winner two rows for winning and two for the prize. Do not
re-add them here.

## Repository Pattern
- `INotificationsRepository` interface defines the contract
- `NotificationsRepository` implements data access with Drizzle ORM
- Dependency injection via `NOTIFICATIONS_REPOSITORY` token

## Events
- `notification.created` - Emitted when a notification is created
