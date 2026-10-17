# Users Module

## Overview

Manages user profiles, account settings, and OAuth provider associations.

## Endpoints

- `GET /api/v1/users/:id` - Get user profile by ID
- `PATCH /api/v1/users/:id` - Update user profile

## Features

- Profile management (name, email, username, avatar, bio)
- OAuth provider linking (Google, Facebook, Twitter, GitHub, Apple, TikTok)
- User statistics
- Soft delete support
- Valkey caching with TTL (5 minutes)
- Identity verification through `UserVerificationService`, with the code delivered by email

## Email verification

`POST /users/verification/confirm` consumes a token; `GET`/`POST /users/me/verification` report and
request one. The request path mints a 48-character hexadecimal token and **emails it to the user from
the method that mints it**, through the single transport in `common/email/` (`SmtpEmailTransporter`

- `TransactionalEmailService`, provided by the global `CommonModule`). The users module may not depend
  on `NotificationsModule` under `dependency-rules.md`, which is where that transport used to live.

The token length and its DTO agree, and are checked rather than assumed: `crypto.randomBytes(24)`
yields 48 lowercase hex characters, and `VerifyUserDto` accepts 16–128 lowercase hex characters. The
neighbouring `email-verification` module had a genuine mismatch — it minted eight digits against a
`@Length(6, 6)` DTO, so the global `ValidationPipe` rejected every token it produced — fixed there.

The token is never put on `email.verification.requested` and never written to a log line: events are
logged, dead-lettered and replayed, and Winston output is aggregated and retained, so a token in
either is a credential with a very long half-life. An SMTP outage does not fail the request — the
token is already stored — and the endpoint's response is a status summary rather than a claim about
delivery, so its contract is unchanged.

## Caching Strategy

- User data is cached in Valkey with 5-minute TTL
- Cache is invalidated on user update or delete
- Password hash is never cached or returned in API responses

## Repository Pattern

- `IUsersRepository` interface defines the contract
- `UsersRepository` implements data access with Drizzle ORM
- Dependency injection via `USERS_REPOSITORY` token

## Events

- `user.registered` - Emitted when a new user is created
- `user.updated` - Emitted when a user profile is updated
- `email.verified` - Emitted once `users.is_verified` is written
- `email.verification.requested` - Emitted when a code is minted. Carries `userId` and `email` only,
  never the code: delivery happens in the request path, not through this event, because no listener
  for it exists and a token on an event payload is a credential in three logs and a queue.
