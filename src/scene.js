// The canopy: procedurally grown trees seen from below, painted as clumps of small leaf dabs
// around a continuous branch network, with wind physics, falling leaves / petals / rain / snow,
// birds and soft clouds.
import { css, blendEnv, TONES } from './palettes.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const LIGHT = { x: 0.55, y: -0.835 }; // where the sunlight comes from

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quad(p0, p1, p2, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y });
  }
  return pts;
}

function almond(path, x, y, len, wid, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const hx = (c * len) / 2, hy = (s * len) / 2, px = -s * wid, py = c * wid;
  path.moveTo(x + hx, y + hy);
  path.quadraticCurveTo(x + px, y + py, x - hx, y - hy);
  path.quadraticCurveTo(x - px, y - py, x + hx, y + hy);
  path.closePath();
}

const jitter = (c, r, amt) => {
  const k = 1 + (r - 0.5) * amt;
  return `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;
};

const LEAF = (() => { const p = new Path2D(); almond(p, 0, 0, 1, 0.46, 0); return p; })();
const PETAL = (() => { const p = new Path2D(); p.ellipse(0, 0, 0.5, 0.36, 0, 0, TAU); return p; })();
const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
};

export class Canopy {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seed = 1608;
    this.t = 0;
    this.pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, speed: 0, active: false };
    this.par = { x: 0, y: 0 };
    this.particles = [];
    this.birds = [];
    this.droplets = [];
    this.flash = 0;
    this.birdTimer = 2;
    this.spawnAcc = { leaf: 0, petal: 0, snow: 0, rain: 0 };
    this.windEnergy = 0;
    this.wind = { x: 1, y: 0, g: 0.5 };
    this.onThunder = null;
    this.scene = null;
    this.mix = 1;
    this.resize();
  }

  // ---------- layout ----------

  resize() {
    const W = innerWidth, H = innerHeight;
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.generate();
    if (this.scene) {
      for (const c of this.clusters) { c.from = null; c.to = this.scene.foliage(c, c.tree); this.paintClump(c, 'to'); }
      this.mix = 1;
      this.paintLooks(1);
    }
  }

  holeR(phi) {
    const { a, b, p } = this.hole;
    const e = (a * b) / Math.hypot(b * Math.cos(phi), a * Math.sin(phi));
    return e * (1 + 0.22 * Math.sin(2 * phi + p[0]) + 0.16 * Math.sin(3 * phi + p[1]) + 0.1 * Math.sin(5 * phi + p[2]));
  }

  holeRatio(x, y) {
    const dx = x - this.cx, dy = y - this.cy;
    return Math.hypot(dx, dy) / this.holeR(Math.atan2(dy, dx));
  }

  generate() {
    const r = mulberry32(this.seed);
    const { W, H } = this;
    const m = Math.min(W, H), M = Math.max(W, H);
    this.m = m; this.M = M;
    this.cx = W / 2; this.cy = H * 0.5;
    this.hole = { a: 0.1 * W + 0.05 * m, b: 0.12 * H + 0.05 * m, p: [r() * TAU, r() * TAU, r() * TAU] };
    this.trees = []; this.clusters = []; this.clouds = [];
    if (W <= 0 || H <= 0) return;
    const depthFactor = (x, y) => clamp(Math.hypot(x - this.cx, y - this.cy) / (0.6 * M), 0, 1.3);

    // Tall trunks lean in from beyond the frame edges and meet near the open sky.
    const n = clamp(Math.round((2 * (W + H)) / (0.5 * m + 0.25 * M)), 6, 11);
    const off = r() * TAU;
    for (let i = 0; i < n; i++) {
      const theta = off + ((i + (r() - 0.5) * 0.55) / n) * TAU;
      const dx = Math.cos(theta), dy = Math.sin(theta);
      const dEdge = Math.min(Math.abs((W / 2) * 1.04 / (dx || 1e-6)), Math.abs((H / 2) * 1.04 / (dy || 1e-6)));
      const base = { x: this.cx + dx * dEdge * 1.15, y: this.cy + dy * dEdge * 1.15 };
      const tipD = this.holeR(theta) * (1.0 + 0.3 * r());
      const tip = { x: this.cx + dx * tipD, y: this.cy + dy * tipD };
      const len = Math.hypot(tip.x - base.x, tip.y - base.y);
      const bend = (r() - 0.5) * 0.18 * len;
      const ctrl = { x: (base.x + tip.x) / 2 - dy * bend, y: (base.y + tip.y) / 2 + dx * bend };
      const w0 = m * (0.045 + 0.025 * r()), w1 = m * 0.007;
      const tree = {
        i, r: r(), r2: r(), r3: r(), theta, len, sx: 0, sy: 0, vx: 0, vy: 0,
        mid: { x: (base.x + tip.x * 2) / 3, y: (base.y + tip.y * 2) / 3 },
        branches: [], nodes: [],
      };
      tree.trunk = quad(base, ctrl, tip, 18).map((p, k) => ({ ...p, s: k / 18, w: lerp(w0, w1, Math.pow(k / 18, 0.75)), df: depthFactor(p.x, p.y) }));
      this.trees.push(tree);

      // Limbs leave the upper trunk and fan out into the crown.
      const nb = 4 + Math.floor(r() * 4);
      for (let j = 0; j < nb; j++) {
        const t = 0.32 + (0.66 * (j + r() * 0.7)) / nb;
        const k = Math.min(17, Math.round(t * 18));
        const p = tree.trunk[k], q = tree.trunk[k + 1];
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        const side = j % 2 ? 1 : -1;
        this.grow(tree, r, p, ang + side * (0.35 + r() * 0.55), len * (0.24 + 0.16 * r()) * (1.15 - 0.45 * t), p.w * 0.6, 1, p.s, depthFactor);
      }
      // …and the very top splits into a small fan.
      const top = tree.trunk[18], pre = tree.trunk[17];
      const topAng = Math.atan2(top.y - pre.y, top.x - pre.x);
      for (let j = 0; j < 3; j++) {
        this.grow(tree, r, top, topAng + (j - 1) * (0.5 + r() * 0.3), len * (0.12 + 0.08 * r()), top.w * 1.2, 2, 1, depthFactor);
      }
    }

    // Leaf clumps hug the branches: one at most nodes, plus fill near (but only near) branches,
    // so sky shows through wherever there are no branches to hold leaves.
    const nodes = this.trees.flatMap((t) => t.nodes);
    const placed = [];
    const tooClose = (x, y, R) => placed.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < (Math.min(p.R, R) * 0.7) ** 2);
    const add = (x, y, R, node) => {
      if (tooClose(x, y, R)) return;
      placed.push({ x, y, R });
      this.clusters.push(this.makeClump(r, x, y, R, node, depthFactor(x, y)));
    };
    for (const nd of nodes) {
      if (nd.depth < 2 || this.holeRatio(nd.x, nd.y) < 0.85) continue;
      const grow = clamp((this.holeRatio(nd.x, nd.y) - 1) / 1.6, 0, 1);
      add(nd.x, nd.y, m * (0.05 + 0.03 * r()) * (0.85 + 0.45 * grow), nd);
    }
    const cell = 0.085 * m;
    for (let gy = -0.04 * H; gy < H * 1.04; gy += cell) {
      for (let gx = -0.04 * W; gx < W * 1.04; gx += cell) {
        const x = gx + (r() - 0.5) * cell, y = gy + (r() - 0.5) * cell;
        const rr = this.holeRatio(x, y);
        if (rr < 0.95) continue;
        let best = null, bd = Infinity;
        for (const nd of nodes) {
          if (nd.depth < 1) continue;
          const d = (nd.x - x) ** 2 + (nd.y - y) ** 2;
          if (d < bd) { bd = d; best = nd; }
        }
        if (!best || Math.sqrt(bd) > m * (0.11 + 0.05 * clamp((rr - 1) / 1.5, 0, 1))) continue;
        const grow = clamp((rr - 1) / 1.6, 0, 1);
        add(x, y, m * (0.055 + 0.03 * r()) * (0.85 + 0.45 * grow), best);
      }
    }
    // Far (near the open sky) first; lower, nearer clumps paint over them.
    this.clusters.sort((a, b) => a.rr - b.rr);

    this.clouds = Array.from({ length: 12 }, (_, i) => this.makeCloud(r, i));
  }

  grow(tree, r, p0, ang, len, w, depth, s0, depthFactor) {
    // Branches stay out of the open sky; only fine twigs may poke a little way in.
    const limit = depth >= 3 ? 0.9 : 1.0;
    let p2 = { x: p0.x + Math.cos(ang) * len, y: p0.y + Math.sin(ang) * len };
    for (let i = 0; i < 6 && this.holeRatio(p2.x, p2.y) < limit; i++) {
      len *= 0.75;
      p2 = { x: p0.x + Math.cos(ang) * len, y: p0.y + Math.sin(ang) * len };
    }
    if (len < this.m * 0.025) return;
    const bend = (r() - 0.5) * 0.5;
    const p1 = { x: (p0.x + p2.x) / 2 - Math.sin(ang) * bend * len * 0.3, y: (p0.y + p2.y) / 2 + Math.cos(ang) * bend * len * 0.3 };
    const s1 = s0 + len / tree.len;
    const w1 = Math.max(this.m * 0.0018, w * 0.35);
    const pts = quad(p0, p1, p2, depth < 3 ? 6 : 4).map((p, k, arr) => {
      const t = k / (arr.length - 1);
      return { ...p, s: lerp(s0, s1, t), w: lerp(w, w1, t), df: depthFactor(p.x, p.y) };
    });
    tree.branches.push({ pts, depth });
    tree.nodes.push({ x: p2.x, y: p2.y, s: s1, depth, tree, ang });
    const mid = pts[Math.floor(pts.length / 2)];
    tree.nodes.push({ x: mid.x, y: mid.y, s: mid.s, depth, tree, ang });
    if (depth >= 4) return;
    const kids = depth <= 2 ? 2 : r() < 0.5 ? 2 : 1;
    for (let j = 0; j < kids; j++) {
      const t = j === 0 ? 1 : 0.4 + 0.4 * r();
      const k = Math.round(t * (pts.length - 1));
      const side = j % 2 ? 1 : -1;
      // A child is never wider than its parent where it leaves it, so joints read as one branch.
      this.grow(tree, r, pts[k], ang + side * (0.3 + r() * 0.45), len * (0.6 + 0.15 * r()), pts[k].w * 0.85, depth + 1, pts[k].s, depthFactor);
    }
  }

  makeClump(r, x, y, R, node, df) {
    const toSky = Math.atan2(this.cy - y, this.cx - x);
    return {
      x, y, r: R, rr: this.holeRatio(x, y), df, node, tree: node.tree,
      sf: Math.pow(clamp(node.s, 0, 1.4), 1.5),
      toSky, along: node.ang ?? toSky, seed: (r() * 1e9) | 0,
      phase: r() * TAU, r1: r(), r2: r(), r3: r(),
      ox: 0, oy: 0, vx: 0, vy: 0, en: 0,
      from: null, to: null, spriteFrom: null, spriteTo: null, front: null,
      look: null, paint: null, fadeIn: 1, fadeOut: 0,
    };
  }

  // Paint a clump into its own small canvas: hundreds of leaf dabs, shadowed toward the trunk,
  // lighter and sunlit toward the sky.
  paintClump(c, which) {
    const L = c[which];
    const key = which === 'to' ? 'spriteTo' : 'spriteFrom';
    if (!L || L.s < 0.02) { c[key] = null; if (which === 'to') c.front = null; return; }
    const m = this.m, R = c.r;
    const E = R * 1.35, sc = Math.min(1.25, this.dpr);
    const cv = makeCanvas(2 * E * sc, 2 * E * sc);
    const g = cv.getContext('2d');
    g.setTransform(sc, 0, 0, sc, E * sc, E * sc);
    const r = mulberry32(c.seed);
    const sky = { x: Math.cos(c.toSky), y: Math.sin(c.toSky) };
    const sunX = (sky.x + LIGHT.x) / 2, sunY = (sky.y + LIGHT.y) / 2;
    const flower = L.mt === 'flower';
    const dab = m * 0.017;
    const green = flower ? TONES.summer : null;
    const n = Math.round(((Math.PI * R * R) / (dab * dab * 0.5)) * 1.5);
    const layers = [['deep', 0.3], ['mid', 0.34], ['light', 0.22], ['glow', 0.14]];
    const ca = Math.cos(c.along), sa = Math.sin(c.along);
    for (const [tone, share] of layers) {
      const count = Math.round(n * share);
      const paths = new Map();
      for (let i = 0; i < count; i++) {
        let px, py;
        const u = r();
        if (tone === 'deep') { const a = r() * TAU, d = Math.sqrt(u) * R * 0.85; px = Math.cos(a) * d - sky.x * R * 0.15; py = Math.sin(a) * d - sky.y * R * 0.15; }
        else if (tone === 'mid') { const a = r() * TAU, d = Math.sqrt(u) * R; px = Math.cos(a) * d; py = Math.sin(a) * d; }
        else {
          const spread = tone === 'glow' ? 1.1 : 1.6;
          const a = Math.atan2(sunY, sunX) + (r() + r() + r() - 1.5) * spread;
          const d = R * (tone === 'glow' ? 0.55 + 0.5 * Math.sqrt(u) : 0.3 + 0.75 * Math.sqrt(u));
          px = Math.cos(a) * d; py = Math.sin(a) * d;
        }
        // Stretch a little along the branch the clump hangs from.
        const lx = px * ca + py * sa, ly = -px * sa + py * ca;
        const qx = lx * 1.18, qy = ly * 0.86;
        const fx = qx * ca - qy * sa, fy = qx * sa + qy * ca;
        const useGreen = green && r() < L.green;
        const col = useGreen ? green[tone] : L[tone];
        const shade = (r() * 4) | 0; // a few lightness variations per tone, for a painted feel
        const k = (useGreen ? 'g' : 'c') + shade;
        if (!paths.has(k)) paths.set(k, { p: new Path2D(), col: jitter(col, shade / 3, 0.14) });
        const petal = flower && !useGreen;
        const len = dab * (0.75 + 0.55 * r()) * (petal ? 0.8 : 1);
        const ang = Math.atan2(fy, fx) + (r() - 0.5) * 1.8;
        almond(paths.get(k).p, fx, fy, len, len * (petal ? 0.38 : 0.24), ang);
      }
      for (const { p, col } of paths.values()) { g.fillStyle = col; g.fill(p); }
    }
    c[key] = { cv, E, sc };

    // A few dabs painted over the branches, so twigs disappear into the leaves.
    if (which === 'to') {
      const lightP = new Path2D(), glowP = new Path2D();
      for (let i = 0; i < Math.round(n * 0.08); i++) {
        const a = Math.atan2(sunY, sunX) + (r() + r() - 1) * 2.2, d = R * (0.2 + 0.75 * Math.sqrt(r()));
        const len = dab * (0.75 + 0.5 * r());
        almond(r() < 0.6 ? lightP : glowP, Math.cos(a) * d, Math.sin(a) * d, len, len * 0.26, a + (r() - 0.5) * 1.8);
      }
      c.front = { lightP, glowP };
    }
  }

  makeCloud(r, i) {
    const w = (0.22 + 0.22 * r()) * this.M, h = w * 0.55;
    const sc = 0.5;
    const puffs = [];
    const k = 16 + Math.floor(r() * 14);
    for (let j = 0; j < k; j++) {
      const t = r();
      const x = (t - 0.5) * w * 0.8;
      const dome = Math.cos((t - 0.5) * Math.PI); // taller in the middle
      const y = h * 0.15 - r() * h * 0.45 * dome;
      puffs.push({ x, y, r: w * (0.07 + 0.1 * r()) * (0.6 + 0.6 * dome) });
    }
    const paint = (fill, shade) => {
      const cv = makeCanvas((w * 1.4) * sc, (h * 1.6) * sc);
      const g = cv.getContext('2d');
      g.setTransform(sc, 0, 0, sc, cv.width / 2, cv.height * 0.62);
      for (const p of puffs) {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, css(fill, 0.85)); gr.addColorStop(0.55, css(fill, 0.55)); gr.addColorStop(1, css(fill, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
      }
      // Soft shading on the undersides.
      g.globalCompositeOperation = 'source-atop';
      const sh = g.createLinearGradient(0, -h * 0.4, 0, h * 0.35);
      sh.addColorStop(0, css(shade, 0)); sh.addColorStop(1, css(shade, 0.5));
      g.fillStyle = sh; g.fillRect(-w, -h, w * 2, h * 2);
      return cv;
    };
    return {
      x: r() * this.W, y: this.cy + (r() - 0.5) * this.H * 0.5, w, h, speed: 4 + r() * 8, vis: 0, i,
      white: paint([255, 255, 255], [196, 214, 228]), grey: paint([205, 212, 217], [120, 134, 145]),
    };
  }

  // ---------- scene changes ----------

  setScene(scene, instant = false) {
    const prev = this.scene;
    this.scene = scene;
    const same = (a, b) => a && b && a.s === b.s && a.mid === b.mid && a.mt === b.mt && a.green === b.green && a.glow === b.glow;
    if (!prev || instant) {
      this.envFrom = this.envTo = this.env = scene.env;
      this.mix = 1;
      for (const c of this.clusters) {
        const next = scene.foliage(c, c.tree);
        if (!same(c.to, next)) { c.to = next; this.paintClump(c, 'to'); }
        c.from = null; c.spriteFrom = null;
      }
      for (const cl of this.clouds) cl.vis = cl.i < scene.env.cloudN ? 1 : 0;
      this.paintLooks(1);
      return;
    }
    this.envFrom = this.env;
    this.envTo = scene.env;
    this.mix = 0;
    for (const c of this.clusters) {
      const next = scene.foliage(c, c.tree);
      if (same(c.to, next)) { c.from = null; c.spriteFrom = null; continue; }
      c.from = c.to; c.spriteFrom = c.spriteTo;
      c.to = next; this.paintClump(c, 'to');
    }
    this.paintLooks(0);
  }

  paintLooks(e) {
    for (const c of this.clusters) {
      const a = c.from, b = c.to;
      const bVisible = b && b.s > 0.02;
      c.fadeIn = a ? e : 1;
      c.fadeOut = a ? (bVisible ? 1 : 1 - e) : 0;
      if (e >= 1) { c.from = null; c.spriteFrom = null; c.fadeOut = 0; }
      const L = bVisible ? b : a;
      c.look = L;
      c.paint = bVisible ? { light: css(b.light), glow: css(b.glow) } : null;
    }
  }

  // ---------- simulation ----------

  gust() {
    const t = this.t;
    const g = 0.55 + 0.45 * (0.6 * Math.sin(t * 0.37) + 0.4 * Math.sin(t * 0.91 + 1.3));
    return g * (this.scene ? this.scene.windMul : 1);
  }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    if (innerWidth !== this.W || innerHeight !== this.H) this.resize();
    const P = this.pointer;
    if (this.mix < 1) {
      this.mix = Math.min(1, this.mix + dt / 2.6);
      const e = ease(this.mix);
      this.env = blendEnv(this.envFrom, this.envTo, e);
      this.paintLooks(e);
    }
    const env = this.env;
    if (!env) return;

    const decay = Math.exp(-dt * 7);
    P.vx *= decay; P.vy *= decay;
    P.speed = Math.hypot(P.vx, P.vy);
    const tx = P.active ? (P.x / this.W - 0.5) * 2 : 0, ty = P.active ? (P.y / this.H - 0.5) * 2 : 0;
    this.par.x += (tx - this.par.x) * Math.min(1, dt * 2);
    this.par.y += (ty - this.par.y) * Math.min(1, dt * 2);

    const gust = this.gust();
    const wa = 0.35 + 0.4 * Math.sin(this.t * 0.05);
    this.wind = { x: Math.cos(wa), y: Math.sin(wa), g: gust };
    const R2 = (0.24 * this.m) ** 2;

    for (const tr of this.trees) {
      const d2 = (tr.mid.x - P.x) ** 2 + (tr.mid.y - P.y) ** 2;
      const f = P.active ? Math.exp(-d2 / (0.5 * this.m) ** 2) : 0;
      const wave = 0.5 + 0.5 * Math.sin(this.t * 0.8 + tr.theta * 2);
      const fx = P.vx * f * 0.07 + this.wind.x * gust * wave * 45;
      const fy = P.vy * f * 0.07 + this.wind.y * gust * wave * 45;
      tr.vx += (fx - 12 * tr.sx - 3.2 * tr.vx) * dt; tr.sx += tr.vx * dt;
      tr.vy += (fy - 12 * tr.sy - 3.2 * tr.vy) * dt; tr.sy += tr.vy * dt;
    }

    let energy = 0;
    for (const c of this.clusters) {
      const dx = c.x - P.x, dy = c.y - P.y;
      const f = P.active ? Math.exp(-(dx * dx + dy * dy) / R2) : 0;
      const wave = 0.5 + 0.5 * Math.sin(this.t * 1.25 - (c.x * 0.0035 + c.y * 0.0018) + c.phase * 0.4);
      const fx = P.vx * f * 0.5 + this.wind.x * gust * wave * 110;
      const fy = P.vy * f * 0.5 + this.wind.y * gust * wave * 110;
      c.vx += (fx - 55 * c.ox - 7.5 * c.vx) * dt; c.ox += c.vx * dt;
      c.vy += (fy - 55 * c.oy - 7.5 * c.vy) * dt; c.oy += c.vy * dt;
      const lim = c.r * 0.16;
      c.ox = clamp(c.ox, -lim, lim); c.oy = clamp(c.oy, -lim, lim);
      const ein = f * Math.min(1, P.speed / 1400);
      c.en = Math.max(c.en * Math.exp(-dt * 2.5), ein);
      if (ein > 0.05) energy = Math.max(energy, ein);
      if (c.en > 0.3 && Math.random() < c.en * dt * 2.4) this.shake(c);
    }
    this.windEnergy = clamp(energy * 1.4 + gust * 0.14, 0, 1);

    this.spawnAmbient(dt, env);
    this.updateParticles(dt);
    this.updateBirds(dt);
    this.updateClouds(dt, env);
    this.updateDroplets(dt, env);
    if (env.lightning > 0.5 && Math.random() < dt / 12) this.strike();
    this.flash = Math.max(0, this.flash - dt * 2.4);
    if (this.flash2 && this.t > this.flash2) { this.flash = 0.75; this.flash2 = 0; }

    this.draw();
  }

  strike() {
    this.flash = 1;
    this.flash2 = this.t + 0.12 + Math.random() * 0.15;
    if (this.onThunder) this.onThunder(0.5 + Math.random() * 2);
  }

  pos(c) {
    const tr = c.tree;
    return {
      x: c.x + tr.sx * c.sf + c.ox - this.par.x * c.df * 12,
      y: c.y + tr.sy * c.sf + c.oy - this.par.y * c.df * 12,
    };
  }

  // A shaken clump drops something that fits the season and the weather.
  shake(c) {
    const { x, y } = this.pos(c);
    const L = c.look;
    if (!L || L.s < 0.1) {
      if (this.env.snow > 0.5) for (let i = 0; i < 3; i++) this.addFall('snow', x + (Math.random() - 0.5) * c.r, y, [255, 255, 255], 0.7);
      return;
    }
    if (this.env.rates.rain > 30) {
      for (let i = 0; i < 2; i++) this.addFall('drip', x + (Math.random() - 0.5) * c.r, y, [210, 232, 240], 1);
      return;
    }
    if (L.mt === 'flower') this.addFall('petal', x, y, L.light);
    else this.addFall('leaf', x, y, Math.random() < 0.5 ? L.mid : L.light);
  }

  addFall(type, x, y, color, scale = 1) {
    if (this.particles.length > 700) return;
    const m = this.m;
    const sz = { leaf: 0.02, petal: 0.012, snow: 0.004, drip: 0.004 }[type] * m * (0.7 + Math.random() * 0.6) * scale;
    this.particles.push({
      type, rx: x - this.cx, ry: y - this.cy, dx: 0, dy: 0, k: 0, x, y,
      kv: { leaf: 0.22, petal: 0.25, snow: 0.16, drip: 0.9 }[type] * (0.7 + Math.random() * 0.6),
      sz, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 3, fs: 2 + Math.random() * 4, ph: Math.random() * TAU,
      color: css(color), age: 0,
    });
  }

  spawnAmbient(dt, env) {
    const acc = this.spawnAcc;
    const pick = (flower) => {
      if (!this.clusters.length) return null;
      for (let i = 0; i < 10; i++) {
        const c = this.clusters[(Math.random() * this.clusters.length) | 0];
        if (c.look && c.look.s > 0.3 && (c.look.mt === 'flower') === flower) return c;
      }
      return null;
    };
    acc.leaf += env.rates.leaf * dt;
    while (acc.leaf >= 1) {
      acc.leaf--;
      const c = pick(false);
      if (c) { const { x, y } = this.pos(c); this.addFall('leaf', x, y, Math.random() < 0.5 ? c.look.mid : c.look.light); }
    }
    acc.petal += env.rates.petal * dt;
    while (acc.petal >= 1) {
      acc.petal--;
      const c = pick(true);
      if (c) { const { x, y } = this.pos(c); this.addFall('petal', x, y, c.look.light); }
    }
    acc.snow += env.rates.snow * dt;
    while (acc.snow >= 1) {
      acc.snow--;
      const x = this.cx + (Math.random() - 0.5) * this.W * 0.9, y = this.cy + (Math.random() - 0.5) * this.H * 0.9;
      this.addFall('snow', lerp(this.cx, x, 0.7), lerp(this.cy, y, 0.7), [255, 255, 255]);
    }
    acc.rain += env.rates.rain * dt;
    while (acc.rain >= 1) {
      acc.rain--;
      if (this.particles.length > 900) break;
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 0.55 * this.M;
      this.particles.push({ type: 'rain', rx: Math.cos(a) * d * 0.6, ry: Math.sin(a) * d * 0.6, k: 0, age: 0, w: 0.6 + Math.random() });
    }
  }

  updateParticles(dt) {
    const P = this.pointer, w = this.wind, t = this.t;
    const R2 = (0.18 * this.m) ** 2;
    const out = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.type === 'rain') {
        p.k += dt * (1.6 + p.k * 3.2);
        if (p.k < 2.4) out.push(p);
        continue;
      }
      p.k += dt * p.kv * (1 + p.k * 0.6);
      const x = this.cx + p.rx * (1 + p.k * 0.5) + p.dx, y = this.cy + p.ry * (1 + p.k * 0.5) + p.dy;
      const f = P.active ? Math.exp(-((x - P.x) ** 2 + (y - P.y) ** 2) / R2) : 0;
      const sway = p.type === 'drip' ? 0 : Math.sin(t * 1.7 + p.ph) * 22;
      p.dx += (w.x * w.g * 24 + sway + P.vx * f * 0.35) * dt;
      p.dy += (w.y * w.g * 24 + P.vy * f * 0.35) * dt;
      p.rot += p.vr * dt;
      p.x = x; p.y = y;
      const off = x < -100 || y < -100 || x > this.W + 100 || y > this.H + 100;
      if (p.k < 2.6 && !off) out.push(p);
    }
    this.particles = out;
  }

  updateBirds(dt) {
    this.birdTimer -= dt;
    const kind = this.scene && this.scene.birds;
    if (this.birdTimer <= 0) {
      this.birdTimer = kind === 'geese' ? 22 + Math.random() * 15 : kind === 'crow' ? 25 + Math.random() * 20 : 10 + Math.random() * 10;
      if (kind) this.spawnFlock(kind);
    }
    for (const b of this.birds) { b.x += b.vx * dt; b.y += b.vy * dt; b.ph += dt * b.flap; }
    const pad = 200;
    this.birds = this.birds.filter((b) => b.x > -pad && b.y > -pad && b.x < this.W + pad && b.y < this.H + pad);
  }

  spawnFlock(kind) {
    const m = this.m, M = this.M;
    const a = Math.random() * TAU;
    const start = { x: this.cx - Math.cos(a) * M * 0.62, y: this.cy - Math.sin(a) * M * 0.62 };
    const heading = a + (Math.random() - 0.5) * 0.4;
    const speed = M * (kind === 'crow' ? 0.045 : 0.055);
    const vx = Math.cos(heading) * speed, vy = Math.sin(heading) * speed;
    const add = (ox, oy, size, flap) => this.birds.push({ x: start.x + ox, y: start.y + oy, vx, vy, heading, size, flap, ph: Math.random() * TAU });
    if (kind === 'geese') {
      const n = 5 + Math.floor(Math.random() * 4), sp = m * 0.03;
      add(0, 0, m * 0.012, 5);
      for (let i = 1; i <= n; i++) {
        const side = i % 2 ? 1 : -1, row = Math.ceil(i / 2);
        add(-Math.cos(heading) * row * sp - side * Math.sin(heading) * row * sp * 0.75,
          -Math.sin(heading) * row * sp + side * Math.cos(heading) * row * sp * 0.75, m * 0.012, 5 + Math.random());
      }
    } else if (kind === 'crow') {
      add(0, 0, m * 0.022, 3.2);
    } else {
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) add((Math.random() - 0.5) * m * 0.1, (Math.random() - 0.5) * m * 0.14, m * (0.015 + Math.random() * 0.005), 6 + Math.random() * 3);
    }
  }

  updateClouds(dt, env) {
    for (const c of this.clouds) {
      c.x += c.speed * dt * (this.scene ? this.scene.windMul : 1);
      const span = c.w * env.cloudScale;
      if (c.x - span > this.W + 40) { c.x = -span; c.y = this.cy + (Math.random() - 0.5) * this.H * 0.5; }
      const target = c.i < env.cloudN ? 1 : 0;
      c.vis += (target - c.vis) * Math.min(1, dt * 0.6);
    }
  }

  updateDroplets(dt, env) {
    if (env.droplets > 0.5 && this.droplets.length < 22 && Math.random() < dt * 1.5) {
      this.droplets.push({ x: Math.random() * this.W, y: Math.random() * this.H, r: 3 + Math.random() * 10, age: 0, life: 3 + Math.random() * 5 });
    }
    for (const d of this.droplets) { d.age += dt; d.y += dt * (d.r > 10 ? 6 : 0); }
    this.droplets = this.droplets.filter((d) => d.age < d.life);
  }

  // ---------- drawing ----------

  draw() {
    const { ctx, dpr, W, H, env, M } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const sky = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, M * 0.8);
    sky.addColorStop(0, css(env.skyIn));
    sky.addColorStop(1, css(env.skyOut));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (this.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${(this.flash * 0.55).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }

    this.drawClouds(env);
    this.drawBirds();
    for (const c of this.clusters) this.drawClump(c);
    for (const tr of this.trees) this.drawTree(tr, env);
    for (const c of this.clusters) this.drawFront(c);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (env.tintA > 0.005) { ctx.fillStyle = css(env.tint, env.tintA); ctx.fillRect(0, 0, W, H); }
    this.drawParticles();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (env.fog > 0.005) { ctx.fillStyle = `rgba(242,246,247,${env.fog.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(240,245,255,${(this.flash * 0.3).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    this.drawDroplets();
  }

  drawClouds(env) {
    const { ctx } = this;
    for (const c of this.clouds) {
      if (c.vis < 0.01) continue;
      const s = env.cloudScale;
      const w = c.white.width * 2 * s, h = c.white.height * 2 * s;
      const x = c.x - this.par.x * 4 - w / 2, y = c.y - this.par.y * 4 - h * 0.62;
      if (env.cloudGrey < 0.98) { ctx.globalAlpha = c.vis * (1 - env.cloudGrey); ctx.drawImage(c.white, x, y, w, h); }
      if (env.cloudGrey > 0.02) { ctx.globalAlpha = c.vis * env.cloudGrey; ctx.drawImage(c.grey, x, y, w, h); }
    }
    ctx.globalAlpha = 1;
  }

  drawBirds() {
    const { ctx, dpr } = this;
    ctx.fillStyle = '#1b2420';
    for (const b of this.birds) {
      const s = b.size;
      const span = 0.55 + 0.45 * Math.abs(Math.cos(b.ph));
      const lift = Math.sin(b.ph) * 0.35;
      const c = Math.cos(b.heading + Math.PI / 2), sn = Math.sin(b.heading + Math.PI / 2);
      ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * b.x, dpr * b.y);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.2, s * 0.55, 0, 0, TAU);
      for (const side of [-1, 1]) {
        ctx.moveTo(0, -s * 0.15);
        ctx.quadraticCurveTo(side * s * 0.6 * span, -s * (0.55 + lift), side * s * 1.2 * span, -s * (0.05 + lift));
        ctx.quadraticCurveTo(side * s * 0.55 * span, s * 0.05, 0, s * 0.2);
      }
      ctx.fill();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clumpMatrix(c, s) {
    const { x, y } = this.pos(c);
    const a = (c.ox / c.r) * 0.15 + c.en * 0.06 * Math.sin(this.t * 24 + c.phase);
    const k = s * (1 + c.en * 0.025 * Math.sin(this.t * 31 + c.phase * 2)) * this.dpr;
    return [Math.cos(a) * k, Math.sin(a) * k, x * this.dpr, y * this.dpr];
  }

  drawClump(c) {
    const { ctx } = this;
    const layers = [];
    if (c.spriteFrom && c.fadeOut > 0.01) layers.push([c.spriteFrom, c.from.s, c.fadeOut]);
    if (c.spriteTo && c.fadeIn > 0.01) layers.push([c.spriteTo, c.to.s, c.fadeIn]);
    for (const [sp, s, alpha] of layers) {
      const M = this.clumpMatrix(c, s / sp.sc);
      ctx.setTransform(M[0], M[1], -M[1], M[0], M[2], M[3]);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sp.cv, -sp.E * sp.sc, -sp.E * sp.sc);
    }
    ctx.globalAlpha = 1;
  }

  drawFront(c) {
    if (!c.front || !c.paint || c.fadeIn < 0.01) return;
    const { ctx } = this;
    const M = this.clumpMatrix(c, c.to.s);
    ctx.setTransform(M[0], M[1], -M[1], M[0], M[2], M[3]);
    ctx.globalAlpha = c.fadeIn;
    ctx.fillStyle = c.paint.light; ctx.fill(c.front.lightP);
    ctx.fillStyle = c.paint.glow; ctx.fill(c.front.glowP);
    ctx.globalAlpha = 1;
  }

  displaced(pts, tr) {
    const out = new Array(pts.length);
    const px = this.par.x * 12, py = this.par.y * 12;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const f = Math.pow(clamp(p.s, 0, 1.4), 1.5);
      out[i] = { x: p.x + tr.sx * f - px * p.df, y: p.y + tr.sy * f - py * p.df, w: p.w };
    }
    return out;
  }

  // Tapered polygon along a polyline with per-point widths. band > 0 draws only a strip on the lit side.
  ribbon(pts, band = 0, widthMul = 1) {
    const { ctx } = this;
    const n = pts.length;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (nx * LIGHT.x + ny * LIGHT.y < 0) { nx = -nx; ny = -ny; }
      const w = (pts[i].w * widthMul) / 2;
      const p = pts[i];
      L.push({ x: p.x + nx * w, y: p.y + ny * w });
      R.push(band ? { x: p.x + nx * w * (1 - band * 2), y: p.y + ny * w * (1 - band * 2) } : { x: p.x - nx * w, y: p.y - ny * w });
    }
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i].x, L[i].y);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
    ctx.closePath();
    ctx.fill();
  }

  drawTree(tr, env) {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bark = css(env.bark);
    const snow = env.snow;
    ctx.fillStyle = bark;
    // One continuous network: every branch the same bark color, rounded where it leaves its parent.
    for (const b of tr.branches) {
      const pts = this.displaced(b.pts, tr);
      this.ribbon(pts);
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, pts[0].w / 2, 0, TAU); ctx.fill();
    }
    if (snow > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${(snow * 0.95).toFixed(3)})`;
      // Snow sits only on branches thick enough to hold it; thin twigs stay dark and unbroken.
      for (const b of tr.branches) if (b.pts[0].w > 3) this.ribbon(this.displaced(b.pts, tr), 0.22);
    }
    const trunk = this.displaced(tr.trunk, tr);
    ctx.fillStyle = bark;
    this.ribbon(trunk);
    // Lit edge of the bark, plus pale birch-like bands on some trunks.
    ctx.fillStyle = snow > 0.5 ? `rgba(255,255,255,${(snow * 0.9).toFixed(3)})` : css(env.barkLight);
    this.ribbon(trunk, 0.16);
    if (tr.r3 < 0.35) {
      ctx.fillStyle = 'rgba(232,226,212,0.85)';
      const r = mulberry32(tr.i * 97 + 3);
      for (let k = 1; k < trunk.length - 4; k++) {
        if (r() > 0.32) continue;
        const a = trunk[k], b = trunk[k + 1];
        const seg = [a, { x: lerp(a.x, b.x, 0.5 + r() * 0.5), y: lerp(a.y, b.y, 0.5 + r() * 0.5), w: b.w }];
        this.ribbon(seg, 0, 0.75 + r() * 0.25);
      }
    }
  }

  drawParticles() {
    const { ctx, dpr } = this;
    for (const p of this.particles) {
      if (p.type === 'rain') {
        const k0 = Math.max(0, p.k - 0.14);
        const x0 = this.cx + p.rx * (1 + k0 * 1.9), y0 = this.cy + p.ry * (1 + k0 * 1.9);
        const x1 = this.cx + p.rx * (1 + p.k * 1.9), y1 = this.cy + p.ry * (1 + p.k * 1.9);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = `rgba(232,242,248,${(Math.min(1, p.age * 4) * 0.55).toFixed(3)})`;
        ctx.lineWidth = p.w * (0.8 + p.k * 1.1);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        continue;
      }
      const size = p.sz * (1 + p.k * 2.2);
      const fadeIn = Math.min(1, p.age * 3), fadeOut = clamp((2.6 - p.k) / 0.6, 0, 1);
      ctx.globalAlpha = fadeIn * fadeOut;
      if (p.type === 'snow' || p.type === 'drip') {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = p.type === 'snow' ? 'rgba(255,255,255,0.92)' : 'rgba(215,235,245,0.7)';
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TAU); ctx.fill();
        continue;
      }
      const flip = Math.cos(this.t * p.fs + p.ph);
      const co = Math.cos(p.rot) * size * dpr, si = Math.sin(p.rot) * size * dpr;
      ctx.setTransform(co, si, -si * flip, co * flip, p.x * dpr, p.y * dpr);
      ctx.fillStyle = p.color;
      ctx.fill(p.type === 'petal' ? PETAL : LEAF);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  drawDroplets() {
    const { ctx } = this;
    for (const d of this.droplets) {
      const a = Math.min(1, d.age * 2) * Math.min(1, (d.life - d.age) / 1.2);
      const g = ctx.createRadialGradient(d.x - d.r * 0.25, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r);
      g.addColorStop(0, `rgba(255,255,255,${(0.04 * a).toFixed(3)})`);
      g.addColorStop(0.75, `rgba(255,255,255,${(0.1 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,255,255,${(0.3 * a).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${(0.55 * a).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(d.x - d.r * 0.35, d.y - d.r * 0.4, d.r * 0.22, d.r * 0.12, -0.6, 0, TAU); ctx.fill();
    }
  }
}
