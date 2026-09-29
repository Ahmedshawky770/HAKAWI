# Books Module

## Overview
Manages book CRUD operations, publishing workflow, and download tracking.

## Endpoints
- `GET /books` - List all books
- `GET /books/:id` - Get book by ID
- `GET /books/isbn/:isbn` - Get book by ISBN
- `POST /books` - Create book (authenticated)
- `PATCH /books/:id` - Update book (authenticated)
- `POST /books/:id/publish` - Publish book (authenticated)
- `POST /books/:id/archive` - Archive book (authenticated)
- `POST /books/:id/download` - Increment download count and get URL (authenticated)
- `DELETE /books/:id` - Soft delete book (authenticated)

## Features
- Book CRUD with status workflow (draft, published, archived)
- ISBN uniqueness validation
- Cover image and PDF support
- View and download count tracking
- Search integration via search module
- Soft delete support

## Caching Strategy
- Individual books are cached in Valkey with 10-minute TTL
- Cache key format: `book:{id}`
- Cache is invalidated on update, archive, and delete

## Repository Pattern
- `IBooksRepository` interface defines the contract
- `BooksRepository` implements data access with Drizzle ORM
- Dependency injection via `BOOKS_REPOSITORY` token

## Events
- `book.created` - Emitted when a book is created
- `book.updated` - Emitted when a book is updated
- `book.published` - Emitted when a book is published
- `book.archived` - Emitted when a book is archived
- `book.deleted` - Emitted when a book is deleted
