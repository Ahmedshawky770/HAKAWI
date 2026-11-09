# ADR 016 — Session tokens stored in HttpOnly cookies

- **Status:** Accepted
- **Date:** 2026-11-09
- **Supersedes:** ADR 016 — Session tokens stored in localStorage (previous version)
- **Related:** `frontend/src/lib/api.ts`, `frontend/src/components/layout/LogoutButton.tsx`,
  `frontend/src/lib/session.ts`, `frontend/src/components/providers/LocaleProvider.tsx`,
  `backend/src/modules/auth/auth.controller.ts`, `backend/src/common/constants/auth-cookie.constants.ts`

## Context

The frontend previously stored the refresh token in `localStorage` (`hakawi_tokens`) and sent it in
the request body to `/auth/refresh` and `/auth/logout`. A successful XSS against the frontend could
read `localStorage` and exfiltrate the refresh token, which is valid for 7 days — long enough to
mint new access tokens and impersonate the reader.

The backend already set both `access_token` and `refresh_token` as `HttpOnly; Secure; SameSite=Strict`
cookies via `writeAuthCookies()` (`backend/src/modules/auth/auth.controller.ts`), and
`resolveRefreshToken()` read the refresh token from the cookie first, falling back to the body.
The client side simply wasn't using the cookie.

## Decision

The refresh token is **no longer stored in `localStorage`**. The frontend relies on the browser
to send the `refresh_token` HttpOnly cookie automatically with `credentials: "include"` on every
cross-origin request to the API. The access token is already in an HttpOnly cookie and is read by
the backend from the cookie (not from an `Authorization` header).

## Changes

**`frontend/src/lib/api.ts`:**
- Removed `storedTokensSchema` and `getStoredRefreshToken()` — the client no longer reads the
  refresh token from `localStorage`.
- `tryRefreshAccessToken()` calls `/auth/refresh` with no body — the browser sends the
  `refresh_token` cookie automatically via `credentials: "include"`.
- `api.refreshToken()` takes no parameter and sends no body.
- `api.logout()` takes no parameter and sends no body — the backend clears both cookies on the
  response.
- `clearStoredUser()` removes only `hakawi_user` (the user profile, not a token) from
  `localStorage`; `hakawi_tokens` is no longer written or removed there.

**`frontend/src/components/layout/LogoutButton.tsx`:**
- Calls `api.logout()` with no argument.

**`frontend/src/lib/session.ts`:**
- `useLogout()` calls `api.logout()` with no argument.

**`frontend/src/components/providers/LocaleProvider.tsx`:**
- Checks `hakawi_user` (not `hakawi_tokens`) to decide whether the reader is authenticated
  before persisting the locale preference to the backend.

## Consequences

**Resolved risk:** XSS can no longer steal the refresh token from `localStorage`, because it is
only ever in an `HttpOnly` cookie that JavaScript cannot read. The refresh token is rotated on
use, and the backend clears both cookies on logout.

**Remaining exposure:** `hakawi_user` (user profile: id, email, name, etc.) is still written to
`localStorage` by `setStoredUser()`. This is PII, not a credential, so XSS cannot use it to
impersonate the reader — but it can read the reader's identity. Moving the user profile to a
cookie or to memory is deferred work.

**Read, not written by the server:** the server never writes `localStorage`; only the client does,
after a successful sign-in. The server mints tokens, sets them as HttpOnly cookies, and clears
them on logout.

---

## Addendum

This ADR replaces the previous "accepted risk" position. The elimination path — refresh token in
an HttpOnly cookie, read automatically by the browser — is implemented and covered by tests in
`frontend/src/lib/api.test.ts` and `frontend/src/components/layout/LogoutButton.test.tsx`.
