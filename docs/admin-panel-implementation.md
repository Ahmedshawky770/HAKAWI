# Admin Panel — Technical Documentation

Hakawi admin surfaces: role-based administration panels for `super_admin`,
`content_moderator`, `financial_officer` and `verification_officer`.

---

## 1. Overview

The admin panel is a set of route-guarded Next.js pages under
`frontend/src/app/(app)/admin/` that let each admin role manage the platform
surface it owns. Every role sees only its own surfaces; a caller who reaches a
page it does not own is stopped by a client-side guard before the page
renders, and the backend's `@Secured` / `@RequireAdminRole` decorators refuse
every request the role does not own.

### Admin roles (from `@hakawi/shared-types`)

| Role | Backend permissions | Surfaces |
|------|--------------------|----------|
| `super_admin` | `ALL_PERMISSIONS` (all 51) | Hub, moderation, financial, verification, roles |
| `content_moderator` | Content moderation, user restrictions, reports | Moderation only |
| `financial_officer` | Financial read/manage, reports view | Financial only |
| `verification_officer` | Verification read/manage, users verify | Verification only |

Role hierarchy (`ADMIN_ROLE_IMPLIES`): `super_admin` implies all roles; every
other role implies only itself. A `content_moderator` cannot enter the
financial or verification desks; a `financial_officer` cannot enter moderation
or verification; a `verification_officer` cannot enter moderation or financial.

---

## 2. File layout

```
frontend/src/app/(app)/admin/
├── page.tsx                      # Admin hub (super_admin only)
├── moderation/
│   └── page.tsx                  # Content moderation desk (content_moderator + super_admin)
├── financial/
│   └── page.tsx                  # Financial desk (financial_officer + super_admin)
├── verification/
│   └── page.tsx                  # Verification desk (verification_officer + super_admin)
└── roles/
    └── page.tsx                  # Role management (super_admin only)

frontend/src/components/admin/
└── AdminGuard.tsx                # Client-side RBAC guard

frontend/src/lib/i18n/
├── admin.ts                      # Admin copy: Arabic + English, all 5 surfaces
└── index.ts                      # Registers `admin` namespace in AppStrings

frontend/src/lib/
├── api.ts                        # Admin API client functions
├── queries.ts                    # Admin query keys + hooks + invalidation
└── schemas.ts                    # Admin response Zod schemas
```

---

## 3. Role-based access control

### Client-side guard (`AdminGuard`)

`AdminGuard` wraps every admin page. It reads the session from `useStoredUser()`
and decides, before the page renders:

1. `accountType !== "admin"` → "You are not an admin" screen.
2. `accountType === "admin"` but `adminRole` not in `allowedRoles` → "Wrong role"
   screen, naming the role the caller actually holds.
3. `accountType === "admin"` and `adminRole` in `allowedRoles` → page renders.

The guard is **UX, not a security boundary**. A caller who strips it from the DOM
still hits the backend, where `@Secured(AccountType.ADMIN)` and
`@RequireAdminRole(...)` refuse every request the role does not own.

### Backend enforcement

Every admin route is protected by the same decorator stack used across the
platform (`backend/src/common/decorators/secured.decorator.ts`):

```typescript
@Secured(AccountType.ADMIN)
@RequireAdminRole(AdminRole.X, AdminRole.SUPER_ADMIN)
@RequirePermissions(Permission.X)
@RequireMfa()
```

`@Secured` composes five guards in order:
1. `JwtAuthGuard` — verifies the token, populates `request.user`
2. `RestrictionGuard` — refuses banned/muted accounts
3. `RolesGuard` — checks account type / admin role
4. `PermissionsGuard` — checks granted permission set
5. `MfaGuard` — second factor, only on routes that ask for it

### Sidebar navigation

`Sidebar.tsx` renders an `admin` nav block only when
`user.accountType === "admin"`. The block lists all five admin surfaces; each
link navigates to its page, and the page's own `AdminGuard` decides whether the
caller may enter.

