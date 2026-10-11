#!/usr/bin/env bash
set -euo pipefail

# Hakawi deployment script for Kubernetes — Helm-only.
# Kustomize and infrastructure/kubernetes/ were removed in commit b960c9db;
# the release names and values files below match
# .github/workflows/deploy-{dev,staging,production}.yml exactly.
#
# Usage: ./scripts/deploy.sh [environment] [action]
#
# Examples:
#   ./scripts/deploy.sh dev deploy
#   ./scripts/deploy.sh staging deploy
#   ./scripts/deploy.sh production deploy
#   ./scripts/deploy.sh staging rollback
#   ./scripts/deploy.sh staging status
#
# Optional environment overrides:
#   IMAGE_TAG=<git sha>    image tag to deploy (default: latest)
#   NAMESPACE=<namespace>  target namespace (default: hakawi)
#
# Database migrations are not run by this script. The CI workflows run them
# after the rollout ("kubectl exec ... -- npx drizzle-kit migrate"); run the
# same command manually when deploying from a workstation.

ENVIRONMENT="${1:-staging}"
ACTION="${2:-deploy}"
NAMESPACE="${NAMESPACE:-hakawi}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELM_DIR="$SCRIPT_DIR/../helm"

if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo "Error: Unknown environment '$ENVIRONMENT'. Use: dev, staging, or production"
  exit 1
fi

if [ "$ACTION" != "deploy" ] && [ "$ACTION" != "rollback" ] && [ "$ACTION" != "status" ]; then
  echo "Error: Unknown action '$ACTION'. Use: deploy, rollback, or status"
  exit 1
fi

if [ ! -d "$HELM_DIR/backend" ] || [ ! -d "$HELM_DIR/frontend" ]; then
  echo "Error: Helm charts not found at $HELM_DIR. Run this script from infrastructure/scripts/."
  exit 1
fi

# Release names: dev uses the short form, staging/production are suffixed with
# the environment, matching the deploy workflows.
if [ "$ENVIRONMENT" = "dev" ]; then
  BACKEND_RELEASE="hakawi-backend"
  FRONTEND_RELEASE="hakawi-frontend"
else
  BACKEND_RELEASE="hakawi-$ENVIRONMENT-backend"
  FRONTEND_RELEASE="hakawi-$ENVIRONMENT-frontend"
fi

helm_deploy() {
  local release="$1"
  local chart="$2"
  local values=("$HELM_DIR/$chart/values.yaml")
  if [ -f "$HELM_DIR/$chart/values-$ENVIRONMENT.yaml" ]; then
    values+=("$HELM_DIR/$chart/values-$ENVIRONMENT.yaml")
  fi

  local args=()
  local file
  for file in "${values[@]}"; do
    args+=(--values "$file")
  done

  echo "Deploying release $release from chart $chart (tag: $IMAGE_TAG)..."
  helm upgrade --install "$release" "$HELM_DIR/$chart" \
    --namespace "$NAMESPACE" \
    --create-namespace \
    --set image.tag="$IMAGE_TAG" \
    --wait --timeout=600s \
    "${args[@]}"
}

echo "Environment: $ENVIRONMENT"
echo "Action: $ACTION"
echo "Namespace: $NAMESPACE"
echo "Image tag: $IMAGE_TAG"

# Switch kubeconfig context (the alias is set by `aws eks update-kubeconfig`
# --name hakawi-$ENVIRONMENT-eks --alias $ENVIRONMENT).
if ! kubectl config use-context "$ENVIRONMENT"; then
  echo "Error: kubeconfig context '$ENVIRONMENT' not found. Point it at the cluster first:"
  echo "  aws eks update-kubeconfig --name hakawi-$ENVIRONMENT-eks --alias $ENVIRONMENT"
  exit 1
fi

case "$ACTION" in
  deploy)
    echo "Deploying to $ENVIRONMENT..."
    helm_deploy "$BACKEND_RELEASE" backend
    helm_deploy "$FRONTEND_RELEASE" frontend
    echo "Deployment to $ENVIRONMENT complete"
    ;;

  rollback)
    echo "Rolling back in $ENVIRONMENT..."
    helm rollback "$BACKEND_RELEASE" -n "$NAMESPACE" --wait --timeout=600s
    helm rollback "$FRONTEND_RELEASE" -n "$NAMESPACE" --wait --timeout=600s
    echo "Rollback in $ENVIRONMENT complete"
    ;;

  status)
    echo "Checking status in $ENVIRONMENT..."
    helm status "$BACKEND_RELEASE" -n "$NAMESPACE"
    helm status "$FRONTEND_RELEASE" -n "$NAMESPACE"
    kubectl get pods,services,ingress,hpa,pdb -n "$NAMESPACE"
    kubectl get deployment -n "$NAMESPACE" -o wide
    echo ""
    echo "Rollout status (all deployments):"
    kubectl rollout status deployment -n "$NAMESPACE" --timeout=300s
    ;;
esac
