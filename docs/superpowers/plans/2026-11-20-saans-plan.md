# Saans Implementation Plan (static, bring-your-own Gemini key)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed static web app that turns a spoken or typed description of a household's day into a smog-safe plan for today, using live Open-Meteo air data and a deterministic impact engine, with Gemini (user's own key) only writing words.

**Architecture:** One Vite + React + TypeScript app, no backend. `src/engine` is pure and fully tested. `src/data` calls Open-Meteo (air quality + geocoding) with zod-validated responses, timeouts and a 10-minute cache. `src/llm` runs a Gemini function-calling loop in the browser with the user's key, plus a template "degraded" assistant used when there is no key or Gemini fails. The UI renders every card from structured data. Voice sits behind `SpeechInput`/`SpeechOutput`. Deployed to Firebase Hosting.

**Tech Stack:** TypeScript 5 strict, React 19, Vite, zod, `@google/genai`, Vitest + jsdom + v8 coverage, React Testing Library, Playwright + `@axe-core/playwright`, ESLint flat config (typescript-eslint, react, react-hooks, jsx-a11y) + Prettier, GitHub Actions, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-11-20-saans-design.md` — **Amendment A at its top overrides §6, §6.2 (server parts), §6.3, §8 security items about servers, and §9 deployment.**

## Choices for items the spec left open

| Item | Choice |
|---|---|
| Package layout | Single npm package (no workspaces needed without a server) |
| Styling | Plain CSS custom-property tokens + CSS Modules (Vite built-in) |
| Motion | CSS only, no Framer Motion |
| i18n | Own `t(key, params, lang)` over `en.json` / `hi.json` |
| Gemini model | `GEMINI_MODEL` constant in `src/config.ts`; Task 16 checks Google's current model list and picks the fastest GA flash model with function calling (fallback `gemini-2.5-flash`) |
| Hosting | Firebase Hosting with headers in `firebase.json` |

## Global Constraints

- TypeScript `strict: true`; no `any` without a one-line justification. ESLint + Prettier: zero warnings.
- The LLM never produces AQI, pollutant, forecast, or impact numbers. Numbers come from Open-Meteo or `src/engine` only.
- Every reading shows its source ("CAMS via Open-Meteo", labelled modelled estimate) and "updated X min ago". CAMS + Open-Meteo attribution in footer and README.
- AQI = CPCB National AQI computed from the mean of the last 24 hourly PM2.5 / PM10 values.
- Outbound fetch timeout 5 s. Cache TTL 10 min per coordinate rounded to 2 decimals.
- `src/engine` is pure (no I/O, no `Date.now()`; time is a parameter) with 100% coverage. Overall coverage ≥ 80%.
- Chat message ≤ 500 chars; conversation window sent to Gemini ≤ 12 messages; Gemini replies ≤ ~60 words, ≤ 2 questions.
- Gemini key: `sessionStorage` only, key name `saans.geminiKey`; never logged, never in URLs; "Remove key" button. Everything works with no key.
- Client-side limit: max 10 Gemini turns per minute.
- No medical advice: no diagnosis, medicine names or doses; "follow your doctor's advice".
- Typing and chips always work; mic hidden with a note when Speech API unsupported.
- Model output rendered as text only; no `dangerouslySetInnerHTML` anywhere.
- Names echo the brief: `lowEmissionRoutine`, `indoorAirTips`, `sustainableSwaps`, `impact`.
- Languages `en` and `hi` (recognition `en-IN` / `hi-IN`).
- Work on `main`. Commit after every task; `npm run lint && npm run typecheck && npm test` green before each commit. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Gemini states a number anyway** (including Devanagari digits ०-९) not in this turn's tool results → reply replaced by the template reply, `guarded: true`. Test in Task 17.
2. **Location ambiguity / outside India** ("Hyderabad" exists in Pakistan; "Aurangabad" exists twice in India; "London") → IN-only candidates; >1 become chips; 0 → "not found in India". Never auto-pick. Tests in Tasks 9 and 15.
3. **Time zone** — forecast hours are IST wall-clock; best hour and tip hours stay IST when the test runs with `TZ=UTC`. Tests in Tasks 6 and 10.
4. **Partial or dead data** — null PM hours, fewer than 18 of the last 24 hours present, Open-Meteo down → no `0`/`NaN` in the UI; the AQI card says "unavailable"; the assistant says data is unavailable. Tests in Tasks 10, 12, 15.
5. **Bad or exhausted Gemini key** (401/403/429) → one friendly message ("key invalid" / "quota reached"), automatic switch to degraded mode for that turn, the key dialog offered again; no crash, no key in error text. Test in Task 18.

---

## File layout (locked)

```
package.json  tsconfig.json  vite.config.ts  vitest.config.ts  playwright.config.ts
eslint.config.js  .prettierrc  .editorconfig  .gitignore  .nvmrc (22)
firebase.json  .github/workflows/ci.yml  index.html
README.md  CLAUDE.md  docs/{spec,plan,demo-script.md,linkedin-post.md}
src/
  main.tsx  App.tsx  config.ts  styles/{tokens.css,global.css}
  types.ts                       zod schemas + types (Task 2)
  engine/{constants,aqi,exposure,emissions,impact,forecast,indoorAirTips,planner}.ts (+ .test.ts)
  data/{http,cache,geocode,openMeteo,airService}.ts (+ tests, fixtures/*.json)
  llm/{templates,degradedAssistant,systemPrompt,tools,geminiClient,toolLoop,numberGuard,assistant}.ts (+ tests)
  key/{keyStore.ts,KeyDialog.tsx}
  i18n/{en.json,hi.json,i18n.ts}
  chat/{MessageList,ChatInput,Chips}.tsx  chat/useConversation.ts
  plan/{PlanView,AqiCard,SourceBadge,DayTimeline,SwapCard,AtHomeCard}.tsx (+ .module.css)
  speech/{types,WebSpeechInput,WebSpeechOutput,useSpeech}.ts  speech/MicButton.tsx
  demo/{families.ts,DemoPicker.tsx,TrySaying.tsx}
e2e/demo.spec.ts
```

---

## Milestone 1 — Scaffold

### Task 1: Vite app, tooling, CI, README skeleton

**Files:** everything in the root list above except `firebase.json`; `src/main.tsx`, `src/App.tsx` (placeholder heading "Saans"), one placeholder test.

- [ ] Vite React-TS app at repo root (keep existing `.gitignore`, `docs/`, `CLAUDE.md`). Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint` (`eslint . --max-warnings 0`), `typecheck` (`tsc -b --noEmit` or `tsc --noEmit -p .`), `test` (`vitest run --coverage`), `test:e2e` (`playwright test`), `format`.
- [ ] Vitest: jsdom env, setup file with `@testing-library/jest-dom`, coverage v8 thresholds global 80 (lines/branches/functions/statements) and `src/engine/**` 100.
- [ ] ESLint flat config with typescript-eslint (type-checked), react, react-hooks, jsx-a11y; Prettier.
- [ ] `ci.yml`: Node 22, `npm ci`, lint, typecheck, test, install Playwright chromium, `npm run build`, `test:e2e`.
- [ ] README skeleton: name, pitch (spec §2), brief → feature table (spec §2.1), placeholders for spec §9 sections.
- [ ] Verify `npm run lint && npm run typecheck && npm test && npm run build` → green. Commit `chore: scaffold Vite React TS app with lint, tests, CI`.

### Task 2: Schemas and types

**Files:** `src/types.ts`, `src/types.test.ts`

**Produces** (zod `XSchema` + inferred `type X`):
- `Lang = 'en' | 'hi'`
- `AqiBand = 'good' | 'satisfactory' | 'moderate' | 'poor' | 'veryPoor' | 'severe'`
- `Location { city: string; area?: string; state?: string; lat: number; lon: number }` — lat 6–37.6, lon 68–97.5 (shortcut comment: bounding box includes slivers of neighbours; upgrade to a polygon if it matters)
- `AirReading { aqi: number; band: AqiBand; pm25: number | null; pm10: number | null; dominantPollutant: 'pm25' | 'pm10'; source: 'CAMS via Open-Meteo'; stationOrGrid: string; observedAt: string; fetchedAt: string; isModelled: true; isStale: boolean }` (`pm25`/`pm10` = 24-h means used for the AQI)
- `ForecastHour { time: string /* IST "YYYY-MM-DDTHH:00" */; pm25: number | null }`; `Forecast { hours: ForecastHour[]; source: 'CAMS via Open-Meteo'; fetchedAt: string }`
- `PersonGroup = 'child' | 'adult' | 'elderly'`; `Member { group: PersonGroup; age?: number; respiratory: boolean; pregnant: boolean }`
- `TravelMode = 'petrolCar' | 'dieselCar' | 'cngAuto' | 'twoWheeler' | 'bus' | 'metro' | 'walk' | 'cycle'`
- `ActivityKind = 'commute' | 'schoolRun' | 'walk' | 'play' | 'exercise' | 'errand'`
- `Activity { kind: ActivityKind; label?: string; startHour?: number /*0–23*/; durationMin?: number; distanceKm?: number; mode?: TravelMode; participants: number[] /* indices into household */; flexible: boolean; occupants?: number }`
- `Profile { location?: Location; household: Member[] /* ≤10 */; activities: Activity[] /* ≤10 */ }`
- `SwapImpact { exposureSavedUg: number; exposureSavedPct: number; co2SavedKg: number }`
- `Swap { activityIndex: number; fromMode: TravelMode; toMode: TravelMode | 'carpool'; impact: SwapImpact; whyKey: string; why?: string }`
- `PlanItem { activityIndex: number | null; startHour: number; adviceKey: string; reasonKey: string; params: Record<string, string | number> }`
- `PlanBlock { period: 'morning' | 'afternoon' | 'evening'; items: PlanItem[] }`
- `Tip { key: string; params: Record<string, string | number> }`
- `DayPlan { lowEmissionRoutine: PlanBlock[]; sustainableSwaps: Swap[]; indoorAirTips: Tip[]; sensitive: boolean }`
- `ChatMessage { role: 'user' | 'model'; text: string /* 1–500 */ }`
- `AssistantTurn { reply: string; chips: string[]; profile: Profile; air: AirReading | null; forecast: Forecast | null; plan: DayPlan | null; candidates: Location[]; degraded: boolean; guarded: boolean; notice?: 'keyInvalid' | 'quota' | 'geminiDown' | 'airUnavailable' }`

- [ ] Tests: valid sample of each parses; 501-char message fails; London coords (51.5, -0.12) fail `Location`; unknown `TravelMode` fails; household of 11 fails.
- [ ] Fail → implement → pass → commit `feat: zod schemas for profile, air, plan, assistant`.

---

## Milestone 2 — Engine (TDD, 100% coverage)

### Task 3: Constants and AQI

**Files:** `src/engine/constants.ts`, `src/engine/aqi.ts`, `aqi.test.ts`

**Produces:** `subIndex(pollutant: 'pm25' | 'pm10', conc: number): number` (linear interpolation, rounded); `computeAqi(pm25: number | null, pm10: number | null): { aqi: number; dominantPollutant: 'pm25' | 'pm10' } | null`; `bandFor(aqi: number): AqiBand`; `BAND_ORDER: AqiBand[]`; `bandAtLeast(a: AqiBand, b: AqiBand): boolean`.

**Constants (each with a source comment):**
- CPCB National AQI breakpoints (CPCB, *National Air Quality Index*, 2014). AQI bands 0–50, 51–100, 101–200, 201–300, 301–400, 401–500.
  - PM2.5 µg/m³: 0–30, 31–60, 61–90, 91–120, 121–250, 251–380 (Severe upper end used for interpolation; clamp AQI at 500).
  - PM10: 0–50, 51–100, 101–250, 251–350, 351–430, 431–600 (same clamp).
  - Interpolate on continuous bounds (30→50, 60→100, …) so 30.5 never falls in a gap.
- Breathing rates m³/h (US EPA *Exposure Factors Handbook* 2011, Ch. 6, Table 6-2 short-term, rounded): child — rest 0.29, light 0.66, moderate 1.26; adult — rest 0.31, light 0.72, moderate 1.56; elderly — rest 0.30, light 0.72, moderate 1.44.
- Environment factors (in-vehicle/indoor ÷ outdoor PM2.5; assumption from Goel et al. 2015 Delhi commuter exposure and Chen & Zhao 2011 infiltration review): outdoors 1.0, walk 1.0, cycle 1.0, twoWheeler 1.0, cngAuto 0.9, carWindowsOpen 0.9, bus 0.85, metro 0.6, carAcRecirc 0.45, indoorsWindowsShut 0.6, indoorsPurifier 0.3. Comment: "assumption, order of magnitude from cited studies".
- Mask factors (fraction inhaled, assumption from real-world fit studies): none 1.0, clothSurgical 0.7, n95 0.3.
- CO₂ kg/passenger-km (India GHG Program, *India Specific Road Transport Emission Factors* 2015; DMRC sustainability report for metro): petrolCar 0.14, dieselCar 0.15, cngAuto 0.08, twoWheeler 0.035, bus 0.015, metro 0.01, walk 0, cycle 0.
- Mode speeds km/h (assumption, Indian metro-city averages): petrolCar/dieselCar 20, cngAuto 18, twoWheeler 22, bus 15, metro 32, walk 4.5, cycle 12.
- Default trip distance km when not given (assumption): schoolRun 4, commute 12, errand 3, walk 2, play 0, exercise 0.
- Sensitivity: `MAX_OUTDOOR_BAND = { general: 'poor', sensitive: 'moderate' }`; `MASK_FROM_BAND = 'poor'`; `PURIFIER_FROM_BAND = 'moderate'`; `NO_INCENSE_FROM_BAND = 'veryPoor'`; `REASONABLE_HOURS = [6, 21]`.

- [ ] Tests: `subIndex('pm25', 0) === 0`; `30 → 50`; `60 → 100`; `90 → 200`; `120 → 300`; `250 → 400`; `30.5 → 51`; `1000 → 500`; `subIndex('pm10', 100) === 100`; `computeAqi(null, null) === null`; `computeAqi(45, 300).dominantPollutant === 'pm10'`; `bandFor` boundaries 50 good, 51 satisfactory, 100 satisfactory, 101 moderate, 200, 201, 300, 301, 400 veryPoor, 401 severe; negative concentration throws `RangeError`; `bandAtLeast('severe','poor') === true`.
- [ ] Commit `feat(engine): CPCB AQI breakpoints and constants`.

### Task 4: Exposure

**Files:** `src/engine/exposure.ts`, test

**Produces:** `type Environment = keyof typeof ENVIRONMENT_FACTORS`; `type Mask = 'none' | 'clothSurgical' | 'n95'`; `type ActivityLevel = 'rest' | 'light' | 'moderate'`; `inhaledDoseUg(input: { pm25: number; group: PersonGroup; level: ActivityLevel; durationMin: number; environment: Environment; mask?: Mask }): number`; `environmentForMode(mode: TravelMode): Environment` (petrolCar/dieselCar → `carWindowsOpen`).

- [ ] Tests: 100 µg/m³, adult, light, 60 min, outdoors, no mask → 72; with n95 → 21.6; durationMin 0 → 0; child moderate > adult light; negative pm25 or duration → `RangeError`; every `TravelMode` maps to an environment.
- [ ] Commit.

### Task 5: Emissions and swap impact

**Files:** `src/engine/emissions.ts`, `src/engine/impact.ts`, tests

**Produces:** `tripCo2Kg(distanceKm: number, mode: TravelMode, occupants = 1): number` (car modes divide by occupants); `tripDurationMin(distanceKm: number, mode: TravelMode): number`; `computeSwapImpact(input: { distanceKm: number; fromMode: TravelMode; toMode: TravelMode | 'carpool'; pm25: number; group: PersonGroup; occupants?: number }): SwapImpact` — exposure per mode uses `tripDurationMin`, level moderate for walk/cycle else light; `'carpool'` = petrolCar with occupants (default 3); pct integer, µg 1 dp, kg 2 dp; positive = saving.

- [ ] Tests: 10 km petrolCar → 1.40 kg; carpool 3 → 0.47; distance 0 → all zeros, pct 0, no NaN; petrolCar → metro at pm25 200 positive on both; petrolCar → walk negative `exposureSavedUg`, positive CO₂; unknown mode (cast) throws `Error('unknown mode')`.
- [ ] Commit.

### Task 6: Forecast helpers and indoor air tips

**Files:** `src/engine/forecast.ts`, `src/engine/indoorAirTips.ts`, tests

**Produces:** `bestWindow(hours: ForecastHour[], opts: { fromHour: number; toHour: number; lengthH: number; day: string /* YYYY-MM-DD IST */ }): { startHour: number; meanPm25: number } | null` (skips windows touching null hours); `worstWindow(...)` same signature; `indoorAirTips(input: { air: AirReading; forecast: Forecast | null; day: string; sensitive: boolean }): Tip[]` with keys `airOut` {from,to} (best 2-h window 10–18), `windowsShut` {from,to} (worst 3-h window 6–21), `purifierNight` (band ≥ PURIFIER_FROM_BAND or sensitive), `exhaustCooking` (always), `noIncense` (band ≥ NO_INCENSE_FROM_BAND), `airOutUnavailable` when forecast null or no window.

- [ ] Tests (run file with `process.env.TZ = 'UTC'` set before imports via vitest `env`): lowest PM at 14–15 → start 14; hours outside range ignored; window touching null skipped; all null → null; IST strings compared by wall-clock; Severe → `noIncense` + `purifierNight`; Good non-sensitive → no `purifierNight`; forecast null → `airOutUnavailable`.
- [ ] Commit.

### Task 7: Planner

**Files:** `src/engine/planner.ts`, test

**Produces:** `buildDayPlan(input: { profile: Profile; air: AirReading; forecast: Forecast | null; now: string /* IST "YYYY-MM-DDTHH:mm" */ }): DayPlan`

Rules:
- `sensitive` = any member child, elderly, respiratory or pregnant. Per activity, its participants decide.
- **lowEmissionRoutine:** each activity → `PlanItem`. Flexible kinds (walk/play/exercise/errand) move to `bestWindow` (1 h, REASONABLE_HOURS, today); if that window's band (from `computeAqi(meanPm25, null)`) exceeds participants' `MAX_OUTDOOR_BAND` → `adviceKey 'moveIndoors'`, else `'goAt'`. Without forecast, flexible keeps its `startHour` (default 17) and uses current band. Fixed activities keep `startHour` (defaults commute 9, schoolRun 8) with `'mask'` if band ≥ MASK_FROM_BAND else `'goAhead'`. Each sensitive member not in any outdoor activity, when current band exceeds `sensitive` limit, gets `stayIndoorsUntil` {hour = forecast best window start, or 'later'} (one item per household, not per member). Period: <12 morning, <17 afternoon, else evening; empty blocks omitted. `reasonKey` + params (`band`, `pm25`, `hour`).
- **sustainableSwaps:** activities with mode petrolCar/dieselCar/cngAuto/twoWheeler: candidates metro, bus, carpool (cars only), walk/cycle (distance ≤ 2 km AND band ≤ moderate). Keep candidates with `co2SavedKg > 0` and (`exposureSavedUg ≥ 0` or band ≤ moderate). Rank by `exposureSavedUg` if the activity's participants are sensitive, else `co2SavedKg`; best per activity; top 3 overall. Group for impact = most sensitive participant (child > elderly > adult). `whyKey` = `swap.<toMode>`.
- **indoorAirTips:** Task 6.

- [ ] Tests: **personalisation** — same Very Poor reading: commuter-only profile vs family with child 8 + asthmatic elder → different routines (`moveIndoors`/`stayIndoorsUntil` only for the family) and different swap ranking; flexible walk moves to forecast best hour; no activities → no crash; missing distance uses default; Good AQI allows walk swap for a 1.5 km errand by car, Severe doesn't; all numbers finite.
- [ ] Coverage of `src/engine` 100%. Commit `feat(engine): day planner with routines, swaps and indoor tips`.

---

## Milestone 3 — Data (Open-Meteo)

### Task 8: HTTP helper and cache

**Files:** `src/data/http.ts`, `src/data/cache.ts`, tests

**Produces:** `fetchJson<T>(url: string, schema: ZodType<T>, opts?: { timeoutMs?: number /*5000*/; signal?: AbortSignal }): Promise<T>` — throws `UpstreamError { status?: number; kind: 'timeout' | 'http' | 'schema' | 'network' }`; `class TtlCache<V> { constructor(ttlMs: number, now?: () => number, max = 200); get(key: string): V | undefined; set(key: string, v: V): void }`; `coordKey(lat: number, lon: number): string` (2 dp).

- [ ] Tests (stub `fetch`): timeout, 500, bad shape, network error each → right `kind`; cache hit before TTL, miss after; max+1 evicts oldest; `coordKey(28.6139, 77.209) === coordKey(28.6141, 77.2088)`.
- [ ] Commit.

### Task 9: Geocoding

**Files:** `src/data/geocode.ts`, test, `src/data/fixtures/geocode-{aurangabad,london,delhi}.json`

**Produces:** `searchIndia(query: string): Promise<Location[]>` — `https://geocoding-api.open-meteo.com/v1/search?name=<enc>&count=10&language=en&format=json&countryCode=IN`; keep `country_code === 'IN'`; dedupe name+admin1; max 5; query trimmed 2–80 chars else `[]` without fetching.

