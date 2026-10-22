// Where is the viewer, what season is it there, what do the trees look like, and what's the weather?

export const PRESETS = [
  { id: 'seattle', city: 'Seattle', country: 'US', lat: 47.61, lon: -122.33 },
  { id: 'bangalore', city: 'Bengaluru', country: 'IN', lat: 12.97, lon: 77.59 },
  { id: 'mumbai', city: 'Mumbai', country: 'IN', lat: 19.08, lon: 72.88 },
  { id: 'delhi', city: 'Delhi', country: 'IN', lat: 28.61, lon: 77.21 },
  { id: 'newyork', city: 'New York', country: 'US', lat: 40.71, lon: -74.01 },
  { id: 'losangeles', city: 'Los Angeles', country: 'US', lat: 34.05, lon: -118.24 },
  { id: 'london', city: 'London', country: 'GB', lat: 51.51, lon: -0.13 },
  { id: 'tokyo', city: 'Tokyo', country: 'JP', lat: 35.68, lon: 139.69 },
  { id: 'sydney', city: 'Sydney', country: 'AU', lat: -33.87, lon: 151.21 },
  { id: 'singapore', city: 'Singapore', country: 'SG', lat: 1.35, lon: 103.82 },
  { id: 'nairobi', city: 'Nairobi', country: 'KE', lat: -1.29, lon: 36.82 },
  { id: 'saopaulo', city: 'São Paulo', country: 'BR', lat: -23.55, lon: -46.63 },
  { id: 'reykjavik', city: 'Reykjavík', country: 'IS', lat: 64.15, lon: -21.94 },
];

// Rough fallback when we can't get an IP location: timezone → a representative city.
const TZ = {
  'America/Los_Angeles': ['Los Angeles', 'US', 34.05, -118.24],
  'America/Vancouver': ['Vancouver', 'CA', 49.28, -123.12],
  'America/Denver': ['Denver', 'US', 39.74, -104.99],
  'America/Phoenix': ['Phoenix', 'US', 33.45, -112.07],
  'America/Chicago': ['Chicago', 'US', 41.88, -87.63],
  'America/New_York': ['New York', 'US', 40.71, -74.01],
  'America/Toronto': ['Toronto', 'CA', 43.65, -79.38],
  'America/Anchorage': ['Anchorage', 'US', 61.22, -149.9],
  'Pacific/Honolulu': ['Honolulu', 'US', 21.31, -157.86],
  'America/Mexico_City': ['Mexico City', 'MX', 19.43, -99.13],
  'America/Bogota': ['Bogotá', 'CO', 4.71, -74.07],
  'America/Lima': ['Lima', 'PE', -12.05, -77.04],
  'America/Sao_Paulo': ['São Paulo', 'BR', -23.55, -46.63],
  'America/Argentina/Buenos_Aires': ['Buenos Aires', 'AR', -34.6, -58.38],
  'Europe/London': ['London', 'GB', 51.51, -0.13],
  'Europe/Dublin': ['Dublin', 'IE', 53.35, -6.26],
  'Europe/Paris': ['Paris', 'FR', 48.86, 2.35],
  'Europe/Berlin': ['Berlin', 'DE', 52.52, 13.4],
  'Europe/Madrid': ['Madrid', 'ES', 40.42, -3.7],
  'Europe/Rome': ['Rome', 'IT', 41.9, 12.5],
  'Europe/Amsterdam': ['Amsterdam', 'NL', 52.37, 4.9],
  'Europe/Stockholm': ['Stockholm', 'SE', 59.33, 18.07],
  'Europe/Moscow': ['Moscow', 'RU', 55.76, 37.62],
  'Europe/Istanbul': ['Istanbul', 'TR', 41.01, 28.98],
  'Atlantic/Reykjavik': ['Reykjavík', 'IS', 64.15, -21.94],
  'Africa/Cairo': ['Cairo', 'EG', 30.04, 31.24],
  'Africa/Lagos': ['Lagos', 'NG', 6.52, 3.38],
  'Africa/Nairobi': ['Nairobi', 'KE', -1.29, 36.82],
  'Africa/Johannesburg': ['Johannesburg', 'ZA', -26.2, 28.05],
  'Asia/Dubai': ['Dubai', 'AE', 25.2, 55.27],
  'Asia/Karachi': ['Karachi', 'PK', 24.86, 67.0],
  'Asia/Kolkata': ['Mumbai', 'IN', 19.08, 72.88],
  'Asia/Calcutta': ['Mumbai', 'IN', 19.08, 72.88],
  'Asia/Kathmandu': ['Kathmandu', 'NP', 27.72, 85.32],
  'Asia/Dhaka': ['Dhaka', 'BD', 23.81, 90.41],
  'Asia/Colombo': ['Colombo', 'LK', 6.93, 79.86],
  'Asia/Bangkok': ['Bangkok', 'TH', 13.76, 100.5],
  'Asia/Jakarta': ['Jakarta', 'ID', -6.2, 106.85],
  'Asia/Singapore': ['Singapore', 'SG', 1.35, 103.82],
  'Asia/Kuala_Lumpur': ['Kuala Lumpur', 'MY', 3.14, 101.69],
  'Asia/Manila': ['Manila', 'PH', 14.6, 120.98],
  'Asia/Shanghai': ['Shanghai', 'CN', 31.23, 121.47],
  'Asia/Hong_Kong': ['Hong Kong', 'HK', 22.32, 114.17],
  'Asia/Taipei': ['Taipei', 'TW', 25.03, 121.57],
  'Asia/Seoul': ['Seoul', 'KR', 37.57, 126.98],
  'Asia/Tokyo': ['Tokyo', 'JP', 35.68, 139.69],
  'Australia/Sydney': ['Sydney', 'AU', -33.87, 151.21],
  'Australia/Melbourne': ['Melbourne', 'AU', -37.81, 144.96],
  'Australia/Brisbane': ['Brisbane', 'AU', -27.47, 153.03],
  'Australia/Perth': ['Perth', 'AU', -31.95, 115.86],
  'Pacific/Auckland': ['Auckland', 'NZ', -36.85, 174.76],
};

