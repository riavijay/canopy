import { Canopy } from './scene.js';
import { buildScene } from './palettes.js';
import { Ambience } from './audio.js';
import {
  resolvePlace, guessFromTimezone, seasonFor, fetchWeather, fetchHistory, fakeWeather, searchPlaces,
  localParts, fromLocal, solarElevation, moonPhase, festivalFor,
} from './season.js';

const $ = (id) => document.getElementById(id);
const canopy = new Canopy($('c'));
const audio = new Ambience();
canopy.onThunder = (d) => audio.thunder(d);
if (import.meta.env.DEV) window.__canopy = canopy;

// ---------- state ----------
// home: where the visitor is. place: the sky on screen. monthOv / hourOv: slider overrides (null = now).
let home = null;
let place = null;
let monthOv = null, hourOv = null;
const liveCache = new Map(); // place key → { w, at }
const histCache = new Map(); // place key + date → weather that day
const query = new URLSearchParams(location.search);
const forcedWeather = fakeWeather(query.get('weather')); // ?weather=storm etc. for previews
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
let units = store.get('canopy-units');
const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })();
const keyOf = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The moment being shown, as an instant plus the wall-clock parts at the place.
function moment() {
  const tz = place.tz || browserTz;
  const now = localParts(tz);
  if (monthOv === null && hourOv === null) return { date: new Date(), lp: now, live: true, tz };
  const y = now.y, mo = monthOv ?? now.mo;
  const d = Math.min(now.d, new Date(y, mo + 1, 0).getDate());
  const h = hourOv === null ? now.h : Math.floor(hourOv / 4), mi = hourOv === null ? now.mi : (hourOv % 4) * 15;
  return { date: fromLocal(tz, y, mo, d, h, mi), lp: { y, mo, d, h, mi }, live: monthOv === null, tz };
}

// For another month, the most recent past date with that day — the archive lags by about a week.
function pastDate(lp) {
  const today = localParts(place.tz || browserTz);
  let y = lp.y;
  if (Date.UTC(y, lp.mo, lp.d) > Date.UTC(today.y, today.mo, today.d) - 7 * 86400000) y -= 1;
  const d = Math.min(lp.d, new Date(y, lp.mo + 1, 0).getDate());
  return `${y}-${pad(lp.mo + 1)}-${pad(d)}`;
}

function weatherFor(m) {
  if (forcedWeather) return forcedWeather;
  if (m.live) return liveCache.get(keyOf(place))?.w || null;
  return histCache.get(keyOf(place) + pastDate(m.lp)) || null;
}

let current = null;
function render(duration = 2.6, instant = false) {
  if (!place) return;
  const m = moment();
  const season = seasonFor(place, new Date(m.lp.y, m.lp.mo, m.lp.d));
  const w = weatherFor(m);
  const tod = { elev: solarElevation(m.date, place.lat, place.lon), moon: moonPhase(m.date), festival: festivalFor(place, m.lp) };
  const scene = buildScene(season, w, tod);
  canopy.setScene(scene, instant, duration);
  audio.setScene(season.key, w, scene.night);
  current = { m, season, w, tod };
  renderChip();
  renderPanel();
}

// ---------- weather ----------
async function ensureWeather() {
  if (!place || forcedWeather) return;
  const m = moment();
  const k = keyOf(place), p = place;
  if (m.live) {
    const hit = liveCache.get(k);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return;
    const w = await fetchWeather(p.lat, p.lon);
    if (!w) return;
    liveCache.set(k, { w, at: Date.now() });
    if (!p.tz && w.tz) p.tz = w.tz;
  } else {
    const ymd = pastDate(m.lp);
    if (histCache.has(k + ymd)) return;
    const w = await fetchHistory(p.lat, p.lon, ymd);
    if (!w) return;
    histCache.set(k + ymd, w);
  }
  if (place === p) render(1.5);
}
let weatherT;
const ensureWeatherSoon = () => { clearTimeout(weatherT); weatherT = setTimeout(ensureWeather, 350); };

// ---------- chip ----------
const FAHRENHEIT = ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW'];
const unit = () => units || (home && FAHRENHEIT.includes(home.country) ? 'F' : 'C');
const temp = (w) => `${Math.round(unit() === 'F' ? (w.temp * 9) / 5 + 32 : w.temp)}°${unit()}`;
const clock = (h, mi) => `${((h + 11) % 12) + 1}:${pad(mi)} ${h < 12 ? 'am' : 'pm'}`;

