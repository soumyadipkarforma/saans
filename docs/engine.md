# The Saans engine

Every number Saans shows comes from here or from Open-Meteo, never from the language model. The engine lives in `src/engine/`: pure functions with no network calls and no clock. The current time is always passed in, so every result can be tested and reproduced.

## AQI — `aqi.ts`

Saans reports the Indian **CPCB National Air Quality Index** (2014).

- The input is the mean of the last 24 hourly PM2.5 and PM10 values from Open-Meteo, matching CPCB's 24-hour averaging period.
- Each pollutant gets a sub-index by straight-line interpolation between the breakpoints below. The AQI is the larger of the two, and that pollutant is reported as dominant.
- The bands join without gaps, so 30.5 µg/m³ of PM2.5 gives AQI 51. Values above the last breakpoint are capped at AQI 500.

| Band | AQI | PM2.5 (µg/m³) | PM10 (µg/m³) |
| --- | --- | --- | --- |
| Good | 0–50 | 0–30 | 0–50 |
| Satisfactory | 51–100 | 31–60 | 51–100 |
| Moderate | 101–200 | 61–90 | 101–250 |
| Poor | 201–300 | 91–120 | 251–350 |
| Very Poor | 301–400 | 121–250 | 351–430 |
| Severe | 401–500 | 251–380 | 431–600 |

## Smog breathed in — `exposure.ts`

```
inhaled PM2.5 (µg) = PM2.5 outdoors (µg/m³) × breathing rate (m³/h) × hours × place factor × mask factor
```

**Breathing rate (m³/h)**, from the US EPA *Exposure Factors Handbook* 2011, Table 6-2, rounded:

| | Rest | Light | Moderate |
| --- | --- | --- | --- |
| Child | 0.29 | 0.66 | 1.26 |
| Adult | 0.31 | 0.72 | 1.56 |
| Elderly | 0.30 | 0.72 | 1.44 |

**Place factor** (indoor or in-vehicle PM2.5 ÷ outdoor). These are assumptions: orders of magnitude taken from Goel et al. 2015 (Delhi commuter exposure) and Chen & Zhao 2011 (infiltration review).

| Outdoors / walk / cycle / two-wheeler | CNG auto | Car, windows open | Bus | Metro | Car, AC on recirculation | Indoors, windows shut | Indoors, purifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.0 | 0.9 | 0.9 | 0.85 | 0.6 | 0.45 | 0.6 | 0.3 |

**Mask factor** (assumption, from real-world fit studies): none 1.0 · cloth or surgical 0.7 · N95 0.3.

Example: an adult at light activity spends 1 hour outdoors in 100 µg/m³ with no mask. That is 100 × 0.72 × 1 × 1.0 × 1.0 = **72 µg**. With an N95 it is **21.6 µg**.

## CO₂ — `emissions.ts`

```
CO₂ (kg) = distance (km) × factor for the mode ÷ people sharing a car
```

Factors are kg CO₂ per passenger-km, from the India GHG Program's *India Specific Road Transport Emission Factors* (2015); the metro figure is from DMRC's sustainability report.

| Petrol car | Diesel car | CNG auto | Two-wheeler | Bus | Metro | Walk / cycle |
| --- | --- | --- | --- | --- | --- | --- |
| 0.14 | 0.15 | 0.08 | 0.035 | 0.015 | 0.01 | 0 |

Trip time comes from typical door-to-door speeds in Indian cities (assumption, km/h): car 20, CNG auto 18, two-wheeler 22, bus 15, metro 32, walk 4.5, cycle 12.

## Swap impact — `impact.ts`

A swap compares the current way of travelling with an alternative over the same distance:

- **Smog saved (µg)** = dose on the current mode − dose on the new one. Each dose uses that mode's trip time and place factor. Walking and cycling count as moderate activity; everything else counts as light.
- **Smog saved (%)** = that difference ÷ the current dose.
- **CO₂ saved (kg)** = CO₂ on the current mode − CO₂ on the new one.
- A **carpool** counts as a petrol car shared by 3 people, unless the user says otherwise.

Rounding: µg to 1 decimal place, % to a whole number, kg to 2 decimal places. A negative "smog saved" is reported honestly: walking can mean breathing in more smog, even while it saves CO₂.

Example: a 10 km petrol-car trip in PM2.5 200 µg/m³, swapped for the metro. The metro saves 58% of the smog breathed in (37.8 µg) and 1.3 kg CO₂.

## Best hours and at-home tips — `forecast.ts`, `indoorAirTips.ts`

- Forecast hours are matched as India-time text (`YYYY-MM-DDTHH`), never converted through the machine's time zone.
- **Best window:** the stretch of the given length with the lowest mean PM2.5. It must start no earlier than the start hour and end by the end hour. Hours with missing data are skipped, and the earliest window wins a tie.
- **At-home tips:**
  - **Air the house out:** in the cleanest 2 hours between 10:00 and 18:00.
  - **Keep windows shut:** during the worst 3 hours between 06:00 and 21:00.
  - **Run a purifier overnight:** from Moderate, or for any sensitive household.
  - **Use the exhaust fan when cooking:** always.
  - **No incense or mosquito coils:** from Very Poor.

## Day planner — `planner.ts`

The planner takes a household, its activities, the live reading, the forecast and the current time, and returns today's plan:

1. **Sensitivity.** Children, elderly people, pregnant people, and anyone with asthma or a lung or heart condition are sensitive. For sensitive people, outdoor activity is advised against above **Moderate**; for everyone else, above **Poor**.
2. **Flexible activities** (walk, play, exercise, errands) move to the cleanest hour still left today, between 06:00 and 21:00. If that hour is still too polluted for the people doing the activity, the advice is to do it indoors instead. If no hour is left, or the forecast is missing, the activity keeps its usual time (or now, if that has already passed). After 20:00 the advice becomes "skip it today".
3. **Fixed activities** (commute, school run) keep their real time. From **Poor**, the advice is to wear a mask. A trip whose time has already passed today becomes advice for tomorrow at the same time.
4. **Stay indoors.** If a sensitive person isn't part of any activity and the air is above their limit, the plan says to stay indoors until the cleanest forecast hour.
5. **Swaps.** Every car, auto or two-wheeler trip is compared with metro, bus and carpool. Walking or cycling is also considered for trips of up to 2 km, but only when the air is Moderate or better. Swaps that save no CO₂ are dropped, and so are swaps that add smog unless the air is Moderate or better. For sensitive travellers the swaps are ranked by smog saved; for everyone else, by CO₂ saved. Saans keeps the best swap for each trip, and the top 3 overall.

So the same city reading gives different plans to different households. A commuter on their own in Very Poor air gets a mask reminder and a metro swap. A family with an 8-year-old and a grandmother with asthma also gets the grandmother's walk moved indoors, and a swap for the school run too.

## Assumptions to keep in mind

- The place factors, mask factors, trip speeds and default trip lengths are assumptions, marked as such in `constants.ts`. Default trip lengths: school run 4 km, commute 12 km, errand 3 km, walk 2 km.
- CAMS data is modelled on a coarse grid. It can differ from a nearby CPCB station, especially at street level.
- The AQI of a single forecast hour is calculated from that hour's PM2.5 alone. That is an approximation of CPCB's 24-hour average, used only to decide when to go out.
