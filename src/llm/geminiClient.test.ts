import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const { geminiClient } = await import('./geminiClient');
const req = { system: 's', contents: [], tools: [] };
const KEY = 'AIzaSECRETSECRETSECRET1234';
const apiError = (status: number, message = 'x') => Object.assign(new Error(message), { status });
const client = () => geminiClient(KEY, 'm', 0);
const failure = () =>
  client()
    .generate(req)
    .then(
      () => null,
      (e: unknown) => e,
    );

beforeEach(() => {
  generateContent.mockReset();
});

describe('geminiClient', () => {
  it('extracts text and function calls', async () => {
    generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'hi' }, { functionCall: { name: 'get_air_quality', args: {} } }],
          },
        },
      ],
    });
    const out = await client().generate(req);
    expect(out.text).toBe('hi');
    expect(out.calls).toEqual([{ name: 'get_air_quality', args: {} }]);
  });

  it.each([
    [401, 'keyInvalid'],
    [403, 'keyInvalid'],
    [429, 'quota'],
    [404, 'geminiDown'],
  ])('maps status %i to %s without retrying', async (status, code) => {
    generateContent.mockImplementation(() => Promise.reject(apiError(status)));
    expect(await failure()).toHaveProperty('code', code);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('maps a 400 about the API key to keyInvalid, other 400s to geminiDown', async () => {
    generateContent.mockImplementationOnce(() =>
      Promise.reject(apiError(400, 'API key not valid')),
    );
    await expect(client().generate(req)).rejects.toMatchObject({ code: 'keyInvalid' });
    generateContent.mockImplementationOnce(() => Promise.reject(apiError(400, 'bad request')));
    await expect(client().generate(req)).rejects.toMatchObject({ code: 'geminiDown' });
  });

  it('retries once on 5xx and on timeout, then gives up', async () => {
    generateContent.mockImplementation(() => Promise.reject(apiError(503)));
    await expect(client().generate(req)).rejects.toMatchObject({ code: 'geminiDown' });
    expect(generateContent).toHaveBeenCalledTimes(2);
    generateContent.mockReset();
    generateContent
      .mockImplementationOnce(() => Promise.reject(new Error('timeout')))
      .mockResolvedValueOnce({ candidates: [] });
    await expect(client().generate(req)).resolves.toMatchObject({ calls: [] });
  });

  it('never puts the key in an error message', async () => {
    generateContent.mockImplementation(() => Promise.reject(apiError(401, `bad ${KEY}`)));
    const err = await client()
      .generate(req)
      .catch((e: Error) => e);
    expect((err as Error).message).not.toContain(KEY);
  });
});
