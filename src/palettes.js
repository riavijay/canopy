// Colors, per-region foliage rules and weather → scene. A "scene" is everything the renderer needs.

export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c, a = 1) =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

// A tone is four paint colors for the leaf dabs: shadowed inside, mid, light, and sunlit edge.
const T = (deep, mid, light, glow) => ({ deep: hex(deep), mid: hex(mid), light: hex(light), glow: hex(glow) });

export const TONES = {
  summer: T('#2c7a35', '#4aa23f', '#7fc64c', '#c0e266'),
  dry: T('#4f6b2c', '#77923e', '#a1b654', '#cdd77b'),
  fresh: T('#4a9634', '#77bf45', '#a5d964', '#d6f095'),
  monsoon: T('#1c6229', '#2c8434', '#4ba545', '#7dc65b'),
  misty: T('#4c6c3f', '#6c8c54', '#91ab6e', '#b9cc95'),
  mildGreen: T('#3a6d33', '#5a8f43', '#84b058', '#b3cf7a'),
  evergreen: T('#1b4b2b', '#2a6636', '#3f8341', '#6aa651'),
  evergreenSnow: T('#1b4b2b', '#2a6636', '#e8eef2', '#ffffff'),
  // Blossoms
  pink: T('#c35f86', '#e78db0', '#f5bdd1', '#fde4ee'),
  white: T('#c4b3b9', '#e6d9dc', '#f7f0ef', '#ffffff'),
  magnolia: T('#b9708f', '#e2a6c0', '#f4d0df', '#fdf0f5'),
  jacaranda: T('#58479a', '#8670cc', '#ab95e5', '#d4c7f6'),
  trumpetPink: T('#b04a80', '#dc78ae', '#f0a5cb', '#fbd3e7'),
  trumpetYellow: T('#c28c22', '#e8b833', '#f6d45a', '#fdeb9b'),
  palash: T('#b2461a', '#e46c20', '#f6983a', '#fcc56b'),
  flame: T('#a32a1c', '#d94626', '#f0703b', '#f8a25d'),
  // Fall
  orange: T('#a8471b', '#dd6f27', '#f39a3b', '#f9c35a'),
  red: T('#8f2519', '#c43b25', '#e3623a', '#f2925a'),
  yellow: T('#a8771e', '#dba52e', '#f2cc4a', '#fae58a'),
  turning: T('#5c8530', '#86a63f', '#b0c352', '#d8de76'),
  gold: T('#8a6a22', '#c49a34', '#e2c053', '#f2dc85'),
  brown: T('#74461f', '#a46638', '#c7884d', '#dfb072'),
  olive: T('#566b2a', '#80943d', '#a7b854', '#cdd77c'),
};

// green: share of plain leaf dabs mixed into a flowering crown.
const look = (s, tone, mt = 'leaf', green = 0) => ({ s, ...tone, mt, green });
const NONE = look(0, TONES.fresh);

// Which blossom each region's spring brings, and when in the season it's out (0–1).
const BLOOM = {
  cherry: { share: 0.5, window: [0, 0.62], green: 0.12, tone: (tr) => (tr.r2 < 0.75 ? TONES.pink : TONES.white) },
  pear: { share: 0.6, window: [0, 0.6], green: 0.15, tone: (tr) => (tr.r2 < 0.5 ? TONES.white : tr.r2 < 0.8 ? TONES.pink : TONES.magnolia) },
  white: { share: 0.42, window: [0, 0.6], green: 0.25, tone: (tr) => (tr.r2 < 0.7 ? TONES.white : TONES.pink) },
  jacaranda: { share: 0.42, window: [0.3, 1], green: 0.2, tone: () => TONES.jacaranda },
  trumpet: { share: 0.55, window: [0.05, 1], green: 0.08, tone: (tr) => (tr.r2 < 0.75 ? TONES.trumpetPink : TONES.trumpetYellow) },
  palash: { share: 0.38, window: [0, 1], green: 0.1, tone: () => TONES.palash },
  ipe: { share: 0.45, window: [0, 0.75], green: 0.05, tone: (tr) => (tr.r2 < 0.6 ? TONES.trumpetPink : TONES.trumpetYellow) },
  fresh: { share: 0, window: [0, 0], green: 1, tone: () => TONES.fresh },
};

