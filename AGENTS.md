# AGENTS.md

## Project Commands

### Lint
- Backend: `npm run lint --workspace=backend`
- Frontend: `npm run lint --workspace=frontend`

### Type Check
- Backend: `npm run typecheck --workspace=backend`
- Frontend: `npm run typecheck --workspace=frontend`
- Shared Types: `npm run typecheck --workspace=packages/shared-types`

### Test
- Unit tests: `npm run test --workspace=backend`
- Frontend tests: `npm run test:run --workspace=frontend`
- E2E tests: `npm run test:e2e --workspace=backend`

### Terraform
- Lint: `terraform fmt -recursive -check`
- Validate: `terraform validate`
- Plan: `terraform plan -var-file=environments/<env>/terraform.tfvars`
- Apply: `terraform apply -var-file=environments/<env>/terraform.tfvars -auto-approve`

### Helm
- Lint: `helm lint ./infrastructure/helm/backend`
- Template: `helm template backend ./infrastructure/helm/backend`
- Deploy: `helm upgrade --install hakawi-backend ./infrastructure/helm/backend --namespace hakawi`

### Kubernetes
- Deploy (Helm): `helm upgrade --install hakawi-backend ./infrastructure/helm/backend --namespace hakawi`
- Deploy (Kustomize): `kustomize build infrastructure/kubernetes/overlays/production | kubectl apply -f -`
- Status: `kubectl rollout status deployment/hakawi-backend -n hakawi`
- Logs: `kubectl logs -n hakawi deployment/hakawi-backend -f`