# ADR-002: Use NestJS for Backend Framework

## Status
Accepted

## Context
We needed a backend framework that supports:
- TypeScript with decorators
- Dependency injection
- Modular architecture
- Testing support
- Enterprise-grade features

## Decision
We chose **NestJS** over other options (Express, Fastify, tRPC) because:
- It provides enterprise-grade architecture out of the box
- It supports dependency injection and modular design
- It has built-in support for guards, interceptors, and pipes
- It integrates well with TypeScript and decorators
- It has a large ecosystem and community support

## Consequences
- All modules follow NestJS patterns (@Module, @Controller, @Injectable)
- Dependency injection is used throughout the application
- Testing is simplified with NestJS testing utilities
- Learning curve for developers new to NestJS
