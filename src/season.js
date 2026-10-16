// Where is the viewer, what season is it there, and what's the weather doing?

export const PRESETS = [
  { id: 'seattle', city: 'Seattle', country: 'US', lat: 47.61, lon: -122.33 },
  { id: 'mumbai', city: 'Mumbai', country: 'IN', lat: 19.08, lon: 72.88 },
  { id: 'delhi', city: 'Delhi', country: 'IN', lat: 28.61, lon: 77.21 },
  { id: 'chennai', city: 'Chennai', country: 'IN', lat: 13.08, lon: 80.27 },
  { id: 'tokyo', city: 'Tokyo', country: 'JP', lat: 35.68, lon: 139.69 },
  { id: 'london', city: 'London', country: 'GB', lat: 51.51, lon: -0.13 },
  { id: 'newyork', city: 'New York', country: 'US', lat: 40.71, lon: -74.01 },
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
  // Unknown zone: assume a mid-latitude northern city.
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
      if (isFinite(j.lat) && isFinite(j.lon)) return { ...j, source: 'ip' };
    }
  } catch {}
  return guessFromTimezone();
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Month as a continuous number: Jan 1 = 0, Dec 31 ≈ 12.
function monthFloat(d) {
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getMonth() + (d.getDate() - 1) / days;
}

/**
 * Season for a place and date. Returns { key, label, progress (0–1 through the season), variant }.
 * key is one of: spring, summer, monsoon, autumn, winter, misty.
 */
export function seasonFor({ lat, lon, country }, date = new Date()) {
  const m = monthFloat(date);
  const S = (key, label, progress = 0.5, variant) => ({ key, label, progress: clamp01(progress), variant });
  const fall = country === 'US' || country === 'CA' ? 'Fall' : 'Autumn';
  const alat = Math.abs(lat);

  // South Asia: summer → southwest monsoon → post-monsoon → cool misty winter → spring.
  if (lat > 5 && lat < 37 && lon > 60 && lon < 98) {
    const seCoast = lat < 14.5 && lon > 77.5; // Tamil Nadu coast + Sri Lanka get the northeast monsoon
    if (m >= 5 && m < 9.5) return S('monsoon', 'Monsoon', (m - 5) / 4.5);
    if (seCoast && m >= 9.5) return S('monsoon', 'Northeast monsoon', (m - 9.5) / 2.5);
    if (m >= 9.5 && m < 11) return S('summer', 'Post-monsoon', (m - 9.5) / 1.5);
    if (m >= 11 || m < 1.5) return S('misty', 'Winter', (m >= 11 ? m - 11 : m + 1) / 2.5);
    if (m < 3) return S('spring', 'Spring', (m - 1.5) / 1.5, 'palash');
    return S('summer', 'Summer', (m - 3) / 2, 'flame');
  }

  // Tropics: wet and dry seasons instead of four.
  if (alat < 23.5) {
    if (alat < 4) return S('summer', 'Tropical', 0.5);
    const north = lat > 0;
    const wet = north ? m >= 4.5 && m < 10 : m >= 10.5 || m < 3.5;
    if (wet) {
      const p = north ? (m - 4.5) / 5.5 : (m >= 10.5 ? m - 10.5 : m + 1.5) / 5;
      return S('monsoon', 'Rainy season', p);
    }
    return S('summer', 'Dry season', 0.5, 'flame');
  }

  // East Asian plum-rain season (tsuyu / meiyu / jangma).
  if (lat > 22 && lat < 42 && lon > 100 && lon < 146 && m >= 5.3 && m < 6.7) {
    return S('monsoon', 'Rainy season', (m - 5.3) / 1.4);
  }

  // Temperate and subpolar: flip six months in the southern hemisphere.
  const mm = lat < 0 ? (m + 6) % 12 : m;
  if (alat >= 58) {
    if (mm >= 10 || mm < 3.5) return S('winter', 'Winter', (mm >= 10 ? mm - 10 : mm + 2) / 5.5);
    if (mm < 5.5) return S('spring', 'Spring', (mm - 3.5) / 2);
    if (mm < 8) return S('summer', 'Summer', (mm - 5.5) / 2.5);
    return S('autumn', fall, (mm - 8) / 2);
  }
  if (mm >= 11 || mm < 2) return S('winter', 'Winter', (mm >= 11 ? mm - 11 : mm + 1) / 3);
  if (mm < 5) return S('spring', 'Spring', (mm - 2) / 3);
  if (mm < 8) return S('summer', 'Summer', (mm - 5) / 3);
  return S('autumn', fall, (mm - 8) / 3);
}

// Default label for a season picked by hand.
export function manualSeason(key, country) {
  const labels = {
    spring: 'Spring', summer: 'Summer', monsoon: 'Monsoon',
    autumn: country === 'US' || country === 'CA' ? 'Fall' : 'Autumn', winter: 'Winter', misty: 'Misty winter',
  };
  const progress = { spring: 0.35, summer: 0.5, monsoon: 0.5, autumn: 0.6, winter: 0.5, misty: 0.5 };
  return { key, label: labels[key], progress: progress[key] };
}

// Live weather from Open-Meteo (free, no key). Returns null on failure.
export async function fetchWeather(lat, lon) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
      `&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,is_day&timezone=auto`;
    const r = await fetch(u, { signal: withTimeout(5000) });
    if (!r.ok) return null;
    const c = (await r.json()).current;
    const code = c.weather_code;
    let kind = 'clear', label = 'clear skies';
    if (code === 1) label = 'mostly clear';
    else if (code === 2) { kind = 'cloudy'; label = 'partly cloudy'; }
    else if (code === 3) { kind = 'cloudy'; label = 'overcast'; }
    else if (code === 45 || code === 48) { kind = 'fog'; label = 'foggy'; }
    else if (code >= 51 && code <= 57) { kind = 'drizzle'; label = 'drizzle'; }
    else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
      kind = code === 65 || code === 82 ? 'heavy' : 'rain';
      label = code === 61 || code === 80 ? 'light rain' : code === 65 || code === 82 ? 'heavy rain' : 'rain';
    } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { kind = 'snow'; label = 'snow'; }
    else if (code >= 95) { kind = 'storm'; label = 'thunderstorm'; }
    return {
      kind, label, code,
      temp: Math.round(c.temperature_2m),
      cloud: c.cloud_cover ?? 0,
      wind: c.wind_speed_10m ?? 8,
      isDay: c.is_day === 1,
    };
  } catch {
    return null;
  }
}