export function guessFromTimezone() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
  const hit = TZ[tz];
  if (hit) return { city: hit[0], country: hit[1], lat: hit[2], lon: hit[3], source: 'timezone' };
  return { city: '', country: '', lat: 40, lon: 0, source: 'default' };
}

const withTimeout = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

export async function resolvePlace() {
  const q = new URLSearchParams(location.search);
  const preset = PRESETS.find((p) => p.id === q.get('place'));
  if (preset) return { ...preset, source: 'url' };
  const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
  if (isFinite(lat) && isFinite(lon)) return { city: q.get('city') || '', country: '', lat, lon, source: 'url' };

  try {
    const r = await fetch('/api/geo', { signal: withTimeout(2500) });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const j = await r.json();
      if (isFinite(j.lat) && isFinite(j.lon) && j.lat !== null) return { ...j, source: 'ip' };
    }
  } catch {}
  return guessFromTimezone();
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const inBox = (lat, lon, [la0, la1, lo0, lo1]) => lat >= la0 && lat <= la1 && lon >= lo0 && lon <= lo1;

function monthFloat(d) {
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getMonth() + (d.getDate() - 1) / days;
}

/*
 * Regional flora: what the trees overhead actually do each season.
 *   spring: cherry | pear (white pear + pink cherry + magnolia) | white | jacaranda | trumpet (pink + yellow tabebuia)
 *           | palash | ipe | fresh (just new leaves)
 *   summer: green | dry | flame (gulmohar / poinciana) | jacaranda (LA's late-May/June bloom)
 *   fall:   vivid (maples) | golden (planes, birch: yellow-brown) | mild (mostly evergreen, a few yellow)
 *   winter: snowy | bare | green
 *   evergreen: share of trees that are conifers / evergreens.
 * Sources: KOMO & FOX13 (Seattle foliage), NYBG & 6sqft (NYC spring), LAist (LA jacarandas),
 * Destination NSW (Sydney jacarandas), South First (Bengaluru pink trumpet trees).
 */
