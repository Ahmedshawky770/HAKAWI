# Manual Tasks (Manual / Not Auto-Implemented)

This file lists items that require manual work by the developer and were NOT fully implemented in code.

## 1. Anti-fraud for publisher/professional verification videos
- **Status**: Not implemented.
- **What's needed**: Browser-side camera fingerprint (Canvas/WebGL/UA hash) + screen-recording detection (MediaRecorder analysis, tab visibility, frame-rate anomalies). Backend pipeline to store and verify metadata.
- **Reference**: `lib/constants/onboarding.ts` (basic size/type/age checks only).

## 2. IBAN validation (EG + 29 chars + MOD-97 checksum)
- **Status**: Stored as string; only basic text input.
- **What's needed**: Add `iban.js` (or equivalent) for client-side MOD-97 validation; backend regex `^EG[0-9]{27}$`.

## 3. Phone validation (Egyptian format)
- **Status**: Stored as string; regex `^\+?[0-9]{10,15}$` on client.
- **What's needed**: Enforce Egyptian pattern `01[0125][0-9]{8}` if required.

## 4. Video "camera fingerprint" & screen-recording detection (Professional)
- **Status**: Not implemented.
- **What's needed**: MediaRecorder capture with timestamped frames; backend stores fingerprint hash + rejects screen recordings.

## 5. Migrations
- Apply new migrations manually: `0042`, `0043`, `0044` (and downs).
- Command: `npm run migrate` (or your migration runner).

## 6. S3 / Storage
- Ensure `STORAGE_BUCKET`, `STORAGE_CDN_URL`, `PUBLIC_API_URL` env vars set.
- Confirm CORS on S3 bucket allows PUT from frontend origin.

## 7. Email transporter
- Configure SMTP env vars for TransactionalEmailService (publisher/professional decision emails).

## 8. Admin UI for publisher applications
- Already exists at `/admin/verification`. Ensure verification officers have `USERS_VERIFY_ALL` permission.

## 9. Onboarding completion enforcement
- AppLayout redirects to `/onboarding` if `onboardingCompleted === false`. Confirm stored user includes the flag (session response updated).

## 10. Professional application review flow
- No admin review endpoint/UI yet for professional applications (only publisher). Add `/admin/professional-applications` if needed.

## 11. EKS / Production deployment
- **Status**: Not applied.
- **What's needed**: Terraform (`infrastructure/terraform/`) and Helm (`infrastructure/helm/backend`, `infrastructure/helm/frontend`) exist with per-environment values, but no EKS cluster has been provisioned. Run `terraform apply -var-file=environments/<env>/terraform.tfvars` then `helm upgrade --install hakawi-backend ./infrastructure/helm/backend --namespace hakawi` to deploy. Compose runs datastores plus source-mounted apps for local development only.
