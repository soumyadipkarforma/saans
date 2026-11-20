# Saans — project notes

Voice-first smog assistant for Indian families. Entry for Hack2skill PromptWars Virtual, Challenge 6 ("Urban Air Quality Assistant").
Design: docs/superpowers/specs/2026-11-20-saans-design.md. Plan: docs/superpowers/plans/2026-11-20-saans-plan.md.

## Goal
Top the leaderboard. Round 1: automated score on code quality, security, efficiency, testing, accessibility, problem-statement alignment. Round 2: judges use the deployed app.

## Non-negotiable rules
- The LLM never produces AQI, pollutant, forecast, or impact numbers. Numbers come from live APIs or engine/ only.
- Show data source and timestamp on every reading.
- API keys stay on the server. Never commit secrets.
- No medical advice (no diagnosis, medicines, or doses).
- Typing and tap-chips always work as an alternative to voice.
- engine/ functions are pure and fully unit-tested before they count as done.
- Run lint, typecheck, and tests before every commit that claims a task is done.
