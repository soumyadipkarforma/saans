# Saans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, voice-first web app that turns a spoken description of a household's day into a smog-safe plan for today, using live Indian AQI data and a deterministic impact engine, with Gemini only writing words.

**Architecture:** npm-workspaces monorepo. `packages/shared` holds zod schemas and types. `apps/server` is Express 5 on Node 22: pure `engine/`, data adapters behind one `AirQualityProvider` interface with a fallback chain and TTL cache, and a Gemini tool loop that returns text plus structured data. `apps/web` is React + Vite and renders every card from structured data; voice sits behind `SpeechInput`/`SpeechOutput`. One Cloud Run container serves both.

**Tech Stack:** TypeScript 5 (strict), Node 22, Express 5, zod, `@google/genai`, helmet, cors, express-rate-limit, React 19, Vite, Vitest + v8 coverage, React Testing Library, supertest, Playwright + `@axe-core/playwright`, ESLint (typescript-eslint, react, react-hooks, jsx-a11y) + Prettier, GitHub Actions, Docker, Google Cloud Run.

**Spec:** `docs/superpowers/specs/2026-11-20-saans-design.md`

## Choices for items the spec left open (Section 12)

| Item | Choice | Why |
|---|---|---|
| Server framework | **Express 5** | supertest is the standard route-test tool; helmet / express-rate-limit / cors are first-party-grade; async errors handled natively in v5 |
| Workspaces | **npm workspaces** | No extra tool for judges or CI to install |
| Styling | **Plain CSS with custom-property tokens + CSS Modules** (Vite built-in) | Zero runtime, smallest bundle, tokens make AQI contrast auditable |
| Motion | **CSS transitions/keyframes only** (no Framer Motion) | Saves ~40 kB; `prefers-reduced-motion` is one media query |
| i18n | **Own `t(key, params)` over `en.json`/`hi.json`** | Two languages, no plurals worth a library |
| Gemini model | `GEMINI_MODEL` env, default chosen in Task 19 after checking Google's current model list for the fastest GA "flash" model with function calling | Model names change; spec says keep it in config |
| Constants | Values below in Task 3, each with a cited source | |

## Global Constraints

- TypeScript `strict: true`; no `any` without a one-line justification comment. ESLint + Prettier: zero warnings.
- The LLM never produces AQI, pollutant, forecast, or impact numbers. Numbers come from live APIs or `engine/` only.
- Every reading shows `source` and `observedAt`/"updated X min ago". Open-Meteo readings always labelled modelled; CAMS + Open-Meteo attribution in footer and README.
- Fallback order for current AQI: CPCB → OpenAQ → Open-Meteo. Reading older than 3 h = stale.
- Cache TTL 10 min per coordinate rounded to 2 decimals. Outbound timeout 5 s.
- `engine/` is pure (no I/O, no `Date.now()` — time is a parameter) and has 100% coverage. Overall coverage ≥ 80%.
- Chat message ≤ 500 chars; conversation window sent to server ≤ 12 messages; Gemini replies ≤ ~60 words, ≤ 2 questions.
- No medical advice: no diagnosis, medicine names or doses; "follow your doctor's advice".
- Typing and chips always work; mic hidden (with a note) when Speech API unsupported.
- Model output rendered as text only; no `dangerouslySetInnerHTML` anywhere.
- No user message text in server logs.
- Names echo the brief: `lowEmissionRoutine`, `indoorAirTips`, `sustainableSwaps`, `impact`.
- Languages: `en` and `hi` (recognition `en-IN` / `hi-IN`).
- Commit after every task; `npm run lint && npm run typecheck && npm test` green before each commit.

## Review Focus

1. **Gemini states a number anyway** (including Devanagari digits ०-९) that is not in this turn's tool results → the reply is replaced by the template reply and `degraded` stays false but `guarded: true`. Test in Task 20.
2. **Location ambiguity / outside India** ("Hyderabad" exists in Pakistan; "Aurangabad" exists twice in India; "London") → geocode returns IN-only candidates; >1 candidate becomes chips, 0 becomes "not found in India, which city?". Never auto-pick. Test in Task 9 and Task 18.
3. **Far-away station** — nearest CPCB/OpenAQ station is > 25 km away (small towns) → rejected, fall through to the next source, so a town never gets a distant city's reading. Tests in Tasks 11, 12.
4. **Time zone** — Open-Meteo hours must be IST wall-clock; "best hour" and at-home tip hours must be IST even when the server runs in UTC (Cloud Run). Test in Tasks 6 and 10.
5. **Partial / dead data** — CPCB rows with `"NA"` values, OpenAQ station with PM10 only, all three sources down → no `0` or `NaN` ever reaches the UI; `/api/air` returns 503 `{ error: "air_unavailable" }` and the UI says data is unavailable. Tests in Tasks 12, 13, 15.

---

## Repository layout (locked here)

