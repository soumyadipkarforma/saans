// Checked against https://aistudio.google.com/docs/models on 2026-11-24: fastest stable (GA) Flash-family model.
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'; // function calling confirmed live on 2026-11-24
// Total time one Gemini turn may take (all loop iterations and retries) before the template answer is used.
export const GEMINI_TURN_BUDGET_MS = 25_000;
export const GEMINI_TIMEOUT_MS = 10_000;
export const MAX_GEMINI_TURNS_PER_MINUTE = 10;
