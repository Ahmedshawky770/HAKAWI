# Library Module

## Overview
Manages user personal library with owned and rented books.

## Endpoints
- `POST /library` - Add book to user's library (authenticated)
- `GET /library` - Get current user's library (authenticated)
- `GET /library/count` - Get library item count (authenticated)
- `POST /library/:id/access` - Track access to a library item (authenticated)
- `DELETE /library/:id` - Remove book from library (authenticated)

## Features
- Library management for purchased and rented books
- Status tracking (owned, rented, reading)
- Last accessed timestamp for reading progress
- Conflict prevention (duplicate library items)
- Library item counting

## Repository Pattern
- `ILibraryRepository` interface defines the contract
- `LibraryRepository` implements data access with Drizzle ORM
- Dependency injection via `LIBRARY_REPOSITORY` token

## Events
- `library.item.added` - Emitted when a book is added to the library
- `library.item.accessed` - Emitted when a library item is accessed
- `library.item.removed` - Emitted when a book is removed from the library
