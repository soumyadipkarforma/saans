import type { z } from 'zod';

export type UpstreamKind = 'timeout' | 'http' | 'schema' | 'network';

export class UpstreamError extends Error {
  readonly kind: UpstreamKind;
  readonly status: number | undefined;

  constructor(kind: UpstreamKind, message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpstreamError';
    this.kind = kind;
    this.status = status;
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 5000;

// Every outbound call goes through here: bounded time, validated shape, typed errors.
export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onCallerAbort);
  const timeoutError = () =>
    new UpstreamError('timeout', `request timed out after ${timeoutMs} ms`);

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (cause) {
      if (timedOut) throw timeoutError();
      throw new UpstreamError('network', 'network request failed', undefined, { cause });
    }
    if (!res.ok) {
      throw new UpstreamError('http', `upstream responded with HTTP ${res.status}`, res.status);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (cause) {
      if (timedOut) throw timeoutError();
      const kind = cause instanceof SyntaxError ? 'schema' : 'network';
      throw new UpstreamError(kind, 'could not read upstream body', undefined, { cause });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new UpstreamError('schema', 'upstream response has an unexpected shape', undefined, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onCallerAbort);
  }
}
