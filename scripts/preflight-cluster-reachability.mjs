#!/usr/bin/env node
/**
 * WHY THIS SCRIPT EXISTS.
 *
 * `.github/workflows/deploy-{dev,staging,production}.yml` deploy on `ubuntu-latest` —
 * GitHub-hosted runners, which live OUTSIDE the VPC. `eks_cluster_endpoint_public_access_cidrs`
 * is `[]` for staging and production
 * (`infrastructure/terraform/environments/{staging,production}/terraform.tfvars`), so the
 * Kubernetes API server answers nobody from there: `aws eks update-kubeconfig`,
 * `helm upgrade` and `kubectl` all hang and then time out.
 *
 * That used to happen AFTER `terraform apply` had already closed the endpoint, i.e.
 * mid-rollout, with the new cluster live and a half-applied pipeline behind it. This
 * script is the same check moved to the START of the workflow, where it costs one cheap
 * API call instead of a red deploy.
 *
 * WHY IT IS A SCRIPT AND NOT AN INLINE SHELL BLOCK: the three workflows must run the SAME
 * check with the SAME message, and a duplicated shell block in three files is a thing that
 * drifts — one of the three gets fixed and the other two keep the old behaviour
 * (Principle #9: one readable place for the rule).
 *
 * WHY `describe-cluster` IS NOT THE CHECK: it is an EKS control-plane API call and succeeds
 * regardless of the endpoint CIDRs, so it says nothing about reachability. It is used here
 * only to distinguish "the cluster does not exist yet" (a first apply, which must be
 * allowed to CREATE it) from "the cluster exists" (the gate applies). The reachability test
 * is the Kubernetes API call itself — `kubectl auth can-i get pods` — because the public
 * access CIDRs are enforced by the API server endpoint.
 *
 * USAGE
 *   node scripts/preflight-cluster-reachability.mjs [--cluster <name>] [--region <region>]
 *     [--allow-missing [--env <environment>]] [--help]
 *
 *   --cluster        Cluster name. Falls back to EKS_CLUSTER_NAME / CLUSTER_NAME / --name,
 *                    then to the terraform convention `hakawi-<env>-eks` / `dev-hakawi`.
 *   --region         AWS region. Falls back to AWS_REGION / AWS_DEFAULT_REGION (us-east-1).
 *   --allow-missing  Treat "cluster does not exist" as SKIP rather than FAIL. Used on the
 *                    FIRST deploy of an environment, where the cluster is created by the
 *                    apply that follows. Production and staging pass it.
 *   --env            Environment name (dev|staging|production), for the log message only.
 *
 * WHY THERE IS NO `--fix`: the only ways out are the two documented ones — deploy from a
 * self-hosted runner inside the VPC, or temporarily add the runner egress CIDRs and remove
 * them afterwards. Widening `public_access_cidrs` to 0.0.0.0/0 or to GitHub's published
 * ranges is a team decision about a hardened control plane, not something a pipeline step
 * should do to itself.
 */
import { spawnSync } from 'node:child_process';

function fail(code, message) {
  console.error('');
  console.error(`::error::${message}`);
  console.error('');
  process.exitCode = code;
}

function parseArgv(argv) {
  const options = { cluster: undefined, region: undefined, allowMissing: false, environment: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }
    let name = token;
    let value = undefined;
    if (token.startsWith('--') && token.includes('=')) {
      const separator = token.indexOf('=');
      name = token.slice(0, separator);
      value = token.slice(separator + 1);
    }
    switch (name) {
      case '--cluster':
        if (value === undefined) {
          value = argv[index + 1];
          index += 1;
        }
        if (value === undefined || value === '') {
          console.error('::error::--cluster requires a value');
          process.exitCode = 2;
          return null;
        }
        options.cluster = value;
        break;
      case '--region':
        if (value === undefined) {
          value = argv[index + 1];
          index += 1;
        }
        if (value === undefined || value === '') {
          console.error('::error::--region requires a value');
          process.exitCode = 2;
          return null;
        }
        options.region = value;
        break;
      case '--env':
        if (value === undefined) {
          value = argv[index + 1];
          index += 1;
        }
        options.environment = value;
        break;
      case '--allow-missing':
        options.allowMissing = true;
        break;
      default:
        if (token.startsWith('-')) {
          console.error(`::error::Unknown flag "${token}". Supported: --cluster <name> --region <region> --allow-missing --env <name> --help`);
          process.exitCode = 2;
          return null;
        }
        // WHY the legacy `--name <cluster>` form still works: an earlier revision of the
        // workflows called the script this way and the docs quote it.
        if (name === '--name') {
          if (value === undefined) {
            value = argv[index + 1];
            index += 1;
          }
          options.cluster = value;
        }
        break;
    }
  }
  return options;
}

function usage() {
  console.log(
    [
      'Usage: node scripts/preflight-cluster-reachability.mjs [--cluster <name>] [--region <region>]',
      '         [--allow-missing] [--env <dev|staging|production>] [--help]',
      '',
      'Fails fast (exit 1) when the Kubernetes API endpoint of the named EKS cluster is not',
      'reachable from this runner — the failure mode of `eks_cluster_endpoint_public_access_cidrs = []`',
      'combined with a GitHub-hosted runner outside the VPC. The two supported ways through are',
      'named in the message: a self-hosted in-VPC runner, or a temporary documented CIDR entry.',
      '',
      'Environment: EKS_CLUSTER_NAME, CLUSTER_NAME, AWS_REGION, AWS_DEFAULT_REGION.',
    ].join('\n'),
  );
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
    commandNotFound: result.error !== undefined && result.error.code === 'ENOENT',
  };
}

