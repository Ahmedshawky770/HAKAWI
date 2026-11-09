# ADR 015 — Swagger UI enabled in production by default

- **Status:** Accepted
- **Date:** 2026-11-09
- **Supersedes:** nothing
- **Related:** `backend/src/main.ts:249`, `backend/src/common/swagger/swagger.config.ts`,
  `backend/src/common/middleware/swagger-auth.middleware.ts`,
  `docs/security-architecture/`, `README.md` § Run

## Context

`setupSwagger(app)` is called in `bootstrap()` unless `ENABLE_SWAGGER === 'false'`
(`backend/src/main.ts:249`). The default is therefore **enabled**, including in
production. OpenAPI at `/api/v1/api/docs` exposes the complete API surface — every
route, every request body, every response shape, every parameter name — to anyone
who can reach the host.

## Decision

Swagger remains enabled by default. The operator must explicitly set
`ENABLE_SWAGGER=false` to disable it entirely. **Access to the Swagger UI and
OpenAPI JSON is protected by JWT authentication** via `SwaggerAuthMiddleware`
(`backend/src/common/middleware/swagger-auth.middleware.ts`), registered on the
`/api/v1/api/docs` path prefix inside `setupSwagger()`.

## Consequences

**Resolved risk:** an attacker who reaches the production host cannot read the
full API contract without a valid access token. The middleware returns 401 for
requests without a token, and 401 for invalid/expired tokens.

**Production hardening:** in production (`NODE_ENV === 'production'`), the
middleware additionally requires the `super_admin` role. Any other authenticated
role receives 403. This is controlled by `SWAGGER_REQUIRE_SUPER_ADMIN`
(default `true` in production, `false` elsewhere). The admin role check reads
`adminRole` from the verified JWT payload, not from a cookie, so a stolen
cookie alone cannot reach the docs.

**Mitigation outside this ADR:** the production deployment should still place
the API behind an ingress or WAF as defense-in-depth, or set
`ENABLE_SWAGGER=false` in the production environment if the docs are not
needed at all.

**Not done:** nothing. Authentication on the Swagger endpoint is implemented
and covered by `backend/src/common/middleware/swagger-auth.middleware.spec.ts`
(7 tests).

**Why not disabled by default:** the development and staging workflows rely on
the interactive docs for integration work, and changing the default would break
those workflows for every developer. Authentication protects production while
keeping docs accessible to authenticated developers.

---

## Addendum

This ADR no longer accepts the risk unmitigated — authentication is enforced.
The full elimination path remains `ENABLE_SWAGGER=false` in
`backend/.env.production.template` and every production values file
(`infrastructure/helm/backend/values-production.yaml`).
