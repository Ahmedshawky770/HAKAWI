# Categories Module

## Overview
Manages story categories for content organization and discovery.

## Endpoints
- `GET /categories` - List all categories
- `GET /categories/:id` - Get category by ID
- `GET /categories/slug/:slug` - Get category by slug
- `POST /categories` - Create category (authenticated)
- `PATCH /categories/:id` - Update category (authenticated)
- `DELETE /categories/:id` - Soft delete category (authenticated)

## Features
- Category CRUD operations
- Slug-based lookup for SEO-friendly URLs
- Duplicate slug prevention
- Soft delete support

## Repository Pattern
- `ICategoriesRepository` interface defines the contract
- `CategoriesRepository` implements data access with Drizzle ORM
- Dependency injection via `CATEGORIES_REPOSITORY` token

## Events
- No domain events emitted
