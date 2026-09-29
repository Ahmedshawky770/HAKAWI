# Messages Module

## Overview
Manages direct messaging between users with conversation support.

## Endpoints
- `POST /messages/conversations` - Create or get conversation with a user
- `GET /messages/conversations` - Get current user's conversations
- `GET /messages/conversations/:conversationId/messages` - Get messages in a conversation
- `POST /messages/conversations/:conversationId/messages` - Send message in conversation
- `PATCH /messages/:messageId/read` - Mark message as read
- `PATCH /messages/conversations/:conversationId/read` - Mark all messages as read
- `GET /messages/conversations/:conversationId/unread` - Get unread message count

## Features
- Direct messaging between two users
- Conversation list with last message timestamps
- Message history with pagination
- Read receipts and unread counts
- Conversation-level and message-level read tracking

## Repository Pattern
- `IConversationsRepository` interface defines the contract
- `ConversationsRepository` implements data access with Drizzle ORM
- `IMessagesRepository` interface defines the contract
- `MessagesRepository` implements data access with Drizzle ORM
- Dependency injection via `CONVERSATIONS_REPOSITORY` and `MESSAGES_REPOSITORY` tokens

## Events
- `message.sent` - Emitted when a message is sent
- `message.read` - Emitted when a message is marked as read
