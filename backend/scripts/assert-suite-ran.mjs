#!/usr/bin/env node
/**
 * Assert a Vitest JSON report describes a suite that actually RAN.
 *
 * ## Why this exists
 *
 * A NestJS module graph that cannot be built fails inside `DependenciesScanner.scanForModules`,
 * which runs *before* any test body. Vitest reports every test in the affected file as **skipped**
 * rather than failed, and the process exits 0. A CI job gated only on the exit code therefore goes
 * green on a suite that executed nothing at all.
 *
 * That is not hypothetical. A circular `books` <-> `library` dependency with no `forwardRef()`, plus
 * `ContestsModule` importing `NotificationsModule` without listing it in `imports`, meant the backend
 * could not start at all, and eleven `*.integration-spec.ts` files plus the stories e2e file skipped
 * on every run.
 *
 * ## What this does and does not add, stated precisely
 *
 * MEASURED, with the cycle reintroduced: `npm run test:e2e --workspace=backend` exits **1**. So the
 * `test-e2e` job was already **red** — this script is not what turns a green pipeline red.
 *
 * What it adds is a check on a signal the exit code does not carry. In that state the report is
 * `numFailedTests: 4, numPendingTests: 195` — the four are suite-level `beforeAll` throws, and the
 * 195 are every real test, tallied as **pending**. The headline a human reads is "195 skipped", which
 * is indistinguishable from a suite with nothing left to do, and it is why the state was documented
 * as passing. Asserting `numPendingTests === 0` names the condition directly: tests were collected
 * and then not run.
 *
 * So the justification is not "CI was blind". It is "the exit code told us *something* was wrong and
 * the test counts did not say what, and 195 collected-but-not-run is a fact worth failing on
 * explicitly".
 *
 * ## Why this is a separate step rather than a Vitest setting
 *
 * Vitest has no built-in "fail if the collection is empty" switch, and there should not be one: a
 * legitimately-empty suite is a normal state for some projects. The question is specific to this
 * repository — the e2e suite is *supposed* to collect a few hundred tests, so zero is never correct
 * and any skip is a signal. That is a policy assertion about this suite, so it lives here, where the
 * expected numbers are visible next to the reason.
 *
 * ## Why the unit job does not need this
 *
 * `test-unit` runs under the coverage gate, and a suite that collects nothing produces no coverage,
 * which fails the configured thresholds. `test-e2e` had no such backstop, which is exactly why the
 * outage hid there and not there. This script is the backstop the e2e job lacked.
 *
 * ## Usage
 *
 *   node assert-suite-ran.mjs <report.json> [--min-tests N] [--max-skipped N] [--label NAME]
 *
 * Exits 0 when the report satisfies the bounds, 1 with a diagnostic when it does not, and 2 when the
 * report cannot be read at all — an unreadable report must never be mistaken for a passing suite.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

const argv = process.argv.slice(2);

function fail(message) {
  process.stderr.write(`\nassert-suite-ran: ${message}\n\n`);
  process.exit(1);
}

function usage(message) {
  process.stderr.write(`\nassert-suite-ran: ${message}\n`);
  process.stderr.write('usage: assert-suite-ran.mjs <report.json> [--min-tests N] [--max-skipped N] [--label NAME]\n\n');
  process.exit(2);
}

const positional = [];
const options = { minTests: 1, maxSkipped: 0, label: 'suite' };

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  switch (arg) {
    case '--min-tests':
      options.minTests = Number(argv[(i += 1)]);
      continue;
    case '--max-skipped':
      options.maxSkipped = Number(argv[(i += 1)]);
      continue;
    case '--label':
      options.label = String(argv[(i += 1)]);
      continue;
    case '-h':
    case '--help':
      usage('help requested');
      break;
    default:
      if (arg.startsWith('--')) usage(`unknown option ${arg}`);
      positional.push(arg);
      break;
  }
}

if (positional.length !== 1) usage('expected exactly one report path');
if (!Number.isFinite(options.minTests)) usage('--min-tests must be a number');
if (!Number.isFinite(options.maxSkipped)) usage('--max-skipped must be a number');

const reportPath = positional[0];

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  // Exit 2, not 0. A report that cannot be parsed is not evidence that the suite ran.
  process.stderr.write(
    `\nassert-suite-ran: could not read a Vitest JSON report at ${reportPath}\n` +
      `  ${error instanceof Error ? error.message : String(error)}\n` +
      '  An unreadable report is not a passing suite.\n\n',
  );
  process.exit(2);
}

const count = (key) => {
  const value = report?.[key];
  return typeof value === 'number' ? value : Number.NaN;
};

const total = count('numTotalTests');
const passed = count('numPassedTests');
const failed = count('numFailedTests');
const skipped = count('numPendingTests');

for (const [name, value] of Object.entries({ numTotalTests: total, numPendingTests: skipped })) {
  if (!Number.isFinite(value)) {
    fail(`${reportPath} has no usable \`${name}\`. Is this a Vitest JSON report?\n  keys present: ${Object.keys(report ?? {}).join(', ') || '(none)'}`);
  }
}

const problems = [];

if (total < options.minTests) {
  problems.push(
    `collected ${total} test(s), expected at least ${options.minTests}.\n` +
      '  A suite that collects (almost) nothing usually means the module graph failed to build, so\n' +
      '  every test was skipped rather than failed. Check the first error above, not this message.',
  );
}

if (skipped > options.maxSkipped) {
  problems.push(
    `${skipped} test(s) were skipped, expected at most ${options.maxSkipped}.\n` +
      '  Skips hide behind failures in this runner: a `beforeAll` that throws turns every test in the\n' +
      '  file into a skip and still exits 0.',
  );
}

if (problems.length > 0) {
  fail(`the ${options.label} suite did not run properly.\n\n  - ${problems.join('\n  - ')}`);
}

process.stdout.write(
  `assert-suite-ran: ${options.label} OK — ${total} collected, ${passed} passed, ${failed} failed, ${skipped} skipped\n`,
);