# Role System Plan — حكاوي (Hakawi)

Plan to evolve the account-type/permission system so readers can write stories, upgrade to
professional authors, and publishers remain institution-only. No code changes yet — this is the
build plan. Status: ⚠️ planned.

## 1. Account types (unchanged set, 6)

`packages/shared-types/src/user.ts` — `ACCOUNT_TYPES` stays:
`reader` · `writer` · `rising_star` · `professional` · `publisher` · `admin`

Implication lattice (`ACCOUNT_TYPE_IMPLIES`) stays:
`rising_star` ⊃ `writer` ⊃ `reader`; `professional` ⊃ `writer`; `publisher` ⊃ `writer`; `admin` ⊃ all.

## 2. Capability model (new)

| Capability | reader | rising_star | professional | publisher |
|---|---|---|---|---|
| Read stories | ✓ | ✓ | ✓ | ✓ |
| Write stories (create/edit/delete own) | ✓ | ✓ | ✓ | ✓ |
| Basic analytics (own stories views) | ✓ | ✓ | ✓ | ✓ |
| Full analytics | — | ✓ | ✓ | ✓ |
| Sell own books | — | — | ✓ | — |
| Sell represented writers' books (PUBLISHER_SELL_REPRESENTED) | — | — | — | ✓ |
| Communicate with publishers (PUBLISHING_COMMUNICATE) | — | ✓ | ✓ | ✓ |
| Create/manage contests | — | — | — | ✓ |
| Admin (sub-roles) | — | — | — | — (admin only) |

## 3. Permission changes (`backend/src/common/permissions/permissions.ts`)

- Add `ANALYTICS_READ_BASIC` (reader) and `PUBLISHING_COMMUNICATE`.
- `READER_PERMISSIONS`: + `CONTENT_CREATE/EDIT_OWN/DELETE_OWN`, `STORIES_CREATE/EDIT_OWN/DELETE_OWN`, `ANALYTICS_READ_BASIC`.
- `WRITER_PERMISSIONS`: + `ANALYTICS_READ_OWN` (full).
- `RISING_STAR_PERMISSIONS`: inherits writer + `PUBLISHING_COMMUNICATE` (pitch services/writing to publishers).
- `PROFESSIONAL_PERMISSIONS`: inherits writer + `BOOKS_SELL_OWN/RENT_OWN`.
- `PUBLISHER_PERMISSIONS`: inherits writer + `CONTESTS_*` + `PUBLISHING_COMMUNICATE` + `BOOKS_SELL_REPRESENTED`, **no** own `BOOKS_SELL`.
- `ALL_PERMISSIONS`/enum auto-update (compile-time).

## 4. Upgrade paths

- **Reader → Rising Star (self-service, "platform-grown writer")**: after email verification, via
  `POST /users/me/upgrade {target:'rising_star'}`. Sets `accountType=rising_star`, invalidates
  refresh tokens + cache, emits `user.upgraded`. Grants writer-level + analytics + publisher outreach.
- **Rising Star → Professional (points + verification-gated)**: professional grants selling own books
  + full analytics + publisher comms, so it must NOT be auto-granted on metrics alone (impersonation
  risk). Eligibility = points/achievements threshold + `isVerified` + **manual approval by
  `verification_officer`** (identity check: proof of authorship / publisher references).
- **Reader → Publisher (forbidden self-service)**: publisher is institutional. Only
  `super_admin`/`verification_officer` provisions via admin endpoint after an application review.
- **Admin**: never self-service (DB/seed only).

## 5. Points & achievement model for Professional upgrade

Points are derived from the existing Badges module metrics plus two new ones:

| Metric | Source event / column | Purpose |
|---|---|---|
| `published_stories` | `story.published` + `stories.status='published'` | Number of published stories |
| `story_views` | `stories.view_count` (incremented on read) | Cumulative views on own stories |
| `story_reactions` | `story.reacted` | Reactions received on own stories |
| `follower_count` | `user.followed` | Followers of the author |

Professional upgrade **eligibility thresholds** (all must be met):
- `published_stories >= 5`
- `story_views >= 1,000`
- `story_reactions >= 100`
- `follower_count >= 50`
- `isVerified = true` (email verified)

When thresholds are met, the user may submit a professional upgrade request. A
`verification_officer` reviews the identity (anti-impersonation) and approves/rejects.
On approval, `accountType` becomes `professional`, refresh tokens are revoked,
cache is invalidated, and `user.upgraded` is emitted.

## 6. Backend changes (no mass assignment)

- `UpdateUserInput`/`UpdateUserDto`: add optional `accountType` (enum) and `adminRole` (enum).
- `UsersController.update`: strip `accountType`/`adminRole` when `isOwn`; allow only for
  super_admin (and verification_officer for publisher provisioning).
- `POST /users/me/upgrade` (JWT + RestrictionGuard): target ∈ {rising_star, professional? no—only
  rising_star self; professional via auto/approval}. Requires `isVerified`. Invalidates tokens/cache,
  emits `user.upgraded`.
- Admin provisioning endpoint for publisher accounts (super_admin): creates user with
  `accountType=publisher`, `isVerified=true`, sends password-reset invite (or OAuth linking).
- OAuth `findOrCreateOAuthUser`: preserves existing role (no change needed).

## 6. Frontend changes

- Register page: no role selector (unchanged).
- Onboarding (optional): "Start reading" / "I want to write (rising star)" / "Open publisher account
  (application)".
- Gating by `accountTypeSatisfies`/`accountTypeAtLeast`: create story (all), sell books (professional),
  contests (publisher), comms (professional+publisher).
- Profile badge shows accountType.

## 7. Docs to update (reflect intended state)

- `docs/security-architecture/permissions/permissions-overview.md` — new permissions + grants.
- `docs/c4-model/code/domain-concepts.md` — capability model.
- `docs/security-architecture/auth/auth-overview.md` — account types + upgrade paths.
- `docs/module-boundaries/overview/module-boundaries.md` — user.upgraded (already registered).

## 8. Tests

- Permissions guard: reader can create stories; reader cannot sell/comms; rising_star analytics;
  professional sell/comms; publisher contests/comms no sell.
- Upgrade endpoint: success, unverified, banned, forbidden target (publisher).
- Admin role assignment + self-escalation blocked.
- Frontend gating tests.

## 9. Data / migrations

- No migration required (`account_type` varchar exists; enum 0024 covers values).
- Optional phase 2: `publisher_applications` table + `publisher_writers` link table (representation) for sell-on-behalf.

## 10. Execution order

1. Backend permissions + UpdateUserInput/Dto + controller guards.
2. Backend upgrade endpoint + admin provisioning.
3. Frontend gating + onboarding (optional).
4. Docs update.
5. Tests (unit + e2e).
6. Typecheck + lint + tests.

Ready to start implementation on your go.
