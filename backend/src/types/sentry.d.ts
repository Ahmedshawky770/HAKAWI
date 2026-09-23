declare module '@sentry/nestjs' {
  import { Type } from '@nestjs/common/interfaces';

  export class SentryModule {
    static HTTP_HANDLER: Type;
  }
}