function main() {
  const options = parseArgv(process.argv.slice(2));
  if (options === null) {
    return;
  }
  if (options.help) {
    usage();
    return;
  }

  const cluster =
    options.cluster ?? process.env.EKS_CLUSTER_NAME ?? process.env.CLUSTER_NAME ?? 'hakawi-dev-eks';
  const region = options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const envLabel = options.environment ?? 'this environment';

  const described = run('aws', [
    'eks',
    'describe-cluster',
    '--name',
    cluster,
    '--region',
    region,
    '--output',
    'json',
  ]);

  if (described.status !== 0) {
    const detail = `${described.stderr}${described.stdout}`.trim();
    if (described.commandNotFound) {
      fail(2, `Preflight: the AWS CLI is not installed on this runner, so the cluster reachability check cannot run. Install the AWS CLI (self-hosted runners) or re-run on an image that ships it.`);
      return;
    }
    const notFound = /ResourceNotFoundException|NotFound/i.test(detail);
    if (notFound) {
      if (options.allowMissing) {
        console.log(
          `::notice::Preflight: cluster "${cluster}" does not exist yet, so there is nothing to reach. ` +
            'This is the first deploy of this environment; the apply below creates it and the ' +
            'reachability check applies from the next deploy on.',
        );
        return;
      }
      fail(
        1,
        `Preflight: cluster "${cluster}" does not exist in region ${region}. ` +
          'Deploy it from the documented path — a self-hosted runner inside the VPC, or a temporary ' +
          'egress CIDR entry — and re-run.',
      );
      return;
    }
    fail(
      2,
      `Preflight: could not describe cluster "${cluster}" in region ${region}: ${detail || 'no output from the AWS CLI'}`,
    );
    return;
  }

  let publicAccessCidrs = 'unknown';
  let endpoint = 'unknown';
  try {
    const parsed = JSON.parse(described.stdout);
    const config = parsed?.cluster?.resourcesVpcConfig ?? {};
    endpoint = parsed?.cluster?.endpoint ?? endpoint;
    // WHY the empty list is spelled out: an empty string here reads like a bug in this
    // script, and the whole point of the message below is to explain that the empty list is
    // the CLUSTER's choice and the reason the runner cannot reach it.
    publicAccessCidrs = Array.isArray(config.publicAccessCidrs) && config.publicAccessCidrs.length > 0
      ? config.publicAccessCidrs.join(', ')
      : '[] (no public access at all)';
  } catch {
    // WHY the failure is ignored: the CIDRs and endpoint are diagnostics printed with the
    // message below, not the decision. The decision is the API call that follows, and a
    // describe that succeeded tells us the cluster exists either way.
    publicAccessCidrs = 'unknown (could not parse the describe-cluster response)';
  }

  const configured = run('aws', [
    'eks',
    'update-kubeconfig',
    '--name',
    cluster,
    '--region',
    region,
    '--alias',
    envLabel,
  ]);
  if (configured.status !== 0) {
    fail(
      1,
      `Preflight: "aws eks update-kubeconfig" failed for cluster "${cluster}" (endpoint ${endpoint}, ` +
        `publicAccessCidrs: ${publicAccessCidrs}): ${configured.stderr.trim() || configured.stdout.trim()}. ` +
        'Cluster access from a GitHub-hosted runner requires one of the two supported paths: ' +
        '(1) deploy from a self-hosted runner inside the VPC or over the VPN, or ' +
        '(2) temporarily add the runner egress CIDRs to eks_cluster_endpoint_public_access_cidrs ' +
        '(and remove them afterwards). Do NOT widen the CIDRs to 0.0.0.0/0 or to GitHub\'s ' +
        'published ranges — that turns a hardened control plane into a public one.',
    );
    return;
  }

  const authenticated = run('kubectl', ['auth', 'can-i', 'get', 'pods', '-n', 'default']);
  if (authenticated.status !== 0) {
    fail(
      1,
      `Preflight: the Kubernetes API of cluster "${cluster}" is unreachable from this runner ` +
        `(endpoint ${endpoint}, publicAccessCidrs: ${publicAccessCidrs}; "kubectl auth can-i get pods" ` +
        `exited ${authenticated.status}: ${authenticated.stderr.trim() || 'timed out or no response'}). ` +
        `With an empty public access CIDR list the API server answers nobody outside the VPC, and this ` +
        'workflow runs on a GitHub-hosted runner. The two supported paths are: ' +
        '(1) deploy from a self-hosted runner inside the VPC or over the VPN, or ' +
        '(2) temporarily add the runner egress CIDRs to eks_cluster_endpoint_public_access_cidrs ' +
        '(and remove them afterwards). Do NOT widen the CIDRs to 0.0.0.0/0 or to GitHub\'s ' +
        'published ranges — that turns a hardened control plane into a public one.',
    );
    return;
  }

  console.log(
    `::notice::Preflight passed: cluster "${cluster}" (endpoint ${endpoint}, publicAccessCidrs: ${publicAccessCidrs}) ` +
      'is reachable from this runner. Deploy may proceed.',
  );
}

main();
