import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export interface ZodIssue {
  readonly path: string;
  readonly message: string;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join(', ');
}

/**
 * The parse half of a schema, stated structurally so the parsed type flows in from
 * the schema the caller passes.
 *
 * `z.ZodTypeAny` cannot be used for that: it fixes the schema's generic parameters to
 * `any`, so `safeParse` hands back `data: any` and every parsed payload would be untyped
 * at the call site — which is exactly what this file exists to prevent.
 */
type SafeParser<TParsed> = {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: TParsed }
    | { success: false; error: z.ZodError };
};

/**
 * Parses untrusted input at a service boundary and converts a schema failure into
 * the HTTP 400 the caller expects. `ValidationPipe` cannot do this for Zod schemas:
 * `tsc` emits `Object` for a type alias, so there is no runtime class for the pipe
 * to read out of `design:paramtypes`.
 */
export function parseOrThrow<TParsed>(schema: SafeParser<TParsed>, value: unknown): TParsed {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new BadRequestException(formatIssues(result.error));
}
