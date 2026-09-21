# Principle #10: Unified Typing Files

**Statement:**
All TypeScript types, interfaces, and enums live in dedicated, centralized typing files — not scattered across components or modules. This ensures consistency, prevents duplication, eliminates type conflicts, and makes refactoring predictable. One source of truth for types, just as there is one source of truth for data.

**Rationale:**
- Scattered types cause duplication
- Type conflicts are hard to resolve
- Refactoring is unpredictable
- IDE autocomplete is less effective

**Enforcement:**
- All types in `src/types/` or module-level `types.ts`
- No inline type definitions in components
- Shared types in `shared/types/`
- Barrel exports for clean imports

**Structure:**
```
src/
├── types/
│   ├── user.types.ts
│   ├── story.types.ts
│   ├── book.types.ts
│   └── index.ts
└── modules/
    ├── users/
    │   └── types.ts  # Module-specific types
    └── stories/
        └── types.ts  # Module-specific types
```
