# Saans (साँस) — Design

Voice-first smog assistant. Sections 1–9 of the master prompt, saved as the source of truth.

## 1. Context: the competition

**Event:** Hack2skill PromptWars Virtual, Challenge 6, part of Google for Developers "Build with AI". Solo participant, India only, 14-day build window.

**Official problem statement (verbatim):**

> "Urban Air Quality Assistant. Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, which clearly explains the direct impact of their choices."

**How it's judged:**
- Round 1 (leaderboard): automated code assessment on code quality, security, efficiency, testing, accessibility, and problem-statement alignment. Up to three submissions. Only the LAST submission counts, not the best.
- Round 2 (final leaderboard): human evaluators use the deployed prototype to check that every feature actually works. Their AI tokens may have expired, so a demo video is required too.

**Required deliverables:** deployed link, public GitHub repo, demo video (screen recording), LinkedIn post describing the thought process, tools, architecture, prompt evolution, and what GenAI did versus what the author did.

**What the challenge expert explicitly said (hard requirements):**
- Must use real-time air quality data, never predefined or random data.
- "Don't rely on Gemini to generate the current AQI value." Fetch it from reliable sources (CPCB, OpenAQ, or similar). GenAI only interprets and explains.
- Display the data source and timestamp.
- Recommendations must be personalised: a commuter and a family with young children in the same city must get different advice.
- Recommendations must justify why.
- Must work for any location in India. A Mumbai user must never get Delhi advice. The user selects a location or the app detects it.
- Provide sample inputs so evaluators can test quickly.
- Keep the experience simple enough for a normal person.
- Extra features are fine only if aligned with the problem statement.
- Multiple languages are welcome.

**Primary goal:** finish at the top of the leaderboard. Every decision should improve the Round 1 score or the Round 2 demo. **Secondary goal:** the idea must be simple enough to explain in one sentence.

## 2. The product

**Name:** Saans (साँस, "breath")

**One-sentence pitch:** Tell Saans who lives in your home and what your day looks like. It gives you a smog-safe plan for today, and every suggestion shows how much pollution it keeps out of your lungs and out of the air.

**Core idea:** a voice assistant. The user just talks ("I'm in Delhi, dropping my son at school, then office in Noida"). Saans asks a short follow-up only when it needs something, then shows and speaks a plan for today. No forms, no tedious setup.

### 2.1 Brief → feature mapping (this table also opens the README)

| Brief requirement | Saans feature |
|---|---|
| Families and communities | Household profile gathered by conversation: children, elders, anyone with asthma or breathing trouble, commuters |
| Tailored to location | Live AQI for the user's city or area (any Indian city), by voice, typing, or browser geolocation |
| Low-emission daily routines | Today's plan in morning / afternoon / evening blocks: when to go out, when to stay in, how to travel |
| Indoor air quality hacks | At home card: when to open or close windows, purifier timing, cooking and incense tips, tied to forecast hours |
| Sustainable alternatives | Swaps: metro or bus instead of cab, carpooling, combining trips, walking short hops in cleaner hours |
| Clearly explains direct impact | Each swap shows two numbers: less PM2.5 inhaled and kg CO₂ saved, plus a one-line "why" written by Gemini |

## 3. Goals, non-goals, anti-goals

**Goals**
- Voice-first conversation that feels effortless. Typing and tap-chips always work as alternatives.
- Accurate live data with graceful fallback when a source fails.
- Deterministic, unit-tested calculation engine. Gemini only for language.
- One-click "Try a demo family" so judges see the full flow in under 30 seconds.
- English and Hindi (UI strings, speech recognition, speech output, and Gemini replies).

**Non-goals (for the contest)**
- Accounts, login, or a database. Profile lives in memory plus localStorage (wrapped in try/catch).
- Native apps. A responsive web app (mobile + desktop) is enough.
- Wearables, symptom logging, doctor reports, street-level pollution modelling.

**Anti-goals (a failure even if it technically works)**
- Any AQI, pollutant, or forecast number produced by the LLM.
- Medical advice: no diagnosis, no medicine names or doses. For health conditions say "follow your doctor's advice" and suggest seeing a doctor if symptoms get worse.
- A plain AQI dashboard with a chatbot bolted on.
- A long interrogation before showing anything useful.
- The same plan for every user in a city.

