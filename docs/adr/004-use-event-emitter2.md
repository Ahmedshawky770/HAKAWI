# ADR-004: Use EventEmitter2 for Event-Driven Architecture

## Status
Accepted

## Context
We needed an event system for:
- Decoupling modules
- Triggering side effects (e.g., send welcome email on user registration)
- Audit logging
- Cache invalidation

## Decision
We chose **EventEmitter2** (via `@nestjs/event-emitter`) because:
- It integrates seamlessly with NestJS
- It supports wildcard event patterns
- It has better performance than the native EventEmitter
- It supports async event handlers
- It is actively maintained

## Consequences
- Events are emitted using `eventEmitter.emit(eventName, payload)`
- Event handlers are registered in modules — 16 event modules under `backend/src/common/events/`
  and 19 per-module handlers under `backend/src/modules/*/events/`

### Delivered ahead of the Phase 7 plan
Both of the following were scheduled for Phase 7 (Week 15) and **shipped during Phases 1–2**:

- ✅ **Event schema registry** — `backend/src/common/events/event-schema-registry.ts`. One
  registered schema per event, with versioning and validation via
  `event-validator.service.ts`. A handler that receives an event failing its schema is rejected
  rather than processed.
- ✅ **Dead letter queue** — `backend/src/common/events/dlq.service.ts`. Events whose handler
  throws are captured in the DLQ with their payload and error, rather than being lost.

See `docs/module-boundaries/events/event-schema-registry.md` and
`docs/roadmap/phases/implementation-roadmap.md` → Phase 7.

## Changelog — reconciliation (2026-09-30)

| Previous | Reality |
|---|---|
| "No event schema registry yet (planned for Phase 7)" | ✅ Built. `backend/src/common/events/event-schema-registry.ts` + `event-validator.service.ts` |
| "No dead letter queue for failed events" | ✅ Built. `backend/src/common/events/dlq.service.ts` |
