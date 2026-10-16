import { Canopy } from './scene.js';
import { buildScene } from './palettes.js';
import { Ambience } from './audio.js';
import { PRESETS, resolvePlace, guessFromTimezone, seasonFor, manualSeason, fetchWeather } from './season.js';

const $ = (id) => document.getElementById(id);
const canopy = new Canopy($('c'));
const audio = new Ambience();
canopy.onThunder = (d) => audio.thunder(d);

// ---------- state ----------
// home: where the visitor is. view: what's on screen (home, another city, or a hand-picked season).
let home = null;
let view = null;
const weatherCache = new Map();

function show(next, instant = false) {
  view = next;
  const weather = next.mode === 'manual' ? null : next.weather;
  canopy.setScene(buildScene(next.season, weather), instant);
  audio.setScene(next.season.key, weather);
  renderChip();
  renderPanel();
}

async function placeView(place, mode) {
  const season = seasonFor(place);
  const v = { place, season, weather: weatherCache.get(place.city) || null, mode };
  if (!v.weather) {
    fetchWeather(place.lat, place.lon).then((w) => {
      if (!w) return;
      weatherCache.set(place.city, w);
      if (home && home.place === place) home.weather = w;
      // Only re-apply if we're still looking at this place.
      if (view && view.place === place && view.mode !== 'manual') show({ ...view, weather: w });
    });
  }
  return v;
}

// ---------- chip + panel ----------
const unit = (country) => (country === 'US' ? 'F' : 'C');
const temp = (w, country) => (unit(country) === 'F' ? Math.round(w.temp * 9 / 5 + 32) : w.temp);

function renderChip() {
  const { place, season, weather, mode } = view;
  $('city').textContent = place.city ? `${place.city} ·` : '';
  $('season').textContent = season.label;
  let sub = '';
  if (mode === 'manual') sub = 'Previewing · tap to go back';
  else if (weather) sub = `${weather.label}, ${temp(weather, place.country)}°${unit(place.country)}`;
  else sub = mode === 'home' ? 'your sky right now' : 'right now';
  $('sub').textContent = sub;
}

const SEASONS = ['spring', 'summer', 'monsoon', 'autumn', 'winter'];

function renderPanel() {
  const seasons = $('seasons');
  seasons.textContent = '';
  if (home) {
    const b = pill(`Yours · ${home.season.label}`, view.mode === 'home', () => show({ ...home, weather: weatherCache.get(home.place.city) || home.weather, mode: 'home' }));
    b.classList.add('home');
    seasons.append(b);
  }
  for (const key of SEASONS) {
    const s = manualSeason(key, home ? home.place.country : '');
    seasons.append(pill(s.label, view.mode === 'manual' && view.season.key === key, () => {
      show({ place: view.place, season: s, weather: null, mode: 'manual' });
    }));
  }
  const places = $('places');
  places.textContent = '';
  for (const p of PRESETS) {
    if (home && p.city === home.place.city) continue;
    places.append(pill(p.city, view.mode === 'city' && view.place.city === p.city, async () => {
      show(await placeView(p, 'city'));
    }));
  }
  const src = home && home.place.source;
  $('note').textContent =
    src === 'ip' ? 'Your season comes from your approximate location and today’s date. Weather from Open-Meteo.'
    : src === 'timezone' ? 'Guessing your location from your timezone. Weather from Open-Meteo.'
    : 'Weather from Open-Meteo.';
}

function pill(label, pressed, onClick) {
  const b = document.createElement('button');
  b.className = 'pill';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

const chip = $('chip'), panel = $('panel');
function togglePanel(open = !panel.classList.contains('open')) {
  panel.classList.toggle('open', open);
  chip.setAttribute('aria-expanded', String(open));
}
chip.addEventListener('click', (e) => {
  e.stopPropagation();
  if (view && view.mode === 'manual' && !panel.classList.contains('open') && home) {
    show({ ...home, weather: weatherCache.get(home.place.city) || home.weather, mode: 'home' });
    return;
  }
  togglePanel();
});
panel.addEventListener('pointerdown', (e) => e.stopPropagation());
addEventListener('keydown', (e) => { if (e.key === 'Escape') togglePanel(false); });

// ---------- sound ----------
const soundBtn = $('sound');
let userMuted = false;
async function setSound(on) {
  if (on) await audio.start(); else audio.stop();
  soundBtn.setAttribute('aria-pressed', String(on));
}
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const on = soundBtn.getAttribute('aria-pressed') !== 'true';
  userMuted = !on;
  setSound(on);
});

// ---------- pointer = wind ----------
const P = canopy.pointer;
let last = null;
let interacted = false;
function onMove(e) {
  const now = performance.now();
  if (last && now > last.t) {
    const dt = (now - last.t) / 1000;
    const vx = (e.clientX - last.x) / dt, vy = (e.clientY - last.y) / dt;
    const cap = 4000;
    P.vx = P.vx * 0.4 + Math.max(-cap, Math.min(cap, vx)) * 0.6;
    P.vy = P.vy * 0.4 + Math.max(-cap, Math.min(cap, vy)) * 0.6;
  }
  P.x = e.clientX; P.y = e.clientY; P.active = true;
  last = { x: e.clientX, y: e.clientY, t: now };
  if (!interacted && Math.hypot(P.vx, P.vy) > 300) {
    interacted = true;
    setTimeout(() => $('hint').classList.add('gone'), 2500);
  }
}
addEventListener('pointermove', onMove, { passive: true });
addEventListener('pointerdown', (e) => {
  last = null; onMove(e);
  togglePanel(false);
  if (!audio.on && !userMuted && e.target === canopy.canvas) setSound(true);
});
addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { P.active = false; last = null; } });
document.addEventListener('pointerleave', () => { P.active = false; last = null; });
addEventListener('blur', () => { P.active = false; });

let resizeT;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => canopy.resize(), 120); });

// ---------- loop ----------
let prev = performance.now();
function frame(now) {
  const dt = (now - prev) / 1000;
  prev = now;
  canopy.step(dt);
  audio.setWind(canopy.windEnergy);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
(async () => {
  // Paint something immediately from the timezone guess, then refine.
  const guess = guessFromTimezone();
  show({ place: guess, season: seasonFor(guess), weather: null, mode: 'home' }, true);
  requestAnimationFrame(frame);

  const place = await resolvePlace();
  home = await placeView(place, 'home');
  const sameSeason = home.season.key === view.season.key && home.season.variant === view.season.variant;
  const forced = new URLSearchParams(location.search).get('season');
  if (SEASONS.includes(forced)) show({ place, season: manualSeason(forced, place.country), weather: null, mode: 'manual' }, true);
  else show(home, sameSeason);
})();
