# Saans

Tell Saans who lives in your home and what your day looks like. It gives you a smog-safe plan for today, and every suggestion shows how much pollution it keeps out of your lungs and out of the air.

Entry for Hack2skill PromptWars Virtual, Challenge 6 ("Urban Air Quality Assistant").

## Brief → feature mapping

| Brief requirement              | Saans feature                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Families and communities       | Household profile gathered by conversation: children, elders, anyone with asthma or breathing trouble, commuters |
| Tailored to location           | Live AQI for the user's city or area (any Indian city), by voice, typing, or browser geolocation                 |
| Low-emission daily routines    | Today's plan in morning / afternoon / evening blocks: when to go out, when to stay in, how to travel             |
| Indoor air quality hacks       | At home card: when to open or close windows, purifier timing, cooking and incense tips, tied to forecast hours   |
| Sustainable alternatives       | Swaps: metro or bus instead of cab, carpooling, combining trips, walking short hops in cleaner hours             |
| Clearly explains direct impact | Each swap shows two numbers: less PM2.5 inhaled and kg CO₂ saved, plus a one-line "why" written by Gemini        |

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
