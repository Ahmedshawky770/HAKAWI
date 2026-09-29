# Notifications Module

## Overview
Manages in-app notifications and user notification preferences.

## Endpoints
- `GET /notifications` - Get current user's notifications
- `GET /notifications/unread` - Get unread notifications
- `GET /notifications/unread/count` - Get unread notification count
- `GET /notifications/unread-count` - Get unread notification count (alias)
- `GET /notifications/preferences` - Get notification preferences
- `PATCH /notifications/preferences` - Update notification preferences
- `PATCH /notifications/:id/read` - Mark notification as read
- `PATCH /notifications/read-all` - Mark all notifications as read
- `PUT /notifications/read-all` - Mark all notifications as read (PUT alias)
- `DELETE /notifications/:id` - Delete notification

## Features
- Notification listing with pagination
- Unread notification tracking
- Granular notification preferences (email, push, reactions, comments, follows, mentions, system)
- Bulk mark-as-read support

## Repository Pattern
- `INotificationsRepository` interface defines the contract
- `NotificationsRepository` implements data access with Drizzle ORM
- Dependency injection via `NOTIFICATIONS_REPOSITORY` token

## Events
- `notification.created` - Emitted when a notification is created
