import { GoogleGenAI, type Content } from '@google/genai';
import { GEMINI_MODEL, GEMINI_TIMEOUT_MS } from '../config';
import { LlmError, type LlmClient } from './llmClient';

export { LlmError };
const RETRY_DELAY_MS = 800;

function classify(e: unknown): { error: LlmError; retry: boolean } {
  const status = (e as { status?: unknown }).status;
  const message = e instanceof Error ? e.message : '';
  // No HTTP status means a timeout or network failure.
  if (typeof status !== 'number') return { error: new LlmError('geminiDown'), retry: true };
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message))) {
    return { error: new LlmError('keyInvalid'), retry: false };
  }
  if (status === 429) return { error: new LlmError('quota'), retry: false };
  return { error: new LlmError('geminiDown'), retry: status >= 500 };
}

export function geminiClient(
  apiKey: string,
  model: string = GEMINI_MODEL,
  retryDelayMs = RETRY_DELAY_MS,
): LlmClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generate({ system, contents, tools, signal }) {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: contents as Content[],
            config: {
              systemInstruction: system,
              // The SDK tool type is a deep union; tools.ts builds it, so a cast is safe here.
              tools: tools as never,
              httpOptions: { timeout: GEMINI_TIMEOUT_MS },
              abortSignal: signal,
            },
          });
          const content = res.candidates?.[0]?.content;
          const parts = content?.parts ?? [];
          const text = parts
            .filter((p) => p.text && !p.thought)
            .map((p) => p.text)
            .join('');
          const calls = parts.flatMap((p) =>
            p.functionCall?.name ? [{ name: p.functionCall.name, args: p.functionCall.args }] : [],
          );
          return { text: text || undefined, calls, modelContent: content };
        } catch (e) {
          const { error, retry } = classify(e);
          if (!retry || attempt >= 1 || signal?.aborted) throw error;
          await new Promise((r) => setTimeout(r, retryDelayMs));
        }
      }
    },
  };
}
