#!/usr/bin/env node
/**
 * WHY THIS SCRIPT EXISTS.
 *
 * `frontend/next.config.ts` resolves `'unsafe-eval'` from `process.env.NODE_ENV`
 * when the config module is LOADED — Next transpiles the TS config with a plain
 * transform and `require`s it, and it only *defaults* `NODE_ENV` rather than
 * forcing it (`next/dist/bin/next`: `process.env.NODE_ENV = process.env.NODE_ENV || …`,
 * with a warning when a set value disagrees). The header it produces is
 * serialized into `.next/routes-manifest.json` at build time and served from
 * there by `next start`, which never re-evaluates the config at boot.
 *
 * So a build invoked with `NODE_ENV=development` already exported — a developer
 * shell, a step-level CI `env:`, a leaked Docker `ARG`, or `next build
 * --debug-prerender`, which forces development outright — emits a **production**
 * image whose `script-src` allows `eval`, and nothing notices at runtime: the
 * bad value is already in the manifest the server reads. The only place the
 * mistake is visible is the artifact.
 *
 * That is what this checks. It walks every `Content-Security-Policy` header Next
 * serialized into the manifest — BOTH of the arrays route rules are written
 * into, `headers` and `onMatchHeaders`, because the runtime serves both — and
 * fails when any of them allows `eval()` in its script policy. The keyword is
 * matched against the SCRIPT directives' source lists, not against the whole
 * policy string, so a `connect-src` that names a host like
 * `https://unsafe-eval.example.com` is not reported as an eval allowance. It
 * also fails when the header is MISSING, because a policy that quietly
 * disappeared is the same regression wearing a different hat, and when the
 * manifest cannot be read at all, because a build that produced no manifest has
 * produced nothing to assert about.
 *
 * Run it from anywhere, always after a build:
 *
 *   npm run verify:csp --workspace=frontend
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = join(FRONTEND_ROOT, '.next', 'routes-manifest.json');
const FORBIDDEN = 'unsafe-eval';

const failures = [];

function loadManifest() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    failures.push(`cannot read ${MANIFEST_PATH}: ${String(error)} — run \`next build\` first`);
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    failures.push(`${MANIFEST_PATH} must contain a JSON object`);
    return null;
  }

  return parsed;
}

/**
 * Every CSP value in the manifest.
 *
 * Next serializes route rules into TWO manifest arrays and the runtime serves
 * BOTH: `headers` for unconditional rules, and `onMatchHeaders` for rules that
 * carry `has:`/`missing:` conditions
 * (`next/dist/build/generate-routes-manifest.js` writes either key, and
 * `next/dist/server/lib/router-utils/filesystem.js` builds the served header set
 * from both). Reading only the first silently skips the second, so both are
 * walked.
 *
 * Each array holds route rules, and each rule carries its own `headers` array of
 * `{ key, value }` pairs. Both levels are walked rather than indexed into, so a
 * shape with another nesting later is still read instead of silently skipped.
 * The header name comparison is case-insensitive, because the manifest key is
 * written by Next's own serialization and a case-normalized read is free.
 */
function collectPolicies(manifest) {
  const policies = [];

  for (const key of ['headers', 'onMatchHeaders']) {
    const rules = Array.isArray(manifest[key]) ? manifest[key] : [];

    for (const rule of rules) {
      const headers = rule !== null && typeof rule === 'object' && Array.isArray(rule.headers) ? rule.headers : [];
      for (const header of headers) {
        if (header !== null && typeof header === 'object' && String(header.key).toLowerCase() === 'content-security-policy') {
          policies.push(String(header.value));
        }
      }
    }
  }

  return policies;
}

/**
 * The directive name of one `;`-separated CSP directive, or null if the chunk
 * carries no name (an empty or malformed chunk). Whitespace-separated and
 * anchored, so `script-src` does not match `script-src-elem` and vice versa.
 */
function directiveName(directive) {
  const match = /^([a-zA-Z0-9-]+?)(?:\s+|$)/.exec(directive);
  return match === null ? null : match[1];
}

/**
 * One CSP source-list token with its quoting removed, so the keyword
 * `'unsafe-eval'` compares as `unsafe-eval`. A token that is not quoted is
 * returned unchanged (a `*.example.com` host stays a host).
 */
function stripQuotes(token) {
  return token.length >= 2 && token.startsWith("'") && token.endsWith("'") ? token.slice(1, -1) : token;
}

/**
 * The source-list tokens of one directive in one policy, quotes stripped so
 * `'unsafe-eval'` compares as `unsafe-eval`. Returns `null` when the policy does
 * not carry that directive at all, and an EMPTY array when it carries it with no
 * source list (`script-src` alone means "block every script"), which are
 * different answers for a fallback chain.
 */
function directiveTokens(policy, name) {
  const directive = String(policy)
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => directiveName(chunk) === name);

  if (directive === undefined) {
    return null;
  }

  return directive.split(/\s+/).slice(1).map(stripQuotes);
}

/**
 * The directives whose source list decides whether `eval()` may run, as a
 * fallback chain rather than a flat list: `script-src-elem` and `script-src-attr`
 * shadow `script-src` for their category, and `script-src` shadows `default-src`,
 * so the directive that decides is the FIRST one the policy actually carries.
 * Walking only the first present entry is what makes the read correct in both
 * directions — a `'unsafe-eval'` in any script-capable directive fails the build,
 * and a `default-src` that names the substring beside an explicit `script-src`
 * does not, because it governs nothing. No OTHER directive is read at all, so a
 * `connect-src` source list like `https://unsafe-eval.example.com` can no longer
 * fail a correct build.
 */
const SCRIPT_CHAINS = [
  ['script-src-elem', 'script-src', 'default-src'],
  ['script-src-attr', 'script-src', 'default-src'],
];

/**
 * The name of the directive whose source list allows `forbidden` in `policy`, or
 * null when the policy's script policy blocks it. Null means "no offender", so it
 * is distinguishable from a directive with an empty source list.
 */
function scriptDirectiveAllowing(policy, forbidden) {
  for (const chain of SCRIPT_CHAINS) {
    for (const name of chain) {
      const tokens = directiveTokens(policy, name);

      if (tokens === null) {
        continue;
      }

      if (tokens.includes(forbidden)) {
        return name;
      }

      break;
    }
  }

  return null;
}

function main() {
  const manifest = loadManifest();
  if (manifest === null) {
    report();
    return;
  }

  const policies = collectPolicies(manifest);

  if (policies.length === 0) {
    failures.push(
      'the built manifest carries no Content-Security-Policy header — the frontend emits one from next.config.ts, ' +
        'so this means the policy stopped being serialized at all',
    );
    report();
    return;
  }

  policies.forEach((policy, index) => {
    const offender = scriptDirectiveAllowing(policy, FORBIDDEN);
    if (offender !== null) {
      failures.push(
        `policy #${index + 1} in .next/routes-manifest.json allows '${FORBIDDEN}' via its ${offender} directive. ` +
          'The build ran with NODE_ENV=development (or next build --debug-prerender): production keeps eval blocked. ' +
          'Rebuild with NODE_ENV unset or production.',
      );
    }
  });

  report();
}

function report() {
  if (failures.length > 0) {
    console.error(`\nCSP check FAILED (${failures.length}):`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    'CSP OK: every Content-Security-Policy header in .next/routes-manifest.json is present and blocks eval.',
  );
}

main();
