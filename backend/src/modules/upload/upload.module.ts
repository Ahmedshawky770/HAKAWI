import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';

import { UploadService } from './upload.service.ts';
import { UploadController } from './upload.controller.ts';

/**
 * Builds the S3 client the upload path signs against.
 *
 * WHY THE CLIENT IS CREATED HERE AND NOT INJECTED AS A TYPE-ONLY IMPORT. `UploadService` used to
 * declare `@Optional() private readonly s3Client?: S3` with `import type { S3 } from
 * '@aws-sdk/client-s3'`. A type-only import emits no runtime value, so with `emitDecoratorMetadata`
 * the fourth constructor slot resolved to the token `Object`, nothing in the container provided it,
 * and `@Optional()` turned the miss into `undefined` — which reached `getSignedUrl(undefined, …)` at
 * runtime. A provider is the only thing that makes the token real, so the module owns it.
 *
 * WHY IT NEVER THROWS WHEN THE ENVIRONMENT IS ABSENT. `new S3Client({ region })` validates nothing:
 * the region only has to be a non-empty string and credentials resolve lazily, per request, from the
 * default provider chain. So the application still boots with no `STORAGE_*` variable set at all,
 * which is how the unit and e2e suites run. A deployment that forgot its credentials then fails on
 * the first upload with a credential error rather than refusing to start — the correct failure.
 *
 * WHY EXPLICIT CREDENTIALS ARE OPTIONAL. Passing `credentials: undefined` is not the same as passing
 * `credentials: { … }`; the former leaves the instance role, `~/.aws/credentials` and
 * `AWS_ACCESS_KEY_ID` all working. Requiring static keys would break every IRSA/EKS deployment, so
 * the two `STORAGE_*_KEY` variables are honoured when both are present and ignored when neither is.
 */
export function createS3Client(): S3Client {
  const accessKeyId = process.env.STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.STORAGE_SECRET_KEY;
  const hasStaticCredentials =
    typeof accessKeyId === 'string' &&
    accessKeyId.length > 0 &&
    typeof secretAccessKey === 'string' &&
    secretAccessKey.length > 0;

  return new S3Client({
    region: process.env.STORAGE_REGION || 'us-east-1',
    ...(hasStaticCredentials ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [UploadController],
  providers: [
    UploadService,
    {
      provide: S3Client,
      useFactory: (): S3Client => createS3Client(),
    },
  ],
  exports: [UploadService],
})
export class UploadModule {}
