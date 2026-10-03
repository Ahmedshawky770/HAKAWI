# Permissions Architecture
## Hakawi Security Architecture

This document defines the authorization and permissions architecture for Hakawi: the RBAC model,
permission evaluation, ownership checks, and the guard implementation.

Status markers: ✅ implemented · ⚠️ partial · ⛔ not implemented.

**Single source of truth:** `packages/shared-types/src/user.ts` defines `ACCOUNT_TYPES`,
`ADMIN_ROLES` and the normalization helpers; `backend/src/common/constants/roles.ts` re-exports
them. There is no second list of roles anywhere in the backend.

**Single source of truth for permissions:** `backend/src/common/permissions/permissions.ts`.

---

## RBAC Model

### Account Types (6)
`packages/shared-types/src/user.ts:4`

| Role | Description | Implies |
|------|-------------|---------|
| `reader` | Default account for consuming content | `reader` |
| `writer` | Can publish stories and texties | `reader`, `writer` |
| `rising_star` | Emerging author with limited features | `reader`, `writer`, `rising_star` |
| `professional` | Full author features, book sales | `reader`, `writer`, `professional` |
| `publisher` | Can create and manage contests | `reader`, `writer`, `publisher` |
| `admin` | Platform administration | all six |

The implication lattice is `ACCOUNT_TYPE_IMPLIES` (`packages/shared-types/src/user.ts:62`) and is
evaluated by `accountTypeSatisfies()` / `accountTypeAtLeast()`.

### Admin Sub-Roles (4)
`packages/shared-types/src/user.ts:16`

| Role | Description |
|------|-------------|
| `super_admin` | Full system access |
| `content_moderator` | Content moderation |
| `financial_officer` | Financial operations |
| `verification_officer` | User verification |

Admin-role implication is `ADMIN_ROLE_IMPLIES`, evaluated by `adminRoleSatisfies()`.

### Legacy value normalization — ✅ implemented
Rows written before the split still store legacy strings. `normalizeAccountType()` /
`normalizeAdminRole()` map them (`packages/shared-types/src/user.ts:33,40`):

| Legacy DB value | Normalized to |
|---|---|
| `author` | `writer` |
| `moderator` | `content_moderator` |
| `finance` | `financial_officer` |

Anything unrecognised falls back to `reader` (the default), so an unknown role **loses** privilege
rather than gaining it.

---

## Permission System — ✅ implemented

### Permission Format

The format is **two or three** parts, not always three:

```
{resource}:{action}
{resource}:{action}:{scope}      scope ∈ own | all | platform
```

The type is `PermissionPattern = \`${resource}:${action}\` | \`${resource}:${action}:${scope}\``
(`backend/src/common/permissions/permissions.ts:59`). A document that says "the format is
`{resource}:{action}:{scope}`" is wrong for the 30-odd two-part permissions such as `content:read`
and `stats:view`.

`Permission` is declared `as const satisfies Record<string, PermissionPattern>`, so a malformed
permission is a **compile error**.

### Resources, actions, scopes
`PERMISSION_RESOURCES`, `PERMISSION_ACTIONS`, `PERMISSION_SCOPES` (`permissions.ts:10,34,53`).

### Count: 51 permissions

`ALL_PERMISSIONS` is `Object.freeze(Object.values(Permission))` — **51** entries, not 49. Verified
by counting the `Permission` object literal (`backend/src/common/permissions/permissions.ts:62-117`).

Selected examples:
- `content:read`, `content:create`, `content:edit:own`, `content:edit:all`, `content:delete:own`,
  `content:delete:all`, `content:moderate`
- `stories:read`, `stories:create`, `stories:edit:own`, `stories:edit:all`, `stories:delete:own`,
  `stories:delete:all`
- `comments:read|create|edit:own|edit:all|delete:own|delete:all`
- `users:read`, `users:manage:all`, `users:restrict:all`, `users:verify:all`
- `reports:create|view|update:all|delete:all`
- `financial:read:all`, `financial:manage:all`, `verification:read:all`, `verification:manage:all`
- `settings:manage`, `stats:view`, `search:use`, `notifications:read`

> Two permissions that the previous version of this document listed do not exist under those names:
> `users:manage` and `contests:manage`. The real ones are `users:manage:all` and the four
> `contests:*` entries (`contests:create`, `contests:manage:own`, `contests:update:own`,
> `contests:delete:own`).

### Permission grants — ✅ implemented
Two lookup tables plus an alias (`permissions.ts:168,210,217`):
- `PERMISSIONS_BY_ACCOUNT_TYPE` — per account type
- `PERMISSIONS_BY_ROLE` — per admin role
- `PERMISSIONS_BY_ADMIN_ROLE` — alias of `PERMISSIONS_BY_ROLE`

