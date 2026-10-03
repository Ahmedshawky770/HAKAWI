import { createHash } from 'crypto';

export function normalizeMigrationContent(content: string): string {
  const withUnixLineEndings = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  return `${withUnixLineEndings.trimEnd()}\n`;
}

export function computeMigrationChecksum(content: string): string {
  return createHash('sha256').update(normalizeMigrationContent(content), 'utf8').digest('hex');
}
