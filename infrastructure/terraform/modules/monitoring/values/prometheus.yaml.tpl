prometheus:
  prometheusSpec:
    retention: ${retention_days}d
    retentionSize: 50GB
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          resources:
            requests:
              storage: 100Gi
    resources:
      requests:
        memory: 2Gi
        cpu: 1000m
      limits:
        memory: 4Gi
        cpu: 2000m
    additionalScrapeConfigs:
      - job_name: 'hakawi-backend'
        kubernetes_sd_configs:
          - role: pod
            namespaces:
              names:
                - hakawi
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: true
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
            action: replace
            target_label: __metrics_path__
            regex: (.+)
          - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
            action: replace
            regex: ([^:]+)(?::\d+)?;(\d+)
            replacement: $1:$2
            target_label: __address__
          - action: labelmap
            regex: __meta_kubernetes_pod_label_(.+)
          - source_labels: [__meta_kubernetes_namespace]
            action: replace
            target_label: kubernetes_namespace
          - source_labels: [__meta_kubernetes_pod_name]
            action: replace
            target_label: kubernetes_pod_name

    ruleSelector:
      matchLabels:
        app: kube-prometheus-stack
    ruleNamespaceSelector: {}

grafana:
  enabled: true
  adminPassword: ${grafana_admin_password}
  persistence:
    enabled: true
    storageClassName: gp3
    size: 10Gi
  datasources:
    datasources.yaml:
      apiVersion: 1
      datasources:
        - name: Prometheus
          type: prometheus
          url: http://prometheus-operated.monitoring.svc.cluster.local:9090
          access: proxy
          isDefault: true
          editable: false
  dashboardProviders:
    dashboardproviders.yaml:
      apiVersion: 1
      providers:
        - name: 'Hakawi'
          orgId: 1
          folder: 'Hakawi'
          type: file
          disableDeletion: false
          updateIntervalMinutes: 10
          allowUiUpdates: true
          options:
            path: /var/lib/grafana/dashboards/hakawi
  dashboards:
    hakawi-overview:
      gnetId: 1860
      revision: 36
      datasource: Prometheus
  sidecar:
    dashboards:
      enabled: true
      label: grafana_dashboard
      folder: Hakawi

alertmanager:
  enabled: true
  persistence:
    enabled: true
    storageClassName: gp3
    size: 10Gi
  config:
    global:
      resolve_timeout: 5m
    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      receiver: 'default'
      routes:
        - match:
            severity: critical
          receiver: 'critical-alerts'
          group_wait: 10s
          group_interval: 1m
          repeat_interval: 1h
        - match:
            severity: warning
          receiver: 'warning-alerts'
          group_wait: 30s
          group_interval: 5m
          repeat_interval: 4h
    receivers:
      - name: 'default'
        email_configs:
          - to: 'ops@hakawi.com'
            send_resolved: true
      - name: 'critical-alerts'
        email_configs:
          - to: 'oncall@hakawi.com'
            send_resolved: true
      - name: 'warning-alerts'
        email_configs:
          - to: 'ops@hakawi.com'
            send_resolved: true

kubeStateMetrics:
  enabled: true

nodeExporter:
  enabled: true

prometheusOperator:
  enabled: true
  admissionWebhooks:
    enabled: true