const F = (name, spring, summer, fall, winter, evergreen = 0.12) => ({ name, spring, summer, fall, winter, evergreen });
export function regionFor({ lat, lon }) {
  if (inBox(lat, lon, [8, 16.5, 74, 80.5])) return { ...F('deccan', 'trumpet', 'flame', 'mild', 'green'), calendar: 'deccan' };
  if (inBox(lat, lon, [5, 37, 60, 98])) return { ...F('south-asia', 'palash', 'flame', 'mild', 'green'), calendar: 'south-asia' };
  if (inBox(lat, lon, [-6, 6, 28, 42])) return { ...F('east-africa', 'jacaranda', 'green', 'mild', 'green'), calendar: 'east-africa' };
  if (Math.abs(lat) < 23.5) return { ...F('tropics', 'flame', 'flame', 'mild', 'green'), calendar: 'tropics' };
  // North America
  if (inBox(lat, lon, [42, 55, -126, -119])) return F('pnw', 'cherry', 'green', 'vivid', 'bare', 0.35);
  if (inBox(lat, lon, [30, 38.5, -125, -114])) return { ...F('california', 'fresh', 'jacaranda', 'mild', 'green', 0.3), calendar: 'california' };
  if (inBox(lat, lon, [24, 33, -125, -75])) return F('us-south', 'white', 'green', 'golden', 'green', 0.25);
  if (inBox(lat, lon, [33, 60, -100, -50])) return F('northeast', 'pear', 'green', 'golden', 'snowy');
  if (inBox(lat, lon, [30, 70, -170, -50])) return F('north-america', 'white', 'green', 'golden', 'snowy', 0.3);
  // Europe
  if (inBox(lat, lon, [58, 72, -25, 45])) return F('nordic', 'fresh', 'green', 'golden', 'snowy', 0.35);
  if (inBox(lat, lon, [34, 44.5, -10, 40])) return F('mediterranean', 'white', 'dry', 'mild', 'green', 0.35);
  if (inBox(lat, lon, [44.5, 58, -11, 25])) return F('atlantic', 'white', 'green', 'golden', 'bare');
  if (inBox(lat, lon, [44.5, 70, 25, 60])) return F('east-europe', 'white', 'green', 'golden', 'snowy', 0.25);
  // East Asia
  if (inBox(lat, lon, [30, 46, 124, 146])) return F('japan-korea', 'cherry', 'green', 'vivid', 'bare');
  if (inBox(lat, lon, [22, 46, 100, 124])) return F('china', 'cherry', 'green', 'golden', 'bare');
  // Southern hemisphere
  if (inBox(lat, lon, [-38, -24, 140, 155])) return F('east-australia', 'jacaranda', 'dry', 'mild', 'green', 0.4);
  if (inBox(lat, lon, [-45, -10, 110, 155])) return F('australia', 'white', 'dry', 'mild', 'green', 0.45);
  if (inBox(lat, lon, [-48, -34, 165, 180])) return F('new-zealand', 'white', 'green', 'golden', 'bare', 0.3);
  if (inBox(lat, lon, [-35, -15, -60, -34])) return F('brazil', 'ipe', 'green', 'mild', 'green', 0.4);
  if (inBox(lat, lon, [-35, -20, 15, 35])) return F('south-africa', 'jacaranda', 'dry', 'mild', 'green', 0.35);
  return F('temperate', 'white', 'green', 'golden', 'bare');
}

/**
 * Season for a place and date: { key, label, progress (0–1 through the season), flora }.
 * key is one of: spring, summer, monsoon, autumn, winter, misty.
 */
