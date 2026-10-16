// Colors, per-region foliage rules and weather → scene. A "scene" is everything the renderer needs.

export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c, a = 1) =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

// A tone is three flat greens (or blossom colors) plus the pale rim around the mass.
const T = (light, mid, dark, halo) => ({ light: hex(light), mid: hex(mid), dark: hex(dark), halo: hex(halo) });

const TONES = {
  summer: T('#a2d043', '#7bbb3a', '#4d9330', '#e3eea3'),
  dry: T('#b9c862', '#97ab4c', '#6c8238', '#eef0bd'),
  fresh: T('#cbe88a', '#a9d862', '#80b743', '#f0f7cf'),
  monsoon: T('#6fbc4a', '#4f9a3a', '#2f6e29', '#cfe6a0'),
  misty: T('#aac47c', '#8aa660', '#647f44', '#e5e9c4'),
  mildGreen: T('#9fc36a', '#7ea654', '#577e3d', '#e6eebc'),
  evergreen: T('#64a446', '#428c3b', '#286b31', '#d6eaa6'),
  evergreenSnow: T('#64a446', '#428c3b', '#286b31', '#ffffff'),
  // Blossoms
  pink: T('#fad3df', '#f2abc3', '#d27c9d', '#fff2f6'),
  white: T('#fffaf5', '#f2e2e2', '#d6bcc3', '#ffffff'),
  magnolia: T('#fde6ef', '#f5c3d6', '#c98aa5', '#fff6f9'),
  jacaranda: T('#c6b1f1', '#a58cdb', '#7c63b7', '#efe7fd'),
  trumpetPink: T('#f8b4d6', '#e984ba', '#be5a90', '#ffeaf4'),
  trumpetYellow: T('#fadf63', '#efc23b', '#c79427', '#fff7cf'),
  palash: T('#fcb05a', '#f58a2c', '#c75b1a', '#ffe7c6'),
  flame: T('#f98a52', '#ec5a2f', '#bd3a22', '#ffe4cb'),
  ipePink: T('#f6a3cd', '#e271ad', '#b54e86', '#ffe9f4'),
  // Fall
  orange: T('#f9b45c', '#f0913a', '#c4621f', '#fde6b3'),
  red: T('#ee8058', '#d9533a', '#a63523', '#fde0bf'),
  yellow: T('#f8dc70', '#efc243', '#c4902a', '#fdf0bb'),
  turning: T('#c2d066', '#a3b84a', '#7a9033', '#f1efbb'),
  gold: T('#ead070', '#d7ae45', '#a98330', '#f8edbe'),
  brown: T('#d6a062', '#b77a3e', '#8a5a2c', '#f6e3c0'),
  olive: T('#b6bf66', '#95a04a', '#6e7b36', '#eeeebf'),
};

const look = (s, tone, mt = 'leaf', halo) => ({ s, ...tone, halo: halo || tone.halo, mt });
const NONE = look(0, TONES.fresh);

// Which blossom each region's spring brings, and when in the season it's out (0–1).
const BLOOM = {
  cherry: { share: 0.5, window: [0, 0.62], tone: (tr) => (tr.r2 < 0.75 ? TONES.pink : TONES.white) },
  pear: { share: 0.6, window: [0, 0.6], tone: (tr) => (tr.r2 < 0.5 ? TONES.white : tr.r2 < 0.8 ? TONES.pink : TONES.magnolia) },
  white: { share: 0.42, window: [0, 0.6], tone: (tr) => (tr.r2 < 0.7 ? TONES.white : TONES.pink) },
  jacaranda: { share: 0.42, window: [0.3, 1], tone: () => TONES.jacaranda },
  trumpet: { share: 0.55, window: [0.05, 1], tone: (tr) => (tr.r2 < 0.75 ? TONES.trumpetPink : TONES.trumpetYellow) },
  palash: { share: 0.38, window: [0, 1], tone: () => TONES.palash },
  ipe: { share: 0.45, window: [0, 0.75], tone: (tr) => (tr.r2 < 0.6 ? TONES.ipePink : TONES.trumpetYellow) },
  fresh: { share: 0, window: [0, 0], tone: () => TONES.fresh },
};