`resolvePermissions({ accountType, adminRole })` unions the two; `hasPermission(granted, required)`
evaluates a requirement list. The requirement list is an **OR**: `@Permissions('stories:edit:own',
'stories:edit:all')` passes if the caller holds either.

### Evaluation Order — ✅ implemented
1. **`@Public()` check** — `IS_PUBLIC_KEY` short-circuits to allow
2. **No requirement declared** — allow (a route with no `@Permissions()` is authenticated-only)
3. **Super admin** — `isSuperAdmin(accountType, adminRole)` allows
4. **Resolve grants** — union of the account-type and admin-role sets
5. **`hasPermission`** — deny with `Missing required permission: <list>` on failure
6. **No `request.user`** — deny with `Access denied`

`backend/src/common/guards/permissions.guard.ts:19-45`.

> The previous version documented a `isVerifiedSuperAdmin()` that consulted a
> "super admin Google ID whitelist". **That function does not exist and never did.** Super-admin
> detection is `isSuperAdmin(user.accountType, user.adminRole)` from `@hakawi/shared-types` — two
> token claims, no external list, no database read.

---

## Authorization Guards — ✅ implemented

### `@Secured()` — the single entry point

`backend/src/common/decorators/secured.decorator.ts`:

```ts
export const SECURED_GUARDS = [JwtAuthGuard, RolesGuard, PermissionsGuard] as const;

export const Secured = (...accountTypes: AccountType[]) =>
  applyDecorators(
    UseGuards(...SECURED_GUARDS),
    ...(accountTypes.length > 0 ? [RequireRoles(...accountTypes)] : []),
  );
```

One decorator wires all three guards in the correct order and optionally pins the account type.
**Every protected route in the application uses it**; `grep -rn "@Secured" backend/src` finds it on
every controller route that needs authorization.

### Why this exists — the bug that was fixed

`@RequireAdminRole(...)` was **dead metadata**: it set `REQUIRED_ADMIN_ROLE_KEY` and *nothing ever
read it*, because no controller applied `RolesGuard`. Any authenticated user — including a
`reader` — could read `GET /api/v1/moderation/stats`. `@Secured()` closes that by always applying
`RolesGuard`, so `RequireAdminRole` is now actually consulted
(`backend/src/common/guards/roles.guard.ts:44`). The regression is pinned by
`backend/src/common/guards/roles.guard.e2e-spec.ts` (17 tests) and
`backend/src/common/guards/roles.guard.spec.ts`.

### RolesGuard — ✅
`backend/src/common/guards/roles.guard.ts`. Reads `IS_PUBLIC_KEY`, `REQUIRED_ACCOUNT_TYPES_KEY` and
`REQUIRED_ADMIN_ROLE_KEY`; denies with `Access denied` / `Insufficient admin privileges` /
`Insufficient permissions`.

### PermissionsGuard — ✅
`backend/src/common/guards/permissions.guard.ts`. Registered in `common.module.ts` and exported
alongside `RolesGuard`. `OwnershipGuard` is deliberately **not** registered there — it is a
per-route factory and is not DI-constructible.

### OwnershipGuard — ⚠️ built, not yet wired

`backend/src/common/guards/ownership.guard.ts` is a **factory**, not an `@Injectable()`:

```ts
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: OwnershipResolver,   // resolveOwnerId(request) => string | null
    private readonly options: OwnershipGuardOptions = {},  // { allowSuperAdmin?, message? }
  ) {}
}
```

It resolves the resource owner through a caller-supplied `OwnershipResolver` and only engages when
a declared permission ends in `:own`. It passes for public routes, for routes with no `:own`
requirement, and for super admins (unless `allowSuperAdmin: false`).

**⛔ No module uses it.** A grep for `OwnershipGuard` / `createOwnershipGuard` across `backend/src`
matches only the guard file and its own spec. Ownership is currently enforced by the **services**
(`stories.service.ts`, `books.service.ts`, …) comparing `author === userId` inline, not by the guard.
The guard is the intended extraction point; the requirement is retained.

---

## Usage in Controllers — ✅ real pattern

```ts
@Controller('moderation')
export class ModerationController {
  // authenticated, no specific role
  @Get('reports')
  @Secured()

  // admin + a specific admin role
  @Get('stats')
  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)

  // fine-grained permission
  @Get('actions')
  @Secured()
  @RequirePermissions(Permission.ACTIONS_VIEW)
}
```