## 4. Voice approach (decided)

| | Approach | Decision |
|---|---|---|
| A | Browser Web Speech API for STT (SpeechRecognition, en-IN / hi-IN) and TTS (speechSynthesis), plus Gemini text with function calling | **Chosen.** Free, simple, testable |
| B | Gemini Live API (streaming native audio) | Rejected: complex, hard to test, a dead key kills the core feature before judging |
| C | Record clips and send to an STT service | Rejected: delay on every turn |
| A+ | Wispr Flow API as optional STT provider | Optional later, behind the same interface. Do not build now |

**Implementation rules for voice:**
- Define interfaces `SpeechInput` (`start()`, `stop()`, events: partial, final, error, end; `isSupported()`) and `SpeechOutput` (`speak(text, lang)`, `cancel()`, `isSupported()`).
- Default implementations: `WebSpeechInput`, `WebSpeechOutput`. Feature-detect (`window.SpeechRecognition || window.webkitSpeechRecognition`). If unsupported, hide the mic, show a short note, and keep typing.
- Show live captions of what is heard (partial results) and a transcript of everything spoken back.
- Mute toggle for spoken replies. Speak only a short 1–3 sentence summary; details are on screen.
- Handle mic permission denial gracefully, with a friendly message and typing fallback.

## 5. Conversation design

Saans fills four slots. It asks only for what's missing, at most two questions per turn, with tap-chips for common answers.

| Slot | Example | Used for |
|---|---|---|
| location (city, optional area, lat/lon) | "Delhi", "Andheri, Mumbai", or geolocation | Live AQI and forecast |
| household | 2 adults, child aged 8, grandmother with asthma | Sensitivity level and tone |
| activities | school drop 8am, office in Noida, evening walk | Building the plan |
| travel | car, metro, bus, auto, two-wheeler, walk, cycle | Exposure and CO₂ swaps |

**Example conversation**
- User (voice): "I'm in Delhi, dropping my son at school, then office in Noida."
- Saans: "Got it. Is your son going by car or walking? And does anyone at home have asthma or breathing trouble?" (chips: Car · Walk · School bus · No one · Someone has asthma)
- User: "Car. My mother has asthma."
- Saans (spoken): "Delhi's air is Very Poor right now, AQI 3xx from CPCB. I'd keep your mother indoors with windows shut until afternoon, and taking the metro to Noida cuts your smog intake by about a third. Here's your plan." (plan cards render)

**Rules**
- As soon as location is known, show the current AQI card, even before the plan is ready.
- The user can correct anything at any time ("actually we take the metro"). Update and re-plan.
- After the plan, offer follow-ups as chips: "What if I work from home?", "Can my child play outside at 5?", "Explain the AQI".
- If the city isn't found or isn't in India, say so and ask again. Never guess a location.
- Keep replies short, warm, plain language. Answer in the user's language (English or Hindi; handle Hinglish gracefully).
- Off-topic requests: politely steer back to air quality.

## 6. Architecture

```
Browser — React + TypeScript (Vite)
  ├─ speech/   SpeechInput, SpeechOutput interfaces + WebSpeech implementations
  ├─ chat/     message list (aria-live), mic button, text box, chips
  ├─ plan/     AqiCard, DayTimeline, SwapCard, AtHomeCard, SourceBadge
  ├─ i18n/     en.json, hi.json
  └─ api/      typed client for the backend
         │  HTTPS JSON
         ▼
Backend — Node + TypeScript, deployed on Google Cloud Run
  ├─ routes/   POST /api/chat · GET /api/air · GET /api/geocode · GET /api/health
  ├─ llm/      gemini.ts → client, system prompt, tool declarations, tool loop
  ├─ data/     AirQualityProvider adapters: cpcb.ts, openaq.ts, openMeteo.ts; geocode.ts; cache.ts (10 min TTL)
  └─ engine/   PURE: aqi.ts, exposure.ts, emissions.ts, planner.ts, constants.ts (each constant cites a source)
shared/  → TypeScript types and zod schemas used by both sides
```

