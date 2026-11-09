# ADR 018 — Request body size limit bypassable with Transfer-Encoding: chunked

- **Status:** Accepted
- **Date:** 2026-11-09
- **Supersedes:** nothing
- **Related:** `backend/src/main.ts:41-63`, `backend/src/common/middleware/waf.middleware.ts`

## Context

`requestSizeLimit` in `main.ts` rejects requests whose `Content-Length` header
exceeds 10 MB. Requests using `Transfer-Encoding: chunked` have no
`Content-Length`, so the early check does not apply. The Express body parsers
are mounted with the same 10 MB `limit`, so they abort the stream mid-upload —
but the WAF's `measureBodyBytes` counterpart reads `rawBody` captured by the
`verify` hook, which only has the bytes Express has already buffered.

The comment in `main.ts` (lines 52-58) states plainly that `Transfer-Encoding:
chunked` bodies are **not counted against the limit here**, and that the parsers'
own `limit` is the control that prevents unbounded buffering.

## Decision

The 10 MB limit remains enforced by `express.json({ limit: '10mb' })` and
`express.urlencoded({ limit: '10mb' })`. `requestSizeLimit` is a best-effort
early rejection for `Content-Length` requests only; chunked requests rely on the
parsers' stream abort.

## Consequences

**Accepted risk:** a chunked request can stream more than 10 MB before Express
aborts it. The excess is held in Express's internal buffer, not in the
application's memory, so the risk is bounded by the parser's own limit rather
than being unbounded. A malicious client can still cause a 10 MB allocation per
chunked request.

**Why not reject chunked outright:** some legitimate clients (streaming uploads,
large file transfers) use chunked encoding, and rejecting it would break them.
The parser limit is the correct enforcement point; `requestSizeLimit` is an
early-exit optimization for the common case.

**Not done:** a WAF rule that counts bytes as they stream through. That would
require intercepting the raw request before Express parses it, which is a
larger change to the middleware stack.

---

## Addendum

The elimination path is: measure body bytes at the WAF layer by wrapping the
request stream and counting bytes as they arrive, rejecting any stream that
crosses 10 MB before Express ever sees it.
