export class MigrationError extends Error {
  readonly migrationId: string | null;

  constructor(message: string, migrationId: string | null = null) {
    super(message);
    this.name = 'MigrationError';
    this.migrationId = migrationId;
  }
}

export class MigrationStructureError extends MigrationError {
  constructor(message: string, migrationId: string | null = null) {
    super(message, migrationId);
    this.name = 'MigrationStructureError';
  }
}

export class MigrationChecksumMismatchError extends MigrationError {
  readonly expectedChecksum: string;
  readonly recordedChecksum: string;

  constructor(migrationId: string, filename: string, recordedChecksum: string, expectedChecksum: string) {
    super(
      `Migration ${migrationId} (${filename}) is already applied but its contents changed on disk. ` +
        `Recorded checksum ${recordedChecksum} does not match the file checksum ${expectedChecksum}. ` +
        'An applied migration must never be edited: restore the original file, or add a new numbered migration instead.',
      migrationId,
    );
    this.name = 'MigrationChecksumMismatchError';
    this.recordedChecksum = recordedChecksum;
    this.expectedChecksum = expectedChecksum;
  }
}

export class MigrationLedgerDriftError extends MigrationError {
  readonly drift: readonly string[];

  constructor(message: string, drift: readonly string[]) {
    super(message, null);
    this.name = 'MigrationLedgerDriftError';
    this.drift = drift;
  }
}

export class MigrationNotReversibleError extends MigrationError {
  readonly reversibility: string;

  constructor(migrationId: string, filename: string, reversibility: string, reason: string) {
    super(
      `Migration ${migrationId} (${filename}) cannot be rolled back automatically: ${reason} ` +
        'Recover with a forward migration, or restore from a backup. No statements were executed.',
      migrationId,
    );
    this.name = 'MigrationNotReversibleError';
    this.reversibility = reversibility;
  }
}

export class MigrationExecutionError extends MigrationError {
  readonly filename: string;
  readonly statementIndex: number | null;
  readonly cause: unknown;

  constructor(migrationId: string, filename: string, statementIndex: number | null, cause: unknown) {
    const where = statementIndex === null ? '' : ` statement ${statementIndex}`;
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Migration ${migrationId} (${filename}) failed at${where}: ${detail}. The transaction was rolled back.`,
      migrationId,
    );
    this.name = 'MigrationExecutionError';
    this.filename = filename;
    this.statementIndex = statementIndex;
    this.cause = cause;
  }
}