---

## 4. Page-by-page breakdown

### 4.1 Admin hub — `/admin` (super_admin)

Landing screen. Shows one stat card per surface (moderation, financial,
verification, roles) plus a link list. Each stat card is a link to that
surface. super_admin sees all four; other roles are blocked by the guard.

Stats come from the shared admin stats queries — the same cache every admin
desk reads, so the hub and desks agree on the numbers without refetching.

### 4.2 Content moderation — `/admin/moderation` (content_moderator + super_admin)

Three tabs:

- **Queue** — open reports, each with target id/type/reason/status/created-at
  and act-on buttons: under review, resolve, dismiss. Optimistic updates: the
  queue invalidates on success; failure reverts and shows a toast.
- **Actions** — moderation actions already taken (placeholder until the client
  actions query exists).
- **Stats** — moderation counters: total reports, open, resolved, dismissed,
  total actions, active restrictions.

Each report row renders a semantic status badge via `toneFor(MODERATION_STATUS_TONES, ...)`

### 4.3 Financial — `/admin/financial` (financial_officer + super_admin)

Implemented payments list + stats via `/payments/admin`. Refunds/payouts tabs remain placeholders (no endpoints).

### 4.4 Verification — `/admin/verification` (verification_officer + super_admin)

Implemented publisher applications list + stats via `/publishers/applications` and `/publishers/stats`, with approve/reject actions.

### 4.5 Role management — `/admin/roles` (super_admin)

Three tabs:

- **Assignments** — current admin role assignments: user id, role, reason,
  expiry, assigned-by, assigned-at. Each row has a revoke button.
- **Stats** — assignment counts: total, active, expired, break-glass uses.
- **Break glass** — emergency temporary elevation to a higher role: role select
  (super_admin / content_moderator / financial_officer / verification_officer),
  duration (max 60 minutes), reason. Submits to `POST /admin/roles/break-glass`.

---

## 5. Data flow

### API client (`lib/api.ts`)

Admin functions added:

| Function | Endpoint | Method | Schema |
|----------|----------|--------|--------|
| `getAdminModerationStats` | `/moderation/stats` | GET | `moderationStatsSchema` |
| `getAdminRoleAssignments` | `/admin/roles` | GET | `roleAssignmentsListResponseSchema` |
| `postAdminBreakGlass` | `/admin/roles/break-glass` | POST | `breakGlassResponseSchema` |
| `postAdminAssignRole` | `/admin/roles/assign` | POST | `roleAssignmentSchema` |
| `deleteAdminRevokeRole` | `/admin/roles/revoke` | DELETE | `roleAssignmentSchema` |

### Query hooks (`lib/queries.ts`)

| Hook | Query key | Notes |
|------|-----------|-------|
| `useAdminModerationStats` | `["admin", "moderation", "stats"]` | |
| `useAdminRoleAssignments` | `["admin", "roles", "assignments"]` | |

Invalidation: `invalidate.admin()` sweeps `["admin"]`, covering all four
admin query keys at once.

### Schemas (`lib/schemas.ts`)

- `moderationStatsSchema` — moderation counters
- `roleAssignmentSchema` — a single assignment
- `roleAssignmentsListResponseSchema` — list + total
- `breakGlassResponseSchema` — success, adminRole, expiresAt, message

---

## 6. i18n

`frontend/src/lib/i18n/admin.ts` defines `AdminStrings` with both `AR` and `EN`
tables. The interface has five namespaces:

- `common` — hub title/description, the four role labels, not-admin / wrong-role /
  MFA / load-failed / refresh messages
- `hub` — hub page copy + per-surface card labels + hub stat labels
- `moderation` — moderation page copy, tab labels, report fields, action labels,
  status/target-type/action label maps
- `financial` — financial page copy, tab labels, payment fields, status labels
- `verification` — verification page copy, tab labels, verification fields,
  status/type label maps
