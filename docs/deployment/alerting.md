# Alerting Deployment Guide

## Overview

This guide explains how to deploy and configure alerting for the Hakawi platform. Alert rules are defined in `monitoring/prometheus/rules/hakawi-alerts.yml` (14 rules), with routing in `monitoring/alertmanager/alertmanager.yml` and a dashboard at `monitoring/grafana/dashboards/hakawi-overview.json`; none of them is deployed by default. This document explains how to wire them to an alertmanager and configure notifications.

> **A note on the count, because this file changed it twice.** The rules file holds 14 rules, not 20. Seven rules were deleted rather than kept as decoration: `WAFHighViolationRate`, `WAFIPBlockedSurge`, `AuthFailureSpike`, `RateLimitExhausted`, `PaymentFailureRateHigh`, `EmailQueueBacklog` and `PaymentWebhookFailures` each read a series that nothing emits, so every one of their expressions evaluated to empty and stayed empty. A rule that can never fire is worse than no rule, because it reads as coverage while guarding nothing (Principle #15). `BackendHighLatency` was also replaced by `BackendEventLoopLagHigh`, which reads `nodejs_eventloop_lag_seconds` — a gauge the process really publishes — instead of a histogram quantile over buckets that do not exist. The rejected alternative was to keep the dead rules as a to-do list; the accepted one is to record the unmet need where it can be checked, which is the comment block at the top of `monitoring/prometheus/rules/hakawi-alerts.yml`. Deploying the file as it stands therefore deploys 14 rules that can all fire; deploying the old 20 would have deployed 7 of them that never could.

## Prerequisites

- A running Kubernetes cluster or Docker Swarm
- Prometheus Operator or Prometheus server
- Alertmanager instance
- Notification channels: email, Slack, PagerDuty, or webhook

## Step 1: Deploy Alertmanager

**Do not create `monitoring/alertmanager/alertmanager.yml` — it already exists, and it works.** The
repository's file is wired for the dev stack: `global` points at `mailhog:1025` (the SMTP sink in
`monitoring/docker-compose.monitoring.yml`, which accepts every message and shows it in a web UI on
`:8025`), and three receivers (`default`, `critical-alerts`, `warning-alerts`) are routed by the
severity vocabulary the rules actually use — `critical` and `warning` map to a receiver each, and
anything else falls through to `default`. Start the stack and read it:

```bash
docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d alertmanager
open http://localhost:8025        # every dev alert lands here
```

> **Why this step no longer shows a config to copy.** It used to say "Create
> `monitoring/alertmanager/alertmanager.yml`" and then print a template full of `${{ secrets.X }}`
> placeholders — `${{ secrets.ALERT_SMTP_HOST }}:587`, `${{ secrets.PAGERDUTY_SERVICE_KEY }}`, and a
> `slack_api_url` built the same way. Following it literally overwrites a file that works with one
> that cannot load, because **Alertmanager does not expand environment variables in its
> configuration file — it parses the text exactly as written.** The failure is not a warning; it is
> a process that exits at startup:
>
>     level=error component=configuration msg="Loading configuration file failed"
>       err="address ${ALERT_SMTP_HOST}:587: too many colons in address"
>
> An alertmanager that cannot start routes nothing at all, so the "notification channels" this step
> is meant to enable would be silently absent — and the person who overwrote the working file has no
> way to tell, because the file looks right. That is the exact failure recorded at the top of the
> real `monitoring/alertmanager/alertmanager.yml`, which is why that file carries no placeholders.
>
> `${{ secrets.* }}` is GitHub Actions template syntax, and it is expanded nowhere in this
> repository's alerting path — the workflow files that could use it are outside the monitoring stack.
>
> **Where production settings legitimately vary.**
> `infrastructure/terraform/modules/monitoring/values/prometheus.yaml.tpl` is a terraform
> `templatefile()`: terraform expands `${...}` while rendering the values, and Alertmanager only
> ever sees the finished text. That is the one place real SMTP hosts, Slack webhooks and PagerDuty
> keys belong — with the credentials as secrets, which must never be committed. The dev file omits
> Slack and PagerDuty receivers entirely rather than emitting empty ones, because Alertmanager
> rejects a receiver whose required integration field is empty.

