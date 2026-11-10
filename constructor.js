const RIG_KEYS = ['white', 'pink', 'brown', 'bright', 'lowcut', 'warmth', 'drift', 'width', 'space', 'mod'];

const RIG_PRESETS = [
  { id: 'silk', name: 'Шёлк', white: 0, pink: 58, brown: 72, bright: 48, lowcut: 16, warmth: 34, drift: 26, width: 78, space: 16, mod: 16 },
  { id: 'brown', name: 'Коричневый', white: 0, pink: 0, brown: 100, bright: 30, lowcut: 10, warmth: 22, drift: 12, width: 64, space: 8, mod: 16 },
  { id: 'pink', name: 'Розовый', white: 0, pink: 100, brown: 0, bright: 70, lowcut: 18, warmth: 12, drift: 16, width: 80, space: 12, mod: 16 },
  { id: 'white', name: 'Мягкий белый', white: 100, pink: 0, brown: 0, bright: 62, lowcut: 34, warmth: 6, drift: 10, width: 84, space: 6, mod: 14 },
  { id: 'sand', name: 'Песок', white: 10, pink: 64, brown: 58, bright: 56, lowcut: 20, warmth: 28, drift: 34, width: 76, space: 14, mod: 16 },
  { id: 'coal', name: 'Уголь', white: 18, pink: 8, brown: 88, bright: 26, lowcut: 8, warmth: 42, drift: 14, width: 52, space: 10, mod: 10 },
  { id: 'air', name: 'Воздух', white: 72, pink: 34, brown: 0, bright: 84, lowcut: 78, warmth: 0, drift: 22, width: 92, space: 30, mod: 12 },
  { id: 'rain', name: 'Дождь', white: 28, pink: 82, brown: 12, bright: 76, lowcut: 64, warmth: 4, drift: 46, width: 88, space: 24, mod: 10 },
  { id: 'deep', name: 'Гул', white: 0, pink: 18, brown: 100, bright: 16, lowcut: 4, warmth: 30, drift: 18, width: 46, space: 22, mod: 4 },
  { id: 'trio', name: 'Три цвета', white: 40, pink: 55, brown: 62, bright: 60, lowcut: 18, warmth: 18, drift: 58, width: 86, space: 18, mod: 16 },
];

function rigLog(v, a, b) {
  return a * Math.pow(b / a, v / 100);
}

function rigBrightHz(v) {
  return rigLog(v, 160, 14000);
}

function rigLowHz(v) {
  return rigLog(v, 20, 500);
}

