// All sound is synthesised in the browser: leaf rustle, wind, rain, birds, cicadas, thunder.

const MIX = {
  //            leafy  dry   wind  rain  cicada birds/s
  summer:  [1.0, 0.1, 0.12, 0, 0.3, 0.22],
  spring:  [0.9, 0.05, 0.12, 0, 0, 0.5],
  autumn:  [0.3, 1.0, 0.18, 0, 0, 0.07],
  winter:  [0.0, 0.15, 0.45, 0, 0, 0.02],
  monsoon: [0.8, 0.0, 0.2, 0.55, 0, 0.03],
  misty:   [0.8, 0.15, 0.15, 0, 0, 0.18],
};

export class Ambience {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.mix = MIX.summer;
    this.rainLevel = 0;
    this.wind = 0;
  }

  async start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.build();
    }
    await this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.5);
    this.applyMix();
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
  }

  noiseBuffer(seconds, color = 'white') {
    const c = this.ctx, n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (color === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
        } else d[i] = w;
      }
    }
    return buf;
  }

  // Leaves: thousands of tiny noise grains, high-passed. Dry leaves = fewer, shorter, sharper grains.
  rustleBuffer(seconds, rate, minLen, maxLen, hp) {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * seconds);
    const buf = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const grains = Math.floor(rate * seconds);
      for (let g = 0; g < grains; g++) {
        const start = Math.floor(Math.random() * n);
        const len = Math.floor((minLen + Math.random() * (maxLen - minLen)) * sr);
        const amp = Math.pow(Math.random(), 2.5);
        for (let i = 0; i < len; i++) {
          const env = Math.sin((Math.PI * i) / len) ** 2;
          d[(start + i) % n] += (Math.random() * 2 - 1) * amp * env;
        }
      }
      let px = 0, py = 0, peak = 0;
      for (let i = 0; i < n; i++) { const x = d[i]; py = hp * (py + x - px); px = x; d[i] = py; peak = Math.max(peak, Math.abs(py)); }
      for (let i = 0; i < n; i++) d[i] *= 0.9 / (peak || 1);
    }
    return buf;
  }

  loop(buffer, ...nodes) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    src.loopStart = 0; src.loopEnd = buffer.duration;
    let prev = src;
    for (const n of nodes) { prev.connect(n); prev = n; }
    src.start(0, Math.random() * buffer.duration);
    return prev;
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);

    const bp = (f, q) => { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; };
    const lp = (f) => { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; return b; };
    const hpf = (f) => { const b = c.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = f; return b; };
    const gain = (v = 0) => { const g = c.createGain(); g.gain.value = v; return g; };

    this.leafyFilter = bp(3200, 0.6);
    this.leafy = gain();
    this.loop(this.rustleBuffer(5, 520, 0.006, 0.045, 0.9), this.leafyFilter, this.leafy).connect(this.master);

    this.dryFilter = bp(4200, 0.9);
    this.dry = gain();
    this.loop(this.rustleBuffer(5, 260, 0.0015, 0.012, 0.97), this.dryFilter, this.dry).connect(this.master);

    this.windFilter = lp(420);
    this.windGain = gain();
    this.loop(this.noiseBuffer(6, 'brown'), this.windFilter, this.windGain).connect(this.master);

    this.rainGain = gain();
    this.loop(this.noiseBuffer(4, 'pink'), hpf(450), lp(5200), this.rainGain).connect(this.master);

    // Cicadas: narrow band of noise pulsed ~50 times a second, swelling in and out.
    this.cicadaAmp = gain(0.5);
    const lfo = c.createOscillator(); lfo.frequency.value = 48;
    const lfoDepth = gain(0.5); lfo.connect(lfoDepth).connect(this.cicadaAmp.gain); lfo.start();
    this.cicada = gain();
    this.loop(this.noiseBuffer(3), bp(5200, 9), this.cicadaAmp, this.cicada).connect(this.master);

    this.brown = this.noiseBuffer(5, 'brown');
    this.tick = setInterval(() => this.ambientTick(), 250);
    this.cicadaNext = c.currentTime + 4;
  }

  setScene(key, weather, night = 0) {
    this.night = night;
    this.crickets = night > 0.5 && key !== 'winter' && !(weather && ['rain', 'heavy', 'storm', 'snow'].includes(weather.kind));
    this.mix = [...(MIX[key] || MIX.summer)];
    if (night > 0.5) { this.mix[4] = 0; this.mix[5] = 0; } // no cicadas or birdsong at night
    const rain = weather ? { drizzle: 0.25, rain: 0.45, heavy: 0.65, storm: 0.65 }[weather.kind] || 0 : 0;
    this.rainLevel = Math.max(this.mix[3], rain);
    this.applyMix();
  }

  applyMix() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(this.rainLevel * 0.5, t, 1.2);
    if (this.mix[4] === 0) this.cicada.gain.setTargetAtTime(0, t, 1);
  }

  // Called every frame with 0–1 wind energy (cursor + breeze).
  setWind(w) {
    if (!this.ctx || !this.on) return;
    this.wind = w;
    const t = this.ctx.currentTime;
    const e = Math.pow(w, 1.3);
    this.leafy.gain.setTargetAtTime(e * 0.85 * this.mix[0], t, 0.08);
    this.dry.gain.setTargetAtTime(e * 0.6 * this.mix[1], t, 0.06);
    this.leafyFilter.frequency.setTargetAtTime(1800 + w * 3200, t, 0.1);
    this.dryFilter.frequency.setTargetAtTime(2800 + w * 3000, t, 0.1);
    this.windGain.gain.setTargetAtTime((0.25 + w * 0.75) * this.mix[2], t, 0.3);
    this.windFilter.frequency.setTargetAtTime(260 + w * 600, t, 0.3);
  }

  ambientTick() {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime;
    if (Math.random() < this.mix[5] * 0.25) this.chirp();
    if (this.crickets && Math.random() < 0.55) this.cricket();
    if (this.mix[4] > 0 && t > this.cicadaNext) {
      const peak = this.mix[4] * (0.5 + Math.random() * 0.5) * 0.35;
      const g = this.cicada.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(peak, t + 3); g.setValueAtTime(peak, t + 7); g.linearRampToValueAtTime(0, t + 11);
      this.cicadaNext = t + 14 + Math.random() * 12;
    }
  }

  chirp() {
    const c = this.ctx, t0 = c.currentTime + 0.02;
    const pan = c.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    const out = c.createGain(); out.gain.value = 0.05 + Math.random() * 0.05;
    pan.connect(out).connect(this.master);
    const trill = Math.random() < 0.3;
    const notes = trill ? 8 + Math.floor(Math.random() * 7) : 2 + Math.floor(Math.random() * 4);
    const f0 = 2600 + Math.random() * 1800;
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const o = c.createOscillator(), g = c.createGain();
      const dur = trill ? 0.025 + Math.random() * 0.01 : 0.05 + Math.random() * 0.06;
      const up = Math.random() < 0.6;
      o.frequency.setValueAtTime(f0 * (up ? 1 : 1.35), t);
      o.frequency.exponentialRampToValueAtTime(f0 * (up ? 1.4 : 0.95), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + dur * 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(pan);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + (trill ? 0.015 : 0.05 + Math.random() * 0.08);
    }
  }

  // A field cricket: a short train of pure, very high pulses.
  cricket() {
    const c = this.ctx, t0 = c.currentTime + Math.random() * 0.2;
    const f = 4300 + Math.random() * 500;
    const pan = c.createStereoPanner(); pan.pan.value = Math.random() * 1.8 - 0.9;
    const out = c.createGain(); out.gain.value = 0.018 + Math.random() * 0.02;
    pan.connect(out).connect(this.master);
    const pulses = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const t = t0 + i * 0.045;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      o.connect(g).connect(pan);
      o.start(t); o.stop(t + 0.04);
    }
  }

  thunder(delay = 1) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.brown;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160 + Math.random() * 120;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.08);
    g.gain.setTargetAtTime(0.45, t + 0.3, 0.3);
    g.gain.setTargetAtTime(0.65, t + 0.9, 0.2);
    g.gain.setTargetAtTime(0, t + 1.4, 1.1);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 6);
  }
}
