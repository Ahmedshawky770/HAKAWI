# Rentals Module

## Overview
Manages book rental lifecycle including creation, extensions, returns, and expiry.

## Endpoints
- `GET /rentals/my` - Get current user's rentals (authenticated)
- `GET /rentals/:id` - Get rental by ID (authenticated)
- `POST /rentals/:id/extend` - Extend rental period, as a checkout (authenticated)
- `GET /rentals/:id/extend/quote` - The price of an extension, before any money moves (authenticated)
- `POST /rentals/:id/return` - Return rental early (authenticated)
- `GET /rentals/overdue` - List overdue rentals (authenticated)

**There is no `POST /rentals`, by design.** It used to create an ACTIVE rental for nothing, which
made the payment-first flow bypassable with one request. A rental is created only by money:
`POST /books/:id/rent` initialises a Paymob checkout whose metadata describes what was bought, and
`RentalsEventHandler` writes the row when `payment.completed` arrives. The route is pinned to a
404 by the controller spec and the e2e suite.

## Features
- Rental creation with configurable duration
- Extension system with maximum extension limits
- Early return support
- Automatic expiry detection
- Active rental conflict prevention
- Valkey caching for rental lookups

## Caching Strategy
- Individual rentals are cached in Valkey with 5-minute TTL
- Cache key format: `rental:{id}`
- Cache is invalidated on updates, extensions, returns, and expiry

## Repository Pattern
- `IRentalsRepository` interface defines the contract
- `RentalsRepository` implements data access with Drizzle ORM
- Dependency injection via `RENTALS_REPOSITORY` token

## Events
- `rental.created` - Emitted when a rental is created
- `rental.extended` - Emitted when a rental is extended
- `rental.returned` - Emitted when a rental is returned early
- `rental.expired` - Emitted when a rental expires
