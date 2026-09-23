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
- Event handlers are registered in modules
- No event schema registry yet (planned for Phase 7)
- No dead letter queue for failed events
