export class ContestCreatedEvent {
  constructor(public readonly contestId: string, public readonly createdBy: string) {}
}

export class ContestStartedEvent {
  constructor(public readonly contestId: string) {}
}

export class ContestCompletedEvent {
  constructor(public readonly contestId: string, public readonly winnerId: string) {}
}

export class SubmissionSubmittedEvent {
  constructor(public readonly submissionId: string, public readonly contestId: string, public readonly authorId: string) {}
}

export class SubmissionApprovedEvent {
  constructor(public readonly submissionId: string, public readonly contestId: string, public readonly authorId: string) {}
}

export class SubmissionRejectedEvent {
  constructor(public readonly submissionId: string, public readonly contestId: string, public readonly authorId: string) {}
}

export class VoteCastEvent {
  constructor(public readonly voteId: string, public readonly contestId: string, public readonly submissionId: string, public readonly userId: string) {}
}

export class WinnerSelectedEvent {
  constructor(public readonly contestId: string, public readonly submissionId: string, public readonly winnerId: string) {}
}

export class PrizeDistributedEvent {
  constructor(public readonly prizeId: string, public readonly contestId: string, public readonly winnerId: string) {}
}
