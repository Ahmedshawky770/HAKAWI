# Contests Module

## Overview
Manages writing contests with submissions, voting, and prize distribution.

## Endpoints
- `GET /contests` - List all contests
- `GET /contests/:id` - Get contest by ID
- `POST /contests` - Create contest (authenticated)
- `PATCH /contests/:id` - Update contest (authenticated)
- `POST /contests/:id/start` - Start contest (authenticated)
- `POST /contests/:id/cancel` - Cancel contest (authenticated)
- `POST /contests/:id/complete` - Complete contest (authenticated)
- `POST /contests/:id/submissions` - Submit story to contest (authenticated)
- `GET /contests/:id/submissions` - Get contest submissions
- `POST /contests/:id/votes` - Cast vote for submission (authenticated)
- `GET /contests/:id/votes` - Get contest votes
- `POST /contests/:id/winner` - Select winner (authenticated)
- `POST /contests/:id/submissions/:submissionId/approve` - Approve submission (authenticated)
- `POST /contests/:id/submissions/:submissionId/reject` - Reject submission (authenticated)
- `POST /contests/:id/prizes` - Distribute prize (authenticated)
- `GET /contests/:id/prizes` - Get contest prizes

## Features
- Contest lifecycle (draft, active, voting, completed, cancelled)
- Submission system with word count validation
- Approval and rejection workflow
- Community voting with one vote per user per submission
- Winner selection by publisher
- Prize distribution tracking
- Valkey caching for contest lookups

## Caching Strategy
- Individual contests are cached in Valkey with 10-minute TTL
- Cache key format: `contest:{id}`
- Cache is invalidated on updates, status changes, and winner selection

## Repository Pattern
- `IContestsRepository` interface defines the contract
- `ContestsRepository` implements data access with Drizzle ORM
- Dependency injection via `CONTESTS_REPOSITORY` token

## Events
- `contest.created` - Emitted when a contest is created
- `contest.started` - Emitted when a contest starts
- `contest.completed` - Emitted when a contest is completed
- `contest.cancelled` - Emitted when a contest is cancelled
- `submission.submitted` - Emitted when a story is submitted
- `submission.approved` - Emitted when a submission is approved
- `submission.rejected` - Emitted when a submission is rejected
- `vote.cast` - Emitted when a vote is cast
- `winner.selected` - Emitted when a winner is selected
- `prize.distributed` - Emitted when a prize is distributed
