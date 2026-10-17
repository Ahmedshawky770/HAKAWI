# Email Verification Module

## Overview

Manages email verification tokens and resend workflows.

## Endpoints

- `POST /auth/verify-email` - Verify email with token (public)
- `POST /auth/resend-verification` - Resend verification email (public)

## Features

- 6-digit verification token generation
- Token storage in Valkey with 24-hour TTL
- Resend cooldown (60 seconds) to prevent abuse
- Automatic token cleanup after verification
- User emailVerified flag update on successful verification
- The code is delivered by email from the request path that mints it

## Caching Strategy

- Verification tokens are stored in Valkey with 24-hour TTL
- Resend cooldown tokens stored with 60-second TTL
- Tokens are deleted after successful verification

## Repository Pattern

- Uses `IUsersRepository` from the users module
- No dedicated repository interface

## Email delivery

Verification mail leaves this process through the ONE transport in the codebase,
`common/email/` — `SmtpEmailTransporter` plus `TransactionalEmailService`, both provided by the
global `CommonModule`. `NotificationsEmailService` uses the same instance, so there is one SMTP
configuration and one connection pool rather than two. The transport moved out of
`notifications/email/` because `dependency-rules.md` allows Auth to depend on Core, Users and Config
only, not on Notifications; see `common/email/README.md` for the full reasoning.

The mail is sent **inside the method that mints the code** (`mintToken`, reached from both
`generateToken` and `resend`), with the code in the body. It is not sent from an event listener:

- `email.verification.requested` carries no token and never may. Events are logged, dead-lettered and
  replayed, so a token on a payload is a credential in three logs and a queue (Principle #15).
- No listener for that event existed anywhere, which is why nothing was ever delivered.

The code is never written to a log line either; Winston output is aggregated and retained.

### What the resend endpoint returns

It answers **HTTP 200** in every case, because the request itself succeeded — the code is minted,
stored and the cooldown is armed whether or not the mail went out — and a delivery failure must not
become a 500 (Principle #14). The message reflects what actually happened:

| Delivery outcome | `message`                                                                          |
| ---------------- | ---------------------------------------------------------------------------------- |
| `sent`           | `Verification email sent`                                                          |
| `not-configured` | `Verification email could not be sent. Please try again later or contact support.` |
| `failed`         | `Verification email could not be sent. Please try again later or contact support.` |

The distinguishing reason — no `EMAIL_*` credentials versus the SMTP server refusing — is logged at
WARN by `TransactionalEmailService` rather than returned to the caller, so an unconfigured deployment
does not advertise its own mail state to an unauthenticated endpoint. The code stays valid for its
full 24 hours, so a failed delivery costs the user one more resend, not a lost code.

`POST /auth/verify-email` is unaffected by any of this: it validates against `@Length(6, 6)` and the
generator now produces exactly that.

## Events

- `email.verified` - Emitted when a user verifies their email
- `email.verification.requested` - Emitted when a verification email is requested. Carries `userId`
  and `email` only — never the code.
