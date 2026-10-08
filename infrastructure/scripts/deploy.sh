#!/usr/bin/env bash
set -euo pipefail

# Hakawi deployment script for Kubernetes
# Usage: ./scripts/deploy.sh [environment] [action]
#
# Examples:
#   ./scripts/deploy.sh staging deploy
#   ./scripts/deploy.sh production deploy
#   ./scripts/deploy.sh staging rollback

ENVIRONMENT="${1:-staging}"
ACTION="${2:-deploy}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$SCRIPT_DIR/../kubernetes"
HELM_DIR="$SCRIPT_DIR/../helm"

if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo "Error: Unknown environment '$ENVIRONMENT'. Use: dev, staging, or production"
  exit 1
fi

if [ "$ACTION" != "deploy" ] && [ "$ACTION" != "rollback" ] && [ "$ACTION" != "status" ]; then
  echo "Error: Unknown action '$ACTION'. Use: deploy, rollback, or status"
  exit 1
fi

echo "Environment: $ENVIRONMENT"
echo "Action: $ACTION"

# Switch kubeconfig context
kubectl config use-context "$ENVIRONMENT"

case "$ACTION" in
  deploy)
    echo "Deploying to $ENVIRONMENT..."
    kustomize build "$K8S_DIR/overlays/$ENVIRONMENT" | kubectl apply -f -

    # Deploy Helm charts
    if [ "$ENVIRONMENT" = "staging" ]; then
      helm upgrade --install backend "$HELM_DIR/backend" \
        --namespace hakawi \
        --values "$K8S_DIR/overlays/$ENVIRONMENT/backend-values.yaml" \
        --wait --timeout=300s

      helm upgrade --install frontend "$HELM_DIR/frontend" \
        --namespace hakawi \
        --values "$K8S_DIR/overlays/$ENVIRONMENT/frontend-values.yaml" \
        --wait --timeout=300s
    fi

    echo "Deployment to $ENVIRONMENT complete"
    ;;

  rollback)
    echo "Rolling back in $ENVIRONMENT..."
    if [ "$ENVIRONMENT" = "staging" ]; then
      helm rollback backend -n hakawi
      helm rollback frontend -n hakawi
    else
      kubectl rollout undo deployment/hakawi-backend -n hakawi
      kubectl rollout undo deployment/hakawi-frontend -n hakawi
    fi
    echo "Rollback in $ENVIRONMENT complete"
    ;;

  status)
    echo "Checking status in $ENVIRONMENT..."
    kubectl get pods,services,ingress,hpa,pdb -n hakawi
    kubectl get deployment -n hakawi -o wide
    echo ""
    echo "Rollout status:"
    kubectl rollout status deployment/hakawi-backend -n hakawi
    kubectl rollout status deployment/hakawi-frontend -n hakawi
    ;;
esac