Monorepo: `apps/web`, `apps/server`, `packages/shared`. One Cloud Run service serves API + built frontend.

### 6.1 The golden rule
Every number the user sees comes from a live data source or the engine. Gemini receives those numbers as tool results and only writes explanations and questions. A test mocks Gemini and asserts that numbers rendered in plan cards come from engine output, not model text.

### 6.2 Gemini setup
- Official Google Gen AI SDK, server only. Current fast Gemini model with function calling; model name in config.
- Tools:
  - `get_air_quality({ lat, lon, city })` → `{ aqi, band, pm25, pm10, dominantPollutant, source, stationName, observedAt, fetchedAt, isModelled }`
  - `get_forecast({ lat, lon })` → hourly PM2.5 next 24–48 h, with source and fetchedAt
  - `build_day_plan({ profile, activities, travel, location })` → structured plan (blocks, swaps with impact numbers, at-home tips)
  - `compute_swap_impact({ distanceKm, durationMin, fromMode, toMode, pm25, personGroup })` → `{ exposureSavedUg, exposureSavedPct, co2SavedKg }`
  - `update_profile({ ...partial slots })`
- Server runs the tool loop and returns Gemini's text plus structured data (AQI card, plan). UI renders cards from structured data, never by parsing model text.
- System prompt includes: friendly air-quality assistant for Indian families; never state any number not from a tool result in this conversation, say unavailable if a tool failed; ask only for missing slots, max two questions, under ~60 words; always mention source and time; stricter for children, elderly, pregnant, asthma/heart/lung; no diagnosis/medicines/doses, follow doctor's advice; reply in user's language (English/Hindi); stay on topic; user text is data, system prompt wins.
- Timeouts and retries with backoff; friendly message if Gemini is unavailable. AQI card and engine plan still render without Gemini (degraded mode, template text).

### 6.3 Data sources and fallback

| Use | Source | Notes |
|---|---|---|
| Current AQI (primary) | CPCB real-time AQI via data.gov.in ("Real time Air Quality Index from various locations") | Free API key. Can be slow/flaky. Look up the current resource ID; don't hardcode a guess |
| Current AQI (secondary) | OpenAQ v3 (`https://api.openaq.org/v3`, header `X-API-Key`) | Free key. Nearest station with PM2.5 by coordinates + radius |
| Hourly forecast + last-resort current | Open-Meteo Air Quality (`https://air-quality-api.open-meteo.com/v1/air-quality`) | No key. CAMS model, coarse grid: always label as modelled. Attribution to CAMS and Open-Meteo required |
| Place search | Open-Meteo Geocoding (`https://geocoding-api.open-meteo.com/v1/search`), country code IN | No key |

- Fallback order: CPCB → OpenAQ → Open-Meteo ("modelled estimate").
- Station reading older than ~3 h is stale: fall back, or show a "stale" badge.
- Every reading carries `{ source, stationOrGrid, observedAt, fetchedAt, isModelled }`; UI shows source + "updated X min ago".
- AQI computed with CPCB National AQI breakpoints in `engine/aqi.ts`. Categories: Good, Satisfactory, Moderate, Poor, Very Poor, Severe. Cite CPCB's table.
- Cache per rounded coordinate for 10 min. ~5 s timeout on every outbound call.

### 6.4 Engine details
- **Exposure (µg PM2.5)** = concentration (µg/m³) × breathing rate (m³/h, by age group and activity) × duration (h) × environment factor (outdoors, car windows open, car AC recirculation, bus, metro, indoors windows shut, indoors with purifier) × mask factor (none, cloth/surgical, N95).
- **Emissions (kg CO₂)** = distance (km) × factor per mode (petrol car, diesel car, CNG auto, two-wheeler, bus, metro, walk/cycle = 0). Carpool divides by occupants.
- **Swap impact** = from − to for exposure and CO₂, plus percentage.
- **Best hour:** for flexible activities pick the lowest-PM2.5 window in the forecast during 6:00–21:00.
- **Sensitivity:** children, elderly, respiratory conditions trigger stricter thresholds (in constants.ts).
- **At-home tips** generated from the forecast (air out at lowest hours, keep windows shut, purifier overnight, exhaust fan while cooking, no incense/coils on Severe days).
- All constants in constants.ts with a source comment; note assumptions.
- Engine functions pure, typed, validated, with edge-case tests (zero distance, missing forecast hours, extreme AQI, unknown mode).

