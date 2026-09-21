# Authentication
## Hakawi Security Architecture

This document defines the authentication system for the Hakawi platform.

---

## Authentication Overview

Hakawi supports multiple authentication methods:
- Email/Password
- OAuth (Google, Apple)
- Phone Number (future)

All authentication flows use JWT tokens for session management.

---

## Authentication Methods

### 1. Email/Password Authentication

#### Registration Flow

```
1. User provides email, password, name
2. System validates email format
3. System checks password strength
4. System hashes password (bcrypt)
5. System creates user account
6. System sends verification email
7. System returns JWT token
```

#### Login Flow

```
1. User provides email and password
2. System finds user by email
3. System compares password hash
4. System checks if account is active
5. System checks if account is verified
6. System generates JWT token
7. System returns token and user data
```

#### Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Not in common password list

### 2. OAuth Authentication

#### Supported Providers

- Google
- Apple (future)
- Facebook (future)

#### OAuth Flow

```
1. User clicks "Login with Google"
2. System redirects to Google OAuth
3. User authenticates with Google
4. Google redirects back with code
5. System exchanges code for tokens
6. System fetches user profile from Google
7. System creates or updates user account
8. System generates JWT token
9. System returns token and user data
```

---

## JWT Token Structure

### Access Token

```
Header: {
  "alg": "HS256",
  "typ": "JWT"
}

Payload: {
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "writer",
  "iat": 1704067200,
  "exp": 1704070800
}

Signature: HMAC SHA256
```

### Refresh Token

```
Payload: {
  "sub": "user-uuid",
  "type": "refresh",
  "iat": 1704067200,
  "exp": 1706659200
}
```

### Token Expiration

| Token Type | Expiration | Refreshable |
|------------|------------|-------------|
| Access Token | 1 hour | Yes |
| Refresh Token | 30 days | Yes |

---

## Token Management

### Token Storage

**Frontend (Web)**
- Access token: Memory (React state)
- Refresh token: HttpOnly cookie

**Frontend (Mobile)**
- Access token: Secure storage
- Refresh token: Secure storage

### Token Refresh Flow

```
1. Access token expires
2. Frontend sends refresh token
3. Backend validates refresh token
4. Backend generates new access token
5. Backend returns new access token
6. Frontend updates access token
```

### Token Revocation

- Logout revokes refresh token
- Password change revokes all tokens
- Admin can revoke user tokens
- Tokens stored in Valkey blacklist

---

## Session Management

### Session Storage

- Store active sessions in Valkey
- Session includes: user ID, IP, user agent, created at
- Max concurrent sessions: 5 per user

### Session Validation

```
1. Receive token
2. Decode JWT
3. Check if token is blacklisted
4. Check if session exists in Valkey
5. Validate session metadata
6. Return user data
```

### Session Cleanup

- Expired sessions removed daily
- Inactive sessions removed after 30 days
- Manual cleanup via admin panel

---

## Password Management

### Password Hashing

- Algorithm: bcrypt
- Salt rounds: 12
- Pepper: Application secret

### Password Reset Flow

```
1. User requests password reset
2. System generates reset token
3. System sends reset email
4. User clicks reset link
5. System validates reset token
6. User provides new password
7. System updates password
8. System revokes all sessions
9. System sends confirmation email
```

### Password Change Flow

```
1. User provides current password
2. User provides new password
3. System validates current password
4. System validates new password
5. System updates password
6. System revokes all sessions
7. System sends confirmation email
```

---

## Email Verification

### Verification Flow

```
1. User registers
2. System generates verification token
3. System sends verification email
4. User clicks verification link
5. System validates token
6. System marks email as verified
7. System sends welcome email
```

### Verification Token

- Expiration: 24 hours
- Single use only
- Stored in Valkey

---

## Account Security

### Account Lockout

- Threshold: 5 failed login attempts
- Lockout duration: 15 minutes
- Notification: Email sent to user

### Suspicious Activity Detection

- Login from new device
- Login from new location
- Multiple failed attempts
- Unusual access patterns

### Two-Factor Authentication (Future)

- TOTP (Time-based One-Time Password)
- SMS verification
- Backup codes

---

## Authorization

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| Guest | Read public stories |
| Reader | Read stories, follow users |
| Writer | Create stories, manage own content |
| Publisher | Manage writers, create contests |
| Moderator | Moderate content, manage reports |
| Admin | Full system access |

### Permission Checking

```
1. User authenticates
2. System extracts role from token
3. System checks role against endpoint
4. System allows or denies access
5. System logs authorization decision
```

---

## Security Best Practices

### Password Security

- Never store plain text passwords
- Use bcrypt with sufficient salt rounds
- Implement password strength meter
- Check against breached password lists

### Token Security

- Use secure random tokens
- Store tokens securely
- Implement token rotation
- Revoke tokens on logout

### Session Security

- Limit concurrent sessions
- Invalidate sessions on password change
- Monitor for suspicious activity
- Implement session timeout

### Communication Security

- Always use HTTPS
- Validate all inputs
- Implement CORS correctly
- Use secure cookies

---

## Error Handling

### Authentication Errors

| Error | HTTP Status | Message |
|-------|-------------|---------|
| Invalid credentials | 401 | Invalid email or password |
| Account not found | 401 | Invalid email or password |
| Account disabled | 403 | Account has been disabled |
| Account not verified | 403 | Please verify your email |
| Token expired | 401 | Token has expired |
| Invalid token | 401 | Invalid token |
| Token revoked | 401 | Token has been revoked |

### Rate Limiting

- Track failed attempts per IP
- Track failed attempts per user
- Implement exponential backoff
- Return 429 on limit exceeded

---

## Monitoring

### Metrics to Track

| Metric | Alert Threshold |
|--------|-----------------|
| Failed logins per minute | > 20 |
| Account lockouts per hour | > 10 |
| Password resets per hour | > 50 |
| Token refresh failures per minute | > 10 |
| Suspicious logins per hour | > 5 |

### Audit Log

All authentication events should be logged:
- Login success/failure
- Logout
- Password change
- Password reset
- Email verification
- Token refresh
- Account lockout

---

## Compliance

### Data Protection

- Passwords hashed with bcrypt
- Tokens signed with HS256
- Sensitive data encrypted at rest
- TLS 1.3 for all communications

### Privacy

- Minimal data collection
- User consent for data processing
- Right to delete account
- Data export available

### Regulations

- GDPR compliance
- COPPA compliance (no users under 13)
- Local data protection laws

---

*This document defines the authentication system for the Hakawi platform.*
