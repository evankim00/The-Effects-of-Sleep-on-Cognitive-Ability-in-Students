# Cognitive Effects of Sleep Loss in Students

An interactive, evidence-based simulation comparing two high school students over a 13-week semester:

- **Student A** sleeps 8 hours a night.
- **Student B** sleeps 1–7 hours a night.

The page shows:

- a side-by-side lecture where words are lost during attention lapses
- the students' sleep debt, PVT attention lapses and Karolinska sleepiness
- one semester view with three tabs: lost nights, lapses and sleepiness

## How the numbers are derived

| Measure | Formula | Calibration |
|---|---|---|
| Sleep debt | `D = n × (8 − h)` | 8 h is the low end of the CDC/AASM 8–10 h recommendation for ages 13–18 |
| Lapses per 10-min PVT | `2 + 0.68·D` up to D = 23.8; then `2 + 16.2·(D/23.8)^0.67`; held after night 14 | Teens: Lo et al. 2016, Fig. 2 (≈2 → 18.2 lapses over 7 nights at 3.4 h/night less sleep). Curve shape: Van Dongen et al. 2003 |
| Sleepiness (KSS) | `4.7 + 2.3·√((8 − h)/3.4)·(1 − e^(−n/2.5))` | Lo et al. 2016, Fig. 2 (rested ≈4.8, restricted 6.9 by night 7) |
| Words missed | `lapses ÷ 95` | ≈95 prompts in a 10-min PVT (2–10 s gaps). This step is illustrative |

The model matches each measured teen night within 1.4 lapses and 0.8 KSS points. No controlled study has gone past 14 nights, so lapses are held at their night-14 value after that.

## Run it

It's a static site with no build step and no dependencies. Open `index.html`, or serve the folder:

```bash
npx serve .
```
