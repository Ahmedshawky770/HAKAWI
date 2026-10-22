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
 * IT ALSO CHECKS THAT EVERY HOST SOURCE PARSES. A host-source in a CSP may
 * carry a wildcard in its LEFTMOST label only (`host-part = "*" / [ "*." ]
 * 1*host-char *( "." 1*host-char )`, CSP3 §6.6.2.6). `https://*.s3.*.amazonaws.com`
 * — the expression this repository shipped for the storage hosts — is not a
 * wildcard expression at all: the second `*` is not a wildcard, and the browser
 * refuses the whole source with "Content-Security-Policy: Couldn't parse invalid
 * host". The browser then drops it, so the policy that reaches the page is
 * NARROWER than the one that was written, and the symptom (an upload refused, a
 * console full of policy errors) names neither the source nor the directive. A
 * policy that cannot be parsed is a policy nobody can reason about, so it is
 * checked HERE, where the answer is a build failure rather than a browser
 * console message.
 *
 * BOTH MANIFESTS ARE READ. `next build` writes `.next/routes-manifest.json` and
 * `next dev` writes `.next/dev/routes-manifest.json`, and the dev server serves
 * the policy from the dev manifest — so a dev-only mistake is exactly the one
 * that reaches a developer first. Whichever exists is checked; a repository with
 * neither has produced nothing to assert about.
 *
 * Run it from anywhere, always after a build:
 *
 *   npm run verify:csp --workspace=frontend
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cspSources from './csp-sources.mjs';

const FRONTEND_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATHS = [
  // The build manifest is the one that SHIPS, so it is held to the production
  // policy: `'unsafe-eval'` is a build failure there.
  { path: join(FRONTEND_ROOT, '.next', 'routes-manifest.json'), label: 'next build', production: true },
  // The dev manifest is what the dev server actually serves. React's
  // development build runs its debug hooks through `eval()`, so the dev policy
  // carries `'unsafe-eval'` ON PURPOSE (see `next.config.ts`) and is not held to
  // the production rule — but a source the browser cannot parse is a bug in
  // either manifest, so that check applies to both.
  { path: join(FRONTEND_ROOT, '.next', 'dev', 'routes-manifest.json'), label: 'next dev', production: false },
];
const FORBIDDEN = 'unsafe-eval';

const failures = [];
const notes = [];

function loadManifests() {
  const manifests = [];

  for (const { path, label, production } of MANIFEST_PATHS) {
    if (!existsSync(path)) {
      continue;
    }

    // A DEV MANIFEST THAT PREDATES THE CONFIG IS A MANIFEST OF A POLICY THAT NO LONGER
    // EXISTS. The dev server writes it when it starts, so a config edited while the dev
    // server was running leaves a manifest of the OLD policy behind, and this script would
    // check that old policy and report it as the one that is served.
    if (!production) {
      const configPath = join(FRONTEND_ROOT, 'next.config.ts');

      if (existsSync(configPath) && statSync(path).mtimeMs < statSync(configPath).mtimeMs) {
        notes.push(
          `the ${label} manifest at ${path} is older than next.config.ts, so it describes a policy that is no ` +
            'longer the one the dev server would serve — it was not checked',
        );
        continue;
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      failures.push(`cannot read ${path}: ${String(error)} — run \`${label}\` first`);
      continue;
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      failures.push(`${path} must contain a JSON object`);
      continue;
    }

    manifests.push({ path, label, production, parsed });
  }

  return manifests;
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
 * The policy grammar, read from the module that owns it.
 *
 * `csp-sources.mjs` holds the parser and its tests; this script is the part that walks the
 * manifests and reports. The two are separate because the parser is the piece with a rule to
 * get right — a source that does not parse is silently dropped by the browser, and a parser
 * that is stricter than the browser fails builds for no reason.
 */
const { directiveTokens, unparseableSources } = cspSources;

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
  const manifests = loadManifests();

  // THE BUILD MANIFEST IS NOT OPTIONAL. It is the artifact that ships, and the one the
  // assertions below are about: the dev manifest is explicitly NOT held to the eval rule,
  // so a run that found only the dev manifest would have checked nothing about the policy
  // that deploys and would still have printed that it "blocks eval". A check that reports
  // what it did not do is worse than no check.
  const build = manifests.find((manifest) => manifest.production);

  if (build === undefined) {
    failures.push(
      `no build manifest at ${MANIFEST_PATHS[0].path} — run \`next build\` first, so that there is a shipped ` +
        'policy to assert about',
    );
  }

  for (const { path, label, production, parsed } of manifests) {
    const policies = collectPolicies(parsed);

    if (policies.length === 0) {
      failures.push(
        `the ${label} manifest at ${path} carries no Content-Security-Policy header — the frontend emits one from ` +
          'next.config.ts, so this means the policy stopped being serialized at all',
      );
      continue;
    }

    policies.forEach((policy, index) => {
      if (production) {
        const offender = scriptDirectiveAllowing(policy, FORBIDDEN);
        if (offender !== null) {
          failures.push(
            `policy #${index + 1} in ${path} allows '${FORBIDDEN}' via its ${offender} directive. ` +
              'The build ran with NODE_ENV=development (or next build --debug-prerender): production keeps eval blocked. ' +
              'Rebuild with NODE_ENV unset or production.',
          );
        }
      }

      for (const problem of unparseableSources(policy)) {
        failures.push(
          `policy #${index + 1} in ${path} carries a source the browser cannot parse — ${problem}. ` +
            'The browser refuses such a source and drops it, so the policy that reaches the page is narrower than ' +
            'the one that was written.',
        );
      }
    });
  }

  report(manifests);
}

function report(manifests) {
  if (failures.length > 0) {
    console.error(`\nCSP check FAILED (${failures.length}):`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  // WHAT WAS CHECKED, NAMED. The summary used to claim the policy "blocks eval" without
  // saying which manifest it was looking at, and the dev manifest is not held to that
  // rule — so a run that checked only the dev manifest reported a guarantee it had not
  // established.
  const checked = manifests
    .map(({ label, production }) => `${label} (${production ? 'production rules' : 'development rules'})`)
    .join(', ');

  for (const note of notes) {
    console.log(`  note: ${note}`);
  }

  console.log(
    `CSP OK: checked ${checked}. Every Content-Security-Policy header is present, the production policy blocks ` +
      'eval, and every source expression is one the browser can parse.',
  );
}

main();