## Step 2: Deploy Prometheus with Alert Rules

**Do not hand-write a second rules file — the repository already has one.**
`monitoring/prometheus/rules/hakawi-alerts.yml` holds 14 rules across three groups, every metric
name in it verified against the exporter or the registry that actually emits it. Copy it, or point
Prometheus at it, rather than pasting the examples below into a new file:

```yaml
rule_files:
  - '/etc/prometheus/rules/*.yml'
```

> **Why this section's example block was replaced rather than extended.** It used to show four
> rules — `HighErrorRate`, `HighLatency`, `DatabaseDown` and `PaymentWebhookFailures` — as a
> starting point for a reader to copy. Three of the four reproduce, verbatim, bugs that had already
> been found and fixed in the real rules file, which makes this guide actively harmful: it teaches
> an engineer to re-introduce the failure the rules file's own WHY comments exist to prevent.
>
> - `HighLatency` read `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m]))
>   by (le))`. The registry declares `http_requests_total` as a COUNTER with **no buckets**, so no
>   `_bucket` series exists and the expression is permanently empty. This is why `BackendHighLatency`
>   was deleted and replaced by `BackendEventLoopLagHigh`, which reads
>   `nodejs_eventloop_lag_seconds` — a gauge `default-metrics.collector.ts` samples every 5 seconds.
> - `DatabaseDown` read `up{job="postgres"}`, while the job in `monitoring/prometheus/prometheus.yml`
>   is named `postgresql`. The expression matched no series and the alert could never fire no matter
>   how long the database stayed down. The surviving rule is `PostgreSQLDown` on `up{job="postgresql"}`.
> - `PaymentWebhookFailures` read `payment_webhook_failures_total`, which nothing emits.
> - `HighErrorRate` is spelled `BackendHighErrorRate` in the real file; the expression itself is the
>   one thing in the old example that was correct, because `http_requests_total` is a real series.
>
> The rejected alternative was to leave the examples as generic scaffolding and add a caveat. A
> snippet a reader copies is not scaffolding, it is the thing that ships, and the only reliable way
> to keep a snippet true is for it to be a copy of the working file (Principle #9). The rules
> themselves are not repeated in full here for the same reason: two copies of a rule file is two
> places to edit one threshold.

### If you want a minimal example

Three rules that can all actually fire, taken from the real file — the two that read app metrics
and one that reads a scrape target:

```yaml
groups:
  - name: hakawi-backend
    interval: 30s
    rules:
      - alert: BackendHighErrorRate
        expr: |
          (
            sum(rate(http_requests_total{job="hakawi-backend",status=~"5.."}[5m]))
            /
            sum(rate(http_requests_total{job="hakawi-backend"}[5m]))
          ) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High 5xx error rate on backend"
          description: "5xx error rate is above 5% for 5 minutes"

      - alert: BackendEventLoopLagHigh
        expr: nodejs_eventloop_lag_seconds{job="hakawi-backend"} > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Backend event loop is lagging"
          description: "Event loop lag exceeds 1 second for 5 minutes - every request is queued behind a blocked tick"

      - alert: PostgreSQLDown
        expr: up{job="postgresql"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL is down"
          description: "PostgreSQL exporter reports database is down"
```

The backend series come from `GET /api/v1/metrics` — a public, unauthenticated Prometheus
exposition endpoint served by `backend/src/common/observability/prometheus.controller.ts` and
scraped by `monitoring/prometheus/prometheus.yml` at `metrics_path: '/api/v1/metrics'`.

## Step 3: Configure the Application

There is **no configuration step for metrics**. The endpoint is always registered — no flag, no
environment variable, no separate port:

- `GET /api/v1/metrics` is declared on `CommonModule` (`backend/src/common/common.module.ts`) and
  served by `backend/src/common/observability/prometheus.controller.ts`, marked `@Public()`.
- It rides the normal `api/v1` global prefix, so the full path is `/api/v1/metrics`, and it answers
  with `text/plain; version=0.0.4`.
- `prometheus-registry.ts` is zero-dependency and always on; `default-metrics.collector.ts` samples
  the process gauges every 5 seconds once `main.ts` calls `start()`.

```bash
# Nothing to set. Scrape the app on the port it already serves:
PORT=3001            # published as "${PORT:-3001}:3001" in docker-compose.yml
```

> **Why this step used to list `METRICS_ENABLED=true` and `METRICS_PORT=9090`.** Neither variable is
> read by anything — `grep -rn "METRICS_ENABLED\|METRICS_PORT" backend/src` returns no hit. Setting
> them in a deployment would have looked like enabling the metrics endpoint and in fact changed
> nothing, which is the quietest way for a scrape to be missing: the operator sees a configured flag,
> the target is down, and the misdirection survives exactly as long as nobody greps. It is the same
> failure as the alert on the uninstrumented metric — a control that looks present and is not
> (Principle #15). The port the app serves is `PORT`, the one `docker-compose.yml` publishes, and
> the scrape target in `monitoring/prometheus/prometheus.yml` is `backend:3001`.

## Step 4: Deploy with Docker Compose

**Do not add these services to `docker-compose.yml` — the overlay already exists.** The monitoring
stack is `monitoring/docker-compose.monitoring.yml`, and it is applied on top of the application
file:

```bash
docker compose \
  -f docker-compose.yml \
  -f monitoring/docker-compose.monitoring.yml \
  up -d
```

It brings up `prometheus` (v2.48.0), `alertmanager` (v0.26.0), `grafana` (10.2.2, on port
**3002** — not 3001, which the backend publishes), `mailhog` (the SMTP sink on :8025), and the four
exporters the rules read: `valkey-exporter`, `postgres-exporter`, `node-exporter`, `cadvisor`.

The overlay's mounts are worth reading because they are what makes the rules load at all:

```yaml
prometheus:
  image: prom/prometheus:v2.48.0
  volumes:
    - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - ./monitoring/prometheus/rules:/etc/prometheus/rules:ro   # a DIRECTORY, globbed by rule_files
```

> **Why this step used to say "Add to `docker-compose.yml`" and to mount
> `./monitoring/prometheus/rules.yml:/etc/prometheus/rules.yml`.** There is no
> `monitoring/prometheus/rules.yml`; the rules live in `monitoring/prometheus/rules/` as a
> directory, and `monitoring/prometheus/prometheus.yml` loads them with
> `rule_files: ['/etc/prometheus/rules/*.yml']` — which is why the overlay mounts the DIRECTORY at
> `/etc/prometheus/rules` and the `--rules.file` flag is absent. Docker mounts a missing host path
> as an empty directory, so the old instruction produced a Prometheus whose glob matched nothing:
> up, healthy, serving `/api/v1/rules` as an empty list, and evaluating no rule at all. Nothing
> errors. That is the same failure mode as the dead alert — a control that looks present and is not.
>
> Two further details in the old snippet were wrong in ways that cost an afternoon: `:latest` for
> both images, where the overlay pins versions that were verified against the metric names the
> rules use; and no `restart: unless-stopped`, so a rebooted laptop lost its whole monitoring stack
> with no sign of it. Adding the services by hand also loses the `mailhog` sink, the exporters and
> the `:ro` read-only mounts, which are the parts that make an alert deliverable.

## Step 5: Verify Alerts

```bash
# Check Prometheus targets
curl http://localhost:9090/targets

# Test alert rules
curl http://localhost:9090/api/v1/rules

# Send a test alert
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{"alerts":[{"status":"firing","labels":{"alertname":"TestAlert"}}]}'
```

## Step 6: Configure Notification Channels

### Slack
1. Create a Slack app at https://api.slack.com/apps
2. Enable "Incoming Webhooks"
3. Put the webhook URL in the **production** alertmanager config —
   `infrastructure/terraform/modules/monitoring/values/prometheus.yaml.tpl`, where terraform's
   `templatefile()` substitutes it before Alertmanager reads the file. It cannot go into
   `monitoring/alertmanager/alertmanager.yml`, for two reasons: Alertmanager parses that file
   verbatim and rejects a receiver whose required integration field is empty, and a webhook URL in
   the repository is a committed credential
4. There is a Slack receiver in no config in this repository. Adding one is a production change,
   not a dev one — the dev stack ends in Mailhog, which is why a dev alert can be followed end to
   end with no credential

### Email
1. Dev already works: `global.smtp_smarthost` is the literal `mailhog:1025` in
   `monitoring/alertmanager/alertmanager.yml`, and MailHog accepts every message on :8025
2. Production SMTP belongs in `infrastructure/terraform/modules/monitoring/values/prometheus.yaml.tpl`
   as a terraform variable, seeded from a secret store — not in the repository
3. **GitHub Actions secrets are not part of this path.** They exist only inside a workflow run. The
   old list (`ALERT_EMAIL_RECIPIENTS`, `ALERT_SMTP_HOST`, …) told an operator to set values in a
   place this deployment never reads, which is worse than saying nothing: the setting looks done, the
   mail still does not send, and the next person re-reads the same five lines

### PagerDuty
1. Create a PagerDuty service
2. Terraform `templatefile()` in `prometheus.yaml.tpl`, same as Slack
3. Not present in any config here; the dev stack deliberately has no PagerDuty receiver

## Step 7: Deploy to Production

```bash
# infrastructure/terraform/modules/monitoring holds the kube-prometheus-stack values. This is the
# path that embeds the repo's own rules file verbatim, so the alert you edit is the alert that ships.
terraform plan -var-file=environments/production/terraform.tfvars
terraform apply -var-file=environments/production/terraform.tfvars -auto-approve
```

`kubectl apply -f monitoring/` applies nothing — `monitoring/` holds compose and Prometheus config
files, not a Kubernetes manifest, so the command fails or applies an unrelated object. The production
stack is the Helm release `hakawi-backend` with kube-prometheus-stack values rendered from
`infrastructure/terraform/modules/monitoring/values/prometheus.yaml.tpl`. Note that the values embed
the rules file at plan time through `templatefile()`, so there is no second copy of the rules to keep
in sync (Principle #9) — but the **dashboard** is not the same story: production loads
`gnetId: 1860` from grafana.com rather than this repository's
`monitoring/grafana/dashboards/hakawi-overview.json`. That gap, and what closes it, is recorded in
the header comment of `monitoring/grafana/dashboards/dashboards.yaml`.

Two known gaps in the production stack, stated so they are not discovered later:

- **No MFA-failure, auth-failure, WAF or payment rule.** The app emits no series for any of them (see
  the rules file's `WHY ALERTS ON UNINSTRUMENTED METRICS ARE GONE` block), so those pages do not exist
  in production either. The generic `BackendHighErrorRate` covers a 5xx storm on any route.
- **`BackendDown`, `BackendHighErrorRate` and `BackendEventLoopLagHigh` are defined but the
  datasource is.** They read real series; what is missing is the cluster to evaluate them on.

## Step 8: Monitor Alerts

```bash
# View active alerts
curl http://localhost:9093/api/v1/alerts

# Check alertmanager configuration
curl http://localhost:9093/api/v1/status

# Which rules Prometheus actually loaded, and how many
curl -s http://localhost:9090/api/v1/rules | jq '[.data.groups[].rules[]] | length'
```

The last command is the one that catches every failure in this guide: it prints **14**, because that
is what the rules file contains. If it prints `0`, the rules directory is not mounted (Step 4). If it
prints a number larger than 14, a second rules file is being loaded somewhere outside
`monitoring/prometheus/rules/`, which is the state the rules file's own header was written to remove.

## Troubleshooting

### Alerts not firing
- Check Prometheus targets: `curl http://localhost:9090/targets`
- Verify metrics are being scraped: `curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[].health'`
- Confirm the app serves them at all: `curl -s http://localhost:3001/api/v1/metrics | head`
- Check alert rule syntax: `promtool check rules monitoring/prometheus/rules/*.yml`
- Check which rules loaded: the count command in Step 8

### Notifications not sending
- Check Alertmanager logs
- Read `monitoring/alertmanager/alertmanager.yml`: the smarthost is a literal `mailhog:1025`, so a
  dev alert goes to `http://localhost:8025` and nowhere else
- If you added a `${...}` placeholder to that file, Alertmanager refused to start — read the header of
  that file for the exact error, then put the placeholder in the terraform `templatefile()` instead

### High noise
- Adjust `group_wait` and `repeat_interval` in Alertmanager
- Add more specific `match` labels to routes
- Use `for:` duration to reduce flapping
