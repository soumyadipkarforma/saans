// Kept apart from geminiClient so the main bundle never pulls in the Gemini SDK.
export interface LlmClient {
  generate(req: {
    system: string;
    contents: unknown[];
    tools: unknown[];
    /** Aborts the call when the turn's total time budget runs out. */
    signal?: AbortSignal;
  }): Promise<{
    text?: string;
    calls: { name: string; args: unknown }[];
    /** The model's own message, echoed back verbatim in the next request (keeps thought signatures). */
    modelContent?: unknown;
  }>;
}

export type LlmErrorCode = 'keyInvalid' | 'quota' | 'geminiDown';

// The message is only the code, so an error can never carry the API key.
export class LlmError extends Error {
  constructor(readonly code: LlmErrorCode) {
    super(code);
    this.name = 'LlmError';
  }
}
