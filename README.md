# Saans

Voice-first smog assistant for Indian families. Ask by voice or tap, in English or Hindi, what the air is like today and what your family can do about it.

Entry for Hack2skill PromptWars Virtual, Challenge 6 ("Urban Air Quality Assistant").

## Brief to feature

| Brief requirement                  | Feature                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Live air quality for your location | CPCB National AQI from CAMS modelled PM2.5 and PM10 via Open-Meteo     |
| Plain-language advice              | Assistant replies from fixed templates; the LLM never produces numbers |
| Voice and text input               | Speech input where supported; typing and tap chips always work         |
| Hindi and English                  | `en` and `hi` UI and speech                                            |
| Day plan for the family            | `lowEmissionRoutine`, `sustainableSwaps`, `indoorAirTips`, `impact`    |

## Setup

```sh
npm install
npm run dev
```

Requires Node 22 or later (see `.nvmrc`).

## Scripts

| Script              | Purpose                             |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Start the dev server                |
| `npm run build`     | Type-check and build the static app |
| `npm run preview`   | Serve the built app on port 4173    |
| `npm run lint`      | ESLint, zero warnings allowed       |
| `npm run typecheck` | TypeScript, no emit                 |
| `npm test`          | Unit tests with coverage            |
| `npm run test:e2e`  | Playwright end-to-end tests         |
| `npm run format`    | Prettier                            |

## Sections to complete

- Data sources and attribution (CAMS via Open-Meteo)
- Privacy and API keys
- Medical disclaimer
- Architecture
- Accessibility
- Testing and coverage
- Deployment
- Limitations
