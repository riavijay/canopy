// Colors and per-season rules. A "scene" is everything the renderer needs for one season.

export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c, a = 1) =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

const T = (fill, shade, light, mark) => ({ fill: hex(fill), shade: hex(shade), light: hex(light), mark: hex(mark) });

const TONES = {
  summer: [
    T('#8cc540', '#6fa832', '#a9d856', '#6aa430'),
    T('#7ab536', '#5d972b', '#94ca4b', '#58902a'),
    T('#9fd04c', '#84b93e', '#bde26a', '#7db43a'),
  ],
  spring: [T('#b9de70', '#9fcb58', '#d2ec90', '#93c04e'), T('#c6e57e', '#acd265', '#dcf19c', '#9fc85a')],
  monsoon: [
    T('#4f9a3a', '#3a7f2d', '#68b24a', '#336f27'),
    T('#5ea83f', '#468f31', '#7abf55', '#3e7d2a'),
    T('#3f8834', '#2f6e29', '#56a044', '#295f24'),
  ],
  misty: [T('#93ae62', '#7b9750', '#abc47c', '#728e48'), T('#84a257', '#6d8a47', '#9db86f', '#64803f')],
  autumn: {
    orange: T('#f0913a', '#d8742a', '#f8b25a', '#c4621f'),
    red: T('#d9533a', '#bb3f2c', '#ea7a52', '#a83524'),
    yellow: T('#efc243', '#d9a52f', '#f7d96e', '#c4902a'),
    green: T('#a2b84a', '#869c3a', '#bccd64', '#7a9033'),
  },
  pink: T('#f6c3d3', '#eba3bb', '#fde1ea', '#de7c9f'),
  white: T('#fbf2ef', '#ecd9da', '#ffffff', '#eeaabd'),
  flame: T('#ef5a2f', '#d4442a', '#f8844e', '#b8341f'),
  palash: T('#f58a2c', '#e06c1d', '#fbab52', '#c4511a'),
  evergreen: T('#2f6a45', '#24563a', '#3d7c53', '#ffffff'),
};

const H = {
  summer: hex('#edf3b6'), spring: hex('#f3f7d2'), blossom: hex('#fff5f7'), warm: hex('#ffe4bf'),
  autumn: hex('#fbe6b0'), monsoon: hex('#cfe39e'), misty: hex('#e5e9c4'), snow: hex('#ffffff'),
};

const look = (s, tone, halo, mt = 'leaf') => ({ s, ...tone, halo, mt });

// Per-cluster foliage for each season. c.r1..r3 and tree.r are stable random numbers.
const FOLIAGE = {
  summer(c, tree, p, v) {
    if (v === 'flame' && tree.r < 0.38) return look(1, TONES.flame, H.warm, 'flower');
    return look(1, TONES.summer[c.tone % 3], H.summer);
  },
  spring(c, tree, p, v) {
    if (tree.r < 0.42) {
      const stillBlooming = p < 0.6 || c.r1 > (p - 0.6) / 0.4;
      if (stillBlooming) {
        const tone = v === 'palash' ? TONES.palash : tree.r < 0.17 ? TONES.white : TONES.pink;
        return look(1, tone, v === 'palash' ? H.warm : H.blossom, 'flower');
      }
      return look(0.9, TONES.spring[0], H.spring);
    }
    const fullness = 0.5 + 0.5 * Math.min(1, p * 1.3 + c.r2 * 0.35);
    return look(fullness, TONES.spring[c.tone % 2], H.spring);
  },
  autumn(c, tree, p) {
    const dom = ['orange', 'red', 'yellow'][Math.floor(tree.r * 3) % 3];
    const turned = c.r1 < 0.2 + 0.95 * p;
    if (!turned) return look(1, TONES.autumn.green, H.autumn);
    const name = c.r3 < 0.68 ? dom : c.r3 < 0.86 ? 'orange' : 'yellow';
    const dropped = c.r2 < Math.max(0, p - 0.3) * 0.75;
    return look(dropped ? 0 : 1 - 0.12 * p, TONES.autumn[name], H.autumn);
  },
  winter(c, tree) {
    if (tree.r > 0.86) return look(0.95, TONES.evergreen, H.snow, 'flower');
    return look(0, TONES.spring[0], H.snow);
  },
  monsoon(c) {
    return look(1.05, TONES.monsoon[c.tone % 3], H.monsoon);
  },
  misty(c) {
    return look(0.95, TONES.misty[c.tone % 2], H.misty);
  },
};

