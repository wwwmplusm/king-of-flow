const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

class Engine {
  constructor() {
    this.ctx = null;
    this.active = [];
    this.depth = 0.55;
    this.volume = 0.8;
  }

  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.noise = {
      white: this.makeNoise('white'),
      pink: this.makeNoise('pink'),
      brown: this.makeNoise('brown'),
    };
    this.beds = null;
    this.impulse = this.makeImpulse(3.8, 2.6);

    setInterval(() => this.tick(), 25);
  }

  makeNoise(kind) {
    const ctx = this.ctx, len = ctx.sampleRate * 6;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') {
        d[i] = w * 0.5;
      } else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  ensureBeds() {
    if (this.beds) return;
    this.beds = {
      white: this.makeBed('white'),
      pink: this.makeBed('pink'),
      brown: this.makeBed('brown'),
    };
  }

  makeBed(kind) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const seconds = 16, fade = Math.floor(sr * 0.8), len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    const leak = Math.exp(-2 * Math.PI * 18 / sr);
    for (let ch = 0; ch < 2; ch++) {
      const raw = new Float32Array(len + fade);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, dc = 0;
      for (let i = 0; i < raw.length; i++) {
        const w = Math.random() * 2 - 1;
        let x;
        if (kind === 'white') {
          x = w;
        } else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          x = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          x = last * 3.5;
        }
        dc = leak * dc + (1 - leak) * x;
        raw[i] = x - dc;
      }
      const out = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) out[i] = raw[i];
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        out[i] = raw[i] * k + raw[len + i] * (1 - k);
      }
      let sum = 0, peak = 0;
      for (let i = 0; i < len; i++) {
        const s = out[i];
        sum += s * s;
        const a = s < 0 ? -s : s;
        if (a > peak) peak = a;
      }
      let g = 0.15 / Math.sqrt(sum / len);
      if (peak * g > 0.95) g = 0.95 / peak;
      for (let i = 0; i < len; i++) out[i] *= g;
    }
    return buf;
  }

  makeImpulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  tick() {
    const ahead = document.hidden ? 1.0 : 0.15;
    const until = this.ctx.currentTime + ahead;
    for (const r of this.active) r.schedule(until);
  }

  setDepth(d) {
    this.depth = d;
    for (const r of this.active) r.setDepth(d);
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
}

class TrackRuntime {
  constructor(engine, def) {
    this.e = engine;
    this.ctx = engine.ctx;
    this.def = def;
    this.s = {};
    this.sources = [];
    this.stopping = false;
    const ctx = this.ctx;

    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.am = ctx.createGain();
    this.amDepth = ctx.createGain();
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = def.mod;
    this.lfo.connect(this.amDepth);
    this.amDepth.connect(this.am.gain);
    this.am.gain.value = 1 - engine.depth / 2;
    this.amDepth.gain.value = engine.depth / 2;

    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = engine.impulse;
    this.dry.connect(this.am);
    this.wet.connect(this.reverb);
    this.reverb.connect(this.am);
    this.am.connect(this.fade);
    this.fade.connect(engine.master);

    this.pitch = def.vary === false ? 1 : Math.pow(2, randInt(-2, 2) / 12);
    this.bpm = (def.bpm || 120) * rand(0.96, 1.04);
    this.stepDur = 60 / this.bpm / 4;
    this.label = '';
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
  }

  start(fadeIn = 1.5) {
    const t = this.ctx.currentTime;
    this.lfo.start(t);
    this.def.setup(this);
    this.fade.gain.setValueAtTime(0, t);
    this.fade.gain.linearRampToValueAtTime(this.def.level || 1, t + fadeIn);
    this.e.active.push(this);
  }

  stop(fadeOut = 2.5) {
    if (this.stopping) return;
    this.stopping = true;
    const t = this.ctx.currentTime, g = this.fade.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fadeOut);
    this.stopAt = t + fadeOut;
    setTimeout(() => {
      for (const s of this.sources) { try { s.stop(); } catch (_) {} }
      try { this.lfo.stop(); } catch (_) {}
      this.fade.disconnect();
      this.e.active = this.e.active.filter(r => r !== this);
    }, fadeOut * 1000 + 400);
  }

  schedule(until) {
    if (this.stopping && this.ctx.currentTime > this.stopAt) return;
    while (this.nextTime < until) {
      this.def.step(this, this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }

  setDepth(d) {
    const t = this.ctx.currentTime;
    this.am.gain.setTargetAtTime(1 - d / 2, t, 0.1);
    this.amDepth.gain.setTargetAtTime(d / 2, t, 0.1);
  }

  gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  bus(dry = 1, wet = 0, pan = 0) {
    const g = this.ctx.createGain();
    let n = g;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      n = p;
    }
    if (dry) { const d = this.gain(dry); n.connect(d); d.connect(this.dry); }
    if (wet) { const w = this.gain(wet); n.connect(w); w.connect(this.wet); }
    return g;
  }

  loopNoise(kind) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.e.noise[kind];
    src.loop = true;
    src.start(this.ctx.currentTime, rand(0, src.buffer.duration));
    this.sources.push(src);
    return src;
  }

  drone(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(this.ctx.currentTime);
    this.sources.push(o);
    return o;
  }

  bed(dest, notes, gain = 0.02) {
    const g = this.gain(1);
    const breath = this.drone('sine', rand(0.015, 0.03));
    const bg = this.gain(0.05);
    breath.connect(bg);
    bg.connect(g.gain);
    g.connect(dest);
    notes.forEach((m, i) => {
      const f = mtof(m) * this.pitch;
      const amp = gain * Math.pow(0.5, i);
      const copies = i === 0 ? [-1.5, 1.5] : [0];
      for (const cents of copies) {
        const o = this.drone('sine', f);
        o.detune.value = cents;
        const og = this.gain(amp / copies.length);
        const dly = this.ctx.createDelay(0.05);
        dly.delayTime.value = rand(0, 0.85) / f;
        o.connect(dly);
        dly.connect(og);
        og.connect(g);
      }
    });
    return g;
  }

  env(param, t, peak, a, hold, r) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    if (hold > 0) param.setValueAtTime(Math.max(peak, 0.0002), t + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    return t + a + hold + r;
  }

  withPan(node, pan, dest) {
    if (pan === undefined || pan === 0) { node.connect(dest); return; }
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    p.connect(dest);
  }

  tone(dest, o) {
    const { f, type = 'sine', t, a = 0.005, hold = 0, r = 0.5, gain = 0.1, detune = 0, pan } = o;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f * this.pitch;
    osc.detune.value = detune;
    const g = this.ctx.createGain();
    osc.connect(g);
    this.withPan(g, pan, dest);
    const end = this.env(g.gain, t, gain, a, hold, r);
    osc.start(t);
    osc.stop(end + 0.05);
    return osc;
  }

  noiseHit(dest, o) {
    const { t, kind = 'white', filter = 'highpass', freq = 6000, q = 0.7, gain = 0.1, a = 0.001, r = 0.05, pan } = o;
    const src = this.ctx.createBufferSource();
    src.buffer = this.e.noise[kind];
    const f = this.filter(filter, freq, q);
    const g = this.ctx.createGain();
    src.connect(f);
    f.connect(g);
    this.withPan(g, pan, dest);
    const end = this.env(g.gain, t, gain, a, 0, r);
    src.start(t, rand(0, 5));
    src.stop(end + 0.05);
  }
}