```
package.json                 workspaces, root scripts: lint, typecheck, test, test:e2e, build, format
tsconfig.base.json           strict, ES2022, moduleResolution bundler
eslint.config.js             flat config
.prettierrc  .editorconfig  .gitignore  .env.example  .nvmrc (22)
.github/workflows/ci.yml
Dockerfile  .dockerignore
README.md  CLAUDE.md
docs/  (spec, plan, demo-script.md, linkedin-post.md)
packages/shared/src/{schemas.ts,index.ts}  + schemas.test.ts
apps/server/src/
  app.ts            createApp(deps): Express app (no listen) — routes, security middleware, static
  index.ts          reads env, builds deps, listen(PORT)
  config.ts         loadConfig(env) → Config (zod-validated)
  engine/{constants,aqi,exposure,emissions,impact,forecast,indoorAirTips,planner}.ts (+ .test.ts each)
  data/{http,cache,geocode,openMeteo,openaq,cpcb,airService}.ts (+ tests, fixtures/ JSON)
  llm/{systemPrompt,tools,toolLoop,numberGuard,templates}.ts (+ tests)
  routes/{health,geocode,air,chat}.ts (+ tests)
apps/web/src/
  main.tsx  App.tsx  styles/{tokens.css,global.css}
  i18n/{en.json,hi.json,i18n.ts}
  api/client.ts
  chat/{MessageList,ChatInput,Chips,useConversation}.tsx/ts
  plan/{PlanView,AqiCard,SourceBadge,DayTimeline,SwapCard,AtHomeCard}.tsx (+ .module.css)
  speech/{types,WebSpeechInput,WebSpeechOutput,MicButton,useSpeech}.ts(x)
  demo/{families.ts,DemoPicker.tsx,TrySaying.tsx}
apps/web/e2e/demo.spec.ts
```

---

## Milestone 1 — Scaffold

### Task 1: Monorepo, tooling, CI, README skeleton

**Files:** Create everything in the root list above except Dockerfile; `apps/server` and `apps/web` with `package.json`, `tsconfig.json`, `vitest.config.ts`, and one placeholder test each; `apps/web` Vite React-TS skeleton.

- [ ] `git init`, `.gitignore` (node_modules, dist, coverage, `.env`, playwright-report).
- [ ] Root scripts: `lint` = `eslint . --max-warnings 0`, `typecheck` = `tsc -b` over all workspaces, `test` = `vitest run --coverage` per workspace, `test:e2e` = Playwright in apps/web, `build` = shared → web → server.
- [ ] Vitest coverage thresholds: global 80 lines/branches/functions/statements; `apps/server/src/engine/**` 100.
- [ ] `.env.example`: `GEMINI_API_KEY=`, `GEMINI_MODEL=`, `DATA_GOV_IN_API_KEY=`, `CPCB_RESOURCE_ID=`, `OPENAQ_API_KEY=`, `ALLOWED_ORIGIN=http://localhost:5173`, `PORT=8080`.
- [ ] `ci.yml`: Node 22, `npm ci`, lint, typecheck, test, `npx playwright install --with-deps chromium`, test:e2e.
- [ ] README skeleton: name, pitch (spec §2), brief → feature table (spec §2.1), placeholder sections from spec §9.
- [ ] Verify: `npm run lint && npm run typecheck && npm test` → all green (placeholder tests pass).
- [ ] Commit `chore: scaffold monorepo with strict TS, lint, tests, CI`.

**Done when:** the three commands pass from a clean clone.

### Task 2: Shared schemas

**Files:** `packages/shared/src/schemas.ts`, `index.ts`, `schemas.test.ts`

**Produces** (zod schema `XSchema` + inferred `type X` for each):
- `Lang = 'en' | 'hi'`
- `AqiBand = 'good' | 'satisfactory' | 'moderate' | 'poor' | 'veryPoor' | 'severe'`
- `Location { city: string; area?: string; state?: string; lat: number; lon: number }` — lat 6–37.6, lon 68–97.5 (India bounding box; shortcut: box includes slivers of neighbours, upgrade to polygon if it matters)
- `AirSource = 'CPCB' | 'OpenAQ' | 'Open-Meteo'`
- `AirReading { aqi: number; band: AqiBand; pm25: number | null; pm10: number | null; dominantPollutant: 'pm25' | 'pm10'; source: AirSource; stationOrGrid: string; distanceKm: number | null; observedAt: string; fetchedAt: string; isModelled: boolean; isStale: boolean }`
- `ForecastHour { time: string /* IST "YYYY-MM-DDTHH:00" */; pm25: number | null }`; `Forecast { hours: ForecastHour[]; source: 'Open-Meteo'; fetchedAt: string }`
- `PersonGroup = 'child' | 'adult' | 'elderly'`; `Member { group: PersonGroup; age?: number; respiratory: boolean; pregnant: boolean }`
- `TravelMode = 'petrolCar' | 'dieselCar' | 'cngAuto' | 'twoWheeler' | 'bus' | 'metro' | 'walk' | 'cycle'`
- `ActivityKind = 'commute' | 'schoolRun' | 'walk' | 'play' | 'exercise' | 'errand'`
- `Activity { kind: ActivityKind; label?: string; startHour?: number /*0–23*/; durationMin?: number; distanceKm?: number; mode?: TravelMode; participants: number[] /* indices into household */; flexible: boolean; occupants?: number }`
- `Profile { location?: Location; household: Member[]; activities: Activity[] }` (household ≤ 10, activities ≤ 10)
- `SwapImpact { exposureSavedUg: number; exposureSavedPct: number; co2SavedKg: number }`
- `Swap { activityIndex: number; fromMode: TravelMode; toMode: TravelMode | 'carpool'; impact: SwapImpact; whyKey: string; why?: string }`
- `PlanItem { activityIndex: number | null; startHour: number; adviceKey: string; reasonKey: string; params: Record<string, string | number> }`
- `PlanBlock { period: 'morning' | 'afternoon' | 'evening'; items: PlanItem[] }`
- `Tip { key: string; params: Record<string, string | number> }`
- `DayPlan { lowEmissionRoutine: PlanBlock[]; sustainableSwaps: Swap[]; indoorAirTips: Tip[]; sensitive: boolean }`
- `ChatMessage { role: 'user' | 'model'; text: string /* 1–500 */ }`
- `ChatRequest { messages: ChatMessage[] /* 1–12 */; profile: Profile; lang: Lang }`
- `ChatResponse { reply: string; chips: string[]; profile: Profile; air: AirReading | null; forecast: Forecast | null; plan: DayPlan | null; candidates: Location[]; degraded: boolean; guarded: boolean }`

