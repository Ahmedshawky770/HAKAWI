import { describe, expect, it } from 'vitest';

import { parseMigrationArgv } from './migration-cli.ts';

describe('parseMigrationArgv', () => {
  it('defaults to up when no argument is given', () => {
    expect(parseMigrationArgv([])).toEqual({
      command: 'up',
      steps: null,
      to: null,
      allowDataLoss: false,
      allowProduction: false,
    });
  });

  it('parses every command', () => {
    for (const command of ['up', 'down', 'status', 'list', 'verify'] as const) {
      expect(parseMigrationArgv([command]).command).toBe(command);
    }
  });

  it('parses --steps in both spellings', () => {
    expect(parseMigrationArgv(['down', '--steps', '3']).steps).toBe(3);
    expect(parseMigrationArgv(['down', '--steps=3']).steps).toBe(3);
  });

  it('parses --to in both spellings', () => {
    expect(parseMigrationArgv(['down', '--to', '0009_create_payments_tables']).to).toBe('0009_create_payments_tables');
    expect(parseMigrationArgv(['down', '--to=0009_create_payments_tables']).to).toBe('0009_create_payments_tables');
  });

  it('parses the acknowledgement flags', () => {
    expect(parseMigrationArgv(['down', '--allow-data-loss']).allowDataLoss).toBe(true);
    expect(parseMigrationArgv(['up', '--allow-production']).allowProduction).toBe(true);
  });

  it('rejects an unknown command and lists the valid ones', () => {
    expect(() => parseMigrationArgv(['sideways'])).toThrow(/Expected one of: up, down, status, list, verify/);
  });

  it('rejects an unknown flag and lists the valid ones', () => {
    expect(() => parseMigrationArgv(['up', '--force'])).toThrow(
      /Supported flags: --steps, --to, --allow-data-loss, --allow-production/,
    );
  });

  it('rejects two commands', () => {
    expect(() => parseMigrationArgv(['up', 'status'])).toThrow(/already set to "up"/);
  });

  it('rejects --steps or --to outside the down command', () => {
    expect(() => parseMigrationArgv(['up', '--steps', '2'])).toThrow(/only valid with the "down" command/);
    expect(() => parseMigrationArgv(['status', '--to', '0000_first'])).toThrow(/only valid with the "down" command/);
  });

  it('rejects --steps and --to together', () => {
    expect(() => parseMigrationArgv(['down', '--steps', '2', '--to', '0000_first'])).toThrow(/mutually exclusive/);
  });

  it('rejects an acknowledgement flag on the wrong command', () => {
    expect(() => parseMigrationArgv(['status', '--allow-data-loss'])).toThrow(/--allow-data-loss is only valid/);
    expect(() => parseMigrationArgv(['down', '--allow-production'])).toThrow(/--allow-production is only valid/);
  });

  it('rejects a non positive or non numeric --steps', () => {
    expect(() => parseMigrationArgv(['down', '--steps', '0'])).toThrow(/positive integer/);
    expect(() => parseMigrationArgv(['down', '--steps', '-1'])).toThrow(/positive integer/);
    expect(() => parseMigrationArgv(['down', '--steps', 'two'])).toThrow(/positive integer/);
  });

  it('rejects a flag with no value', () => {
    expect(() => parseMigrationArgv(['down', '--steps'])).toThrow(/--steps requires a value/);
    expect(() => parseMigrationArgv(['down', '--to'])).toThrow(/--to requires a value/);
    expect(() => parseMigrationArgv(['down', '--to', '--allow-data-loss'])).toThrow(/--to requires a value/);
  });
});
