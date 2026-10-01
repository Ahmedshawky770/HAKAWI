# Frontend Container
## Hakawi C4 - Container View

**Purpose:** Deliver the web UI for readers, writers, publishers, and admins.

**Technology:**
- Next.js **16.3.5** App Router
- TypeScript
- Tailwind CSS 4
- 5 hand-written components in `components/ui/` — ⚠️ Shadcn and Radix are **not installed**
- TanStack Query
- ~50 Zod response schemas in `lib/schemas.ts`
- `@hakawi/shared-types` (compiled package)

**Responsibilities:**
- SSR/SSG pages
- Client-side interactions
- Auth UI and redirects to NestJS auth endpoints
- API consumption
- Optional PWA layer

**Deployment:** Vercel or containerized Next.js

**Dependencies:** Backend REST API
