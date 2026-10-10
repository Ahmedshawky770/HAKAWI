import { MigrationStructureError } from './migration-errors.ts';

const LINE_COMMENT = '--';
const BLOCK_COMMENT_START = '/*';
const BLOCK_COMMENT_END = '*/';
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const DOLLAR = '$';
const SEMICOLON = ';';

type DollarTag = { readonly tag: string; readonly length: number };

function isDollarTagStart(source: string, index: number): boolean {
  const next = source[index + 1];
  if (next === undefined) {
    return false;
  }
  if (next === DOLLAR) {
    return true;
  }
  return /[A-Za-z_]/.test(next);
}

function readDollarTag(source: string, index: number): DollarTag | null {
  if (source[index] !== DOLLAR || !isDollarTagStart(source, index)) {
    return null;
  }
  let cursor = index + 1;
  while (cursor < source.length && /[A-Za-z0-9_]/.test(source[cursor] as string)) {
    cursor += 1;
  }
  if (source[cursor] !== DOLLAR) {
    return null;
  }
  return { tag: source.slice(index, cursor + 1), length: cursor + 1 - index };
}

function pushStatement(collected: string[], statement: string): void {
  const trimmed = statement.trim();
  if (trimmed.length === 0) {
    return;
  }
  collected.push(trimmed);
}

export function splitSqlStatements(source: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  let inLineComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let blockCommentDepth = 0;
  let dollarTag: string | null = null;

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    if (inLineComment) {
      inLineComment = char !== '\n';
      if (!inLineComment) {
        current += char;
      }
      index += 1;
      continue;
    }

    if (dollarTag !== null) {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }

    if (blockCommentDepth > 0) {
      if (char === BLOCK_COMMENT_START[0] && next === BLOCK_COMMENT_START[1]) {
        blockCommentDepth += 1;
        index += 2;
        continue;
      }
      if (char === BLOCK_COMMENT_END[0] && next === BLOCK_COMMENT_END[1]) {
        blockCommentDepth -= 1;
        index += 2;
        continue;
      }
      if (char === '\n') {
        current += char;
      }
      index += 1;
      continue;
    }

    if (inSingleQuote) {
      if (char === SINGLE_QUOTE) {
        if (next === SINGLE_QUOTE) {
          current += SINGLE_QUOTE + SINGLE_QUOTE;
          index += 2;
          continue;
        }
        inSingleQuote = false;
      }
      current += char;
      index += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (char === DOUBLE_QUOTE) {
        if (next === DOUBLE_QUOTE) {
          current += DOUBLE_QUOTE + DOUBLE_QUOTE;
          index += 2;
          continue;
        }
        inDoubleQuote = false;
      }
      current += char;
      index += 1;
      continue;
    }

    if (char === LINE_COMMENT[0] && next === LINE_COMMENT[1]) {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (char === BLOCK_COMMENT_START[0] && next === BLOCK_COMMENT_START[1]) {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }

    if (char === SINGLE_QUOTE) {
      inSingleQuote = true;
      current += char;
      index += 1;
      continue;
    }

    if (char === DOUBLE_QUOTE) {
      inDoubleQuote = true;
      current += char;
      index += 1;
      continue;
    }

    if (char === DOLLAR) {
      const tag = readDollarTag(source, index);
      if (tag !== null) {
        dollarTag = tag.tag;
        current += tag.tag;
        index += tag.length;
        continue;
      }
    }

    if (char === SEMICOLON) {
      pushStatement(statements, current);
      current = '';
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  if (inSingleQuote || inDoubleQuote || blockCommentDepth > 0) {
    throw new MigrationStructureError(
      `Unterminated SQL construct at end of migration: ${
        inSingleQuote ? 'string literal' : inDoubleQuote ? 'quoted identifier' : 'block comment'
      }`,
    );
  }

  if (dollarTag !== null) {
    throw new MigrationStructureError(`Unterminated dollar-quoted block ${dollarTag} at end of migration`);
  }

  pushStatement(statements, current);
  return statements;
}