- `roles` — roles page copy, tab labels, assignment fields, break-glass fields,
  role label map

Every namespace carries a table for both locales side by side, per the product's
rule that the two languages of a sentence cannot drift apart. The namespace is
registered in `lib/i18n/index.ts` as `admin: AdminStrings` in `AppStrings`.

---

## 7. UI/UX design system compliance

All admin pages follow `docs/system-architecture/ui-ux-design-system.md`:

| Rule | How admin pages comply |
|------|----------------------|
| §1 Readability first | 65ch measure via `max-w-2xl` middle column; body 1.75 line height |
| §1 Warm minimalism | Near-black canvas, warm surface tokens, no decoration |
| §1 Optimistic responsiveness | Moderation actions mutate optimistically; failure reverts + toast |
| §1 Progressive disclosure | Tabs show only what is needed; empty states guide the reader |
| §1 Performance as feature | Shared query cache; skeletons on load; route-level splitting |
| §3 Spacing 4px base | `p-6` cards, `gap-4`, `space-y-6`, `px-4 py-2` buttons |
| §3 Radius 8px / 12px | `rounded-lg` controls, `rounded-xl` cards |
| §4 Colour 60-30-10 | Canvas 60%, surfaces 30%, accent 10% (buttons, active nav) |
| §4 Semantic states | Success/warning/error/info via `toneFor` badge maps |
| §5 Breakpoints | Sidebar from `lg`; rail from `xl`; max-w-2xl feed |
| §6 Buttons ≥44px | Every `Button` size ≥ `min-h-11`; icon buttons `size-11` |
| §6 Cards | `rounded-xl border border-line bg-surface`, `p-6` |
| §6 Stat cards | `hk-numeric` tabular figures, `text-3xl` |
| §7 UX patterns | Optimistic updates, one query key per fact, a view is a URL |
| §8 Accessibility | `aria-current="page"`, landmarks, focus outline, 44px targets, |
| | no colour-only meaning, `.hk-numeric` for RTL digits |
| §9 Performance | Skeletons reserve exact dimensions; `staleTime` 5 min |
| §10 Tokens | CSS-first `@theme inline`; no `tailwind.config.ts` |
| §11 Theming | Dark default; toggle persists via `localStorage` |
| §12 RTL | `dir="rtl"`, logical properties, `.hk-flip-rtl` for directional glyphs |

---

## 8. Accessibility (WCAG A/AA)

| Rule | Implementation |
|------|---------------|
| 4.5:1 body text, 3:1 large text / control boundaries | Tokens measured by `design-system.test.ts` |
| Visible focus on everything interactive | Global `outline: 2px solid var(--hk-accent)` + 2px offset |
| Full keyboard operation | Real `<button>`, `<a>`, `<input>`, `<select>`; no click-only affordances |
| `aria-current="page"` on active destination | Sidebar `Nav` sets `aria-current` |
| Landmarks | `header`, `nav` (labelled), `main#main-content`, `aside` |
| Live regions | Loading `role="status"`, errors `role="alert"`, toasts polite |
| Touch targets ≥44×44px | `min-h-11` on every button; `size-11` on icon buttons |
| `prefers-reduced-motion` | Global block collapses animations/transitions |
| No colour-only meaning | Status pills carry text + `data-state`; active nav carries `aria-current` |
| Decorative icons hidden | `Icon` sets `aria-hidden` unless `title` given |
| Skip link | `.hk-skip-link` targeting `#main-content` |
| Numbers in RTL | `.hk-numeric` isolates LTR digits |

---

## 9. The 17 architecture principles

