# Principle #7: Loose Coupling Between Modules

**Statement:**
Every module in my system integrates with others through well-defined interfaces and contracts, never through direct internal dependencies. If I need to swap a component, I should be able to do so without touching the rest of the system. Tight coupling is the silent killer of maintainability — it turns a small change into a system-wide rewrite.

**Rationale:**
- Tight coupling makes changes expensive
- Hard to test in isolation
- Difficult to deploy independently
- Risk of cascade failures

**Enforcement:**
- Modules communicate via interfaces only
- No direct database access across modules
- Dependency injection for all dependencies
- Event-driven communication for loose coupling

**Patterns:**
- Repository pattern for data access
- Service layer for business logic
- Event emitter for cross-module communication
- Interface segregation
