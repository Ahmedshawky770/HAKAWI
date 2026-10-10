# Alerting Deployment Guide

## Overview

This guide explains how to deploy and configure alerting for the Hakawi platform. Alert rules are defined in `monitoring/alert-rules.yml`, but they are not deployed by default. This document explains how to wire them to an alertmanager and configure notifications.

## Prerequisites

- A running Kubernetes cluster or Docker Swarm
- Prometheus Operator or Prometheus server
- Alertmanager instance
- Notification channels: email, Slack, PagerDuty, or webhook

## Step 1: Deploy Alertmanager

Create `monitoring/alertmanager/alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: "${{ secrets.SLACK_API_URL }}"
  pagerduty_url: "https://events.pagerduty.com/v2/enqueue"

route:
  receiver: default
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    - receiver: slack-critical
      match:
        severity: critical
    - receiver: pagerduty-critical
      match:
        severity: critical
      continue: true
    - receiver: email-team
      match:
        severity: warning

receivers:
  - name: default
    slack_configs:
      - channel: "#hakawi-alerts"
        send_resolved: true

  - name: slack-critical
    slack_configs:
      - channel: "#hakawi-critical"
        send_resolved: true

  - name: pagerduty-critical
    pagerduty_configs:
      - service_key: "${{ secrets.PAGERDUTY_SERVICE_KEY }}"
        send_resolved: true

  - name: email-team
    email_configs:
      - to: "${{ secrets.ALERT_EMAIL_RECIPIENTS }}"
        from: "${{ secrets.ALERT_EMAIL_FROM }}"
        smarthost: "${{ secrets.ALERT_SMTP_HOST }}:587"
        auth_username: "${{ secrets.ALERT_SMTP_USERNAME }}"
        auth_password: "${{ secrets.ALERT_SMTP_PASSWORD }}"
```

## Step 2: Deploy Prometheus with Alert Rules

Create `monitoring/prometheus/rules.yml`:

```yaml
groups:
  - name: hakawi.alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
          service: backend
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
          > 0.2
        for: 5m
        labels:
          severity: warning
          service: backend
        annotations:
          summary: "High latency detected"
          description: "P95 latency is {{ $value | humanizeDuration }}"

      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
          service: database
        annotations:
          summary: "PostgreSQL is down"
          description: "PostgreSQL has been unreachable for more than 1 minute"

      - alert: ValkeyDown
        expr: up{job="valkey"} == 0
        for: 1m
        labels:
          severity: critical
          service: cache
        annotations:
          summary: "Valkey is down"
          description: "Valkey cache has been unreachable for more than 1 minute"

      - alert: PaymentWebhookFailures
        expr: |
          sum(rate(payment_webhook_failures_total[10m])) > 0.1
        for: 5m
        labels:
          severity: warning
          service: payments
        annotations:
          summary: "Payment webhook failures"
          description: "{{ $value | humanize }} webhook failures in the last 10 minutes"
```

## Step 3: Configure the Application

Set these environment variables in your deployment:

```bash
# Prometheus metrics endpoint
METRICS_ENABLED=true
METRICS_PORT=9090

# Alerting webhook (optional)
ALERT_WEBHOOK_URL=https://your-alertmanager/webhook
```

## Step 4: Deploy with Docker Compose

Add to `docker-compose.yml`:

```yaml
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/prometheus/rules.yml:/etc/prometheus/rules.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--rules.file=/etc/prometheus/rules.yml'
    ports:
      - "9090:9090"

  alertmanager:
    image: prom/alertmanager:latest
    volumes:
      - ./monitoring/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
    ports:
      - "9093:9093"
```

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
3. Add the webhook URL to `alertmanager.yml`
4. Set `SLACK_API_URL` secret in GitHub

### Email
1. Configure SMTP credentials
2. Set email secrets in GitHub:
   - `ALERT_EMAIL_RECIPIENTS`
   - `ALERT_EMAIL_FROM`
   - `ALERT_SMTP_HOST`
   - `ALERT_SMTP_USERNAME`
   - `ALERT_SMTP_PASSWORD`

### PagerDuty
1. Create a PagerDuty service
2. Get the integration key
3. Set `PAGERDUTY_SERVICE_KEY` secret in GitHub

## Step 7: Deploy to Production

```bash
# Apply the deployment
kubectl apply -f monitoring/

# Or with Docker Compose
docker compose up -d prometheus alertmanager
```

## Step 8: Monitor Alerts

```bash
# View active alerts
curl http://localhost:9093/api/v1/alerts

# Check alertmanager configuration
curl http://localhost:9093/api/v1/status
```

## Troubleshooting

### Alerts not firing
- Check Prometheus targets: `curl http://localhost:9090/targets`
- Verify metrics are being scraped
- Check alert rule syntax: `promtool check rules monitoring/prometheus/rules.yml`

### Notifications not sending
- Check Alertmanager logs
- Verify notification channel configuration
- Test with `amtool` CLI

### High noise
- Adjust `group_wait` and `repeat_interval` in Alertmanager
- Add more specific `match` labels to routes
- Use `for:` duration to reduce flapping