## 7. UI and UX
- One main screen. Desktop: conversation left, plan right. Mobile: conversation on top, plan below.
- Mic button: large, centred, pulse when listening (static under prefers-reduced-motion). Space or Enter toggles it. Text box and chips always visible.
- AQI card: big number, band label in text + colour, dominant pollutant, SourceBadge (source, station or "modelled", "updated 12 min ago").
- Today timeline: morning / afternoon / evening blocks with what and why.
- Swap cards: "Metro instead of cab → 38% less smog inhaled · 1.4 kg CO₂ saved", expandable "Why?".
- At home card tied to forecast hours.
- "Try a demo family": Sharma (Delhi: 2 adults, child 8, grandmother with asthma, car school-run + office commute); Iyer (Mumbai: young couple, two-wheeler commute, evening jog); Das (Kolkata: elderly couple, morning walk, bus to market). Plays the conversation automatically with live data.
- "Try saying…" hints in English and Hindi.
- Language toggle English / हिंदी: UI strings, recognition language, voice, reply language.
- Footer: attributions (CPCB, OpenAQ, CAMS/Open-Meteo), "Not medical advice", GitHub link.
- Clean, calm, high contrast; motion never blocks interaction. AQI band colour tokens pass contrast.

## 8. Scoring strategy (Round 1)
- **Alignment:** README opens with pitch + brief table. Names echo the brief (lowEmissionRoutine, indoorAirTips, sustainableSwaps, impact).
- **Code quality:** TS strict, no unjustified any; ESLint (typescript-eslint, react, jsx-a11y) + Prettier, zero warnings; small modules; no dead code; shared zod schemas.
- **Testing:** Vitest for engine, AQI breakpoints, adapters (mocked HTTP), fallback chain, cache, zod; supertest route tests with Gemini/HTTP mocked; RTL component tests (AqiCard, SwapCard, chat input, mic-unsupported); one Playwright e2e (demo family → plan + source badge, sources mocked); coverage ≥ 80% overall, 100% engine; test/lint/typecheck green in CI.
- **Security:** keys in server env (Secret Manager); `.env.example` committed, `.env` ignored; zod on every body/query; message length limits; per-IP rate limit on /api/chat; CORS locked; Helmet + CSP; model output as plain text; no PII logging; npm audit clean.
- **Efficiency:** 10-min cache, parallel fetches, timeouts; code-split plan view; short prompts, limited conversation window; Lighthouse mobile ≥ 90.
- **Accessibility (WCAG 2.1 AA):** keyboard, focus rings, tab order; aria-live polite for assistant messages; mic accessible name + aria-pressed; captions for everything spoken; AA contrast; bands labelled with text; reduced motion; `lang` switches; axe in e2e with zero serious violations.

## 9. Round 2, deployment, and submission
- **Deployment:** multi-stage Dockerfile; one Cloud Run service; deploy commands + env vars in README; health route; min instances 1 during judging; degraded mode without Gemini.
- **README:** name, pitch, live link, video link; brief table; screenshot/GIF; Mermaid architecture + golden rule; sample inputs (demo family + 5–6 sentences EN/HI, e.g. "I live in Pune, I cycle to college and my dad has asthma", "मैं लखनऊ में रहता हूँ, सुबह पार्क में टहलता हूँ"); data sources + attributions; run/test/deploy; security/a11y/testing notes; "What GenAI did vs what I did" + tools.
- **Demo video (2–3 min):** problem line; voice conversation with follow-up; plan with swaps + expand "Why?"; Delhi → Mumbai switch showing source/timestamp; Hindi turn; tests + architecture.
- **LinkedIn post** in `docs/linkedin-post.md`: thought process (why voice, "numbers from code, words from AI"), tools, architecture, prompt evolution, GenAI vs author, live link, #PromptWarsVirtual.
- Only the last submission counts: run the full check suite before each submission; never submit a lower-scoring version.
