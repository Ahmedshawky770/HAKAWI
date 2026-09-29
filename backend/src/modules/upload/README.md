# Upload Module

## Overview
Manages file uploads with presigned S3 URLs for images and PDFs.

## Endpoints
- `POST /upload/image` - Generate presigned URL for image upload
- `POST /upload/pdf` - Generate presigned URL for PDF upload
- `DELETE /upload/:filename` - Delete uploaded file (authenticated)

## Features
- Presigned S3 URL generation for client-side uploads
- Support for images (JPEG, PNG, WebP, GIF) and PDFs
- File size validation
- Circuit breaker for S3 resilience
- Valkey caching for upload metadata

## Configuration
- `STORAGE_BUCKET` - S3 bucket name (default: `hakawi-media`)
- `STORAGE_CDN_URL` - Optional CDN base URL
- `MAX_FILE_SIZE` - Maximum file size in bytes (default: 10485760 / 10MB)
- `ALLOWED_IMAGE_TYPES` - Comma-separated allowed image MIME types
- `ALLOWED_PDF_TYPES` - Comma-separated allowed PDF MIME types

## Repository Pattern
- Direct database access via Drizzle ORM
- Upload records persisted in `uploads` table
- No dedicated repository interface

## Events
- No domain events emitted
