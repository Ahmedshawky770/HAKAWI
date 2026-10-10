import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const METRICS = ['statements', 'branches', 'functions', 'lines'];

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUMMARY_PATHS = [
  resolve(BACKEND_ROOT, 'coverage/coverage-summary.json'),
  resolve(process.cwd(), 'backend/coverage/coverage-summary.json'),
  resolve(process.cwd(), 'coverage/coverage-summary.json'),
];

const CONFIG_PATH = resolve(BACKEND_ROOT, 'vitest.config.ts');

const PER_GLOB_LINE =
  /^\s*'([^']+)':\s*\{\s*lines:\s*(\d+(?:\.\d+)?),\s*functions:\s*(\d+(?:\.\d+)?),\s*branches:\s*(\d+(?:\.\d+)?),\s*statements:\s*(\d+(?:\.\d+)?),?\s*\},?\s*$/;

function readThresholds() {
  const source = readFileSync(CONFIG_PATH, 'utf8');
  const start = source.indexOf('const THRESHOLDS = {');
  if (start === -1) {
    throw new Error(`Could not find the THRESHOLDS block in ${CONFIG_PATH}`);
  }
  const end = source.indexOf('\n};', start);
  if (end === -1) {
    throw new Error(`The THRESHOLDS block in ${CONFIG_PATH} is not terminated`);
  }
  const body = source.slice(start, end);

  const global = {};
  for (const metric of METRICS) {
    const match = new RegExp(`^\\s*(?:'${metric}'|${metric}):\\s*(\\d+(?:\\.\\d+)?),?$`, 'm').exec(body);
    if (match === null) {
      throw new Error(`vitest.config.ts THRESHOLDS is missing a global "${metric}" floor`);
    }
    global[metric] = Number.parseFloat(match[1]);
  }

  const perGlob = [];
  for (const line of body.split('\n')) {
    const match = PER_GLOB_LINE.exec(line);
    if (match === null) {
      continue;
    }
    perGlob.push({
      pattern: match[1],
      lines: match[2],
      functions: match[3],
      branches: match[4],
      statements: match[5],
    });
  }

  return { global, perGlob };
}

function loadSummary() {
  for (const path of SUMMARY_PATHS) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
  }
  return null;
}

function percentFor(total, metric) {
  const { covered, total: count } = total[metric];
  return count === 0 ? 100 : (covered / count) * 100;
}

function renderTable(header, rows) {
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => row[index].length)));
  const render = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  return [render(header), widths.map((width) => '-'.repeat(width)).join('  '), ...rows.map((row) => render(row))].join('\n');
}

const summary = loadSummary();

if (summary === null || summary.total === undefined) {
  process.stdout.write('coverage-summary.json not found; skipping coverage table.\n');
  process.exit(0);
}

const { global: floors, perGlob } = readThresholds();
const total = summary.total;

const rows = METRICS.map((metric) => {
  const pct = percentFor(total, metric);
  const floor = floors[metric];
  return [metric, `${pct.toFixed(2)}%`, `${floor}%`, pct >= floor ? 'PASS' : 'FAIL'];
});

const output = ['Backend coverage', renderTable(['Metric', 'Coverage', 'Floor', 'Status'], rows)];

if (perGlob.length > 0) {
  output.push('', 'Configured per-path floors (enforced by vitest, reported here for context)');
  output.push(
    renderTable(
      ['Ratchet (path)', 'lines', 'functions', 'branches', 'statements'],
      perGlob.map((row) => [row.pattern, row.lines, row.functions, row.branches, row.statements]),
    ),
  );
}

process.stdout.write(`${output.join('\n')}\n`);

process.exitCode = rows.some((row) => row[3] === 'FAIL') ? 1 : 0;