- [ ] Tests: valid sample of each parses; `ChatMessage` of 501 chars fails; 13 messages fails; `Location` with London coords (51.5, -0.12) fails; unknown `TravelMode` fails.
- [ ] Run → fail, implement, run → pass. Commit `feat(shared): zod schemas for profile, air, plan, chat`.

**Status update after M1** (3 lines).

---

## Milestone 2 — Engine (TDD, 100% coverage)

All engine files import types from `@saans/shared` and take time as a parameter.

### Task 3: Constants and AQI

**Files:** `engine/constants.ts`, `engine/aqi.ts`, `engine/aqi.test.ts`

**Produces:**
- `subIndex(pollutant: 'pm25' | 'pm10', conc: number): number` — linear interpolation, rounded.
- `computeAqi(pm25: number | null, pm10: number | null): { aqi: number; dominantPollutant: 'pm25' | 'pm10' } | null` — max sub-index; null if both null.
- `bandFor(aqi: number): AqiBand`
- `BAND_ORDER: AqiBand[]`, `bandAtLeast(a: AqiBand, b: AqiBand): boolean`

**Constants (each with a source comment):**
- CPCB National AQI breakpoints (CPCB, *National Air Quality Index*, 2014, Table 2 — verify against the published PDF before committing). AQI bands 0–50, 51–100, 101–200, 201–300, 301–400, 401–500.
  - PM2.5 (µg/m³): 0–30, 31–60, 61–90, 91–120, 121–250, 251–380 (Severe upper end used for interpolation; clamp AQI at 500).
  - PM10: 0–50, 51–100, 101–250, 251–350, 351–430, 431–600 (same clamp).
  - Interpolate on continuous bounds (30→50, 60→100 …) so 30.5 never falls in a gap.
- Breathing rates m³/h (US EPA *Exposure Factors Handbook* 2011, Ch. 6, Table 6-2 short-term rates, rounded): child 6–<11 — rest 0.29, light 0.66, moderate 1.26; adult 21–<61 — rest 0.31, light 0.72, moderate 1.56; elderly 61+ — rest 0.30, light 0.72, moderate 1.44.
- Environment factors (indoor/in-vehicle ÷ outdoor PM2.5; assumption, cite: Goel et al. 2015 Delhi commuter exposure study and Chen & Zhao 2011 infiltration review): outdoors 1.0, walk/cycle 1.0, two-wheeler 1.0, cngAuto 0.9, carWindowsOpen 0.9, bus 0.85, metro 0.6, carAcRecirc 0.45, indoorsWindowsShut 0.6, indoorsPurifier 0.3. Mark as "assumption, order of magnitude from cited studies".
- Mask factors (fraction inhaled; assumption from real-world fit studies): none 1.0, clothSurgical 0.7, n95 0.3.
- CO₂ kg/passenger-km (India GHG Program, *India Specific Road Transport Emission Factors* 2015, and DMRC sustainability report for metro — verify values): petrolCar 0.14, dieselCar 0.15, cngAuto 0.08, twoWheeler 0.035, bus 0.015, metro 0.01, walk 0, cycle 0.
- Mode speeds km/h for duration from distance (assumption, Indian metro-city averages): car 20, cngAuto 18, twoWheeler 22, bus 15, metro 32 (incl. access), walk 4.5, cycle 12.
- Default trip distance km when user didn't say (assumption): schoolRun 4, commute 12, errand 3.
- Sensitivity: `MAX_OUTDOOR_BAND = { general: 'poor', sensitive: 'moderate' }`; `MASK_FROM_BAND = 'poor'`; `PURIFIER_FROM_BAND = 'moderate'`; `NO_INCENSE_FROM_BAND = 'veryPoor'`; `REASONABLE_HOURS = [6, 21]`.

- [ ] Tests (`aqi.test.ts`): `subIndex('pm25', 0) === 0`; `30 → 50`; `60 → 100`; `90 → 200`; `120 → 300`; `250 → 400`; `30.5 → 51`; `1000 → 500`; `subIndex('pm10', 100) === 100`; `computeAqi(null, null) === null`; `computeAqi(45, 300)` → dominant `pm10`; `bandFor(0..500)` hits all six bands at each boundary (50 good, 51 satisfactory, 400 veryPoor, 401 severe); negative concentration throws `RangeError`.
- [ ] Fail → implement → pass → commit `feat(engine): CPCB AQI breakpoints and constants`.

### Task 4: Exposure

**Files:** `engine/exposure.ts`, `exposure.test.ts`

**Produces:** `type Environment = keyof typeof ENVIRONMENT_FACTORS`; `type Mask = 'none' | 'clothSurgical' | 'n95'`; `type ActivityLevel = 'rest' | 'light' | 'moderate'`;
`inhaledDoseUg(input: { pm25: number; group: PersonGroup; level: ActivityLevel; durationMin: number; environment: Environment; mask?: Mask }): number`;
`environmentForMode(mode: TravelMode): Environment` (petrolCar/dieselCar → `carWindowsOpen`).

