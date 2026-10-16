// The canopy: procedurally grown trees seen from below, wind physics, particles, light.
import { css, mixC, blendEnv } from './palettes.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const LIGHT = { x: 0.55, y: -0.835 }; // direction the sunlight comes from, for shading clusters

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

const LEAF = (() => { const p = new Path2D(); almond(p, 0, 0, 1, 0.46, 0); return p; })();
const PETAL = (() => { const p = new Path2D(); p.ellipse(0, 0, 0.5, 0.36, 0, 0, TAU); return p; })();

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
    this.birdTimer = 3;
    this.spawnAcc = { leaf: 0, petal: 0, snow: 0, rain: 0 };
    this.windEnergy = 0;
    this.onThunder = null;
    this.scene = null;
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
      for (const c of this.clusters) c.look = c.from = c.to = this.scene.foliage(c, c.tree);
      this.paintLooks(1);
    }
  }

  holeR(phi) {
    const { a, b, p } = this.hole;
    const e = (a * b) / Math.hypot(b * Math.cos(phi), a * Math.sin(phi));
    return e * (1 + 0.2 * Math.sin(2 * phi + p[0]) + 0.15 * Math.sin(3 * phi + p[1]) + 0.1 * Math.sin(5 * phi + p[2]) + 0.05 * Math.sin(8 * phi + p[0] * 2));
  }

  // How far outside the sky hole a point sits (1 = on the edge).
  holeRatio(x, y) {
    const dx = x - this.cx, dy = y - this.cy;
    return Math.hypot(dx, dy) / this.holeR(Math.atan2(dy, dx));
  }

  generate() {
    const r = mulberry32(this.seed);
    const { W, H } = this;
    const m = Math.min(W, H), M = Math.max(W, H);
    this.m = m; this.M = M;
    this.cx = W / 2; this.cy = H * 0.49;
    this.hole = { a: 0.15 * W + 0.06 * m, b: 0.15 * H + 0.06 * m, p: [r() * TAU, r() * TAU, r() * TAU] };
    const depthFactor = (x, y) => clamp(Math.hypot(x - this.cx, y - this.cy) / (0.6 * M), 0, 1.3);

    // Trees lean in from beyond the frame edges toward the open sky.
    const n = clamp(Math.round((2 * (W + H)) / (0.55 * m + 0.25 * M)), 6, 10);
    const off = r() * TAU;
    this.trees = [];
    for (let i = 0; i < n; i++) {
      const theta = off + ((i + (r() - 0.5) * 0.5) / n) * TAU;
      const dx = Math.cos(theta), dy = Math.sin(theta);
      const dEdge = Math.min(Math.abs((W / 2) * 1.04 / (dx || 1e-6)), Math.abs((H / 2) * 1.04 / (dy || 1e-6)));
      const base = { x: this.cx + dx * dEdge * 1.1, y: this.cy + dy * dEdge * 1.1 };
      const tipD = this.holeR(theta) * (1.45 + 0.3 * r());
      const tip = { x: this.cx + dx * tipD, y: this.cy + dy * tipD };
      const len = Math.hypot(tip.x - base.x, tip.y - base.y);
      const bend = (r() - 0.5) * 0.3 * len;
      const ctrl = { x: (base.x + tip.x) / 2 - dy * bend, y: (base.y + tip.y) / 2 + dx * bend };
      const tree = {
        i, r: r(), theta, len, sx: 0, sy: 0, vx: 0, vy: 0,
        w0: m * (0.08 + 0.04 * r()), w1: m * 0.026,
        mid: { x: (base.x + tip.x * 2) / 3, y: (base.y + tip.y * 2) / 3 },
        branches: [], nodes: [],
      };
      tree.trunk = quad(base, ctrl, tip, 16).map((p, k) => ({ ...p, s: k / 16, df: depthFactor(p.x, p.y) }));
      this.trees.push(tree);

      const nb = 4 + Math.floor(r() * 3);
      for (let j = 0; j < nb; j++) {
        const t = 0.3 + (0.7 * (j + r() * 0.6)) / nb;
        const k = Math.min(15, Math.floor(t * 16));
        const p = tree.trunk[k], q = tree.trunk[k + 1];
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        const side = j % 2 ? 1 : -1;
        const w = lerp(tree.w0, tree.w1, Math.pow(t, 0.8)) * 0.55;
        this.grow(tree, r, p, ang + side * (0.2 + r() * 0.5), len * (0.38 + 0.2 * r()) * (1.2 - 0.4 * t), w, 1, t, depthFactor);
      }
    }

    // Leaf clusters: one at many branch tips, plus a fill pass so the canopy reads as a full ring.
    this.clusters = [];
    const allNodes = this.trees.flatMap((t) => t.nodes);
    const addCluster = (x, y, rad, node, top) => {
      const c = this.makeCluster(r, x, y, rad, node, top);
      c.df = depthFactor(x, y);
      this.clusters.push(c);
    };
    for (const nd of allNodes) {
      if ((nd.depth === 2 || nd.depth === 3) && r() < 0.4 && this.holeRatio(nd.x, nd.y) > 0.8) {
        addCluster(nd.x, nd.y, m * (0.045 + 0.03 * r()) * (nd.depth === 2 ? 1.2 : 1), nd, nd.depth === 3);
      }
    }
    const cell = 0.11 * m;
    const sector = Math.PI / n;
    for (let gy = -0.04 * H; gy < H * 1.04; gy += cell) {
      for (let gx = -0.04 * W; gx < W * 1.04; gx += cell) {
        const x = gx + (r() - 0.5) * cell * 0.9, y = gy + (r() - 0.5) * cell * 0.9;
        const rr = this.holeRatio(x, y);
        if (rr < 1.02) continue;
        // Sky channels between neighbouring crowns, like the gaps in the reference.
        const phi = Math.atan2(y - this.cy, x - this.cx);
        let ad = Infinity;
        for (const t of this.trees) ad = Math.min(ad, Math.abs(Math.atan2(Math.sin(phi - t.theta), Math.cos(phi - t.theta))));
        const frac = ad / sector;
        if (frac > 0.74 && r() < 0.88) continue;
        if (r() < 0.07) continue;
        let best = null, bd = Infinity;
        for (const nd of allNodes) {
          const d = (nd.x - x) ** 2 + (nd.y - y) ** 2;
          if (d < bd) { bd = d; best = nd; }
        }
        const grow = clamp((rr - 1) / 1.6, 0, 1);
        addCluster(x, y, m * (0.075 + 0.04 * r()) * (0.8 + 0.5 * grow), best, false);
      }
    }
    // Far clusters (near the sky hole) first, near ones (frame edges) last.
    const dist = (c) => Math.hypot(c.x - this.cx, c.y - this.cy) / this.holeR(Math.atan2(c.y - this.cy, c.x - this.cx));
    // Draw in groups (per tree, per distance tier): a group shares one cream outline, so clusters
    // merge into big leaf masses and the cream lines only appear between layers.
    // Outer (frame-edge) layers first and darker; the layer bordering the sky last and lightest.
    for (const c of this.clusters) { const q = dist(c); c.tier = q < 1.35 ? 0 : q < 1.9 ? 1 : 2; }
    this.groups = [[], [], []];
    for (let tier = 2; tier >= 0; tier--) {
      for (const tr of this.trees) {
        const g = this.clusters.filter((c) => !c.top && c.tree === tr && c.tier === tier).sort((a, b) => dist(b) - dist(a));
        if (g.length) this.groups[tier].push(g);
      }
    }
    this.front = this.trees.map((tr) => this.clusters.filter((c) => c.top && c.tree === tr)).filter((g) => g.length);

    // Clouds, bokeh and pollen are layout-dependent too.
    this.clouds = Array.from({ length: 12 }, (_, i) => this.makeCloud(r, i));
    this.bokeh = Array.from({ length: 12 }, () => ({ a: r() * TAU, d: r() * 0.35 * m, rad: (0.012 + 0.035 * r()) * m, ph: r() * TAU }));
    this.pollen = Array.from({ length: 40 }, () => ({ x: r() * W, y: r() * H, ph: r() * TAU, sz: 0.8 + r() * 1.6 }));
    this.rays = Array.from({ length: 8 }, () => ({ a: r(), w: 0.025 + 0.05 * r(), ph: r() * TAU }));
  }

  grow(tree, r, p0, ang, len, w, depth, s0, depthFactor) {
    // Keep limbs out of the open sky; only fine twigs may poke a little way in.
    const limit = depth >= 3 ? 0.88 : 1.02;
    let p2 = { x: p0.x + Math.cos(ang) * len, y: p0.y + Math.sin(ang) * len };
    for (let i = 0; i < 6 && this.holeRatio(p2.x, p2.y) < limit; i++) {
      len *= 0.75;
      p2 = { x: p0.x + Math.cos(ang) * len, y: p0.y + Math.sin(ang) * len };
    }
    if (len < this.m * 0.02) return;
    const bend = (r() - 0.5) * 0.5;
    const p1 = { x: (p0.x + p2.x) / 2 - Math.sin(ang) * bend * len * 0.3, y: (p0.y + p2.y) / 2 + Math.cos(ang) * bend * len * 0.3 };
    const s1 = s0 + len / tree.len;
    const pts = quad(p0, p1, p2, depth < 3 ? 6 : 3).map((p, k, arr) => {
      const s = lerp(s0, s1, k / (arr.length - 1));
      return { ...p, s, df: depthFactor(p.x, p.y) };
    });
    tree.branches.push({ pts, w0: w, w1: w * 0.55, depth });
    tree.nodes.push({ x: p2.x, y: p2.y, s: s1, depth, tree });
    if (depth >= 4) return;
    const kids = depth < 3 ? 2 + (r() < 0.5 ? 1 : 0) : 2;
    for (let j = 0; j < kids; j++) {
      const t = j === 0 ? 1 : 0.5 + 0.45 * r();
      const k = Math.round(t * (pts.length - 1));
      const side = j % 2 ? 1 : -1;
      this.grow(tree, r, pts[k], ang + side * (0.25 + r() * 0.5) + (r() - 0.5) * 0.3, len * (0.55 + 0.15 * r()), w * 0.6, depth + 1, pts[k].s, depthFactor);
    }
  }

  makeCluster(r, x, y, R, node, top) {
    const lobes = [{ x: 0, y: 0, r: R * 0.68 }];
    const k = 10 + Math.floor(r() * 5);
    const a0 = r() * TAU;
    for (let j = 0; j < k; j++) {
      const a = a0 + (j / k) * TAU + (r() - 0.5) * 0.4;
      const d = R * (0.6 + 0.08 * r());
      lobes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: R * (0.24 + 0.12 * r()) });
    }
    const halo = new Path2D(), body = new Path2D(), shade = new Path2D(), light = new Path2D();
    const h = R * 0.13;
    for (const l of lobes) {
      halo.moveTo(l.x + l.r + h, l.y); halo.arc(l.x, l.y, l.r + h, 0, TAU);
      body.moveTo(l.x + l.r, l.y); body.arc(l.x, l.y, l.r, 0, TAU);
      const dot = (l.x * LIGHT.x + l.y * LIGHT.y) / R;
      if (dot < 0.15) {
        const sx = l.x - LIGHT.x * l.r * 0.25, sy = l.y - LIGHT.y * l.r * 0.25, sr = l.r * 0.72;
        shade.moveTo(sx + sr, sy); shade.arc(sx, sy, sr, 0, TAU);
      }
      if (dot > 0.05) {
        const lx = l.x + LIGHT.x * l.r * 0.32, ly = l.y + LIGHT.y * l.r * 0.32, lr = l.r * 0.5;
        light.moveTo(lx + lr, ly); light.arc(lx, ly, lr, 0, TAU);
      }
    }
    const marks = new Path2D(), flowers = new Path2D();
    const nm = 10 + Math.floor(r() * 9);
    for (let j = 0; j < nm; j++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.72;
      const mx = Math.cos(a) * d, my = Math.sin(a) * d;
      almond(marks, mx, my, R * (0.18 + 0.1 * r()), R * 0.06, r() * TAU);
      const fr = R * 0.05;
      for (let q = 0; q < 5; q++) {
        const qa = (q / 5) * TAU + a;
        const fx = mx + Math.cos(qa) * fr * 1.1, fy = my + Math.sin(qa) * fr * 1.1;
        flowers.moveTo(fx + fr, fy); flowers.arc(fx, fy, fr, 0, TAU);
      }
    }
    return {
      x, y, r: R, node, tree: node.tree, top,
      sf: Math.pow(clamp(node.s, 0, 1.4), 1.5),
      rot: (r() - 0.5) * 0.3, phase: r() * TAU,
      r1: r(), r2: r(), r3: r(), tone: Math.floor(r() * 6),
      ox: 0, oy: 0, vx: 0, vy: 0, en: 0,
      halo, body, shade, light, marks, flowers,
      look: null, from: null, to: null, paint: null,
    };
  }

  makeCloud(r, i) {
    const w = (0.16 + 0.18 * r()) * this.M;
    const lobes = [];
    const k = 5 + Math.floor(r() * 4);
    for (let j = 0; j < k; j++) {
      const t = j / (k - 1) - 0.5;
      lobes.push({ x: t * w * 0.85, y: (r() - 0.6) * w * 0.12 - Math.cos(t * Math.PI) * w * 0.08, r: w * (0.12 + 0.1 * r()) * (1 - Math.abs(t) * 0.6) });
    }
    return { x: r() * this.W, y: r() * this.H, w, lobes, speed: 5 + r() * 10, vis: 0, i };
  }

  // ---------- scene changes ----------

  setScene(scene, instant = false) {
    const prev = this.scene;
    this.scene = scene;
    if (!prev || instant) {
      this.envFrom = this.envTo = scene.env;
      this.env = scene.env;
      this.mix = 1;
      for (const c of this.clusters) c.look = c.from = c.to = scene.foliage(c, c.tree);
      for (const cl of this.clouds) cl.vis = cl.i < scene.env.cloudN ? 1 : 0;
      this.paintLooks(1);
      return;
    }
    this.envFrom = this.env;
    this.envTo = scene.env;
    this.mix = 0;
    for (const c of this.clusters) { c.from = c.look; c.to = scene.foliage(c, c.tree); }
  }

  paintLooks(e) {
    for (const c of this.clusters) {
      const a = c.from, b = c.to;
      const L = e >= 1 ? b : {
        s: lerp(a.s, b.s, e), fill: mixC(a.fill, b.fill, e), shade: mixC(a.shade, b.shade, e),
        light: mixC(a.light, b.light, e), mark: mixC(a.mark, b.mark, e), halo: mixC(a.halo, b.halo, e),
        mt: e < 0.5 ? a.mt : b.mt,
      };
      c.look = L;
      const dk = c.tier === 2 ? 0.45 : c.tier === 1 ? 0.2 : 0;
      c.paint = {
        s: L.s, fill: css(mixC(L.fill, L.shade, dk)), shade: css(mixC(L.shade, L.mark, dk * 0.6)),
        light: css(mixC(L.light, L.fill, dk)), mark: css(L.mt === 'flower' ? L.mark : mixC(L.mark, [10, 30, 10], 0.18)), halo: css(L.halo), mt: L.mt,
      };
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

    // Pointer velocity relaxes when the cursor stops.
    const decay = Math.exp(-dt * 7);
    P.vx *= decay; P.vy *= decay;
    P.speed = Math.hypot(P.vx, P.vy);
    const tx = P.active ? (P.x / this.W - 0.5) * 2 : 0, ty = P.active ? (P.y / this.H - 0.5) * 2 : 0;
    this.par.x += (tx - this.par.x) * Math.min(1, dt * 2);
    this.par.y += (ty - this.par.y) * Math.min(1, dt * 2);

    const gust = this.gust();
    const wa = 0.35 + 0.4 * Math.sin(this.t * 0.05);
    this.wind = { x: Math.cos(wa), y: Math.sin(wa), g: gust };
    const R2 = (0.22 * this.m) ** 2;

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
    const detachMul = this.scene ? 1 : 0;
    for (const c of this.clusters) {
      const dx = c.x - P.x, dy = c.y - P.y;
      const f = P.active ? Math.exp(-(dx * dx + dy * dy) / R2) : 0;
      const wave = 0.5 + 0.5 * Math.sin(this.t * 1.25 - (c.x * 0.0035 + c.y * 0.0018) + c.phase * 0.4);
      const fx = P.vx * f * 0.55 + this.wind.x * gust * wave * 150;
      const fy = P.vy * f * 0.55 + this.wind.y * gust * wave * 150;
      c.vx += (fx - 55 * c.ox - 7.5 * c.vx) * dt; c.ox += c.vx * dt;
      c.vy += (fy - 55 * c.oy - 7.5 * c.vy) * dt; c.oy += c.vy * dt;
      const lim = c.r * 0.3;
      c.ox = clamp(c.ox, -lim, lim); c.oy = clamp(c.oy, -lim, lim);
      const ein = f * Math.min(1, P.speed / 1400);
      c.en = Math.max(c.en * Math.exp(-dt * 2.5), ein);
      if (ein > 0.05) energy = Math.max(energy, ein);
      if (c.en > 0.3 && Math.random() < c.en * dt * 2.2 * detachMul) this.shake(c);
    }
    // What the ears hear: cursor wind plus the ambient gust.
    this.windEnergy = clamp(energy * 1.4 + gust * 0.14, 0, 1);

    this.spawnAmbient(dt, env);
    this.updateParticles(dt);
    this.updateBirds(dt);
    this.updateClouds(dt, env);
    this.updateDroplets(dt, env);
    if (env.lightning > 0.5 && Math.random() < dt / 16) this.strike();
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.flash2 && this.t > this.flash2) { this.flash = 0.8; this.flash2 = 0; }

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
      x: c.x + tr.sx * c.sf + c.ox - this.par.x * c.df * 14,
      y: c.y + tr.sy * c.sf + c.oy - this.par.y * c.df * 14,
    };
  }

  // A shaken cluster drops something appropriate to the season.
  shake(c) {
    const p = c.paint;
    const { x, y } = this.pos(c);
    if (p.s < 0.1) {
      if (this.env.snow > 0.5) for (let i = 0; i < 3; i++) this.addFall('snow', x, y, [255, 255, 255], 0.6);
      return;
    }
    if (this.env.rates.rain > 60) {
      for (let i = 0; i < 2; i++) this.addFall('drip', x + (Math.random() - 0.5) * c.r, y, [210, 232, 240], 1);
      return;
    }
    if (p.mt === 'flower') this.addFall(c.to.mark[0] === 255 ? 'snow' : 'petal', x, y, c.look.light, 1);
    else this.addFall('leaf', x, y, Math.random() < 0.5 ? c.look.fill : c.look.light, 1);
  }

  addFall(type, x, y, color, scale = 1) {
    if (this.particles.length > 700) return;
    const m = this.m;
    const sz = { leaf: 0.022, petal: 0.012, snow: 0.004, drip: 0.004 }[type] * m * (0.7 + Math.random() * 0.6) * scale;
    this.particles.push({
      type, rx: x - this.cx, ry: y - this.cy, dx: 0, dy: 0, k: 0,
      kv: { leaf: 0.22, petal: 0.25, snow: 0.16, drip: 0.9 }[type] * (0.7 + Math.random() * 0.6),
      sz, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 3, fs: 2 + Math.random() * 4, ph: Math.random() * TAU,
      color: css(color), age: 0,
    });
  }

  spawnAmbient(dt, env) {
    const acc = this.spawnAcc;
    const visible = () => {
      if (!this.clusters.length) return null;
      for (let i = 0; i < 8; i++) {
        const c = this.clusters[(Math.random() * this.clusters.length) | 0];
        if (c.paint.s > 0.3) return c;
      }
      return null;
    };
    acc.leaf += env.rates.leaf * dt;
    while (acc.leaf >= 1) {
      acc.leaf--;
      const c = visible();
      if (c && c.paint.mt !== 'flower') { const { x, y } = this.pos(c); this.addFall('leaf', x, y, Math.random() < 0.5 ? c.look.fill : c.look.light); }
    }
    acc.petal += env.rates.petal * dt;
    while (acc.petal >= 1) {
      acc.petal--;
      const c = visible();
      if (c && c.paint.mt === 'flower') { const { x, y } = this.pos(c); this.addFall('petal', x, y, c.look.light); }
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
      this.birdTimer = kind === 'geese' ? 22 + Math.random() * 15 : kind === 'crow' ? 25 + Math.random() * 20 : 9 + Math.random() * 9;
      if (kind) this.spawnFlock(kind);
    }
    for (const b of this.birds) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.ph += dt * b.flap;
    }
    const pad = 200;
    this.birds = this.birds.filter((b) => b.x > -pad && b.y > -pad && b.x < this.W + pad && b.y < this.H + pad);
  }

  spawnFlock(kind) {
    const m = this.m, M = this.M;
    const a = Math.random() * TAU;
    const start = { x: this.cx - Math.cos(a) * M * 0.62, y: this.cy - Math.sin(a) * M * 0.62 };
    const heading = a + (Math.random() - 0.5) * 0.5;
    const speed = M * (kind === 'crow' ? 0.045 : 0.06);
    const vx = Math.cos(heading) * speed, vy = Math.sin(heading) * speed;
    const add = (ox, oy, size, flap) =>
      this.birds.push({ x: start.x + ox, y: start.y + oy, vx, vy, heading, size, flap, ph: Math.random() * TAU });
    if (kind === 'geese') {
      const n = 5 + Math.floor(Math.random() * 4), sp = m * 0.028;
      add(0, 0, m * 0.011, 5);
      for (let i = 1; i <= n; i++) {
        const side = i % 2 ? 1 : -1, row = Math.ceil(i / 2);
        const bx = -Math.cos(heading) * row * sp + side * -Math.sin(heading) * row * sp * 0.75;
        const by = -Math.sin(heading) * row * sp + side * Math.cos(heading) * row * sp * 0.75;
        add(bx, by, m * 0.011, 5 + Math.random());
      }
    } else if (kind === 'crow') {
      add(0, 0, m * 0.02, 3.2);
    } else {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) add((Math.random() - 0.5) * m * 0.12, (Math.random() - 0.5) * m * 0.12, m * (0.013 + Math.random() * 0.005), 7 + Math.random() * 3);
    }
  }

  updateClouds(dt, env) {
    for (const c of this.clouds) {
      c.x += c.speed * dt * (this.scene ? this.scene.windMul : 1);
      const span = c.w * env.cloudScale;
      if (c.x - span > this.W + 40) { c.x = -span; c.y = Math.random() * this.H; }
      const target = c.i < env.cloudN ? 1 : 0;
      c.vis += (target - c.vis) * Math.min(1, dt * 0.6);
    }
  }

  updateDroplets(dt, env) {
    if (env.droplets > 0.5 && this.droplets.length < 24 && Math.random() < dt * 1.6) {
      this.droplets.push({ x: Math.random() * this.W, y: Math.random() * this.H, r: 3 + Math.random() * 11, age: 0, life: 3 + Math.random() * 5 });
    }
    for (const d of this.droplets) { d.age += dt; d.y += dt * (d.r > 10 ? 6 : 0); }
    this.droplets = this.droplets.filter((d) => d.age < d.life);
  }

  // ---------- drawing ----------

  draw() {
    const { ctx, dpr, W, H, env, m, M } = this;
    if (!env) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const sx = env.sunX * W, sy = env.sunY * H;

    // Sky: brightest around the sun.
    const sky = ctx.createRadialGradient(sx, sy, 0, sx, sy, M * 1.15);
    sky.addColorStop(0, css(mixC(env.sky, env.glow, 0.85 * env.sunI)));
    sky.addColorStop(0.35, css(mixC(env.sky, env.glow, 0.25 * env.sunI)));
    sky.addColorStop(0.7, css(env.sky));
    sky.addColorStop(1, css(env.skyEdge));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (this.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${this.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }

    // Sun disk sits behind the leaves.
    const sr = 0.04 * m * env.sunSize;
    const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.2);
    sun.addColorStop(0, `rgba(255,253,240,${env.sunI})`);
    sun.addColorStop(0.45, `rgba(255,250,225,${env.sunI})`);
    sun.addColorStop(1, 'rgba(255,248,220,0)');
    ctx.fillStyle = sun;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 2.2, 0, TAU); ctx.fill();

    this.drawClouds(env);
    this.drawBirds();

    for (const tr of this.trees) this.drawTree(tr, env, true);
    for (const g of this.groups[2]) this.drawGroup(g);
    for (const g of this.groups[1]) this.drawGroup(g);
    for (const tr of this.trees) this.drawTree(tr, env, false);
    for (const g of this.groups[0]) this.drawGroup(g);
    for (const g of this.front) this.drawGroup(g);

    this.drawParticles();
    this.drawLight(env, sx, sy);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (env.fog > 0.005) { ctx.fillStyle = `rgba(250,252,252,${env.fog})`; ctx.fillRect(0, 0, W, H); }
    const vig = ctx.createRadialGradient(this.cx, this.cy, M * 0.25, this.cx, this.cy, M * 0.85);
    vig.addColorStop(0, 'rgba(20,40,25,0)');
    vig.addColorStop(1, 'rgba(20,40,25,0.2)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    if (this.flash > 0) { ctx.fillStyle = `rgba(240,245,255,${this.flash * 0.3})`; ctx.fillRect(0, 0, W, H); }
    this.drawDroplets();
  }

  drawClouds(env) {
    const { ctx } = this;
    const fill = css(env.cloudFill), shade = css(env.cloudShade);
    for (const c of this.clouds) {
      if (c.vis < 0.01) continue;
      const s = env.cloudScale;
      const x = c.x - this.par.x * 4, y = c.y - this.par.y * 4;
      ctx.globalAlpha = c.vis;
      ctx.fillStyle = shade;
      ctx.beginPath();
      for (const l of c.lobes) { ctx.moveTo(x + l.x * s + l.r * s, y + l.y * s + c.w * 0.04 * s); ctx.arc(x + l.x * s, y + l.y * s + c.w * 0.04 * s, l.r * s, 0, TAU); }
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (const l of c.lobes) { ctx.moveTo(x + l.x * s + l.r * s, y + l.y * s); ctx.arc(x + l.x * s, y + l.y * s, l.r * s, 0, TAU); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawBirds() {
    const { ctx, dpr } = this;
    ctx.fillStyle = '#1b2a22';
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

  drawGroup(g) {
    const { ctx, dpr, t } = this;
    const mats = [];
    for (const c of g) {
      const p = c.paint;
      if (!p || p.s < 0.02) { mats.push(null); continue; }
      const { x, y } = this.pos(c);
      const a = c.rot + (c.ox / c.r) * 0.25 + c.en * 0.1 * Math.sin(t * 24 + c.phase);
      const s = p.s * (1 + c.en * 0.04 * Math.sin(t * 31 + c.phase * 2)) * dpr;
      mats.push([Math.cos(a) * s, Math.sin(a) * s, x * dpr, y * dpr]);
    }
    for (let i = 0; i < g.length; i++) {
      const M = mats[i];
      if (!M) continue;
      ctx.setTransform(M[0], M[1], -M[1], M[0], M[2], M[3]);
      ctx.fillStyle = g[i].paint.halo; ctx.fill(g[i].halo);
    }
    for (let i = 0; i < g.length; i++) {
      const M = mats[i];
      if (!M) continue;
      const c = g[i], p = c.paint;
      ctx.setTransform(M[0], M[1], -M[1], M[0], M[2], M[3]);
      ctx.fillStyle = p.fill; ctx.fill(c.body);
      ctx.fillStyle = p.shade; ctx.fill(c.shade);
      ctx.fillStyle = p.light; ctx.fill(c.light);
      ctx.fillStyle = p.mark; ctx.fill(p.mt === 'flower' ? c.flowers : c.marks);
    }
  }

  displaced(pts, tr) {
    const out = new Array(pts.length);
    const px = this.par.x * 14, py = this.par.y * 14;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const f = Math.pow(clamp(p.s, 0, 1.4), 1.5);
      out[i] = { x: p.x + tr.sx * f - px * p.df, y: p.y + tr.sy * f - py * p.df };
    }
    return out;
  }

  ribbon(pts, w0, w1, stripe = 0) {
    // Tapered polygon along a polyline. stripe > 0 draws only the lit edge band.
    const { ctx } = this;
    const n = pts.length;
    const L = [], Rr = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (nx * LIGHT.x + ny * LIGHT.y < 0) { nx = -nx; ny = -ny; }
      const w = (lerp(w0, w1, i / (n - 1)) / 2) * (i === n - 1 ? 0.4 : 1);
      const p = pts[i];
      if (stripe) {
        L.push({ x: p.x + nx * w, y: p.y + ny * w });
        Rr.push({ x: p.x + nx * w * (1 - stripe * 2), y: p.y + ny * w * (1 - stripe * 2) });
      } else {
        L.push({ x: p.x + nx * w, y: p.y + ny * w });
        Rr.push({ x: p.x - nx * w, y: p.y - ny * w });
      }
    }
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i].x, L[i].y);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rr[i].x, Rr[i].y);
    ctx.closePath();
    ctx.fill();
  }

  drawTree(tr, env, twigs) {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const snow = env.snow;
    const branch = css(env.branch), twig = css(env.twig);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const b of tr.branches) {
      if (twigs !== b.depth >= 3) continue;
      const pts = this.displaced(b.pts, tr);
      if (b.depth >= 3) {
        ctx.strokeStyle = twig;
        ctx.lineWidth = Math.max(0.9, b.w0 * 0.8);
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        if (snow > 0.02) {
          ctx.strokeStyle = `rgba(255,255,255,${snow * 0.9})`;
          ctx.lineWidth = Math.max(0.8, b.w0 * 0.45);
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y - b.w0 * 0.4);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y - b.w0 * 0.4);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = branch;
        this.ribbon(pts, b.w0, b.w1);
        if (snow > 0.02) { ctx.fillStyle = `rgba(255,255,255,${snow * 0.92})`; this.ribbon(pts, b.w0, b.w1, 0.22); }
      }
    }
    if (twigs) return;
    const trunk = this.displaced(tr.trunk, tr);
    ctx.fillStyle = css(env.trunk);
    this.ribbon(trunk, tr.w0, tr.w1);
    ctx.fillStyle = snow > 0.5 ? `rgba(255,255,255,${snow * 0.9})` : css(env.trunkEdge);
    this.ribbon(trunk, tr.w0 * 0.92, tr.w1 * 0.92, 0.18);
  }

  drawParticles() {
    const { ctx, dpr } = this;
    for (const p of this.particles) {
      if (p.type === 'rain') {
        const k0 = Math.max(0, p.k - 0.14);
        const x0 = this.cx + p.rx * (1 + k0 * 1.9), y0 = this.cy + p.ry * (1 + k0 * 1.9);
        const x1 = this.cx + p.rx * (1 + p.k * 1.9), y1 = this.cy + p.ry * (1 + p.k * 1.9);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = `rgba(232,242,248,${Math.min(1, p.age * 4) * 0.55})`;
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

  drawLight(env, sx, sy) {
    const { ctx, m, M, t } = this;
    const I = env.sunI;
    if (I < 0.05) return;
    ctx.globalCompositeOperation = 'screen';

    // Bloom: leaves near the sun glow.
    const bloom = ctx.createRadialGradient(sx, sy, 0, sx, sy, m * 0.55);
    bloom.addColorStop(0, `rgba(255,246,215,${0.75 * I})`);
    bloom.addColorStop(0.3, `rgba(255,240,200,${0.25 * I})`);
    bloom.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, this.W, this.H);

    // Slow god rays fanning out from the sun.
    if (env.rays > 0.02) {
      const base = Math.atan2(this.cy - sy, this.cx - sx);
      for (const r of this.rays) {
        const a = base + (r.a - 0.5) * 2.2 + Math.sin(t * 0.07 + r.ph) * 0.06;
        const w = r.w * (0.8 + 0.2 * Math.sin(t * 0.3 + r.ph));
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, M * 1.2);
        const al = 0.09 * I * env.rays * (0.6 + 0.4 * Math.sin(t * 0.21 + r.ph * 3));
        g.addColorStop(0, `rgba(255,248,220,${al})`);
        g.addColorStop(1, 'rgba(255,248,220,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.arc(sx, sy, M * 1.2, a - w, a + w);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Bokeh near the sun.
    const nb = Math.floor(env.rates.bokeh);
    for (let i = 0; i < Math.min(nb, this.bokeh.length); i++) {
      const b = this.bokeh[i];
      const bx = sx + Math.cos(b.a + t * 0.02) * b.d - this.par.x * 20, by = sy + Math.sin(b.a + t * 0.02) * b.d - this.par.y * 20;
      const al = (0.07 + 0.05 * Math.sin(t * 0.5 + b.ph)) * I;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, b.rad);
      g.addColorStop(0, `rgba(255,250,230,${al})`);
      g.addColorStop(0.8, `rgba(255,250,230,${al * 0.8})`);
      g.addColorStop(1, 'rgba(255,250,230,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, b.rad, 0, TAU); ctx.fill();
    }

    // Lens flare along the sun → centre axis, nudged by the cursor.
    if (I > 0.4) {
      const P = this.pointer;
      const tx = P.active ? lerp(this.cx, P.x, 0.35) : this.cx, ty = P.active ? lerp(this.cy, P.y, 0.35) : this.cy;
      const flares = [[0.45, 0.018, '255,240,200'], [0.7, 0.04, '200,255,220'], [0.95, 0.014, '255,210,230'], [1.25, 0.065, '220,240,255'], [1.6, 0.025, '255,235,190']];
      for (const [f, rad, col] of flares) {
        const fx = lerp(sx, tx, f * 1.6), fy = lerp(sy, ty, f * 1.6);
        ctx.fillStyle = `rgba(${col},${0.07 * (I - 0.3)})`;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + 0.3;
          const px = fx + Math.cos(a) * rad * m, py = fy + Math.sin(a) * rad * m;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
    }

    // Floating pollen catching the light.
    const np = Math.floor(env.rates.pollen);
    for (let i = 0; i < Math.min(np, this.pollen.length); i++) {
      const p = this.pollen[i];
      p.x += (Math.sin(t * 0.3 + p.ph) * 6 + this.wind.x * 4) * (1 / 60);
      p.y += (Math.cos(t * 0.23 + p.ph * 2) * 5 - 1) * (1 / 60);
      if (p.x > this.W + 10) p.x = -10; if (p.y < -10) p.y = this.H + 10;
      const al = (0.35 + 0.35 * Math.sin(t * 2 + p.ph * 5)) * I;
      ctx.fillStyle = `rgba(255,250,220,${al})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, TAU); ctx.fill();
    }

    // Warm haze over everything.
    ctx.fillStyle = css(env.haze, env.hazeA * (0.5 + 0.5 * I));
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawDroplets() {
    const { ctx } = this;
    for (const d of this.droplets) {
      const a = Math.min(1, d.age * 2) * Math.min(1, (d.life - d.age) / 1.2);
      const g = ctx.createRadialGradient(d.x - d.r * 0.25, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r);
      g.addColorStop(0, `rgba(255,255,255,${0.04 * a})`);
      g.addColorStop(0.75, `rgba(255,255,255,${0.1 * a})`);
      g.addColorStop(1, `rgba(255,255,255,${0.3 * a})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
      ctx.beginPath(); ctx.ellipse(d.x - d.r * 0.35, d.y - d.r * 0.4, d.r * 0.22, d.r * 0.12, -0.6, 0, TAU); ctx.fill();
    }
  }
}