const BASE = {
  summer: {
    sky: '#8ccbe8', skyEdge: '#72b8dc', glow: '#fff6d2',
    sun: [0.72, 0.22, 1, 1], haze: ['#ffe8b2', 0.08], fog: 0,
    clouds: [3, '#ffffff', '#d7e9f3', 1], rays: 0.9,
    trunk: '#1d4a2a', trunkEdge: '#2e6a3c', branch: '#6c4a2a', twig: '#7d5b36', snow: 0,
    rates: { leaf: 0.3, petal: 0, snow: 0, rain: 0, pollen: 30, bokeh: 9 },
    birds: 'small', lightning: 0, droplets: 0,
    fallColors: [TONES.summer[0].fill, TONES.summer[2].fill],
  },
  spring: {
    sky: '#a3d6f0', skyEdge: '#8ac6e7', glow: '#fffaf0',
    sun: [0.66, 0.2, 0.9, 0.85], haze: ['#fff0e6', 0.12], fog: 0,
    clouds: [4, '#ffffff', '#dcecf4', 1], rays: 0.7,
    trunk: '#24502f', trunkEdge: '#356f42', branch: '#74533a', twig: '#86664a', snow: 0,
    rates: { leaf: 0, petal: 2.4, snow: 0, rain: 0, pollen: 20, bokeh: 7 },
    birds: 'small', lightning: 0, droplets: 0,
    fallColors: [TONES.pink.fill, TONES.white.fill],
  },
  autumn: {
    sky: '#94c2dc', skyEdge: '#7caecd', glow: '#ffe2b0',
    sun: [0.84, 0.13, 1.1, 0.9], haze: ['#ffcf8c', 0.14], fog: 0,
    clouds: [4, '#fffaf2', '#eadfd0', 1], rays: 1,
    trunk: '#263f2c', trunkEdge: '#3a5a3c', branch: '#5e3f26', twig: '#6e4c30', snow: 0,
    rates: { leaf: 2.2, petal: 0, snow: 0, rain: 0, pollen: 10, bokeh: 8 },
    birds: 'geese', lightning: 0, droplets: 0,
    fallColors: [TONES.autumn.orange.fill, TONES.autumn.red.fill, TONES.autumn.yellow.fill],
  },
  winter: {
    sky: '#cdd9e2', skyEdge: '#b3c4d1', glow: '#f6f7f2',
    sun: [0.86, 0.15, 0.8, 0.45], haze: ['#ebf2fa', 0.1], fog: 0.08,
    clouds: [7, '#eef3f6', '#d3dde5', 1.4], rays: 0.3,
    trunk: '#2b3b39', trunkEdge: '#3f514d', branch: '#3f322a', twig: '#4a3c33', snow: 1,
    rates: { leaf: 0, petal: 0, snow: 16, rain: 0, pollen: 0, bokeh: 3 },
    birds: 'crow', lightning: 0, droplets: 0,
    fallColors: [hex('#ffffff')],
  },
  monsoon: {
    sky: '#93a9b6', skyEdge: '#7a909c', glow: '#d9e3e3',
    sun: [0.75, 0.2, 0.9, 0.18], haze: ['#d2e1e6', 0.08], fog: 0.06,
    clouds: [10, '#a9b8c1', '#8a9ba5', 1.7], rays: 0,
    trunk: '#183d26', trunkEdge: '#24553a', branch: '#4c3524', twig: '#5a4030', snow: 0,
    rates: { leaf: 0.2, petal: 0, snow: 0, rain: 150, pollen: 0, bokeh: 0 },
    birds: null, lightning: 1, droplets: 1,
    fallColors: [TONES.monsoon[0].fill, TONES.monsoon[1].fill],
  },
  misty: {
    sky: '#c4d6dd', skyEdge: '#aabfc8', glow: '#fbf0d6',
    sun: [0.8, 0.18, 1, 0.6], haze: ['#fff0d7', 0.14], fog: 0.16,
    clouds: [2, '#f6f8f8', '#dde6ea', 1.2], rays: 0.6,
    trunk: '#2c4a33', trunkEdge: '#3d6045', branch: '#5b4632', twig: '#6a543f', snow: 0,
    rates: { leaf: 0.15, petal: 0, snow: 0, rain: 0, pollen: 12, bokeh: 5 },
    birds: 'small', lightning: 0, droplets: 0,
    fallColors: [TONES.misty[0].fill],
  },
};

