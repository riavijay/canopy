import { Canopy } from './scene.js';
import { buildScene } from './palettes.js';
import { Ambience } from './audio.js';
import { PRESETS, resolvePlace, guessFromTimezone, seasonFor, manualSeason, fetchWeather, fakeWeather } from './season.js';

const $ = (id) => document.getElementById(id);
const canopy = new Canopy($('c'));
const audio = new Ambience();
canopy.onThunder = (d) => audio.thunder(d);
if (import.meta.env.DEV) window.__canopy = canopy;

// ---------- state ----------
// home: where the visitor is. view: what's on screen (home, another city, or a hand-picked season).
let home = null;
let view = null;
const weatherCache = new Map();
const query = new URLSearchParams(location.search);
const forcedWeather = fakeWeather(query.get('weather')); // ?weather=storm etc. for previews
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
let units = store.get('canopy-units'); // 'C' | 'F', or null until we know where you are

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
  const v = { place, season, weather: forcedWeather || weatherCache.get(place.city) || null, mode };
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
const FAHRENHEIT = ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW'];
const unit = () => units || (home && FAHRENHEIT.includes(home.place.country) ? 'F' : 'C');
const temp = (w) => `${Math.round(unit() === 'F' ? (w.temp * 9) / 5 + 32 : w.temp)}°${unit()}`;

function renderChip() {
  const { place, season, weather, mode } = view;
  $('city').textContent = place.city ? `${place.city} ·` : '';
  $('season').textContent = season.label;
  let sub = '';
  if (mode === 'manual') sub = 'Daydreaming · tap to come back';
  else if (weather) sub = `${weather.label}, ${temp(weather)}`;
  else sub = mode === 'home' ? 'your sky right now' : 'checking the sky…';
  $('sub').textContent = sub;
}

const SEASONS = ['spring', 'summer', 'monsoon', 'autumn', 'winter'];

function renderPanel() {
  const seasons = $('seasons');
  seasons.textContent = '';
  if (home) {
    const b = pill(`☀︎ My sky · ${home.season.label}`, view.mode === 'home', () => show({ ...home, weather: forcedWeather || weatherCache.get(home.place.city) || home.weather, mode: 'home' }));
    b.classList.add('home');
    seasons.append(b);
  }
  for (const key of SEASONS) {
    const s = manualSeason(key, view.place);
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
    (src === 'timezone' ? 'We guessed your city from your timezone. ' : 'Your sky follows roughly where you are and today’s date. ') +
    'Live weather by Open-Meteo.';
  for (const b of document.querySelectorAll('#units button')) b.setAttribute('aria-pressed', String(b.dataset.u === unit()));
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
    show({ ...home, weather: forcedWeather || weatherCache.get(home.place.city) || home.weather, mode: 'home' });
    return;
  }
  togglePanel();
});
panel.addEventListener('pointerdown', (e) => e.stopPropagation());
for (const b of document.querySelectorAll('#units button')) {
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    units = b.dataset.u;
    store.set('canopy-units', units);
    renderChip();
    renderPanel();
  });
}
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
  const forced = query.get('season');
  if (SEASONS.includes(forced)) show({ place, season: manualSeason(forced, place), weather: forcedWeather, mode: forcedWeather ? 'city' : 'manual' }, true);
  else show(home, sameSeason);
})();