export function seasonFor(place, date = new Date()) {
  const { lat, country } = place;
  const flora = regionFor(place);
  const m = monthFloat(date);
  const S = (key, label, progress = 0.5) => ({ key, label, progress: clamp01(progress), flora });
  const fall = country === 'US' || country === 'CA' ? 'Fall' : 'Autumn';

  // Bengaluru & the Deccan: pink trumpet trees Jan–Mar, gulmohar Apr–May, two monsoons, cool Dec.
  if (flora.calendar === 'deccan') {
    if (m < 3.3) return S('spring', 'Pink trumpet season', m / 3.3);
    if (m < 5.1) return S('summer', 'Summer', (m - 3.3) / 1.8);
    if (m < 9.5) return S('monsoon', 'Southwest monsoon', (m - 5.1) / 4.4);
    if (m < 11.5) return S('monsoon', 'Northeast monsoon', (m - 9.5) / 2);
    return S('misty', 'Winter', (m - 11.5) / 0.5);
  }
  // Rest of South Asia: palash spring, gulmohar summer, southwest monsoon, misty winter.
  if (flora.calendar === 'south-asia') {
    if (m >= 5 && m < 9.5) return S('monsoon', 'Monsoon', (m - 5) / 4.5);
    if (m >= 9.5 && m < 11) return S('summer', 'Post-monsoon', (m - 9.5) / 1.5);
    if (m >= 11 || m < 1.5) return S('misty', 'Winter', (m >= 11 ? m - 11 : m + 1) / 2.5);
    if (m < 3) return S('spring', 'Spring', (m - 1.5) / 1.5);
    return S('summer', 'Summer', (m - 3) / 2);
  }
  // Nairobi & highlands: long rains Mar–May, jacaranda + short rains Oct–Nov.
  if (flora.calendar === 'east-africa') {
    if (m >= 2 && m < 5.5) return S('monsoon', 'Long rains', (m - 2) / 3.5);
    if (m >= 9 && m < 11.5) return S('spring', 'Jacaranda season', (m - 9) / 2.5);
    return S('summer', 'Dry season', 0.5);
  }
  if (flora.calendar === 'tropics') {
    if (Math.abs(lat) < 4) return S('summer', 'Tropical', 0.5);
    const north = lat > 0;
    const wet = north ? m >= 4.5 && m < 10 : m >= 10.5 || m < 3.5;
    if (wet) return S('monsoon', 'Rainy season', north ? (m - 4.5) / 5.5 : (m >= 10.5 ? m - 10.5 : m + 1.5) / 5);
    return S('summer', 'Dry season', 0.5);
  }
  // East Asian plum-rain season.
  if ((flora.name === 'japan-korea' || flora.name === 'china') && m >= 5.3 && m < 6.7) {
    return S('monsoon', 'Rainy season', (m - 5.3) / 1.4);
  }

  // Temperate: flip six months in the southern hemisphere.
  const mm = lat < 0 ? (m + 6) % 12 : m;
  if (Math.abs(lat) >= 58) {
    if (mm >= 10 || mm < 3.5) return S('winter', 'Winter', (mm >= 10 ? mm - 10 : mm + 2) / 5.5);
    if (mm < 5.5) return S('spring', 'Spring', (mm - 3.5) / 2);
    if (mm < 8) return S('summer', 'Summer', (mm - 5.5) / 2.5);
    return S('autumn', fall, (mm - 8) / 2);
  }
  if (mm >= 11 || mm < 2) return S('winter', 'Winter', (mm >= 11 ? mm - 11 : mm + 1) / 3);
  if (mm < 5) return S('spring', 'Spring', (mm - 2) / 3);
  if (mm < 8) return S('summer', flora.summer === 'jacaranda' && mm < 6.5 ? 'Jacaranda season' : 'Summer', (mm - 5) / 3);
  return S('autumn', fall, (mm - 8) / 3);
}

// A season picked by hand, shown with the trees of the given place.
export function manualSeason(key, place) {
  const flora = regionFor(place);
  const us = place.country === 'US' || place.country === 'CA';
  const labels = { spring: 'Spring', summer: 'Summer', monsoon: 'Monsoon', autumn: us ? 'Fall' : 'Autumn', winter: 'Winter' };
  const progress = { spring: 0.35, summer: 0.2, monsoon: 0.5, autumn: 0.65, winter: 0.5 };
  return { key, label: labels[key], progress: progress[key], flora };
}

const WEATHER_LABELS = {
  clear: 'clear skies', mostly: 'mostly clear', partly: 'partly cloudy', cloudy: 'overcast', fog: 'foggy',
  drizzle: 'drizzle', rain: 'rain', heavy: 'heavy rain', storm: 'thunderstorm', snow: 'snow',
};

function weatherFromCode(code, cloud) {
  if (code === 0) return 'clear';
  if (code === 1) return 'mostly';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 65 || code === 82 || code === 67) return 'heavy';
  if ((code >= 61 && code <= 66) || (code >= 80 && code <= 81)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return cloud > 70 ? 'cloudy' : 'clear';
}

// Pretend weather for previews: ?weather=storm etc.
export function fakeWeather(kind) {
  if (!WEATHER_LABELS[kind]) return null;
  const cloud = { clear: 0, mostly: 15, partly: 45, cloudy: 95, fog: 100, drizzle: 90, rain: 100, heavy: 100, storm: 100, snow: 100 }[kind];
  const precip = { drizzle: 0.3, rain: 2, heavy: 8, storm: 10, snow: 1 }[kind] || 0;
  return { kind, label: WEATHER_LABELS[kind], temp: 18, cloud, wind: kind === 'storm' ? 35 : 10, precip, isDay: true, fake: true };
}