function renderChip() {
  const { m, season, w, tod } = current;
  $('city').textContent = place.city ? `${place.city} ·` : '';
  $('season').textContent = season.label;
  const when = m.live ? clock(m.lp.h, m.lp.mi) : `${MONTHS[m.lp.mo].slice(0, 3)} ${m.lp.d}, ${clock(m.lp.h, m.lp.mi)}`;
  let sub = when;
  if (w) sub += w.historical ? ` · ${w.label}, ${temp(w)} that day last year` : ` · ${w.label}, ${temp(w)}`;
  else if (!m.live) sub += ' · digging up last year’s weather…';
  if (tod.festival === 'christmas') sub += ' · ✨';
  if (tod.festival === 'diwali') sub += ' · 🪔';
  $('sub').textContent = sub;
}

// ---------- panel ----------
const SEASON_COLORS = { spring: '#f3a8c4', summer: '#7cc24f', monsoon: '#4f8f8a', autumn: '#e8873a', winter: '#b9cbe0', misty: '#a9b99a' };
function renderPanel() {
  const { m, season } = current;
  const monthEl = $('month'), hourEl = $('hour');
  if (document.activeElement !== monthEl) monthEl.value = m.lp.mo;
  if (document.activeElement !== hourEl) hourEl.value = m.lp.h * 4 + Math.floor(m.lp.mi / 15);
  $('monthLabel').textContent = MONTHS[m.lp.mo];
  $('monthSeason').textContent = season.label;
  $('hourLabel').textContent = clock(m.lp.h, m.lp.mi);
  $('now').hidden = monthOv === null && hourOv === null;
  $('mysky').hidden = !home || place === home;

  // The month track shows this place's seasons; the time track shows its real sunrise and sunset.
  const stops = [];
  for (let i = 0; i < 12; i++) {
    const c = SEASON_COLORS[seasonFor(place, new Date(m.lp.y, i, 15)).key];
    stops.push(`${c} ${(i / 12) * 100}%`, `${c} ${((i + 1) / 12) * 100}%`);
  }
  monthEl.style.background = `linear-gradient(90deg, ${stops.join(',')})`;
  const tz = m.tz, hs = [];
  for (let i = 0; i <= 24; i++) {
    const e = solarElevation(fromLocal(tz, m.lp.y, m.lp.mo, m.lp.d, i % 24, 0), place.lat, place.lon);
    const c = e > 8 ? '#8ccbee' : e > -1 ? '#f2a77e' : e > -7 ? '#8d8fc4' : '#1f2b4a';
    hs.push(`${c} ${(i / 24) * 100}%`);
  }
  hourEl.style.background = `linear-gradient(90deg, ${hs.join(',')})`;

  for (const b of document.querySelectorAll('#units button')) b.setAttribute('aria-pressed', String(b.dataset.u === unit()));
  renderWeatherCard();
  $('note').textContent = (home && home.source === 'timezone' ? 'We guessed your city from your timezone. ' : '') +
    'The sun and moon are worked out for the exact spot and minute.';
}