function hzText(h) {
  if (h >= 1000) {
    const k = h / 1000;
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)} кГц`;
  }
  return `${Math.round(h)} Гц`;
}

function rigMatch(p) {
  return RIG_PRESETS.find(pre => RIG_KEYS.every(k => pre[k] === p[k])) || null;
}

function rigTitle(p) {
  const m = rigMatch(p);
  return m ? m.name : 'Свой микс';
}

function rigBlurb(p) {
  const bits = [];
  if (p.brown) bits.push(`коричневый ${p.brown}`);
  if (p.pink) bits.push(`розовый ${p.pink}`);
  if (p.white) bits.push(`белый ${p.white}`);
  return bits.join(' · ') || 'Поднимите хотя бы один шум';
}

function rigTune(p) {
  const bits = [
    `яркость ${hzText(rigBrightHz(p.bright))}`,
    `низ ${hzText(rigLowHz(p.lowcut))}`,
  ];
  if (p.warmth) bits.push(`тепло ${p.warmth}%`);
  if (p.drift) bits.push(`дрейф ${p.drift}%`);
  bits.push(p.width === 0 ? 'моно' : `ширина ${p.width}%`);
  if (p.space) bits.push(`пространство ${p.space}%`);
  return bits.join(' · ');
}

function rigPalette(p) {
  const cols = [[214, 211, 209, p.white], [244, 114, 182, p.pink], [194, 65, 12, p.brown]];
  const w = cols.reduce((s, c) => s + c[3], 0);
  if (!w) return ['#64748b', '#a5b4fc'];
  const mix = i => Math.round(cols.reduce((s, c) => s + c[i] * c[3], 0) / w);
  const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  const r = mix(0), g = mix(1), b = mix(2);
  return [hex(r, g, b), hex(r + 36, g + 22, b + 14)];
}

function keepStereo(node) {
  node.channelCount = 2;
  node.channelCountMode = 'explicit';
  node.channelInterpretation = 'discrete';
  return node;
}

class NoiseRig {
  constructor(engine) {
    this.e = engine;
    this.ctx = null;
    this.params = null;
    this.built = false;
    this.running = false;
    this.token = 0;
    this.sources = [];
  }

  start(fadeIn = 1.2) {
    this.token += 1;
    const fresh = !this.built;
    if (fresh) this.build();
    this.running = true;
    this.apply(this.params, fresh);
    const t = this.ctx.currentTime, g = this.fade.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1, t + fadeIn);
  }

  stop(fadeOut = 2.5) {
    if (!this.built) return;
    this.running = false;
    const token = this.token = this.token + 1;
    const t = this.ctx.currentTime, g = this.fade.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fadeOut);
    setTimeout(() => {
      if (this.token !== token) return;
      this.teardown();
    }, fadeOut * 1000 + 300);
  }

  teardown() {
    for (const s of this.sources) { try { s.stop(); } catch (_) {} }
    try { this.fade.disconnect(); } catch (_) {}
    this.sources = [];
    this.built = false;
    this.running = false;
  }

  setDepth(d) {
    if (!this.built || !this.params || !this.params.mod) return;
    const t = this.ctx.currentTime;
    this.am.gain.setTargetAtTime(1 - d / 2, t, 0.1);
    this.amDepth.gain.setTargetAtTime(d / 2, t, 0.1);
  }

  apply(p, immediate) {
    this.params = p;
    if (!this.built || !p) return;
    const t = this.ctx.currentTime;
    const set = (param, v) => {
      if (immediate) param.value = v;
      else param.setTargetAtTime(v, t, 0.08);
    };
    for (const kind of ['white', 'pink', 'brown']) {
      const level = (p[kind] / 100) * 0.5;
      set(this.colors[kind].g.gain, level);
      set(this.colors[kind].lg.gain, level * (p.drift / 100) * 0.45);
    }
    const bright = rigBrightHz(p.bright), low = Math.min(rigLowHz(p.lowcut), bright * 0.85);
    const nyq = this.ctx.sampleRate / 2;
    const depth = Math.min(bright * (p.drift / 100) * 0.18, Math.max(0, bright - low - 30), Math.max(0, nyq * 0.9 - bright));
    set(this.lp.frequency, bright);
    set(this.hp.frequency, low);
    set(this.warm.gain, (p.warmth / 100) * 7);
    set(this.driftDepth.gain, depth);
    set(this.breathDepth.gain, (p.drift / 100) * 0.1);
    set(this.wet.gain, (p.space / 100) * 0.55);
    const w = p.width / 100, same = 0.5 + 0.5 * w, cross = 0.5 - 0.5 * w;
    const norm = 1 / Math.sqrt(same * same + cross * cross);
    set(this.wLL.gain, same * norm);
    set(this.wRR.gain, same * norm);
    set(this.wLR.gain, cross * norm);
    set(this.wRL.gain, cross * norm);
    set(this.modLfo.frequency, Math.max(p.mod, 0.05));
    if (p.mod <= 0) {
      set(this.am.gain, 1);
      set(this.amDepth.gain, 0);
    } else {
      const d = this.e.depth;
      set(this.am.gain, 1 - d / 2);
      set(this.amDepth.gain, d / 2);
    }
  }

  build() {
    const ctx = this.ctx = this.e.ctx;
    this.e.ensureBeds();
    this.sources = [];

    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.am = ctx.createGain();
    this.amDepth = ctx.createGain();
    this.modLfo = ctx.createOscillator();
    this.modLfo.connect(this.amDepth);
    this.amDepth.connect(this.am.gain);
    this.am.connect(this.fade);
    this.fade.connect(this.e.master);

    this.dry = keepStereo(ctx.createGain());
    this.dry.gain.value = 1;
    this.wet = keepStereo(ctx.createGain());
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.e.impulse;
    this.dry.connect(this.am);
    this.wet.connect(this.reverb);
    this.reverb.connect(this.am);

    this.hp = keepStereo(ctx.createBiquadFilter());
    this.hp.type = 'highpass';
    this.hp.Q.value = 0.5;
    this.lp = keepStereo(ctx.createBiquadFilter());
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.5;
    this.warm = keepStereo(ctx.createBiquadFilter());
    this.warm.type = 'peaking';
    this.warm.frequency.value = 280;
    this.warm.Q.value = 0.6;
    this.hp.connect(this.lp);
    this.lp.connect(this.warm);

    this.split = ctx.createChannelSplitter(2);
    this.merge = ctx.createChannelMerger(2);
    this.warm.connect(this.split);
    this.wLL = ctx.createGain();
    this.wLR = ctx.createGain();
    this.wRL = ctx.createGain();
    this.wRR = ctx.createGain();
    this.split.connect(this.wLL, 0);
    this.split.connect(this.wLR, 0);
    this.split.connect(this.wRL, 1);
    this.split.connect(this.wRR, 1);
    this.wLL.connect(this.merge, 0, 0);
    this.wRL.connect(this.merge, 0, 0);
    this.wRR.connect(this.merge, 0, 1);
    this.wLR.connect(this.merge, 0, 1);

    this.body = keepStereo(ctx.createGain());
    this.body.gain.value = 1;
    this.merge.connect(this.body);
    this.body.connect(this.dry);
    this.body.connect(this.wet);

    this.colors = {};
    const rates = { white: 0.017, pink: 0.013, brown: 0.019 };
    for (const kind of ['white', 'pink', 'brown']) {
      const src = ctx.createBufferSource();
      src.buffer = this.e.beds[kind];
      src.loop = true;
      const g = keepStereo(ctx.createGain());
      src.connect(g);
      g.connect(this.hp);
      src.start(ctx.currentTime, Math.random() * src.buffer.duration);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rates[kind];
      const lg = ctx.createGain();
      lfo.connect(lg);
      lg.connect(g.gain);
      lfo.start(ctx.currentTime);
      this.sources.push(src, lfo);
      this.colors[kind] = { g, lg };
    }

    this.driftLfo = ctx.createOscillator();
    this.driftLfo.frequency.value = 0.029;
    this.driftDepth = ctx.createGain();
    this.driftLfo.connect(this.driftDepth);
    this.driftDepth.connect(this.lp.frequency);
    this.driftLfo.start(ctx.currentTime);
    this.sources.push(this.driftLfo);

    this.breath = ctx.createOscillator();
    this.breath.frequency.value = 0.043;
    this.breathDepth = ctx.createGain();
    this.breath.connect(this.breathDepth);
    this.breathDepth.connect(this.body.gain);
    this.breath.start(ctx.currentTime);
    this.sources.push(this.breath);

    this.modLfo.start(ctx.currentTime);
    this.sources.push(this.modLfo);
    this.built = true;
  }
}
