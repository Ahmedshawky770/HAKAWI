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
 * Parses untrusted input at a service boundary and converts a schema failure into
 * the HTTP 400 the caller expects. `ValidationPipe` cannot do this for Zod schemas:
 * `tsc` emits `Object` for a type alias, so there is no runtime class for the pipe
 * to read out of `design:paramtypes`.
 */
export function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(formatIssues(result.error));
  }
  return result.data as z.output<TSchema>;
}
