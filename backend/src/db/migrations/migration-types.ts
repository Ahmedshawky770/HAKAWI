export type MigrationReversibility = 'reversible' | 'data-loss' | 'irreversible';

export type MigrationDataLoss = 'none' | 'columns' | 'rows';

export type MigrationFile = {
  readonly id: string;
  readonly filename: string;
  readonly absolutePath: string;
  readonly checksum: string;
  readonly statements: readonly string[];
};

export type DownScript = {
  readonly id: string;
  readonly filename: string;
  readonly absolutePath: string;
  readonly reversibility: MigrationReversibility;
  readonly dataLoss: MigrationDataLoss;
  readonly reason: string;
  readonly statements: readonly string[];
};

export type LedgerRow = {
  readonly rowId: number;
  readonly migrationId: string;
  readonly filename: string;
  readonly checksum: string;
  readonly appliedAt: Date;
  readonly executionMs: number;
  readonly statementCount: number;
  readonly rolledBackAt: Date | null;
};

export type MigrationStatusKind =
  'applied' | 'pending' | 'checksum-mismatch' | 'orphan-ledger' | 'no-down-script' | 'irreversible';

export type MigrationStatusEntry = {
  readonly id: string;
  readonly filename: string;
  readonly kind: MigrationStatusKind;
  readonly expectedChecksum: string | null;
  readonly recordedChecksum: string | null;
  readonly appliedAt: Date | null;
  readonly executionMs: number | null;
  readonly reversibility: MigrationReversibility | null;
  readonly detail: string;
};

export type MigrationRunResult = {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  readonly adoptedLegacyChecksums: readonly string[];
};

export type MigrationRollbackResult = {
  readonly rolledBack: readonly string[];
};

export type MigrationCommand = 'up' | 'down' | 'status' | 'list' | 'verify';

export type ParsedMigrationCommand = {
  readonly command: MigrationCommand;
  readonly steps: number | null;
  readonly to: string | null;
  readonly allowDataLoss: boolean;
  readonly allowProduction: boolean;
};
