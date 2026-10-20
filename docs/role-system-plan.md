# Role System Plan — Hakawi Platform

**Status**: ✅ **IMPLEMENTED** — All planned features are now live as of 2026-10-20.

This document serves as the historical implementation plan. See [Admin Roles System](./admin-roles-system.md) for current state.

---

## 1. Account Types (Implemented)

`packages/shared-types/src/user.ts` — `ACCOUNT_TYPES`:
`reader` · `rising_star` · `professional` · `publisher` · `admin`

Implication lattice (`ACCOUNT_TYPE_IMPLIES`):
`rising_star` ⊃ `writer` ⊃ `reader`; `professional` ⊃ `writer`; `publisher` ⊃ `writer`; `admin` ⊃ all.

---

## 2. Admin Roles (Implemented)

Four specialized admin roles with distinct permissions:

| Role | Permissions | Use Case |
|------|-------------|----------|
| `super_admin` | ALL_PERMISSIONS (51) | Platform owner, emergency access |
| `content_moderator` | Content moderation, user restrictions, reports | Community management |
| `financial_officer` | Financial data, payments, refunds | Finance operations |
| `verification_officer` | User verification, publisher provisioning | Identity & publisher onboarding |

---

## 3. Permission System (Implemented)

51 granular permissions in `backend/src/common/permissions/permissions.ts` with:
- Resource:Action:Scope pattern
- AND/OR evaluation modes
- `PERMISSIONS_BY_ACCOUNT_TYPE` and `PERMISSIONS_BY_ROLE` matrices

---

## 4. Upgrade Paths (Implemented)

### Reader → Rising Star (Self-Service)
- Email verification required
- `POST /users/me/upgrade {target:'rising_star'}`
- Sets `accountType=rising_star`, revokes tokens, emits `user.upgraded`

### Rising Star → Professional (Approval-Gated)
- Eligibility thresholds:
  - 5+ published stories
  - 1,000+ story views
  - 100+ story reactions
  - 50+ followers
  - Email verified
- `verification_officer` reviews and approves
- On approval: `accountType=professional`, token revocation, cache invalidation

### Reader → Publisher (Admin-Only)
- Institutional role, no self-service
- Provisioned by `super_admin`/`verification_officer`
- `POST /users` with `accountType=publisher`

---

## 5. Admin Role Management (Implemented)

### API Endpoints
```
POST   /api/v1/admin/roles/assign      # Assign role to user
DELETE /api/v1/admin/roles/revoke      # Revoke role from user
GET    /api/v1/admin/roles             # List assignments (with filters)
GET    /api/v1/admin/roles/stats       # Role statistics
POST   /api/v1/admin/roles/break-glass # Emergency temporary access
```

### Audit Trail
Every assignment/revocation recorded in `admin_role_assignments`:
- `user_id`, `admin_role`, `assigned_by`, `reason`, `assigned_at`
- `revoked_at`, `revoked_by`, `revoke_reason`
- `environment` scoping

### Role Expiry
- `admin_role_expires_at` column on users table
- Configurable default (365 days)
- Daily cleanup at 2 AM auto-expires roles
- Warning at 30 days before expiry

### Break-Glass (Emergency)
- Self-invocation by `super_admin` only
- Requires MFA
- Max 60 minutes duration
- Full audit logging with `BREAK-GLASS:` prefix
- Event emission for SIEM

### Environment Scoping
- Roles scoped to `environment` (production, staging, development)
- Defaults to `app.environment` config
- Query-level isolation

---

## 6. Payments Controller Fix (Implemented)

Fixed to use proper decorators instead of manual role checks:
```typescript
@Secured(AccountType.ADMIN)
@RequireAdminRole(AdminRole.FINANCIAL_OFFICER, AdminRole.SUPER_ADMIN)
@RequirePermissions(Permission.FINANCIAL_MANAGE_ALL)
@RequireMfa()
```

---

## 7. Documentation Updated

- [Admin Roles System](./admin-roles-system.md) — Complete implementation docs
- [Security Architecture Overview](./security-architecture/overview/security-architecture.md)
- [Permissions Overview](./security-architecture/permissions/permissions-overview.md)
- [Authentication Overview](./security-architecture/auth/auth-overview.md)
- [API Contract](./api-contract/openapi/rest-api-spec.md)
- [Module Boundaries](./module-boundaries/overview/module-boundaries.md)

---

## 8. Migrations

| Migration | Description |
|---|---|
| `0032_create_admin_role_assignments.sql` | Audit trail table with indexes |
| `0033_add_admin_role_expires_at.sql` | Expiry column on users |

---

## 9. Testing

- Unit tests: Role assignment, break-glass, expiry, environment filtering
- E2E tests: Full lifecycle, MFA enforcement, break-glass, cross-env isolation
- All lint/typecheck passing

---

## 10. Execution Summary

All planned items completed:
1. ✅ Backend permissions + UpdateUserInput/Dto + controller guards
2. ✅ Backend upgrade endpoint + admin provisioning
3. ✅ Frontend gating + onboarding (optional)
4. ✅ Docs update
5. ✅ Tests (unit + e2e)
6. ✅ Typecheck + lint + tests

**Ready for production deployment.**