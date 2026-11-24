import type { Assistant } from '../chat/useConversation';
import { MAX_GEMINI_TURNS_PER_MINUTE } from '../config';
import type { createAirService } from '../data/airService';
import type { searchIndia } from '../data/geocode';
import type { KeyStore } from '../key/keyStore';
import { createDegradedAssistant } from './degradedAssistant';
import { LlmError, type LlmClient } from './llmClient';
import { createGeminiAssistant } from './toolLoop';

const WINDOW_MS = 60_000;

// The Gemini SDK is a separate chunk, fetched only when a key is actually used.
export function lazyGeminiClient(apiKey: string): LlmClient {
  let client: Promise<LlmClient> | undefined;
  return {
    async generate(req) {
      client ??= import('./geminiClient').then((m) => m.geminiClient(apiKey));
      return (await client).generate(req);
    },
  };
}

export function createAssistant(deps: {
  geocode: typeof searchIndia;
  air: ReturnType<typeof createAirService>;
  keys: KeyStore;
  onKeyInvalid?: () => void;
  makeLlm?: (apiKey: string) => LlmClient;
  clock?: () => number;
}): Assistant {
  const { geocode, air, keys, onKeyInvalid, makeLlm = lazyGeminiClient, clock = Date.now } = deps;
  const degraded = createDegradedAssistant({ geocode, air });
  let sent: number[] = [];

  return async (input) => {
    const key = keys.get();
    const at = clock();
    sent = sent.filter((t) => at - t < WINDOW_MS);
    if (!key) return degraded(input);
    if (sent.length >= MAX_GEMINI_TURNS_PER_MINUTE) {
      const limited = await degraded(input);
      return { ...limited, notice: limited.notice ?? 'rateLimited' };
    }
    sent.push(at);
    try {
      return await createGeminiAssistant({ llm: makeLlm(key), geocode, air })(input);
    } catch (e) {
      const notice = e instanceof LlmError ? e.code : 'geminiDown';
      if (notice === 'keyInvalid') {
        keys.clear();
        onKeyInvalid?.();
      }
      const turn = await degraded(input);
      return { ...turn, notice: turn.notice ?? notice };
    }
  };
}
