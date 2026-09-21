# Principle #3: IDs as Strings

**Statement:**
All entity identifiers are stored, passed, and serialized as strings — never as numbers. This prevents precision loss with large integer IDs, simplifies serialization across system boundaries, and eliminates subtle bugs that arise when numeric IDs overflow or lose precision in JavaScript. Consistency in ID representation is non-negotiable.

**Rationale:**
- UUIDs are strings by nature
- JavaScript numbers lose precision beyond 2^53
- String IDs serialize safely to JSON
- Consistent across API boundaries

**Enforcement:**
- All database schemas use `uuid` or `text` for IDs
- TypeScript types use `string` for all IDs
- API contracts use `string` for all IDs
- No `number` types for identifiers

**Example:**
```typescript
// ❌ BAD
type UserId = number;

// ✅ GOOD
type UserId = string;
```