// Per-clump foliage for each season. c.r1..r3 and tree.r, tree.r2 are stable random numbers.
const FOLIAGE = {
  spring(c, tree, p, f) {
    if (tree.r > 1 - f.evergreen) return look(1, TONES.evergreen);
    let bloom = BLOOM[f.spring] || BLOOM.white;
    if (f.summer === 'jacaranda' && p > 0.7) bloom = BLOOM.jacaranda; // LA's jacarandas start in late spring
    const open = p >= bloom.window[0] && p <= bloom.window[1];
    if (tree.r < bloom.share && open && !(p > bloom.window[1] - 0.15 && c.r1 < (p - bloom.window[1] + 0.15) / 0.15)) {
      return look(1, bloom.tone(tree), 'flower', bloom.green);
    }
    return look(0.6 + 0.4 * Math.min(1, p * 1.4 + c.r2 * 0.3), TONES.fresh);
  },
  summer(c, tree, p, f) {
    if (tree.r > 1 - f.evergreen) return look(1, TONES.evergreen);
    if (f.summer === 'flame' && tree.r < 0.38) return look(1, TONES.flame, 'flower', 0.35);
    if (f.summer === 'jacaranda' && p < 0.5 && tree.r < 0.4) return look(1, TONES.jacaranda, 'flower', 0.2);
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
    if (c.r2 < Math.max(0, p - 0.35) * drop) return look(0, TONES.turning);
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

// Sky: deeper blue toward the edges of the view, paler straight overhead.
const BASE = {
  summer: { sky: ['#cbe9f8', '#6ab4e4'], clouds: 0, birds: 'small', rates: { leaf: 0.2, petal: 0 } },
  spring: { sky: ['#d3ecf9', '#78bde8'], clouds: 0, birds: 'small', rates: { leaf: 0, petal: 2.2 } },
  autumn: { sky: ['#cfe6f5', '#6fb0de'], clouds: 0, birds: 'geese', rates: { leaf: 2.2, petal: 0 } },
  winter: { sky: ['#e4ebf0', '#a9bccb'], clouds: 6, birds: 'crow', rates: { leaf: 0, petal: 0 } },
  monsoon: { sky: ['#c5d0d6', '#8297a4'], clouds: 9, birds: null, rates: { leaf: 0.2, petal: 0 } },
  misty: { sky: ['#e3eaec', '#aec3cc'], clouds: 1, birds: 'small', rates: { leaf: 0.15, petal: 0 } },
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
    skyIn: hex(b.sky[0]), skyOut: hex(b.sky[1]),
    cloudN: b.clouds, cloudGrey: 0, cloudScale: 1,
    bark: hex('#2f2620'), barkLight: hex('#6b5a4b'), snow: 0, fog: 0,
    tint: hex('#4b6370'), tintA: 0, lightning: 0, droplets: 0, sun: 1,
    rates: { ...b.rates, snow: 0, rain: 0 },
  };
  if (season.key === 'autumn') env.rates.leaf *= 0.4 + season.progress * 1.2;
  if (season.key === 'winter' && f.winter === 'snowy' && !weather) env.snow = 1;

  // Sky follows the actual weather. A clear day is just blue.
  if (kind === 'clear') env.cloudN = 0;
  else if (kind === 'mostly') env.cloudN = 2;
  else if (kind === 'partly') env.cloudN = 4;
  else env.cloudN = Math.max(env.cloudN, Math.round(5 + (cloudCover / 100) * 5));
  if (season.key === 'monsoon' && ['clear', 'mostly', 'partly'].includes(kind)) env.cloudN = Math.max(env.cloudN, 3);

  const grey = (amt) => {
    env.skyIn = mixC(env.skyIn, hex('#d5dcdf'), amt);
    env.skyOut = mixC(env.skyOut, hex('#94a5b0'), amt);
    env.cloudGrey = Math.max(env.cloudGrey, amt * 0.8);
    env.sun = Math.min(env.sun, 1 - amt * 0.6);
  };
  if (kind === 'cloudy' || kind === 'fog') { grey(0.6); env.tintA = 0.05; env.cloudScale = 1.35; }
  if (kind === 'fog') env.fog = 0.3;
  if (['drizzle', 'rain', 'heavy', 'storm'].includes(kind)) {
    const base = { drizzle: 45, rain: 120, heavy: 220, storm: 240 }[kind];
    env.rates.rain = Math.min(320, Math.max(base, 40 + precip * 40));
    env.droplets = 1;
    grey(kind === 'drizzle' ? 0.7 : 0.95);
    env.cloudScale = 1.6;
    env.tintA = kind === 'drizzle' ? 0.07 : kind === 'rain' ? 0.11 : 0.17;
    env.rates.petal *= 0.3;
  }
  if (kind === 'storm' || (season.key === 'monsoon' && !weather)) env.lightning = 1;
  if (kind === 'storm') { env.skyOut = mixC(env.skyOut, hex('#5f717d'), 0.5); env.cloudGrey = 1; env.tintA = 0.2; }
  if (kind === 'snow') {
    env.rates.snow = 30; env.snow = 1; grey(0.5);
    env.skyIn = mixC(env.skyIn, hex('#eef2f4'), 0.5);
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