- [ ] Tests: 100 µg/m³, adult, light, 60 min, outdoors, no mask → 72; same with n95 → 21.6; durationMin 0 → 0; child moderate > adult light for same input; pm25 negative or duration negative → `RangeError`; every `TravelMode` maps to an environment.
- [ ] Fail → implement → pass → commit.

### Task 5: Emissions and swap impact

**Files:** `engine/emissions.ts`, `engine/impact.ts`, tests

**Produces:**
- `tripCo2Kg(distanceKm: number, mode: TravelMode, occupants = 1): number` (car modes divide by occupants; others ignore it)
- `tripDurationMin(distanceKm: number, mode: TravelMode): number`
- `computeSwapImpact(input: { distanceKm: number; fromMode: TravelMode; toMode: TravelMode | 'carpool'; pm25: number; group: PersonGroup; occupants?: number }): SwapImpact` — exposure uses `tripDurationMin` per mode and `level` = moderate for walk/cycle, light otherwise; `'carpool'` = petrolCar with occupants (default 3). Percent rounded to integer; µg to 1 dp; kg to 2 dp. Positive = saving.

- [ ] Tests: 10 km petrolCar → 1.40 kg; carpool 3 → 0.47; distance 0 → all zero and pct 0 (no NaN); petrolCar → metro at pm25 200 gives positive exposure and CO₂ saving; petrolCar → walk gives negative `exposureSavedUg` (walking breathes more) and positive CO₂; unknown mode string (cast) → throws `Error('unknown mode')`.
- [ ] Fail → implement → pass → commit `feat(engine): emissions and swap impact`.

### Task 6: Forecast helpers and indoor air tips

**Files:** `engine/forecast.ts`, `engine/indoorAirTips.ts`, tests

**Produces:**
- `bestWindow(hours: ForecastHour[], opts: { fromHour: number; toHour: number; lengthH: number; day: string /* IST YYYY-MM-DD */ }): { startHour: number; meanPm25: number } | null` — skips null hours; null if no full window.
- `worstWindow(...)` same signature.
- `indoorAirTips(input: { air: AirReading; forecast: Forecast | null; day: string; sensitive: boolean }): Tip[]` — keys: `airOut` {from,to} (best 2 h window 10–18), `windowsShut` {from,to} (worst 3 h window), `purifierNight` (band ≥ PURIFIER_FROM_BAND or sensitive), `exhaustCooking` (always), `noIncense` (band ≥ NO_INCENSE_FROM_BAND), `airOutUnavailable` when forecast null.

- [ ] Tests: forecast with lowest PM at 14:00–15:00 → `bestWindow` start 14; hours outside 6–21 ignored; window crossing a null hour skipped; all-null → null; IST strings with no offset are compared by wall-clock (test with a fixture generated as `timezone=Asia/Kolkata`); Severe reading → tips include `noIncense` and `purifierNight`; Good reading, non-sensitive → no `purifierNight`; forecast null → `airOutUnavailable` and no crash.
- [ ] Fail → implement → pass → commit.

### Task 7: Planner

**Files:** `engine/planner.ts`, `planner.test.ts`

**Consumes:** Tasks 3–6. **Produces:** `buildDayPlan(input: { profile: Profile; air: AirReading; forecast: Forecast | null; now: string /* IST ISO */ }): DayPlan`