// Per-cluster foliage for each season. c.r1..r3 and tree.r, tree.r2 are stable random numbers.
const FOLIAGE = {
  spring(c, tree, p, f) {
    if (tree.r > 1 - f.evergreen) return look(1, TONES.evergreen);
    let bloom = BLOOM[f.spring] || BLOOM.white;
    if (f.summer === 'jacaranda' && p > 0.7) bloom = BLOOM.jacaranda; // LA's jacarandas start in late spring
    const open = p >= bloom.window[0] && p <= bloom.window[1];
    if (tree.r < bloom.share && open && !(p > bloom.window[1] - 0.15 && c.r1 < (p - bloom.window[1] + 0.15) / 0.15)) {
      return look(1, bloom.tone(tree), 'flower');
    }
    return look(0.55 + 0.45 * Math.min(1, p * 1.4 + c.r2 * 0.3), TONES.fresh);
  },
  summer(c, tree, p, f) {
    if (tree.r > 1 - f.evergreen) return look(1, TONES.evergreen);
    if (f.summer === 'flame' && tree.r < 0.38) return look(1, TONES.flame, 'flower');
    if (f.summer === 'jacaranda' && p < 0.5 && tree.r < 0.4) return look(1, TONES.jacaranda, 'flower');
    return look(1, f.summer === 'dry' || f.summer === 'jacaranda' ? TONES.dry : TONES.summer);
  },
  autumn(c, tree, p, f) {
    if (tree.r > 1 - f.evergreen) return look(1, TONES.evergreen);
    if (f.fall === 'mild') {
      return tree.r < 0.3 && p > 0.25 ? look(1, c.r3 < 0.7 ? TONES.gold : TONES.olive) : look(1, TONES.mildGreen);
    }
    const turned = c.r1 < 0.15 + 0.95 * p;
    if (!turned) return look(1, TONES.turning);
    const drop = f.fall === 'vivid' ? 0.75 : 0.5;
    const dropped = c.r2 < Math.max(0, p - 0.35) * drop;
    if (dropped) return look(0, TONES.turning);
    if (f.fall === 'vivid') {
      const dom = ['orange', 'red', 'yellow'][Math.floor(tree.r2 * 3) % 3];
      return look(1, TONES[c.r3 < 0.68 ? dom : c.r3 < 0.86 ? 'orange' : 'yellow']);
    }
    // Golden: planes, honey locusts, birches — yellows and browns, a little olive.
    return look(1, c.r3 < 0.55 ? TONES.gold : c.r3 < 0.85 ? TONES.brown : TONES.olive);
  },
  winter(c, tree, p, f, snowy) {
    if (f.winter === 'green') return look(1, TONES.mildGreen);
    if (tree.r > 1 - Math.max(f.evergreen, 0.15)) return look(0.95, snowy ? TONES.evergreenSnow : TONES.evergreen);
    return NONE;
  },
  monsoon() { return look(1.04, TONES.monsoon); },
  misty() { return look(0.97, TONES.misty); },
};

const BASE = {
  summer: { sky: '#9fd2ea', clouds: 0, birds: 'small', rates: { leaf: 0.2, petal: 0 } },
  spring: { sky: '#a7d8ef', clouds: 0, birds: 'small', rates: { leaf: 0, petal: 2.2 } },
  autumn: { sky: '#a2cfe6', clouds: 0, birds: 'geese', rates: { leaf: 2.2, petal: 0 } },
  winter: { sky: '#c4d3de', clouds: 5, birds: 'crow', rates: { leaf: 0, petal: 0 } },
  monsoon: { sky: '#9db2be', clouds: 9, birds: null, rates: { leaf: 0.2, petal: 0 } },
  misty: { sky: '#c3d4db', clouds: 1, birds: 'small', rates: { leaf: 0.15, petal: 0 } },
};

const SCENE_DEFAULT_WEATHER = { summer: 'clear', spring: 'clear', autumn: 'clear', winter: 'cloudy', monsoon: 'rain', misty: 'fog' };

