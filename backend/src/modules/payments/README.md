# Payments Module

## Overview
Manages payment processing, transactions, and refunds via Paymob integration.

## Endpoints
- `POST /payments` - Create a payment (authenticated)
- `GET /payments/:id` - Get payment by ID (authenticated)
- `GET /payments` - List current user's payments (authenticated)
- `PATCH /payments/:id/status` - Update payment status (authenticated)
- `POST /payments/:id/refund` - Create refund for payment (authenticated)
- `GET /payments/:id/refunds` - List refunds for payment (authenticated)

## Features
- Payment creation with Paymob integration
- Order initialization and callback handling
- Payment status tracking (pending, processing, completed, failed)
- Refund processing with reason tracking
- Transaction history for each payment
- Valkey caching for payment lookups

## Caching Strategy
- Individual payments are cached in Valkey with 5-minute TTL
- Cache key format: `payment:{id}`
- Cache is invalidated on status updates

## Configuration
- `PAYMOB_API_KEY` - Paymob API key
- `PAYMOB_MERCHANT_ID` - Paymob merchant ID
- `PAYMOB_WEBHOOK_SECRET` - Webhook verification secret
- `PAYMOB_BASE_URL` - Paymob API base URL

## Repository Pattern
- `IPaymentsRepository` interface defines the contract
- `PaymentsRepository` implements data access with Drizzle ORM
- Dependency injection via `PAYMENTS_REPOSITORY` token

## Events
- `payment.created` - Emitted when a payment is created
- `payment.completed` - Emitted when a payment is completed
- `payment.failed` - Emitted when a payment fails
- `refund.created` - Emitted when a refund is created
- `refund.completed` - Emitted when a refund is completed