// The actual readings behind the sky, with where and when they came from.
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const isoClock = (iso) => { if (!iso) return '–'; const [h, mi] = iso.slice(11, 16).split(':').map(Number); return clock(h, mi); };
function renderWeatherCard() {
  const { m, w } = current;
  const F = unit() === 'F';
  const t = (c) => (c == null ? '–' : `${Math.round(F ? (c * 9) / 5 + 32 : c)}°`);
  const speed = (k) => (k == null ? '–' : F ? `${Math.round(k * 0.621)} mph` : `${Math.round(k)} km/h`);
  const rain = (mm) => (mm == null ? '–' : F ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(1)} mm`);
  const name = place.city || 'your sky';
  $('wxTitle').textContent = w && w.historical
    ? `${name} on ${MONTHS[+w.historical.slice(5, 7) - 1].slice(0, 3)} ${+w.historical.slice(8)}, ${w.historical.slice(0, 4)}`
    : `Right now in ${name}`;
  if (!w) {
    $('wxTemp').textContent = '–';
    $('wxCond').textContent = m.live ? 'Checking the sky…' : 'Digging up last year’s weather…';
    $('wxSub').textContent = ''; $('wxGrid').textContent = ''; $('wxSrc').textContent = '';
    return;
  }
  const d = w.details || {};
  $('wxTemp').textContent = t(w.temp);
  $('wxCond').textContent = w.label;
  $('wxSub').textContent = w.historical ? `High ${t(d.high)} · Low ${t(d.low)}` : d.feels != null ? `Feels like ${t(d.feels)}` : '';
  const cells = w.historical
    ? [['Rain that day', rain(d.rainMm)], ['Top wind', speed(d.windKmh)], ['Cloud cover', `${Math.round(d.cloud ?? 0)}%`], ['Sunrise', isoClock(d.sunrise)], ['Sunset', isoClock(d.sunset)]]
    : [['Humidity', d.humidity == null ? '–' : `${Math.round(d.humidity)}%`],
       ['Wind', d.windKmh == null ? '–' : `${speed(d.windKmh)} ${COMPASS[Math.round((d.windDir ?? 0) / 45) % 8]}`],
       ['Rain', rain(d.rainMm)], ['Cloud cover', `${Math.round(d.cloud ?? 0)}%`], ['Sunrise', isoClock(d.sunrise)], ['Sunset', isoClock(d.sunset)]];
  const grid = $('wxGrid');
  grid.textContent = '';
  for (const [k, v] of cells) {
    const div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = v; div.append(dt, dd); grid.append(div);
  }
  const where = d.lat != null ? ` Nearest weather grid point: ${Math.abs(d.lat).toFixed(2)}°${d.lat >= 0 ? 'N' : 'S'}, ${Math.abs(d.lon).toFixed(2)}°${d.lon >= 0 ? 'E' : 'W'}.` : '';
  const src = $('wxSrc');
  src.textContent = '';
  if (w.fake) { src.textContent = 'Preview weather set from the link, not a live reading.'; return; }
  let lead;
  if (w.historical) lead = 'Recorded weather from the Open-Meteo historical archive (ERA5 reanalysis).';
  else {
    const mins = Math.max(0, Math.round((Date.now() - (d.fetchedAt || Date.now())) / 60000));
    lead = `Live reading${d.observed ? ` from ${isoClock(d.observed)}` : ''}, updated ${mins < 1 ? 'just now' : `${mins} min ago`}. Source: `;
  }
  const a = document.createElement('a');
  a.href = 'https://open-meteo.com/'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open-Meteo';
  if (w.historical) src.append(lead + where);
  else src.append(lead, a, ', built on national weather models (NOAA, DWD, ECMWF and more).' + where);
}

let slideT = 0;
function onSlide() {
  const now = performance.now();
  if (now - slideT < 120) return;
  slideT = now;
  render(0.6);
  ensureWeatherSoon();
}
$('month').addEventListener('input', (e) => {
  const v = +e.target.value;
  monthOv = v === localParts(place.tz || browserTz).mo && hourOv === null ? null : v;
  onSlide();
});
$('hour').addEventListener('input', (e) => { hourOv = +e.target.value; onSlide(); });
for (const id of ['month', 'hour']) $(id).addEventListener('change', () => { slideT = 0; render(0.6); ensureWeatherSoon(); });
$('now').addEventListener('click', () => { monthOv = hourOv = null; render(1.5); ensureWeather(); });
$('mysky').addEventListener('click', () => goTo(home));

function goTo(p) {
  place = p;
  $('q').value = '';
  $('results').textContent = '';
  render(2);
  ensureWeather();
}

// ---------- city search ----------
let searchCtl = null, searchT;
$('q').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchT);
  if (searchCtl) searchCtl.abort();
  if (q.length < 2) { $('results').textContent = ''; return; }
  searchT = setTimeout(async () => {
    searchCtl = new AbortController();
    let found = [];
    try { found = await searchPlaces(q, searchCtl.signal); } catch { return; }
    const list = $('results');
    list.textContent = '';
    if (!found.length) {
      const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Hmm, no sky by that name. Try another spelling?';
      list.append(li); return;
    }
    for (const p of found) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.setAttribute('role', 'option');
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = p.city;
      b.lastChild.textContent = [p.region, p.countryName].filter(Boolean).join(', ');
      b.addEventListener('click', (ev) => { ev.stopPropagation(); goTo(p); });
      li.append(b); list.append(li);
    }
  }, 250);
});
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = $('results').querySelector('button'); if (first) first.click(); }
  e.stopPropagation();
});

// ---------- chip + panel toggling ----------
const chip = $('chip'), panel = $('panel');
function togglePanel(open = !panel.classList.contains('open')) {
  panel.classList.toggle('open', open);
  chip.setAttribute('aria-expanded', String(open));
}
chip.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); if (panel.classList.contains('open') && current) renderPanel(); });
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
// Keep "now" in step with the real clock: the sky drifts with the sun, weather refreshes.
setInterval(() => {
  if (place && monthOv === null && hourOv === null) { render(4); ensureWeather(); }
}, 60 * 1000);

// ---------- boot ----------
(async () => {
  // Paint something immediately from the timezone guess, then refine.
  place = { ...guessFromTimezone(), tz: browserTz };
  render(0, true);
  requestAnimationFrame(frame);

  const found = await resolvePlace();
  home = { ...found, tz: found.tz || (found.source === 'timezone' || found.source === 'default' ? browserTz : undefined) };
  place = home;
  const qm = query.get('month'), qh = query.get('hour');
  if (qm !== null && qm !== '') monthOv = Math.max(0, Math.min(11, +qm - 1));
  if (qh !== null && qh !== '') hourOv = Math.max(0, Math.min(95, Math.round(+qh * 4)));
  render(1.5);
  ensureWeather();
})();
