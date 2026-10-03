import { ZodError, type ZodType } from 'zod';

export type FetchJsonBody = string | null | undefined;

export interface FetchJsonOptions {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: FetchJsonBody;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly operation?: string;
}

export class FetchResponseError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly bodyPreview: string;
  readonly retryable: boolean;
  readonly operation: string;

  constructor(operation: string, status: number, statusText: string, bodyPreview: string) {
    super(`${operation} failed with HTTP ${status} ${statusText}`.trim());
    this.name = 'FetchResponseError';
    this.operation = operation;
    this.status = status;
    this.statusText = statusText;
    this.bodyPreview = bodyPreview;
    this.retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  }
}

export class FetchParseError extends Error {
  readonly operation: string;
  readonly retryable: boolean;

  constructor(operation: string, message: string) {
    super(`${operation} returned a body that is not valid JSON: ${message}`);
    this.name = 'FetchParseError';
    this.operation = operation;
    this.retryable = true;
  }
}

export class FetchTimeoutError extends Error {
  readonly operation: string;
  readonly timeoutMs: number;
  readonly retryable: boolean;

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.retryable = true;
  }
}

export class FetchValidationError extends Error {
  readonly operation: string;
  readonly issues: readonly string[];
  readonly retryable: boolean;

  constructor(operation: string, error: ZodError) {
    super(`${operation} response failed schema validation`);
    this.name = 'FetchValidationError';
    this.operation = operation;
    this.issues = error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
    this.retryable = false;
  }
}

export const DEFAULT_FETCH_TIMEOUT_MS = 5000;
const BODY_PREVIEW_LIMIT = 512;

const RETRYABLE_ERRORS = [FetchTimeoutError, FetchParseError] as const;

export function isRetryableFetchError(error: unknown): boolean {
  if (error instanceof FetchResponseError || error instanceof FetchValidationError) {
    return error.retryable;
  }
  for (const ErrorType of RETRYABLE_ERRORS) {
    if (error instanceof ErrorType) {
      return true;
    }
  }
  return false;
}

export async function fetchJson<T>(url: string, schema: ZodType<T>, options: FetchJsonOptions = {}): Promise<T> {
  return fetchValidated<T>(url, schema, options);
}

async function fetchValidated<T>(url: string, schema: ZodType<T>, options: FetchJsonOptions): Promise<T> {
  const operation = options.operation ?? `GET ${url}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available in this runtime');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = (): void => {
    controller.abort();
  };
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', onExternalAbort);
  }

  let rawBody: string;
  try {
    if (controller.signal.aborted) {
      throw new FetchTimeoutError(operation, timeoutMs);
    }
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });

    rawBody = await response.text();

    if (!response.ok) {
      throw new FetchResponseError(
        operation,
        response.status,
        response.statusText,
        rawBody.slice(0, BODY_PREVIEW_LIMIT),
      );
    }
  } catch (error) {
    if (error instanceof FetchResponseError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new FetchTimeoutError(operation, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  let parsed: unknown;
  try {
    parsed = rawBody.length === 0 ? undefined : JSON.parse(rawBody);
  } catch (error) {
    throw new FetchParseError(operation, error instanceof Error ? error.message : String(error));
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new FetchValidationError(operation, result.error);
  }
  return result.data;
}
