# Principle #1: Zero `any` / `as any` Policy

**Statement:**
TypeScript's `any` type and `as any` casts are strictly banned from my codebase. If the compiler cannot verify a type, I do not ship it. Type safety is the first line of defense against runtime errors, and bypassing it is technical debt in disguise. Every type must be explicit, every cast must be justified.

**Rationale:**
- `any` bypasses TypeScript's type system
- Runtime errors that could be caught at compile time
- Technical debt that compounds over time
- Makes refactoring dangerous

**Enforcement:**
- ESLint rule: `@typescript-eslint/no-explicit-any` (error)
- CI check: `tsc --noEmit` must pass
- Code review: explicit check for `any` usage

**Exceptions:**
- Third-party library types that are untyped (must be wrapped)
- Dynamic JSON parsing (must be validated with Zod first)