Rules (the plan's only algorithm):
- `sensitive` = any member child, elderly, respiratory, or pregnant. Per activity, its participants decide sensitivity.
- **lowEmissionRoutine:** each activity → a `PlanItem`. Flexible activities (walk/play/exercise/errand) move to `bestWindow` (1 h, REASONABLE_HOURS); if the best window's band (via `computeAqi`) exceeds the participants' `MAX_OUTDOOR_BAND` → `adviceKey: 'moveIndoors'`. Fixed activities keep `startHour` (default commute 9, schoolRun 8) with `adviceKey: 'mask'` if band ≥ MASK_FROM_BAND, else `'goAhead'`. Sensitive members with no outdoor activity get an item `stayIndoorsUntil` {hour} when current band exceeds their limit. Period: <12 morning, <17 afternoon, else evening. Every item has a `reasonKey` + params (`band`, `pm25`, `hour`).
- **sustainableSwaps:** for each activity with mode in petrolCar/dieselCar/cngAuto/twoWheeler: candidates metro, bus, carpool (cars only), walk/cycle (only if distance ≤ 2 km AND band ≤ moderate). Keep candidates with `co2SavedKg > 0` and (`exposureSavedUg ≥ 0` or band ≤ moderate). Rank by `exposureSavedUg` when the activity's participants are sensitive, else by `co2SavedKg`; keep best per activity, top 3 overall. `whyKey` like `swap.metro.cleanerCabin`.
- **indoorAirTips:** from Task 6.

- [ ] Tests: **personalisation** — same Delhi Very Poor reading, commuter-only profile vs family with child 8 + asthmatic elder → different `lowEmissionRoutine` (`moveIndoors`/`stayIndoorsUntil` present only for the family) and different swap ranking; flexible walk moves to forecast best hour; no activities → routine contains only stay-indoors items or is empty, no crash; distance missing → uses default distance; Good AQI → walk/cycle swap allowed for a 1.5 km errand, Severe → not; all numbers in output are finite.
- [ ] Fail → implement → pass. Run `npm test -- --coverage` for server: engine 100%. Commit `feat(engine): day planner with routines, swaps and indoor tips`.

**Status update after M2.**

---

## Milestone 3 — Data adapters and routes

> **Ask the user now** (do not take keys in chat): get a data.gov.in key (https://data.gov.in → sign up → My Account → API key) and an OpenAQ key (https://explore.openaq.org → account → API keys), and put them in a local `.env` at the repo root using `.env.example`. Open-Meteo needs none.

### Task 8: HTTP helper and cache

**Files:** `data/http.ts`, `data/cache.ts`, tests

**Produces:** `fetchJson<T>(url: string, opts: { headers?: Record<string,string>; timeoutMs?: number /*5000*/; schema: ZodType<T> }): Promise<T>` (AbortSignal.timeout; throws `UpstreamError` with `status` on non-2xx, timeout, or schema mismatch); `class TtlCache<V> { constructor(ttlMs: number, now?: () => number); get(key): V | undefined; set(key, v): void }` with max 500 entries (drop oldest); `coordKey(lat, lon): string` (2-dp rounding).

- [ ] Tests (mock `fetch` with `vi.stubGlobal`): timeout → `UpstreamError`; 500 → `UpstreamError` status 500; bad shape → `UpstreamError`; cache hit before TTL, miss after (fake clock); 501st entry evicts first; `coordKey(28.6139, 77.209) === coordKey(28.6141, 77.2088)`.
- [ ] Commit.

### Task 9: Geocode + app skeleton + /api/geocode + /api/health

**Files:** `data/geocode.ts`, `app.ts`, `config.ts`, `index.ts`, `routes/health.ts`, `routes/geocode.ts`, tests, `data/fixtures/geocode-*.json`

**Produces:** `searchIndia(query: string): Promise<Location[]>` — Open-Meteo `/v1/search?name=&count=10&language=en&format=json&countryCode=IN`, filtered again to `country_code === 'IN'`, deduped by name+admin1, max 5. `createApp(deps: { air: AirService; geocode: typeof searchIndia; chat: ChatHandler; config: Config }): Express`. `GET /api/health → 200 { ok: true }`. `GET /api/geocode?q=` (zod: 2–80 chars) → `{ results: Location[] }`; 400 on bad query; 502 `{ error: 'geocode_unavailable' }` on upstream failure.

- [ ] Tests: "Aurangabad" fixture → 2 candidates with different `state`; "London" fixture (empty IN results) → `[]`; route 400 for `q=a`; 502 when geocode throws; health 200. Express error handler returns JSON, never a stack.
- [ ] Commit.

### Task 10: Open-Meteo adapter

**Files:** `data/openMeteo.ts`, test, fixtures

**Produces:** `AirQualityProvider` interface `{ name: AirSource; current(loc: Location, now: Date): Promise<AirReading | null> }`; `openMeteo.current` (uses `current=pm2_5,pm10`, `isModelled: true`, `stationOrGrid: 'CAMS grid ~40 km'`); `openMeteoForecast(loc, now): Promise<Forecast>` (`hourly=pm2_5&forecast_days=2&timezone=Asia%2FKolkata`).

- [ ] Tests: fixture → AQI from `computeAqi`; `isModelled` true; forecast hour strings kept as IST wall-clock (no `Z` conversion) with `TZ=UTC` set in the test; null PM values pass through as null.
- [ ] Commit.

### Task 11: OpenAQ v3 adapter

**Files:** `data/openaq.ts`, test, fixtures

**Produces:** `openaq: AirQualityProvider`. `/v3/locations?coordinates={lat},{lon}&radius=25000&limit=10` with `X-API-Key`, pick nearest location having a PM2.5 (or PM10) sensor, then `/v3/locations/{id}/latest`; `distanceKm` via haversine (`data/geo.ts` helper `haversineKm`). Returns null if none within 25 km or key missing.

- [ ] Tests: nearest station selected; station only with PM10 → AQI from PM10, `pm25: null`; empty results → null; `observedAt` older than 3 h → `isStale: true`.
- [ ] Commit.

### Task 12: CPCB adapter

- [ ] **First:** confirm on data.gov.in the current resource ID for "Real time Air Quality Index from various locations" and its field names (expected: `state, city, station, last_update "DD-MM-YYYY HH:mm:ss" IST, latitude, longitude, pollutant_id, avg_value`). Put the ID in `.env` as `CPCB_RESOURCE_ID`, record what you found in a comment. If the API or fields differ, **stop and tell the user** (per prompt §0).

**Files:** `data/cpcb.ts`, test, fixtures

**Produces:** `cpcb: AirQualityProvider` — query `filters[state]`-free, `limit=1000`, `format=json`; group rows by station; nearest station within 25 km having PM2.5 or PM10 `avg_value` numeric; parse `last_update` as IST.

- [ ] Tests: `"NA"` values ignored (no NaN); nearest station within 25 km chosen; Delhi-only fixture queried with Mumbai coords → null (Review Focus 3); IST timestamp parsed to correct UTC instant; reading > 3 h old → `isStale: true`.
- [ ] Commit.

### Task 13: Air service with fallback + /api/air

**Files:** `data/airService.ts`, `routes/air.ts`, tests

**Produces:** `createAirService(providers: AirQualityProvider[], forecast: typeof openMeteoForecast, cache: TtlCache, now: () => Date): AirService` with `getAir(loc): Promise<{ air: AirReading; forecast: Forecast | null }>` — tries providers in order, skips throwers, nulls, and stale readings (keeps the first stale one as last resort, flagged); fetches forecast in parallel with the first provider; caches by `coordKey`; throws `AirUnavailableError` when all fail. `GET /api/air?lat&lon&city` (zod with India box) → `{ air, forecast }`; 400 bad coords; 503 `{ error: 'air_unavailable' }`.

- [ ] Tests: CPCB ok → CPCB used, others not called; CPCB throws → OpenAQ; both null → Open-Meteo modelled; all fail → 503; second call within 10 min doesn't hit providers; forecast failure still returns air with `forecast: null`; London coords → 400.
- [ ] Commit. **Status update after M3.**

---

## Milestone 4 — Frontend without voice

### Task 14: Web shell, tokens, i18n, API client

**Files:** `main.tsx`, `App.tsx`, `styles/tokens.css`, `styles/global.css`, `i18n/*`, `api/client.ts`, tests

**Produces:** `t(key: string, params?: Record<string,string|number>, lang?: Lang): string`; `useLang(): { lang, setLang }` (sets `document.documentElement.lang`, persists in localStorage in try/catch); `api.chat(req: ChatRequest): Promise<ChatResponse>`, `api.air(loc)`, `api.geocode(q)` — each validates the response with the shared schema. Band tokens `--aqi-good` … `--aqi-severe` with paired text colours, each pair ≥ 4.5:1 (record ratios in a comment). Layout: two columns ≥ 900 px, stacked below. Footer: attributions, "Not medical advice", GitHub link.

- [ ] Tests: every key in `en.json` exists in `hi.json` and vice versa; `t('aqi.updated', {min: 5})` interpolates; missing key returns the key; `setLang('hi')` sets `<html lang="hi">`; client rejects a malformed response.
- [ ] Commit.

### Task 15: AqiCard and SourceBadge

**Files:** `plan/AqiCard.tsx`, `plan/SourceBadge.tsx`, CSS modules, tests

**Props:** `AqiCard({ air: AirReading | null; status: 'loading' | 'ready' | 'unavailable'; now: Date })`; `SourceBadge({ air, now })`.

- [ ] Tests: renders `air.aqi`, band label text (`t('band.veryPoor')`), dominant pollutant, source name, "updated 12 min ago"; `isModelled` shows "modelled estimate"; `isStale` shows "stale"; `status='unavailable'` shows the unavailable message and no number; band conveyed by text not only colour.
- [ ] Commit.

### Task 16: Plan cards

**Files:** `plan/PlanView.tsx` (default export, lazy-loaded in App via `React.lazy`), `DayTimeline.tsx`, `SwapCard.tsx`, `AtHomeCard.tsx`, tests

**Props:** `DayTimeline({ blocks: PlanBlock[] })`, `SwapCard({ swap: Swap })` — headline "`{toMode}` instead of `{fromMode}` → `{pct}`% less smog inhaled · `{kg}` kg CO₂ saved"; "Why?" is a `<button aria-expanded>` revealing `swap.why ?? t(swap.whyKey)`. `AtHomeCard({ tips: Tip[] })`.

- [ ] Tests: SwapCard numbers equal `swap.impact` values; negative exposure shows "more smog inhaled, lower CO₂" wording, never a negative "less"; "Why?" toggles `aria-expanded` and shows text; DayTimeline renders three periods with headings and skips empty ones; AtHomeCard renders hours from params.
- [ ] Commit.

### Task 17: Chat UI

**Files:** `chat/MessageList.tsx`, `ChatInput.tsx`, `Chips.tsx`, `useConversation.ts`, tests

**Produces:** `useConversation(): { messages; profile; air; forecast; plan; candidates; chips; status; send(text: string): Promise<void>; reset(): void; loadProfile(p: Profile, script: string[]): Promise<void> }` — keeps the last 12 messages, sends `ChatRequest`, merges `ChatResponse`. Persists `profile` to localStorage (try/catch). `MessageList` is `aria-live="polite"`, `role="log"`. `ChatInput` enforces 500 chars with a visible counter. `Chips({ items, onPick })` are real buttons. Location candidates render as chips; picking one sends it.

- [ ] Tests: typing + Enter calls `send`; empty input disabled; 501st char blocked; chips call `onPick` with label; new assistant message appears inside the live region; server error shows a friendly message and keeps the input usable.
- [ ] Commit. **Status update after M4.**

---

## Milestone 5 — Gemini conversation

> **Ask the user now** to add `GEMINI_API_KEY` (https://aistudio.google.com/apikey) to `.env`.

### Task 18: /api/chat degraded path (works with no Gemini)

**Files:** `routes/chat.ts`, `llm/templates.ts`, tests

**Produces:** `type ChatHandler = (req: ChatRequest) => Promise<ChatResponse>`; `degradedChat(req, deps: { air: AirService; geocode }) : Promise<ChatResponse>` — if `profile.location` missing: geocode the last user message; 1 candidate → set location; >1 → `candidates` + chips; 0 → not-found template. With location: `getAir` → `buildDayPlan` → `templateReply(lang, air, plan)` (one or two short sentences with `t`-style templates, numbers interpolated from data). `degraded: true`. Route: zod body, 16 kb JSON limit, returns 400 on invalid.

- [ ] Tests (supertest, mocked deps): profile with Delhi location → response has `air`, `plan`, reply contains the air's AQI and source; "Aurangabad" → 2 candidates, no plan; "London" → not-found reply, no plan; invalid body → 400; Hindi request → Hindi template.
- [ ] Commit.

### Task 19: Gemini client, system prompt, tools, tool loop

- [ ] **First:** check Google's current Gemini model list; set `GEMINI_MODEL` default in `config.ts` to the fastest GA flash model that supports function calling. Note the choice in the README.

**Files:** `llm/systemPrompt.ts`, `llm/tools.ts`, `llm/toolLoop.ts`, tests

**Produces:**
- `systemPrompt(lang: Lang): string` — the spec §6.2 rules verbatim in intent, plus "the user's household and plan are in tool results; call `build_day_plan` once location, household and at least one activity are known".
- `toolDeclarations` for `update_profile`, `get_air_quality`, `get_forecast`, `build_day_plan`, `compute_swap_impact` (parameter JSON schemas derived from shared zod types).
- `interface LlmClient { generate(req: { system: string; contents: Content[]; tools: FunctionDeclaration[] }): Promise<{ text?: string; calls: { name: string; args: unknown }[] }> }`; `geminiClient(config): LlmClient` wrapping `@google/genai` with 8 s timeout and 2 retries (exponential backoff 500 ms, 1 s) on 429/5xx/timeout.
- `runToolLoop(req: ChatRequest, deps: { llm: LlmClient; air: AirService; geocode }): Promise<ChatResponse>` — max 5 iterations; each tool call's args validated with zod (invalid → tool error result, not a throw); `update_profile` merges into a working profile; location from `update_profile` must come from `geocode` (the model gives a place name; the server resolves coordinates — model-supplied lat/lon are ignored); tool results feed back; structured `air`/`forecast`/`plan` taken from the server's own tool executions only. The server, not the model, picks `chips` from the missing slots or the post-plan follow-ups (`chipsFor(profile, plan, lang)` in `templates.ts`).

- [ ] Tests with a scripted fake `LlmClient`: model calls `update_profile({city:'Delhi'})` then `get_air_quality` → response `air` equals the fake AirService's reading; invalid args → loop continues with an error result; >5 iterations → stops with template reply; model-provided lat/lon ignored in favour of geocode; system prompt contains "Never state any AQI" and the language rule.
- [ ] Commit.

### Task 20: Number guard and golden-rule tests

**Files:** `llm/numberGuard.ts`, test; `apps/web/src/plan/goldenRule.test.tsx`

**Produces:** `extractNumbers(text: string): number[]` (ASCII and Devanagari digits, decimals, `%`); `allowedNumbers(resp: Partial<ChatResponse>, profile: Profile): Set<number>` (AQI, pm, impact values in their displayed rounding, hours, ages, distances, counts ≤ 10); `guardReply(reply, allowed): { reply: string; guarded: boolean }` — any number outside `allowed` → caller substitutes `templateReply`.

- [ ] Tests: "AQI is 312 from CPCB" with 312 allowed → unchanged; "AQI is 999" → guarded; "एक्यूआई ३१२" with 312 allowed → unchanged, with `९९९` → guarded; time "5pm" allowed when 17 is a plan hour (map 12-h forms); child age "8" allowed.
- [ ] Golden-rule test (web): render `PlanView`/`AqiCard` from a `ChatResponse` whose `reply` says "AQI 999, 90% less smog" while `air.aqi = 312` and swap pct 38 → DOM shows 312 and 38, never 999 or 90 in cards. Server-side equivalent in `toolLoop.test.ts`: fake LLM text with a fabricated number → `guarded: true`, reply replaced.
- [ ] Commit.

### Task 21: Wire chat with fallback and rate limit

**Files:** `routes/chat.ts`, `app.ts`, `index.ts`, tests

- [ ] `chatHandler = runToolLoop` when `GEMINI_API_KEY` set, catching `LlmUnavailableError` → `degradedChat`; no key → always degraded. `express-rate-limit` on `/api/chat`: 20 req/min/IP, JSON 429 `{ error: 'rate_limited' }`; `app.set('trust proxy', 1)` for Cloud Run.
- [ ] Tests: LLM throws → response `degraded: true` with `air` and `plan`; 21st request in a minute → 429; log spy confirms no message text logged.
- [ ] Manual check against real Gemini with `.env`: run server, `curl -X POST localhost:8080/api/chat` with the spec's example sentence; paste output. Commit. **Status update after M5.**

---

## Milestone 6 — Voice

### Task 22: Speech interfaces and Web Speech implementations

**Files:** `speech/types.ts`, `WebSpeechInput.ts`, `WebSpeechOutput.ts`, tests

**Produces:**
```ts
interface SpeechInput { isSupported(): boolean; start(lang: Lang): void; stop(): void;
  on(event: 'partial' | 'final', cb: (text: string) => void): () => void;
  on(event: 'error', cb: (code: 'not-allowed' | 'no-speech' | 'network' | 'other') => void): () => void;
  on(event: 'end', cb: () => void): () => void; }
interface SpeechOutput { isSupported(): boolean; speak(text: string, lang: Lang): void; cancel(): void; }
```
`WebSpeechInput` uses `interimResults: true`, `continuous: false`, lang `en-IN`/`hi-IN`. `WebSpeechOutput` picks a voice whose `lang` starts with `hi`/`en-IN`, falls back to default voice; speaks only the first 3 sentences.

- [ ] Tests with a fake `SpeechRecognition` on `window`: unsupported when absent; interim result → `partial`, final → `final`; `not-allowed` error mapped; output trims to 3 sentences and calls `cancel` before a new utterance; missing Hindi voice still speaks with default.
- [ ] Commit.

### Task 23: Mic UI, captions, mute, fallbacks

**Files:** `speech/MicButton.tsx`, `speech/useSpeech.ts`, `App.tsx`, tests

- [ ] `MicButton`: `<button aria-pressed={listening} aria-label={t('mic.label')}>`, large, centred; pulse animation disabled under `prefers-reduced-motion`; Space/Enter toggle (native button). Live caption region shows partial text. Final text → `send`. Mute toggle (`aria-pressed`) persisted in localStorage; assistant replies spoken when unmuted. Unsupported → mic hidden, note `t('mic.unsupported')`. `not-allowed` → friendly message, focus moves to text box.
- [ ] Tests: unsupported fallback shows note and keeps input; permission denied message; caption shows partial; final triggers `send`; mute stops `speak`; switching to Hindi starts recognition with `hi`.
- [ ] Manual check in Chrome: English and Hindi utterance. Commit. **Status update after M6.**

---

## Milestone 7 — Demo families and hints

### Task 24: Demo families, Try saying, geolocation

**Files:** `demo/families.ts`, `demo/DemoPicker.tsx`, `demo/TrySaying.tsx`, App wiring, tests

**Produces:** `DEMO_FAMILIES: { id: 'sharma' | 'iyer' | 'das'; name: string; profile: Profile /* city only, coords filled via geocode at run time */; script: string[] }[]` exactly as spec §7 (Sharma Delhi; Iyer Mumbai; Das Kolkata). Picking one: geocodes the city, `loadProfile`, plays the script messages with a short delay (instant under reduced motion), live data throughout. `TrySaying` lists the spec §9 example sentences in EN + HI; clicking one fills the input. "Use my location" button: `navigator.geolocation` → `Location { city: t('loc.yours'), lat, lon }`, rejected outside India box with a message.

- [ ] Tests: each family has household and activities matching the spec; Sharma vs Iyer plans (with mocked API) differ; Try-saying click fills input; geolocation outside India shows message; geolocation denied shows message.
- [ ] Commit. **Status update after M7.**

---

## Milestone 8 — Hardening

### Task 25: Security pass

- [ ] helmet with CSP: `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'`; CORS only `ALLOWED_ORIGIN`; `express.json({ limit: '16kb' })`; `x-powered-by` off; request logger logs method, path, status, ms only.
- [ ] Tests: CSP header present; disallowed origin gets no CORS header; 20 kb body → 413; grep test fails if `dangerouslySetInnerHTML` appears in `apps/web/src`.
- [ ] `npm audit --omit=dev` clean (or justify each in README). Commit.

### Task 26: E2E, accessibility, coverage, performance

**Files:** `apps/web/e2e/demo.spec.ts`, `playwright.config.ts`

- [ ] Playwright starts the built server with an env flag `SAANS_FIXTURES=1` that swaps providers/geocode for fixture-backed fakes (in `index.ts` only; shortcut: fixtures ship in the image, upgrade to a test-only entry if size matters). Test: load → "Try a demo family" → Sharma → AQI card with source badge + at least one swap card visible; `AxeBuilder` → zero `serious`/`critical` violations; keyboard-only run through the demo button and chips.
- [ ] `npm test` coverage ≥ 80% overall, engine 100%. Lighthouse mobile on `vite preview` build ≥ 90 performance, 100 accessibility; fix regressions (lazy PlanView, font-display, no unused deps).
- [ ] Commit. **Status update after M8.**

---

## Milestone 9 — Deploy

### Task 27: Docker + Cloud Run

**Files:** `Dockerfile` (multi-stage: `node:22-slim` build → `node:22-slim` runtime with `npm ci --omit=dev`, non-root user), `.dockerignore`; `app.ts` serves `apps/web/dist` with SPA fallback.

- [ ] `docker build` + `docker run -p 8080:8080 --env-file .env` locally; `curl /api/health` and load the page.
- [ ] **Ask the user** to run (they own the GCP project): create secrets in Secret Manager for the three keys, then `gcloud run deploy saans --source . --region asia-south1 --allow-unauthenticated --min-instances 1 --concurrency 80 --set-secrets ...` (exact command written into README). Set `ALLOWED_ORIGIN` to the service URL.
- [ ] Smoke test the live URL: health, `/api/air` for Delhi and Mumbai (different readings and sources shown), demo family end to end, Hindi turn. Paste outputs. Commit. **Status update after M9.**

---

## Milestone 10 — Submission pack

### Task 28: README, demo script, LinkedIn post

- [ ] README complete per spec §9: live link, video link placeholder, brief table, screenshot, Mermaid diagram + golden rule, sample inputs (demo families + 6 sentences EN/HI), data sources + attributions (CPCB/data.gov.in, OpenAQ, CAMS/Open-Meteo), run/test/deploy, security/a11y/testing notes, constants and their sources, "What GenAI did vs what I did", tools.
- [ ] `docs/demo-script.md`: 2–3 min shot list per spec §9.
- [ ] `docs/linkedin-post.md` per spec §9, `#PromptWarsVirtual`.
- [ ] Final full check: lint, typecheck, test, test:e2e, live smoke. Commit `docs: submission pack`.

---

## Open items for the user (spec §13)

1. Exact Challenge 6 submission deadline.
2. Wispr Flow key — not needed; interface left clean.
3. Keys: data.gov.in + OpenAQ at Milestone 3, Gemini at Milestone 5 — into local `.env`, never chat.
4. A GCP project with billing (Cloud Run free tier is enough) and `gcloud` installed, for Milestone 9.
5. A GitHub repo name for the public repo.
