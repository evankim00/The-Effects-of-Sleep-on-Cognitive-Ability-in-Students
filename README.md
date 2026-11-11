# Cognitive Effects of Sleep Loss in Students

An interactive, educational simulation comparing two high school students across a 13-week (about 3-month) semester:

- **Student A** sleeps 8 hours a night.
- **Student B** sleeps 4, 5 or 6 hours a night, with optional weekend catch-up sleep.

The page shows how the gap compounds into sleep debt and how it changes sleepiness (Karolinska Sleepiness Scale), reaction time (PVT-style, with 500 ms lapses) and example grades.

The model's direction and rough effect sizes come from published studies (Lo et al. 2016; Cousins et al. 2018, 2019; Basner & Dinges 2011; Van Dongen et al. 2003; CDC). The exact coefficients are illustrative assumptions, and the grades are an example. See the "How the simulation works" section on the page.

## Run it

It's a static site with no build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

Files: `index.html` (structure and copy), `styles.css` (design tokens and layout), `app.js` (model and charts).
