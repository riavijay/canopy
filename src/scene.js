// The canopy: procedurally grown trees seen from below, drawn in a flat illustrated style,
// with wind physics, falling leaves / petals / rain / snow, birds and clouds.
import { css, mixC, blendEnv } from './palettes.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

// A lumpy blob with a scalloped, cloud-like edge — the basic leaf mass of the illustration.
function scallop(path, ox, oy, R, shape, grow = 0, scale = 1) {
  const n = shape.angles.length;
  const pts = shape.angles.map((a, i) => {
    const r = R * shape.radii[i] * scale + grow;
    return { x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r, a, r };
  });
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const am = p.a + ((q.a - p.a + TAU) % TAU) / 2;
    const chord = Math.hypot(q.x - p.x, q.y - p.y);
    const rm = (p.r + q.r) / 2 + chord * 0.42;
    path.quadraticCurveTo(ox + Math.cos(am) * rm, oy + Math.sin(am) * rm, q.x, q.y);
  }
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
      for (const c of this.clusters) c.look = c.from = c.to = this.scene.foliage(c, c.tree);
      this.paintLooks(1);
    }
  }

  holeR(phi) {
    const { a, b, p } = this.hole;
    const e = (a * b) / Math.hypot(b * Math.cos(phi), a * Math.sin(phi));
    return e * (1 + 0.2 * Math.sin(2 * phi + p[0]) + 0.15 * Math.sin(3 * phi + p[1]) + 0.1 * Math.sin(5 * phi + p[2]) + 0.05 * Math.sin(8 * phi + p[0] * 2));
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
    this.cx = W / 2; this.cy = H * 0.49;
    // Tall sky opening on portrait screens, like the reference; wider on landscape.
    this.hole = { a: 0.13 * W + 0.06 * m, b: 0.17 * H + 0.05 * m, p: [r() * TAU, r() * TAU, r() * TAU] };
    this.trees = []; this.clusters = []; this.groups = []; this.clouds = [];
    if (W <= 0 || H <= 0) return;
    const depthFactor = (x, y) => clamp(Math.hypot(x - this.cx, y - this.cy) / (0.6 * M), 0, 1.3);

    // Trunks lean in from beyond the frame edges toward the open sky.
    const n = clamp(Math.round((2 * (W + H)) / (0.6 * m + 0.3 * M)), 5, 9);
    const off = r() * TAU;
    for (let i = 0; i < n; i++) {
      const theta = off + ((i + (r() - 0.5) * 0.5) / n) * TAU;
      const dx = Math.cos(theta), dy = Math.sin(theta);
      const dEdge = Math.min(Math.abs((W / 2) * 1.04 / (dx || 1e-6)), Math.abs((H / 2) * 1.04 / (dy || 1e-6)));
      const base = { x: this.cx + dx * dEdge * 1.12, y: this.cy + dy * dEdge * 1.12 };
      const tipD = this.holeR(theta) * (1.4 + 0.3 * r());
      const tip = { x: this.cx + dx * tipD, y: this.cy + dy * tipD };
      const len = Math.hypot(tip.x - base.x, tip.y - base.y);
      const bend = (r() - 0.5) * 0.25 * len;
      const ctrl = { x: (base.x + tip.x) / 2 - dy * bend, y: (base.y + tip.y) / 2 + dx * bend };
      const tree = {
        i, r: r(), r2: r(), theta, len, sx: 0, sy: 0, vx: 0, vy: 0,
        w0: m * (0.085 + 0.04 * r()), w1: m * 0.03,
        mid: { x: (base.x + tip.x * 2) / 3, y: (base.y + tip.y * 2) / 3 },
        branches: [], nodes: [],
      };
      tree.trunk = quad(base, ctrl, tip, 16).map((p, k) => ({ ...p, s: k / 16, df: depthFactor(p.x, p.y) }));
      tree.nodes.push({ x: tip.x, y: tip.y, s: 1, depth: 0, tree });
      this.trees.push(tree);

      // Main limbs fan out from the upper trunk toward the crown edge.
      const nb = 4 + Math.floor(r() * 3);
      for (let j = 0; j < nb; j++) {
        const t = 0.28 + (0.64 * (j + r() * 0.7)) / nb;
        const k = Math.min(15, Math.floor(t * 16));
        const p = tree.trunk[k], q = tree.trunk[k + 1];
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        const side = j % 2 ? 1 : -1;
        const w = lerp(tree.w0, tree.w1, Math.pow(t, 0.8)) * 0.5;
        this.grow(tree, r, p, ang + side * (0.4 + r() * 0.5), len * (0.36 + 0.2 * r()) * (1.2 - 0.5 * t), w, 1, t, depthFactor);
      }
    }

    // Leaf masses: a jittered grid outside the sky opening, each owned by the nearest tree.
    const allNodes = this.trees.flatMap((t) => t.nodes);
    const cell = 0.12 * m;
    const sector = Math.PI / n;
    for (let gy = -0.05 * H; gy < H * 1.05; gy += cell) {
      for (let gx = -0.05 * W; gx < W * 1.05; gx += cell) {
        const x = gx + (r() - 0.5) * cell * 0.9, y = gy + (r() - 0.5) * cell * 0.9;
        const rr = this.holeRatio(x, y);
        if (rr < 1.0) continue;
        const phi = Math.atan2(y - this.cy, x - this.cx);
        let ad = Infinity;
        for (const t of this.trees) ad = Math.min(ad, Math.abs(Math.atan2(Math.sin(phi - t.theta), Math.cos(phi - t.theta))));
        // Sky channels between neighbouring crowns, and the odd gap inside a crown.
        if (ad / sector > 0.78 && r() < 0.85) continue;
        if (r() < 0.06) continue;
        let best = null, bd = Infinity;
        for (const nd of allNodes) {
          const d = (nd.x - x) ** 2 + (nd.y - y) ** 2;
          if (d < bd) { bd = d; best = nd; }
        }
        const grow = clamp((rr - 1) / 1.6, 0, 1);
        this.clusters.push(this.makeCluster(r, x, y, m * (0.078 + 0.04 * r()) * (0.85 + 0.45 * grow), best, rr, depthFactor(x, y)));
      }
    }

    // Two layers per tree: the outer (lower, nearer the frame) crown first, then the inner crown
    // bordering the sky on top. Each layer shares one pale rim, so lobes merge into masses.
    const outer = [], inner = [];
    for (const tr of this.trees) {
      const mine = this.clusters.filter((c) => c.tree === tr).sort((a, b) => b.rr - a.rr);
      const o = mine.filter((c) => c.rr >= 1.55), i = mine.filter((c) => c.rr < 1.55);
      for (const c of o) c.layer = 1;
      if (o.length) outer.push(o);
      if (i.length) inner.push(i);
    }
    this.groups = [...outer, ...inner];

    this.clouds = Array.from({ length: 12 }, (_, i) => this.makeCloud(r, i));
  }

  grow(tree, r, p0, ang, len, w, depth, s0, depthFactor) {
    // Branches end inside the foliage, not out in the open sky.
    const limit = depth >= 3 ? 1.0 : 1.08;
    let p2 = { x: p0.x + Math.cos(ang) * len, y: p0.y + Math.sin(ang) * len };
    for (let i = 0; i < 6 && this.holeRatio(p2.x, p2.y) < limit; i++) {
      len *= 0.75;
      p2 = { x: p0.x + Math.cos(ang) * len, y: p0.y + Math.sin(ang) * len };
    }
    if (len < this.m * 0.03) return;
    const bend = (r() - 0.5) * 0.45;
    const p1 = { x: (p0.x + p2.x) / 2 - Math.sin(ang) * bend * len * 0.3, y: (p0.y + p2.y) / 2 + Math.cos(ang) * bend * len * 0.3 };
    const s1 = s0 + len / tree.len;
    const pts = quad(p0, p1, p2, depth < 3 ? 7 : 4).map((p, k, arr) => {
      const s = lerp(s0, s1, k / (arr.length - 1));
      return { ...p, s, df: depthFactor(p.x, p.y) };
    });
    tree.branches.push({ pts, w0: w, w1: w * 0.3, depth });
    tree.nodes.push({ x: p2.x, y: p2.y, s: s1, depth, tree });
    if (depth >= 3) return;
    const kids = depth === 1 ? 2 : r() < 0.35 ? 2 : 1;
    for (let j = 0; j < kids; j++) {
      const t = j === 0 ? 1 : 0.35 + 0.45 * r();
      const k = Math.round(t * (pts.length - 1));
      const side = j % 2 ? 1 : -1;
      this.grow(tree, r, pts[k], ang + side * (0.3 + r() * 0.4), len * (0.55 + 0.2 * r()), w * 0.5, depth + 1, pts[k].s, depthFactor);
    }
  }

  makeCluster(r, x, y, R, node, rr, df) {
    const m = this.m;
    const nb = clamp(Math.round((TAU * R) / (0.042 * m)), 9, 24);
    const p1 = r() * TAU, p2 = r() * TAU;
    const angles = [], radii = [];
    for (let i = 0; i < nb; i++) {
      const a = ((i + (r() - 0.5) * 0.35) / nb) * TAU;
      angles.push(a);
      radii.push(0.86 + 0.09 * Math.sin(2 * a + p1) + 0.06 * Math.sin(3 * a + p2) + (r() - 0.5) * 0.06);
    }
    const shape = { angles, radii };
    // The lighter top layer sits toward the sky; the darker base shows as a rim on the far side.
    const toSky = Math.atan2(this.cy - y, this.cx - x);
    const ox = Math.cos(toSky) * R * 0.14, oy = Math.sin(toSky) * R * 0.14;
    const h = m * 0.017;
    const halo = new Path2D(), base = new Path2D(), top = new Path2D();
    scallop(halo, 0, 0, R, shape, h);
    scallop(base, 0, 0, R, shape);
    scallop(top, ox, oy, R, shape, 0, 0.8);

    const marksTop = new Path2D(), marksBase = new Path2D(), flowersTop = new Path2D(), flowersBase = new Path2D();
    const leafLen = m * 0.022, leafW = m * 0.0075, fr = m * 0.0055;
    const count = Math.round(((R * R) / (0.05 * m) ** 2) * 1.1);
    for (let j = 0; j < count; j++) {
      const onTop = r() < 0.65;
      const a = onTop ? r() * TAU : toSky + Math.PI + (r() - 0.5) * 2.2;
      const d = onTop ? Math.sqrt(r()) * R * 0.6 : R * (0.72 + 0.12 * r());
      const mx = (onTop ? ox : 0) + Math.cos(a) * d, my = (onTop ? oy : 0) + Math.sin(a) * d;
      almond(onTop ? marksTop : marksBase, mx, my, leafLen * (0.8 + 0.4 * r()), leafW, r() * TAU);
      const fp = onTop ? flowersTop : flowersBase;
      for (let q = 0; q < 5; q++) {
        const qa = (q / 5) * TAU + a;
        const fx = mx + Math.cos(qa) * fr * 1.15, fy = my + Math.sin(qa) * fr * 1.15;
        fp.moveTo(fx + fr, fy); fp.arc(fx, fy, fr, 0, TAU);
      }
    }
    return {
      x, y, r: R, rr, df, node, tree: node.tree, layer: 0,
      sf: Math.pow(clamp(node.s, 0, 1.4), 1.5),
      rot: (r() - 0.5) * 0.12, phase: r() * TAU,
      r1: r(), r2: r(), r3: r(), dark: r() < 0.22,
      ox: 0, oy: 0, vx: 0, vy: 0, en: 0,
      halo, base, top, marksTop, marksBase, flowersTop, flowersBase,
      look: null, from: null, to: null, paint: null,
    };
  }

  makeCloud(r, i) {
    const w = (0.16 + 0.16 * r()) * this.M;
    const k = 5 + Math.floor(r() * 4);
    const lobes = [];
    for (let j = 0; j < k; j++) {
      const t = j / (k - 1) - 0.5;
      lobes.push({ x: t * w * 0.85, y: (r() - 0.6) * w * 0.1 - Math.cos(t * Math.PI) * w * 0.08, r: w * (0.12 + 0.09 * r()) * (1 - Math.abs(t) * 0.55) });
    }
    return { x: r() * this.W, y: r() * this.H, w, lobes, speed: 5 + r() * 9, vis: 0, i };
  }

  // ---------- scene changes ----------

  setScene(scene, instant = false) {
    const prev = this.scene;
    this.scene = scene;
    if (!prev || instant) {
      this.envFrom = this.envTo = this.env = scene.env;
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
        s: lerp(a.s, b.s, e), light: mixC(a.light, b.light, e), mid: mixC(a.mid, b.mid, e),
        dark: mixC(a.dark, b.dark, e), halo: mixC(a.halo, b.halo, e), mt: e < 0.5 ? a.mt : b.mt,
      };
      c.look = L;
      // Inner crown: mid base, light top. Outer crown (and some inner lobes): dark base, mid top.
      const deep = c.layer === 1 || c.dark;
      const baseC = deep ? L.dark : L.mid, topC = deep ? L.mid : L.light;
      c.paint = {
        s: L.s, halo: css(L.halo), base: css(baseC), top: css(topC),
        markTop: css(mixC(topC, baseC, 0.75)), markBase: css(mixC(baseC, topC, 0.7)), mt: L.mt,
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
      const fx = P.vx * f * 0.5 + this.wind.x * gust * wave * 130;
      const fy = P.vy * f * 0.5 + this.wind.y * gust * wave * 130;
      c.vx += (fx - 55 * c.ox - 7.5 * c.vx) * dt; c.ox += c.vx * dt;
      c.vy += (fy - 55 * c.oy - 7.5 * c.vy) * dt; c.oy += c.vy * dt;
      const lim = c.r * 0.18;
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

  // A shaken leaf mass drops something that fits the season and the weather.
  shake(c) {
    const p = c.paint;
    const { x, y } = this.pos(c);
    if (p.s < 0.1) {
      if (this.env.snow > 0.5) for (let i = 0; i < 3; i++) this.addFall('snow', x + (Math.random() - 0.5) * c.r, y, [255, 255, 255], 0.7);
      return;
    }
    if (this.env.rates.rain > 30) {
      for (let i = 0; i < 2; i++) this.addFall('drip', x + (Math.random() - 0.5) * c.r, y, [210, 232, 240], 1);
      return;
    }
    if (p.mt === 'flower') this.addFall('petal', x, y, c.look.light);
    else this.addFall('leaf', x, y, Math.random() < 0.5 ? c.look.mid : c.look.light);
  }

  addFall(type, x, y, color, scale = 1) {
    if (this.particles.length > 700) return;
    const m = this.m;
    const sz = { leaf: 0.022, petal: 0.013, snow: 0.004, drip: 0.004 }[type] * m * (0.7 + Math.random() * 0.6) * scale;
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
        if (c.paint.s > 0.3 && (c.paint.mt === 'flower') === flower) return c;
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
      // Like the reference: a loose little trio.
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) add((Math.random() - 0.5) * m * 0.1, (Math.random() - 0.5) * m * 0.14, m * (0.016 + Math.random() * 0.005), 6 + Math.random() * 3);
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
    if (env.droplets > 0.5 && this.droplets.length < 22 && Math.random() < dt * 1.5) {
      this.droplets.push({ x: Math.random() * this.W, y: Math.random() * this.H, r: 3 + Math.random() * 10, age: 0, life: 3 + Math.random() * 5 });
    }
    for (const d of this.droplets) { d.age += dt; d.y += dt * (d.r > 10 ? 6 : 0); }
    this.droplets = this.droplets.filter((d) => d.age < d.life);
  }

  // ---------- drawing ----------

  draw() {
    const { ctx, dpr, W, H, env } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.fillStyle = css(env.sky);
    ctx.fillRect(0, 0, W, H);
    if (this.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${(this.flash * 0.55).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }

    this.drawClouds(env);
    this.drawBirds();
    for (const g of this.groups) this.drawGroup(g);
    for (const tr of this.trees) this.drawTree(tr, env);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (env.tintA > 0.005) { ctx.fillStyle = css(env.tint, env.tintA); ctx.fillRect(0, 0, W, H); }
    this.drawParticles();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (env.fog > 0.005) { ctx.fillStyle = `rgba(245,248,248,${env.fog.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(240,245,255,${(this.flash * 0.3).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
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
      for (const [col, dy] of [[shade, c.w * 0.04 * s], [fill, 0]]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        for (const l of c.lobes) { ctx.moveTo(x + l.x * s + l.r * s, y + l.y * s + dy); ctx.arc(x + l.x * s, y + l.y * s + dy, l.r * s, 0, TAU); }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBirds() {
    const { ctx, dpr } = this;
    ctx.fillStyle = '#16231b';
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

  // One leaf mass: shared pale rim, then darker base lobes, lighter top lobes, then leaf marks.
  drawGroup(g) {
    const { ctx, dpr, t } = this;
    const mats = [];
    for (const c of g) {
      const p = c.paint;
      if (!p || p.s < 0.02) { mats.push(null); continue; }
      const { x, y } = this.pos(c);
      const a = c.rot + (c.ox / c.r) * 0.2 + c.en * 0.08 * Math.sin(t * 24 + c.phase);
      const s = p.s * (1 + c.en * 0.03 * Math.sin(t * 31 + c.phase * 2)) * dpr;
      mats.push([Math.cos(a) * s, Math.sin(a) * s, x * dpr, y * dpr]);
    }
    const pass = (fn) => {
      for (let i = 0; i < g.length; i++) {
        const M = mats[i];
        if (!M) continue;
        ctx.setTransform(M[0], M[1], -M[1], M[0], M[2], M[3]);
        fn(g[i], g[i].paint);
      }
    };
    pass((c, p) => { ctx.fillStyle = p.halo; ctx.fill(c.halo); });
    pass((c, p) => { ctx.fillStyle = p.base; ctx.fill(c.base); });
    pass((c, p) => { ctx.fillStyle = p.top; ctx.fill(c.top); });
    pass((c, p) => {
      const fl = p.mt === 'flower';
      ctx.fillStyle = p.markTop; ctx.fill(fl ? c.flowersTop : c.marksTop);
      ctx.fillStyle = p.markBase; ctx.fill(fl ? c.flowersBase : c.marksBase);
    });
  }

  displaced(pts, tr) {
    const out = new Array(pts.length);
    const px = this.par.x * 12, py = this.par.y * 12;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const f = Math.pow(clamp(p.s, 0, 1.4), 1.5);
      out[i] = { x: p.x + tr.sx * f - px * p.df, y: p.y + tr.sy * f - py * p.df };
    }
    return out;
  }

  // Tapered polygon along a polyline; band > 0 draws only a strip along the upper edge.
  ribbon(pts, w0, w1, band = 0, tip = 0.55) {
    const { ctx } = this;
    const n = pts.length;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const w = (lerp(w0, w1, i / (n - 1)) / 2) * (i === n - 1 ? tip : 1);
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
    const snow = env.snow;
    const limb = css(env.trunk), branch = css(env.branch);
    const snowC = `rgba(255,255,255,${(snow * 0.95).toFixed(3)})`;
    // Fine brown branches first, then the dark main limbs over them, then the trunk.
    for (const depth of [3, 2, 1]) {
      for (const b of tr.branches) {
        if (b.depth !== depth) continue;
        const pts = this.displaced(b.pts, tr);
        const w0 = Math.max(1.4, b.w0), w1 = Math.max(0.7, b.w1);
        ctx.fillStyle = depth === 1 ? limb : branch;
        this.ribbon(pts, w0, w1, 0, 0.12);
        if (snow > 0.02) { ctx.fillStyle = snowC; this.ribbon(pts, w0, w1, 0.3, 0.12); }
      }
    }
    const trunk = this.displaced(tr.trunk, tr);
    ctx.fillStyle = limb;
    this.ribbon(trunk, tr.w0, tr.w1);
    ctx.fillStyle = snow > 0.5 ? snowC : css(env.trunkEdge);
    this.ribbon(trunk, tr.w0 * 0.92, tr.w1 * 0.92, 0.2);
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