`RequirePermissions()` (not `@Permissions()`) is the real decorator name
(`backend/src/common/decorators/roles.decorator.ts`). Controllers that use it today:
`moderation.controller.ts`, `badges.controller.ts`, `users.controller.ts`.

---

## Permission Matrix

Derived from `PERMISSIONS_BY_ACCOUNT_TYPE` and `PERMISSIONS_BY_ROLE`
(`backend/src/common/permissions/permissions.ts:168-217`).

| Action | Reader | Writer | Rising Star | Professional | Publisher | Admin |
|--------|--------|--------|-------------|--------------|-----------|-------|
| Read published content (`content:read`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create story (`stories:create`) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit own story (`stories:edit:own`) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete own story (`stories:delete:own`) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit any story (`stories:edit:all`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Delete any story (`stories:delete:all`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Moderate content (`content:moderate`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (content_moderator, super_admin) |
| Restrict users (`users:restrict:all`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (super_admin) |
| Verify users (`users:verify:all`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (verification_officer, super_admin) |
| Manage finance (`financial:manage:all`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (financial_officer, super_admin) |
| Manage contests (`contests:*`) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Sell books (`books:sell:own`) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage settings (`settings:manage`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Fail-Closed Design — ✅ implemented
- Permission check fails → **deny** (`ForbiddenException`)
- No `request.user` → **deny** (`Access denied`)
- Unknown account type → normalized to `reader` (least privilege)
- Public route → allow (an explicit, deliberate opt-in)

There is no code path in which a failed check results in granted access.

---

## Audit Trail — ⛔ NOT IMPLEMENTED

**No permission decision is logged.** A grep for `audit` across
`backend/src/common/permissions/` and `backend/src/common/guards/` returns zero hits. There is no
permission-check log, no decision record, and no table that stores allow/deny outcomes.

What *is* logged today:
- 401/403 responses by `AllExceptionsFilter` (`backend/src/common/filters/all-exceptions.filter.ts:52`)
- Moderation actions and user restrictions through the `moderation_actions` table and
  `user_restrictions` — but those record *administrative* actions, not authorization decisions
- WAF and correlation IDs on the request

The requirement below is retained, not implemented:

> Every permission check should be logged with: user ID · resource accessed · action attempted ·
> permission checked · result (allowed/denied) · timestamp · IP address.

---

## Changelog — reconciliation (2026-09-30)

| Claim | Reality | Evidence |
|---|---|---|
| "`{resource}:{action}:{scope}`" format | Two-part **or** three-part; the type is a union | `backend/src/common/permissions/permissions.ts:59` |
| 10 example permissions incl. `users:manage`, `contests:manage` | **51** permissions; `users:manage:all` and `contests:*` are the real names | `backend/src/common/permissions/permissions.ts:62-117` |
| `isVerifiedSuperAdmin()` + super-admin Google-ID whitelist | ⛔ Never existed. `isSuperAdmin(accountType, adminRole)` only | `packages/shared-types/src/user.ts` |
| "check user's account type → look up permissions for role" | Real order: public → no-requirement → super-admin → resolve → `hasPermission` | `backend/src/common/guards/permissions.guard.ts:19-45` |
| Guards shown as `@Injectable()` reading a `session` via `auth()` | Guards read `request.user`; there is no `auth()` session helper | `backend/src/common/guards/permissions.guard.ts:30` |
| `OwnershipGuard` as an `@Injectable()` | It is a **factory** taking `(reflector, resolver, options)` | `backend/src/common/guards/ownership.guard.ts:23-27` |
| `OwnershipGuard` used by controllers | ⛔ Used by **no** module; ownership is enforced inline in services | zero non-spec matches |
| `@Permissions(...)` decorator name | The real decorator is `RequirePermissions(...)` | `backend/src/common/decorators/roles.decorator.ts` |
| `AuthGuard` | Named `JwtAuthGuard`; the three are composed by `@Secured()` | `backend/src/common/decorators/secured.decorator.ts:11` |
| "Audit Trail: all permission checks are logged" | ⛔ Not implemented, no permission-decision logging | zero `audit` hits in `permissions/`, `guards/` |
| Roles declared ad hoc | Re-exported from `@hakawi/shared-types`, the single source | `backend/src/common/constants/roles.ts` |
| Legacy `author` account type | ⛔ Not mentioned; handled by `LEGACY_ACCOUNT_TYPE_MAP` → `writer` | `packages/shared-types/src/user.ts:33` |

**Newly documented (was missing entirely):** the authorization hole that `@Secured()` closed —
`@RequireAdminRole` was dead metadata and `RolesGuard` was never applied, so any authenticated user
could read moderation stats.

---

*This document defines the permissions architecture for Hakawi.*
