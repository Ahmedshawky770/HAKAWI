import { MigrationStructureError } from './migration-errors.ts';
import type { ParsedMigrationCommand, MigrationCommand } from './migration-types.ts';

const COMMANDS: readonly MigrationCommand[] = ['up', 'down', 'status', 'list', 'verify'];
const KNOWN_FLAGS = new Set(['--steps', '--to', '--allow-data-loss', '--allow-production']);

function readFlagValue(argv: readonly string[], index: number, flag: string): string {
  const inline = argv[index]?.startsWith(`${flag}=`) === true ? (argv[index] as string).slice(flag.length + 1) : null;
  if (inline !== null) {
    if (inline.length === 0) {
      throw new MigrationStructureError(`${flag} requires a value`);
    }
    return inline;
  }
  const next = argv[index + 1];
  if (next === undefined || next.startsWith('--')) {
    throw new MigrationStructureError(`${flag} requires a value`);
  }
  return next;
}

export function parseMigrationArgv(argv: readonly string[]): ParsedMigrationCommand {
  let command: MigrationCommand = 'up';
  let steps: number | null = null;
  let to: string | null = null;
  let allowDataLoss = false;
  let allowProduction = false;
  let commandSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;

    if (!token.startsWith('--')) {
      if (commandSeen) {
        throw new MigrationStructureError(
          `Unexpected argument "${token}". The command was already set to "${command}".`,
        );
      }
      if (!COMMANDS.includes(token as MigrationCommand)) {
        throw new MigrationStructureError(`Unknown command "${token}". Expected one of: ${COMMANDS.join(', ')}.`);
      }
      command = token as MigrationCommand;
      commandSeen = true;
      continue;
    }

    const flag = token.split('=')[0] as string;
    if (!KNOWN_FLAGS.has(flag)) {
      throw new MigrationStructureError(`Unknown flag "${token}". Supported flags: ${[...KNOWN_FLAGS].join(', ')}.`);
    }

    if (flag === '--allow-data-loss') {
      allowDataLoss = true;
      continue;
    }

    if (flag === '--allow-production') {
      allowProduction = true;
      continue;
    }

    const value = readFlagValue(argv, index, flag);
    if (!token.includes('=')) {
      index += 1;
    }

    if (flag === '--steps') {
      const parsed = Number.parseInt(value, 10);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1) {
        throw new MigrationStructureError(`--steps requires a positive integer, received "${value}"`);
      }
      steps = parsed;
      continue;
    }

    to = value;
  }

  if (command !== 'down' && (steps !== null || to !== null)) {
    throw new MigrationStructureError('--steps and --to are only valid with the "down" command');
  }
  if (steps !== null && to !== null) {
    throw new MigrationStructureError('--steps and --to are mutually exclusive');
  }

  if (command !== 'down' && allowDataLoss) {
    throw new MigrationStructureError('--allow-data-loss is only valid with the "down" command');
  }
  if (command !== 'up' && allowProduction) {
    throw new MigrationStructureError('--allow-production is only valid with the "up" command');
  }

  return { command, steps, to, allowDataLoss, allowProduction };
}