/*
 * Flatten season + weather into numbers and colors the renderer can blend.
 * weather === null means "preview": use a typical day for that season.
 */
export function buildScene(season, weather) {
  const b = BASE[season.key];
  const f = season.flora;
  const kind = weather ? weather.kind : SCENE_DEFAULT_WEATHER[season.key];
  const cloudCover = weather ? weather.cloud : { clear: 0, cloudy: 85, rain: 100, fog: 100 }[kind];
  const precip = weather ? weather.precip : kind === 'rain' ? 4 : 0;

  const env = {
    sky: hex(b.sky),
    cloudN: b.clouds, cloudFill: hex('#ffffff'), cloudShade: hex('#dbe9f1'), cloudScale: 1,
    trunk: hex('#1d4a2c'), trunkEdge: hex('#2f6a3e'), branch: hex('#6e5432'), snow: 0, fog: 0,
    tint: hex('#4b6370'), tintA: 0, lightning: 0, droplets: 0,
    rates: { ...b.rates, snow: 0, rain: 0 },
  };
  if (season.key === 'autumn') env.rates.leaf *= 0.4 + season.progress * 1.2;
  if (season.key === 'winter' && f.winter === 'snowy' && !weather) env.snow = 1;

  // Sky follows the actual weather. A clear day is just blue.
  if (kind === 'clear') env.cloudN = 0;
  else if (kind === 'mostly') env.cloudN = 1;
  else if (kind === 'partly') env.cloudN = 3;
  else env.cloudN = Math.max(env.cloudN, Math.round(4 + (cloudCover / 100) * 5));
  if (season.key === 'monsoon' && (kind === 'clear' || kind === 'mostly' || kind === 'partly')) env.cloudN = Math.max(env.cloudN, 2);

  const grey = (amt) => {
    env.sky = mixC(env.sky, hex('#a3b3bd'), amt);
    env.cloudFill = mixC(env.cloudFill, hex('#d7dee3'), amt);
    env.cloudShade = mixC(env.cloudShade, hex('#b5c2ca'), amt);
  };
  if (kind === 'cloudy' || kind === 'fog') { grey(0.55); env.tintA = 0.06; env.cloudScale = 1.4; }
  if (kind === 'fog') env.fog = 0.28;
  if (['drizzle', 'rain', 'heavy', 'storm'].includes(kind)) {
    const base = { drizzle: 45, rain: 120, heavy: 220, storm: 240 }[kind];
    env.rates.rain = Math.min(320, Math.max(base, 40 + precip * 40));
    env.droplets = 1;
    grey(kind === 'drizzle' ? 0.6 : 0.85);
    env.cloudScale = 1.6;
    env.tintA = kind === 'drizzle' ? 0.08 : kind === 'rain' ? 0.12 : 0.18;
    env.rates.petal *= 0.3;
  }
  if (kind === 'storm' || (season.key === 'monsoon' && !weather)) env.lightning = 1;
  if (kind === 'storm') { env.sky = mixC(env.sky, hex('#6f828e'), 0.5); env.tintA = 0.22; }
  if (kind === 'snow') {
    env.rates.snow = 30; env.snow = 1; grey(0.4);
    env.sky = mixC(env.sky, hex('#dfe6eb'), 0.5);
  }

  const snowy = env.snow > 0.5;
  return {
    season,
    env,
    kind,
    birds: ['rain', 'heavy', 'storm', 'snow'].includes(kind) ? null : b.birds,
    windMul: 0.6 + Math.min(1.6, (weather ? weather.wind : kind === 'storm' ? 30 : 8) / 20),
    foliage: (cl, tree) => FOLIAGE[season.key](cl, tree, season.progress, f, snowy),
  };
}

export function blendEnv(a, b, t) {
  const out = {};
  for (const k in b) {
    const x = a[k], y = b[k];
    if (Array.isArray(y)) out[k] = mixC(x, y, t);
    else if (typeof y === 'number') out[k] = x + (y - x) * t;
    else if (k === 'rates') { out[k] = {}; for (const r in y) out[k][r] = (x[r] || 0) + (y[r] - (x[r] || 0)) * t; }
    else out[k] = y;
  }
  return out;
}