// Flatten a season (+ optional live weather) into numbers and colors the renderer can blend.
export function buildScene(season, weather) {
  const b = BASE[season.key];
  const c = (h) => (Array.isArray(h) ? h : hex(h));
  const env = {
    sky: c(b.sky), skyEdge: c(b.skyEdge), glow: c(b.glow),
    sunX: b.sun[0], sunY: b.sun[1], sunSize: b.sun[2], sunI: b.sun[3],
    haze: c(b.haze[0]), hazeA: b.haze[1], fog: b.fog,
    cloudN: b.clouds[0], cloudFill: c(b.clouds[1]), cloudShade: c(b.clouds[2]), cloudScale: b.clouds[3],
    rays: b.rays, trunk: c(b.trunk), trunkEdge: c(b.trunkEdge), branch: c(b.branch), twig: c(b.twig), snow: b.snow,
    lightning: b.lightning, droplets: b.droplets,
    rates: { ...b.rates },
  };
  // Autumn leaf fall picks up as the season goes on.
  if (season.key === 'autumn') env.rates.leaf *= 0.4 + season.progress * 1.2;
  if (season.key === 'spring') env.rates.petal *= season.progress < 0.7 ? 1 : 0.4;

  let wind = 8;
  if (weather) {
    wind = weather.wind;
    const w = weather.kind;
    const extraClouds = Math.round((weather.cloud / 100) * 6);
    env.cloudN = Math.max(env.cloudN, Math.min(12, env.cloudN + extraClouds));
    env.sunI *= 1 - (weather.cloud / 100) * 0.55;
    env.rays *= 1 - weather.cloud / 120;
    const rain = { drizzle: 50, rain: 130, heavy: 220, storm: 240 }[w] || 0;
    if (rain) {
      env.rates.rain = Math.max(env.rates.rain, rain);
      env.droplets = 1;
      env.rates.pollen = 0; env.rates.bokeh *= 0.3;
      const grey = hex('#a7b4bc');
      env.cloudFill = mixC(env.cloudFill, grey, 0.5);
      env.cloudShade = mixC(env.cloudShade, hex('#8c9aa3'), 0.5);
      env.sky = mixC(env.sky, hex('#9fb1bc'), 0.45);
      env.skyEdge = mixC(env.skyEdge, hex('#8799a5'), 0.45);
      env.cloudN = Math.max(env.cloudN, 8);
      env.cloudScale = Math.max(env.cloudScale, 1.5);
      env.sunI = Math.min(env.sunI, 0.3);
    }
    // A monsoon day that isn't raining right now: wet, glistening, dripping, but no downpour.
    if (!rain && season.key === 'monsoon') {
      env.rates.rain = 0; env.lightning = 0;
      env.sunI = Math.max(env.sunI, 0.55 * (1 - weather.cloud / 160));
      env.rays = 0.4; env.rates.bokeh = 4; env.cloudN = Math.min(env.cloudN, 6);
    }
    if (w === 'storm') env.lightning = 1;
    if (w === 'snow') env.rates.snow = Math.max(env.rates.snow, 28);
    if (w === 'fog') env.fog = Math.max(env.fog, 0.22);
  }

  return {
    season,
    env,
    birds: b.birds,
    fallColors: b.fallColors,
    windMul: 0.6 + Math.min(1.4, wind / 22),
    foliage: (cl, tree) => FOLIAGE[season.key](cl, tree, season.progress, season.variant),
  };
}

export function blendEnv(a, b, t) {
  const out = {};
  for (const k in b) {
    const x = a[k], y = b[k];
    if (Array.isArray(y)) out[k] = mixC(x, y, t);
    else if (typeof y === 'number') out[k] = x + (y - x) * t;
    else if (k === 'rates') { out[k] = {}; for (const r in y) out[k][r] = x[r] + (y[r] - x[r]) * t; }
    else out[k] = y;
  }
  return out;
}
