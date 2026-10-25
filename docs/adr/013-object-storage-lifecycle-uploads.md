# ADR-013: Object Storage Lifecycle for Soft-Deleted Uploads

## Status
Accepted

## Context
`UploadService.deleteFile` hard-deletes both the S3 object and the DB row.
Soft-deleted uploads (`uploads.deleted_at` set) keep their S3 objects indefinitely —
a storage-cost and information-leakage risk. No process removed orphaned bucket
objects.

## Decision
1. `backend/scripts/cleanup-orphaned-uploads.ts` finds soft-deleted uploads older
   than a retention window (default 30 days) and deletes their S3 objects, leaving
   the DB row intact for audit.
2. Runs as a scheduled job (cron / NestJS `Cron` / CI). Supports `--dry-run` and
   `--older-than-days`.
3. Reads from `dbPrimary` for an accurate, up-to-date list of soft-deleted uploads.

## Consequences
- Orphaned S3 objects are reclaimed on a schedule.
- DB rows retained for audit; bucket objects removed after retention.
- `--dry-run` allows previewing deletions before execution.

## References
- Principle #15 Proactive Defense — preventive storage hygiene.
- `backend/scripts/cleanup-orphaned-uploads.ts`
- `backend/src/modules/upload/upload.service.ts`
