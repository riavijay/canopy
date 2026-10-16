# Canopy

Lie back and look up. An interactive illustration of the trees overhead on a sunny day.

- Move your cursor (or finger) to make a breeze: leaves sway, rustle and fall.
- The season follows wherever you are: fall in Seattle, monsoon in Mumbai, spring in Sydney. It uses your approximate location (Vercel IP geolocation, no permission prompt) and today's date, plus live weather from [Open-Meteo](https://open-meteo.com).
- All sound is synthesized in the browser.

URL options: `?place=mumbai` (any preset id in `src/season.js`), `?season=winter`.

## Develop

```bash
npm install
npm run dev
```

Deployed on Vercel; `api/geo.js` is an Edge Function that reads Vercel's geo headers.
