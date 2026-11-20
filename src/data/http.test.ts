import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson, UpstreamError } from './http';

const URL = 'https://example.test/data';
const Schema = z.object({ n: z.number() });

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function rejectionOf(p: Promise<unknown>): Promise<UpstreamError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof UpstreamError) return err;
    throw err;
  }
  throw new Error('expected the promise to reject');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  it('returns the parsed body when the response matches the schema', async () => {
    stubFetch(() => Promise.resolve(response({ n: 1 })));
    await expect(fetchJson(URL, Schema)).resolves.toEqual({ n: 1 });
  });

  it('maps a request that outlives the timeout to kind timeout', async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const err = await rejectionOf(fetchJson(URL, Schema, { timeoutMs: 10 }));
    expect(err.name).toBe('UpstreamError');
    expect(err.kind).toBe('timeout');
  });

  it('maps an HTTP 500 to kind http with the status', async () => {
    stubFetch(() => Promise.resolve(response({}, 500)));
    const err = await rejectionOf(fetchJson(URL, Schema));
    expect(err.kind).toBe('http');
    expect(err.status).toBe(500);
  });

  it('maps a body that breaks the schema to kind schema', async () => {
    stubFetch(() => Promise.resolve(response({ n: 'nope' })));
    const err = await rejectionOf(fetchJson(URL, Schema));
    expect(err.kind).toBe('schema');
  });

  it('maps a body that is not JSON to kind schema', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      } as unknown as Response),
    );
    const err = await rejectionOf(fetchJson(URL, Schema));
    expect(err.kind).toBe('schema');
  });

  it('maps a rejected fetch to kind network', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const err = await rejectionOf(fetchJson(URL, Schema));
    expect(err.kind).toBe('network');
    expect(err.status).toBeUndefined();
  });

  it('maps a body that stalls past the timeout to kind timeout', async () => {
    stubFetch((_url, init) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            );
          }),
      } as unknown as Response),
    );
    const err = await rejectionOf(fetchJson(URL, Schema, { timeoutMs: 10 }));
    expect(err.kind).toBe('timeout');
  });

  it('maps a connection dropped while reading the body to kind network', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new TypeError('network error')),
      } as unknown as Response),
    );
    const err = await rejectionOf(fetchJson(URL, Schema));
    expect(err.kind).toBe('network');
  });

  it('aborts the request when the caller signal fires', async () => {
    const controller = new AbortController();
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const pending = rejectionOf(fetchJson(URL, Schema, { signal: controller.signal }));
    controller.abort();
    const err = await pending;
    expect(err.kind).toBe('network');
  });
});