- [ ] Tests: Aurangabad → 2 results with different `state`; London (no IN results) → `[]`; one-char query → `[]` and fetch not called; network error propagates as `UpstreamError`.
- [ ] Commit.

### Task 10: Open-Meteo air service

**Files:** `src/data/openMeteo.ts`, `src/data/airService.ts`, tests, `src/data/fixtures/air-delhi.json`

**Produces:**
- `fetchAirAndForecast(loc: Location, now: Date): Promise<{ air: AirReading; forecast: Forecast }>` — one request: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude&longitude&hourly=pm2_5,pm10&past_days=1&forecast_days=2&timezone=Asia%2FKolkata`. AQI from `computeAqi(mean24(pm2_5), mean24(pm10))` over the 24 hours ending at the current IST hour; if fewer than 18 non-null values for both → throw `AirUnavailableError`. `observedAt` = latest hour with a value (IST, converted to ISO with `+05:30`); `isStale` if that is > 3 h before `now`. `stationOrGrid: 'CAMS model grid (~40 km)'`. Forecast = hours from the current IST hour onward.
- `createAirService(fetcher = fetchAirAndForecast, cache = new TtlCache(600_000)): { getAir(loc: Location, now: Date): Promise<{ air; forecast }> }` — cached by `coordKey`.

- [ ] Tests (`TZ=UTC`): fixture → AQI equals `computeAqi` of the 24-h means; hour strings stay IST wall-clock; nulls tolerated; only 10 valid hours → `AirUnavailableError`; latest value 4 h old → `isStale`; second `getAir` within 10 min doesn't call fetcher; after 10 min it does.
- [ ] Commit.

---

## Milestone 4 — Frontend without voice

### Task 11: Shell, tokens, i18n

**Files:** `src/App.tsx`, `src/styles/*`, `src/i18n/*`, `index.html`, tests

**Produces:** `t(key: string, params?: Record<string, string | number>, lang?: Lang): string` (missing key returns the key); `useLang(): { lang: Lang; setLang(l: Lang): void }` (sets `document.documentElement.lang`; persists `saans.lang` in localStorage inside try/catch). Band tokens `--aqi-good`…`--aqi-severe` with paired text colours, each ≥ 4.5:1 (ratios in a comment). Layout: conversation left / plan right ≥ 900 px, stacked below; header with language toggle (`English` / `हिंदी`, `aria-pressed`). Footer: "Air data: CAMS via Open-Meteo (modelled)", "Not medical advice", GitHub link placeholder. Skip link to main.

- [ ] Tests: `en.json` and `hi.json` have identical key sets; interpolation; missing key; toggle sets `<html lang="hi">`.
- [ ] Commit.

### Task 12: AqiCard and SourceBadge

**Files:** `src/plan/AqiCard.tsx`, `SourceBadge.tsx`, CSS modules, tests

**Props:** `AqiCard({ air: AirReading | null; status: 'idle' | 'loading' | 'ready' | 'unavailable'; now: Date; city?: string })`; `SourceBadge({ air: AirReading; now: Date })`.

- [ ] Tests: shows `air.aqi`, band label text, dominant pollutant, "CAMS via Open-Meteo", "modelled estimate", "updated 12 min ago"; `isStale` → "stale"; `unavailable` → message, no number; band carried by text, not only colour.
- [ ] Commit.

### Task 13: Plan cards

**Files:** `src/plan/PlanView.tsx` (default export, lazy-loaded in App via `React.lazy`), `DayTimeline.tsx`, `SwapCard.tsx`, `AtHomeCard.tsx`, tests

**Props:** `PlanView({ plan: DayPlan })`; `DayTimeline({ blocks: PlanBlock[] })`; `SwapCard({ swap: Swap })` headline "`{toMode}` instead of `{fromMode}` → `{pct}`% less smog inhaled · `{kg}` kg CO₂ saved", "Why?" is `<button aria-expanded>` revealing `swap.why ?? t(swap.whyKey)`; `AtHomeCard({ tips: Tip[] })`.

- [ ] Tests: SwapCard numbers equal `swap.impact`; negative exposure uses "more smog inhaled, less CO₂" wording; "Why?" toggles `aria-expanded`; DayTimeline headings per non-empty period; AtHomeCard renders hours.
- [ ] Commit.

### Task 14: Chat UI and conversation hook

**Files:** `src/chat/MessageList.tsx`, `ChatInput.tsx`, `Chips.tsx`, `useConversation.ts`, tests

**Produces:** `type Assistant = (input: { messages: ChatMessage[]; profile: Profile; lang: Lang; now: Date }) => Promise<AssistantTurn>`; `useConversation(assistant: Assistant): { messages; profile; turn: AssistantTurn | null; status: 'idle' | 'thinking'; send(text: string): Promise<void>; setProfile(p: Profile): void; reset(): void }` — keeps last 12 messages, merges turns, persists `profile` to localStorage (`saans.profile`, try/catch, validated on load). `MessageList`: `role="log"` `aria-live="polite"`. `ChatInput`: 500-char limit with counter, Enter sends, disabled while empty. `Chips({ items, onPick })`: real buttons. Location candidates render as chips labelled "City, State".

- [ ] Tests (fake assistant): Enter sends; empty disabled; 501st char blocked; chip pick sends label; assistant reply appears in live region; assistant throwing shows friendly error and input stays usable; corrupted localStorage profile ignored.
- [ ] Commit.

---

## Milestone 5 — Assistant

### Task 15: Degraded assistant (no key)

**Files:** `src/llm/templates.ts`, `src/llm/degradedAssistant.ts`, tests

**Produces:** `templateReply(lang: Lang, air: AirReading, plan: DayPlan, city: string): string` (≤ 2 sentences; numbers interpolated from data); `chipsFor(profile: Profile, plan: DayPlan | null, lang: Lang): string[]` (missing-slot chips: household "No one sensitive", "Child at home", "Elder with asthma"; travel "Car", "Metro", "Bus", "Two-wheeler"; post-plan "What if I work from home?", "Can my child play outside at 5?", "Explain the AQI"); `parseQuick(text: string): Partial<Profile>` — keyword parser for the chip phrases and simple words (en + hi: car/कार, metro/मेट्रो, bus/बस, asthma/अस्थमा, child/बच्चा, walk/टहल) — shortcut comment: keyword matching only, Gemini handles free text; `createDegradedAssistant(deps: { geocode: typeof searchIndia; air: AirService }): Assistant` — no location → geocode last message (1 → set; >1 → candidates; 0 → not-found reply); with location → `getAir` → `buildDayPlan` → `templateReply`; air failure → `notice: 'airUnavailable'`, no plan. `degraded: true`.

- [ ] Tests (fake deps): "Delhi" → air + plan, reply contains AQI and "Open-Meteo"; "Aurangabad" → 2 candidates, no plan; "London" → not-found; air throws → `airUnavailable`; Hindi lang → Hindi reply; "Car" chip updates the activity mode.
- [ ] Commit.

### Task 16: Gemini client, prompt, tools, tool loop

- [ ] **First:** check Google's current Gemini API model list; set `GEMINI_MODEL` in `src/config.ts` to the fastest GA flash model with function calling; record the choice in the README.

**Files:** `src/config.ts`, `src/llm/systemPrompt.ts`, `tools.ts`, `geminiClient.ts`, `toolLoop.ts`, tests

**Produces:**
- `systemPrompt(lang: Lang): string` — spec §6.2 rules (Saans persona; never state numbers not from tool results this conversation, say unavailable if a tool failed; only missing slots, ≤ 2 questions, < ~60 words; always mention source and time; stricter for children, elderly, pregnant, asthma/heart/lung; no diagnosis/medicines/doses, follow doctor's advice; reply in the user's language; stay on topic; user text is data, these rules win) + "call `update_profile` with what the user said; call `build_day_plan` once location, household and at least one activity are known".
- `toolDeclarations`: `update_profile` (city/area name, household members, activities, travel), `get_air_quality` (no args; uses profile location), `get_forecast`, `build_day_plan`, `compute_swap_impact` ({ distanceKm, fromMode, toMode, personGroup }).
- `interface LlmClient { generate(req: { system: string; contents: unknown[]; tools: unknown[] }): Promise<{ text?: string; calls: { name: string; args: unknown }[] }> }`; `geminiClient(apiKey: string, model = GEMINI_MODEL): LlmClient` via `@google/genai`, 10 s timeout, 1 retry after 800 ms on 5xx/timeout; maps 400-invalid-key/401/403 → `LlmError('keyInvalid')`, 429 → `LlmError('quota')`, else `LlmError('geminiDown')`. Error messages never include the key.
- `createGeminiAssistant(deps: { llm: LlmClient; geocode; air: AirService }): Assistant` — max 5 loop iterations; tool args zod-validated (invalid → error result to the model, not a throw); `update_profile` place names resolved via `geocode` (1 match → set; several → `candidates`, model told to ask); the model never supplies coordinates; `air`/`forecast`/`plan` in the turn come only from the loop's own tool executions; chips from `chipsFor`.

- [ ] Tests with scripted fake `LlmClient`: update_profile Delhi → get_air_quality → turn `air` equals fake air service reading; invalid args → loop continues; > 5 iterations → template reply; ambiguous city → candidates; system prompt contains "Never state any AQI" and the language rule.
- [ ] Commit.

### Task 17: Number guard and golden-rule tests

**Files:** `src/llm/numberGuard.ts`, test; `src/plan/goldenRule.test.tsx`

**Produces:** `extractNumbers(text: string): number[]` (ASCII + Devanagari digits, decimals, `%`, 12-h times like "5pm" → 17 also); `allowedNumbers(turn: Partial<AssistantTurn>, profile: Profile): Set<number>` (AQI, PM values as displayed, impact numbers as displayed, plan hours in 24-h and 12-h form, ages, distances, durations, counts 1–10); `guardReply(reply: string, allowed: Set<number>): { reply: string; guarded: boolean }` — `createGeminiAssistant` substitutes `templateReply` when guarded.

- [ ] Tests: "AQI is 312" with 312 allowed → unchanged; "AQI is 999" → guarded; "एक्यूआई ३१२" with 312 → unchanged; "९९९" → guarded; "5pm" allowed when 17 is a plan hour; age "8" allowed.
- [ ] Golden-rule (RTL): turn whose `reply` says "AQI 999, 90% less smog" with `air.aqi = 312`, swap pct 38 → cards show 312 and 38, never 999/90. Tool-loop test: fake LLM text with a made-up number → `guarded: true`.
- [ ] Commit.

### Task 18: Key dialog and assistant wiring

**Files:** `src/key/keyStore.ts`, `src/key/KeyDialog.tsx`, `src/llm/assistant.ts`, `App.tsx` wiring, tests

**Produces:** `keyStore = { get(): string | null; set(k: string): void; clear(): void }` over sessionStorage `saans.geminiKey` (try/catch; trims; rejects < 20 chars); `KeyDialog` — native `<dialog>` with label, password-type input, link to `https://aistudio.google.com/apikey`, privacy note ("stays in this browser tab, sent only to Google"), Save / Remove key / "Continue without AI"; `createAssistant(deps): Assistant` — key present and under 10 turns/minute → Gemini assistant; `LlmError` → degraded assistant for that turn with `notice` set; `keyInvalid` clears the key and reopens the dialog. Header shows "AI: on/off" button opening the dialog.

- [ ] Tests: key round-trips sessionStorage, clear removes; short key rejected; no key → degraded used; 401 fake → degraded turn with `notice: 'keyInvalid'` and key cleared; 429 → `notice: 'quota'`; 11th turn in a minute → degraded; dialog focus trapped and Escape closes.
- [ ] Commit.

---

## Milestone 6 — Voice

### Task 19: Speech interfaces and Web Speech implementations

**Files:** `src/speech/types.ts`, `WebSpeechInput.ts`, `WebSpeechOutput.ts`, tests

**Produces:**
```ts
interface SpeechInput { isSupported(): boolean; start(lang: Lang): void; stop(): void;
  on(event: 'partial' | 'final', cb: (text: string) => void): () => void;
  on(event: 'error', cb: (code: 'not-allowed' | 'no-speech' | 'network' | 'other') => void): () => void;
  on(event: 'end', cb: () => void): () => void; }
interface SpeechOutput { isSupported(): boolean; speak(text: string, lang: Lang): void; cancel(): void; }
```
`WebSpeechInput`: `interimResults: true`, `continuous: false`, `en-IN` / `hi-IN`. `WebSpeechOutput`: voice whose `lang` starts with `hi` / `en-IN`, else default; speaks first 3 sentences; cancels before each utterance.

- [ ] Tests with fake `SpeechRecognition` / `speechSynthesis`: unsupported when absent; interim → partial; final → final; `not-allowed` mapped; 3-sentence trim; no Hindi voice still speaks.
- [ ] Commit.

### Task 20: Mic UI, captions, mute, fallbacks

**Files:** `src/speech/MicButton.tsx`, `src/speech/useSpeech.ts`, `App.tsx`, tests

- [ ] `MicButton`: `<button aria-pressed aria-label>` large and centred; pulse disabled under `prefers-reduced-motion`; live caption region for partial text; final → `send`. Mute toggle (`aria-pressed`, `saans.muted` in localStorage) — when unmuted, speak each reply. Unsupported → mic hidden, `t('mic.unsupported')` note. `not-allowed` → friendly message, focus to text box.
- [ ] Tests: unsupported note and input remain; denied message; partial caption; final sends; mute stops speak; Hindi starts recognition with `hi`.
- [ ] Commit.

---

## Milestone 7 — Demo families and hints

### Task 21: Demo families, Try saying, geolocation

**Files:** `src/demo/families.ts`, `DemoPicker.tsx`, `TrySaying.tsx`, App wiring, tests

**Produces:** `DEMO_FAMILIES: { id: 'sharma' | 'iyer' | 'das'; name: string; city: string; profile: Omit<Profile, 'location'>; script: string[] }[]` — Sharma (Delhi: 2 adults, child 8, grandmother with asthma; car school-run 8:00 + petrol-car office commute 12 km), Iyer (Mumbai: young couple; two-wheeler commute 10 km; evening jog flexible), Das (Kolkata: elderly couple; morning walk flexible; bus to market 3 km). Picking one geocodes the city, sets the profile, and plays the script lines as messages (instant under reduced motion) through the current assistant — works without a key. `TrySaying` lists 6 sentences EN + HI (incl. "I live in Pune, I cycle to college and my dad has asthma", "मैं लखनऊ में रहता हूँ, सुबह पार्क में टहलता हूँ"); click fills the input. "Use my location" → `navigator.geolocation` → `Location { city: t('loc.yours'), lat, lon }`, rejected outside the India box with a message; denial handled.

- [ ] Tests: each family matches the spec; Sharma vs Iyer plans differ (fake air); Try-saying click fills input; geolocation outside India and denial show messages.
- [ ] Commit.

---

## Milestone 8 — Hardening

### Task 22: Security pass

- [ ] `firebase.json` hosting config: `public: dist`, SPA rewrite, headers: CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://air-quality-api.open-meteo.com https://geocoding-api.open-meteo.com https://generativelanguage.googleapis.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=(self), geolocation=(self), camera=()`, long cache for `/assets/**`. Same CSP as a `<meta>` in `index.html` (minus `frame-ancestors`) so preview builds are covered.
- [ ] Tests: a test reads `src/**` and fails on `dangerouslySetInnerHTML`, `innerHTML =`, `eval(`; a test asserts `firebase.json` CSP `connect-src` lists exactly those hosts; a test asserts the key never appears in `localStorage` after `keyStore.set`.
- [ ] `npm audit --omit=dev` clean (or each item justified in README). Commit.

### Task 23: E2E, accessibility, coverage, performance

**Files:** `e2e/demo.spec.ts`, `playwright.config.ts`, `e2e/fixtures/*`

- [ ] Playwright runs `vite preview`; Open-Meteo requests intercepted with `page.route` and fixture JSON. Test: load → "Try a demo family" → Sharma → AQI card with source badge and ≥ 1 swap card; `AxeBuilder` → zero serious/critical; keyboard-only path through demo picker and chips; Hindi toggle changes `<html lang>`.
- [ ] Coverage ≥ 80% overall, engine 100%. Lighthouse mobile on the preview build ≥ 90 performance, 100 accessibility; fix regressions.
- [ ] Commit.

---

## Milestone 9 — Deploy

### Task 24: Firebase Hosting

- [ ] README deploy section: `npm i -g firebase-tools`, `firebase login`, `firebase init hosting` (use existing `firebase.json`), `npm run build && firebase deploy --only hosting`.
- [ ] **User runs** login + deploy (their Google account). Then smoke test the live URL: page loads, Delhi and Mumbai show different readings with source + timestamp, demo family end to end without a key, with a key one Gemini turn, Hindi turn, response headers include the CSP. Paste outputs. Commit.

---

## Milestone 10 — Submission pack

### Task 25: README, demo script, LinkedIn post

- [ ] README complete per spec §9 (adjusted by Amendment A): live link, video placeholder, brief table, screenshot, Mermaid diagram + golden rule, "bring your own Gemini key" section, sample inputs (demo families + 6 sentences EN/HI), data attribution (CAMS, Open-Meteo), constants + sources, run/test/deploy, security/a11y/testing notes, "What GenAI did vs what I did", tools.
- [ ] `docs/demo-script.md` (2–3 min shot list, spec §9) and `docs/linkedin-post.md` (`#PromptWarsVirtual`).
- [ ] Final check: lint, typecheck, test, build, test:e2e. Commit `docs: submission pack`.

---

## Execution: agents and models (cost control)

| Dispatch | Tasks | Implementer model | Reviewer model |
|---|---|---|---|
| D1 | 1–2 scaffold + schemas | haiku | sonnet |
| D2 | 3–5 constants, AQI, exposure, emissions | haiku | sonnet |
| D3 | 6–7 forecast, tips, planner | sonnet | sonnet |
| D4 | 8–10 data layer | haiku | sonnet |
| D5 | 11–13 shell, AQI card, plan cards | haiku | sonnet |
| D6 | 14–15 chat UI, degraded assistant | sonnet | sonnet |
| D7 | 16–18 Gemini loop, guard, key dialog | sonnet | sonnet |
| D8 | 19–21 voice, demo families | sonnet | sonnet |
| D9 | 22–23 security, e2e, a11y | sonnet | sonnet |
| D10 | 25 docs (Task 24 is the user's deploy) | haiku | — (final review covers it) |
| Final | whole branch | — | opus |

## Open items for the user

1. Exact submission deadline.
2. A Gemini key in your browser for testing (never in chat or the repo).
3. A Google account for Firebase Hosting (Milestone 9).
4. GitHub repo name.