| # | Principle | Application in admin panel |
|---|-----------|---------------------------|
| 1 | Zero `any` / `as any` | All admin functions typed; `adminRoleSchema` validates roles; no `any` in admin files |
| 2 | Logger over `console` | Errors surface through `ErrorMessage` + toasts, never `console.log` |
| 3 | IDs as strings | All ids (report, user, role assignment, payment) are strings |
| 4 | Document problems and solutions | This document; WHY comments on every page and component |
| 5 | Architecture before code | Role matrix designed before implementation; guard + backend decorators |
| 6 | Minimize database migrations | No frontend migrations; uses existing backend admin endpoints |
| 7 | Loose coupling between modules | Admin pages depend only on `lib/api`, `lib/queries`, shared-types |
| 8 | Open for extension, closed for modification | New admin surfaces add a new page + guard allowedRoles; existing pages unchanged |
| 9 | Single Source of Truth | Role labels live once in `admin.ts`; query keys once in `queries.ts`; schemas once in `schemas.ts` |
| 10 | Unified typing files | Types from `@hakawi/shared-types` + local Zod `z.infer` |
| 11 | Valkey as cache layer | Backend admin endpoints use Valkey; frontend uses React Query cache |
| 12 | Reduce synchronization | One `invalidate.admin()` sweeps all admin keys; no duplicated fetch state |
| 13 | Automate with awareness | Admin forms submit via validated API functions; no mass DOM manipulation |
| 14 | AP as default choice | Optimistic UI updates; eventual consistency via cache invalidation |
| 15 | Proactive defense first | Guard before render + backend decorators + MFA on writes |
| 16 | Smart hybrid consistency | Client cache + backend source of truth; server wins on `onSettled` |
| 17 | Warning against mass linting | Admin code written file-by-file; no automated find/replace across pages |

---

## 10. Security model

1. **Client guard** — `AdminGuard` prevents rendering pages the caller cannot
   use. UX only.
2. **Backend account-type gate** — `@Secured(AccountType.ADMIN)` requires an
   admin account on every admin route.
3. **Backend role gate** — `@RequireAdminRole(...)` requires the specific role
   (or super_admin) on each route.
4. **Backend permission gate** — `@RequirePermissions(Permission.X)` requires
   the specific permission.
5. **MFA** — `@RequireMfa()` on all write routes (assign, revoke, break-glass,
   financial/verification mutations).
6. **Defence in depth** — Even if the client guard is bypassed, the backend
   refuses the request and returns 403, which the client classifies and shows
   as a localized error via `classifyError`.

---

## 11. What was missing before this implementation

| Gap | Before | After |
|-----|--------|-------|
| Admin hub | None | `/admin` — super_admin landing with stats + links |
| Moderation desk | Placeholder tabs only | Full queue + actions + stats with act-on buttons |
| Financial desk | None | `/admin/financial` — payments/refunds/payouts |
| Verification desk | None | `/admin/verification` — identity verification review |
| Role management | None | `/admin/roles` — assign/revoke/stats/break-glass |
| Client RBAC | None | `AdminGuard` on every admin page |
| Sidebar admin nav | None | Role-conditional admin block |
| i18n for admin | None | `admin.ts` — Arabic + English, all surfaces |
| API client functions | Only `getModerationStats` | 5 admin functions (stats, assignments, break-glass, assign, revoke) |
| Query hooks | Only moderation | 2 admin hooks + `invalidate.admin()` |
| Zod schemas | Partial | `moderationStats`, `roleAssignment`, `roleAssignmentsList`, `breakGlassResponse` |

---

## 12. Roles that can enter each surface

| Surface | super_admin | content_moderator | financial_officer | verification_officer |
|---------|-------------|-------------------|-------------------|----------------------|
| `/admin` (hub) | ✅ | ❌ | ❌ | ❌ |
| `/admin/moderation` | ✅ | ✅ | ❌ | ❌ |
| `/admin/financial` | ✅ | ❌ | ✅ | ❌ |
| `/admin/verification` | ✅ | ❌ | ❌ | ✅ |
| `/admin/roles` | ✅ | ❌ | ❌ | ❌ |

A caller who attempts a surface they do not own sees the "wrong role" screen
naming their actual role, then cannot make any backend request because the
decorators refuse it.

---

*End of documentation.*