// Live conditions from Open-Meteo (free, no key). Returns null on failure.
export async function fetchWeather(lat, lon) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,is_day` +
      `&daily=sunrise,sunset&forecast_days=1&timezone=auto`;
    const r = await fetch(u, { signal: withTimeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    const c = j.current;
    const cloud = c.cloud_cover ?? 0;
    const kind = weatherFromCode(c.weather_code, cloud);
    return {
      tz: j.timezone,
      kind, label: WEATHER_LABELS[kind], code: c.weather_code,
      temp: c.temperature_2m, cloud,
      wind: Math.max(c.wind_speed_10m ?? 8, (c.wind_gusts_10m ?? 0) * 0.6),
      precip: c.precipitation ?? 0,
      isDay: c.is_day === 1,
      // The raw readings, shown in the weather card so people can see where the sky comes from.
      details: {
        feels: c.apparent_temperature, humidity: c.relative_humidity_2m, windKmh: c.wind_speed_10m,
        windDir: c.wind_direction_10m, gustKmh: c.wind_gusts_10m, rainMm: c.precipitation, cloud,
        sunrise: j.daily?.sunrise?.[0], sunset: j.daily?.sunset?.[0], observed: c.time, fetchedAt: Date.now(),
        lat: j.latitude, lon: j.longitude, elevation: j.elevation,
      },
    };
  } catch {
    return null;
  }
}

// ---------- search, history, sun, moon, local time, festivals ----------

// City search via Open-Meteo's free geocoding API.
export async function searchPlaces(q, signal) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
  const r = await fetch(u, { signal });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results || []).map((x) => ({
    city: x.name, country: x.country_code || '', countryName: x.country || '', region: x.admin1 || '',
    lat: x.latitude, lon: x.longitude, tz: x.timezone, source: 'search',
  }));
}

// What the weather actually was at a place on a given local date (Open-Meteo historical archive).
export async function fetchHistory(lat, lon, ymd) {
  try {
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
      `&start_date=${ymd}&end_date=${ymd}&daily=weather_code,temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,cloud_cover_mean,wind_speed_10m_max,sunrise,sunset&timezone=auto`;
    const r = await fetch(u, { signal: withTimeout(6000) });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.daily;
    if (!d || d.weather_code[0] == null) return null;
    const cloud = d.cloud_cover_mean[0] ?? 50;
    const kind = weatherFromCode(d.weather_code[0], cloud);
    return {
      kind, label: WEATHER_LABELS[kind], temp: d.temperature_2m_mean[0], cloud,
      wind: (d.wind_speed_10m_max[0] ?? 12) * 0.6, precip: (d.precipitation_sum[0] ?? 0) / 6, historical: ymd,
      details: {
        high: d.temperature_2m_max[0], low: d.temperature_2m_min[0], rainMm: d.precipitation_sum[0],
        windKmh: d.wind_speed_10m_max[0], cloud, sunrise: d.sunrise?.[0], sunset: d.sunset?.[0],
        lat: j.latitude, lon: j.longitude, elevation: j.elevation,
      },
    };
  } catch {
    return null;
  }
}

// Local wall-clock parts of an instant in an IANA timezone.
export function localParts(tz, date = new Date()) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return { y: +p.year, mo: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute };
  } catch {
    return { y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(), h: date.getHours(), mi: date.getMinutes() };
  }
}

// The instant when it is the given wall-clock time in tz.
export function fromLocal(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo, d, h, mi);
  const p = localParts(tz, new Date(guess));
  const off = Date.UTC(p.y, p.mo, p.d, p.h, p.mi) - guess;
  return new Date(guess - off);
}

// Sun height above the horizon in degrees (low-precision solar position, good to ~1°).
export function solarElevation(date, lat, lon) {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = ((357.529 + 0.98560028 * n) % 360) * rad;
  const q = (280.459 + 0.98564736 * n) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * n) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad / 15;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = ((gmst + lon / 15 - ra) * 15) * rad;
  const la = lat * rad;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) / rad;
}

// Moon age as a fraction of the synodic month: 0 new, 0.5 full.
export function moonPhase(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const f = ((jd - 2451550.1) / 29.530588853) % 1;
  return f < 0 ? f + 1 : f;
}

// Little seasonal details: string lights in December, diyas around Diwali in South Asia.
const DIWALI = { 2025: [9, 20], 2026: [10, 8], 2027: [9, 29], 2028: [9, 17], 2029: [10, 5], 2030: [9, 26] };
const DIWALI_COUNTRIES = ['IN', 'NP', 'LK', 'MY', 'SG', 'MU', 'FJ', 'GY', 'TT'];
export function festivalFor(place, { y, mo, d }) {
  const dw = DIWALI[y];
  if (dw && DIWALI_COUNTRIES.includes(place.country)) {
    const diff = (Date.UTC(y, mo, d) - Date.UTC(y, dw[0], dw[1])) / 86400000;
    if (diff >= -3 && diff <= 2) return 'diwali';
  }
  if (mo === 11 || (mo === 0 && d <= 6)) return 'christmas';
  return null;
}
