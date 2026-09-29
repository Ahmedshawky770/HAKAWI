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

## Caching Strategy
- Verification tokens are stored in Valkey with 24-hour TTL
- Resend cooldown tokens stored with 60-second TTL
- Tokens are deleted after successful verification

## Repository Pattern
- Uses `IUsersRepository` from the users module
- No dedicated repository interface

## Events
- `email.verified` - Emitted when a user verifies their email
- `email.verification.requested` - Emitted when a verification email is requested
