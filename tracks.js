const I = {
  kick(r, dest, t, gain = 0.8) {
    const o = r.ctx.createOscillator(), g = r.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(g);
    g.connect(dest);
    r.env(g.gain, t, gain, 0.002, 0.02, 0.35);
    o.start(t);
    o.stop(t + 0.45);
  },

  snare(r, dest, t, gain = 0.3) {
    r.noiseHit(dest, { t, filter: 'bandpass', freq: 1800, q: 0.8, gain, r: 0.18 });
    r.tone(dest, { f: 185, type: 'triangle', t, gain: gain * 0.5, r: 0.09 });
  },

  hat(r, dest, t, gain = 0.05, open = false) {
    r.noiseHit(dest, { t, filter: 'highpass', freq: 7500, gain, r: open ? 0.25 : 0.045 });
  },

  pad(r, dest, notes, t, dur, o = {}) {
    const { gain = 0.03, cutoff = 900, a = 1.5, rel = 2, type = 'sawtooth', spread = 8, tilt = 1 } = o;
    const f = r.filter('lowpass', cutoff, 0.4), g = r.ctx.createGain();
    f.connect(g);
    g.connect(dest);
    const end = r.env(g.gain, t, 1, a, Math.max(0, dur - a), rel);
    notes.forEach((m, i) => {
      const noteGain = gain * Math.pow(tilt, i);
      for (const d of [-spread, spread]) {
        const osc = r.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = mtof(m) * r.pitch;
        osc.detune.value = d + rand(-2, 2);
        const og = r.gain(noteGain);
        osc.connect(og);
        og.connect(f);
        osc.start(t);
        osc.stop(end + 0.1);
      }
    });
  },

  piano(r, dest, m, t, vel = 0.5, pan = 0) {
    const f = mtof(m), len = 4.5 * Math.pow(0.5, (m - 60) / 24);
    [[1, 1], [2, 0.45], [3, 0.2], [4.02, 0.1], [5.03, 0.05]].forEach(([h, amp], k) =>
      r.tone(dest, { f: f * h, t, gain: vel * amp * 0.12, a: 0.004, r: len / (1 + k * 0.7), pan }));
    r.noiseHit(dest, { t, filter: 'bandpass', freq: Math.min(f * 4, 9000), q: 1, gain: vel * 0.02, r: 0.03, pan });
  },

  ep(r, dest, m, t, vel = 0.5, dur = 1.2, pan = 0) {
    const f = mtof(m);
    r.tone(dest, { f, t, gain: vel * 0.09, a: 0.005, hold: dur * 0.3, r: dur, pan });
    r.tone(dest, { f: f * 1.003, type: 'triangle', t, gain: vel * 0.025, a: 0.005, hold: dur * 0.3, r: dur, pan });
    r.tone(dest, { f: f * 2, t, gain: vel * 0.03, a: 0.003, r: 0.4, pan });
  },

  pluck(r, dest, m, t, gain = 0.08, pan = 0, dec = 0.6) {
    r.tone(dest, { f: mtof(m), type: 'triangle', t, gain, a: 0.003, r: dec, pan });
    r.tone(dest, { f: mtof(m + 12), t, gain: gain * 0.35, a: 0.003, r: dec * 0.5, pan });
  },

  bell(r, dest, m, t, gain = 0.05, pan = 0) {
    const f = mtof(m);
    [[1, 1, 6], [2.76, 0.4, 3], [5.4, 0.2, 1.5], [8.93, 0.08, 0.8]].forEach(([h, amp, d]) =>
      r.tone(dest, { f: f * h, t, gain: gain * amp, a: 0.004, r: d, pan }));
  },

  chirp(r, dest, t, f0, f1, dur, gain, pan) {
    const o = r.tone(dest, { f: f0, t, gain, a: 0.01, r: dur, pan });
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  },

  synth(r, dest, m, t, o = {}) {
    const { type = 'sawtooth', gain = 0.08, a = 0.003, hold = 0, rel = 0.3, cutoff = 300, env = 2500, fdec = 0.15, q = 4, pan, detune = 0 } = o;
    const f = r.filter('lowpass', cutoff, q);
    f.frequency.setValueAtTime(cutoff + env, t);
    f.frequency.setTargetAtTime(cutoff, t + a, fdec / 3);
    const osc = r.tone(f, { f: mtof(m), type, t, gain, a, hold, r: rel, detune });
    r.withPan(f, pan, dest);
    return osc;
  },

  guitar(r, dest, m, t, vel = 0.5, pan = 0) {
    const f = mtof(m), dec = 2.2 * Math.pow(0.5, (m - 52) / 24);
    I.synth(r, dest, m, t, { gain: vel * 0.08, rel: dec, cutoff: f * 1.5, env: f * 6, fdec: 0.25, q: 1, pan });
    r.tone(dest, { f, type: 'triangle', t, gain: vel * 0.05, a: 0.002, r: dec, pan });
  },

  marimba(r, dest, m, t, vel = 0.5, pan = 0) {
    const f = mtof(m);
    r.tone(dest, { f, t, gain: vel * 0.16, a: 0.002, r: 0.6, pan });
    r.tone(dest, { f: f * 3.93, t, gain: vel * 0.04, a: 0.001, r: 0.08, pan });
    r.tone(dest, { f: f * 9.2, t, gain: vel * 0.01, a: 0.001, r: 0.03, pan });
  },

  clap(r, dest, t, gain = 0.2) {
    [0, 0.011, 0.023].forEach((d, k) =>
      r.noiseHit(dest, { t: t + d, filter: 'bandpass', freq: 1200, q: 1.2, gain: gain * (k === 2 ? 1 : 0.6), r: k === 2 ? 0.16 : 0.01 }));
  },
};

const TRACKS = [
  {
    id: 'deep',
    name: 'Глубокая работа',
    subtitle: 'Эмбиент-электроника · пэды и арпеджио',
    category: 'Фокус',
    mod: 16,
    bpm: 90,
    colors: ['#5b7cfa', '#9b5cf6'],
    setup(r) {
      r.s.pad = r.bus(0.6, 0.5);
      r.s.arp = r.bus(0.35, 0.8);
      r.s.bass = r.bus(0.9, 0.05);
      r.s.perc = r.bus(0.6, 0.2);
      r.s.prog = [
        { root: 45, notes: [57, 60, 64, 71] },
        { root: 41, notes: [57, 60, 64, 67] },
        { root: 36, notes: [55, 59, 64, 67] },
        { root: 43, notes: [55, 59, 62, 64] },
      ];
    },
    step(r, i, t) {
      const sd = r.stepDur, ch = r.s.prog[Math.floor(i / 32) % 4];
      if (i % 32 === 0) I.pad(r, r.s.pad, ch.notes, t, 32 * sd, { gain: 0.022, cutoff: 1100, a: 2 });
      if (i % 16 === 0) r.tone(r.s.bass, { f: mtof(ch.root), t, gain: 0.22, a: 0.05, hold: 12 * sd, r: 1 });
      if (i % 2 === 0 && chance(0.55)) I.pluck(r, r.s.arp, pick(ch.notes) + 12, t, 0.06, rand(-0.6, 0.6), 0.5);
      if (i % 4 === 2) I.hat(r, r.s.perc, t, 0.025);
    },
  },

  {
    id: 'lofi',
    name: 'Лоу-фай вечер',
    subtitle: 'Ленивый бит · электропиано · винил',
    category: 'Фокус',
    mod: 14,
    bpm: 78,
    colors: ['#f59e0b', '#ef4444'],
    setup(r) {
      r.s.drums = r.bus(0.85, 0.08);
      r.s.keys = r.bus(0.6, 0.35);
      r.s.bass = r.bus(0.9, 0);
      r.s.vinyl = r.bus(1, 0);
      const hiss = r.loopNoise('pink'), hp = r.filter('highpass', 2500), g = r.gain(0.012);
      hiss.connect(hp);
      hp.connect(g);
      g.connect(r.s.vinyl);
      r.s.prog = [
        { root: 38, notes: [53, 57, 60, 64] },
        { root: 43, notes: [53, 57, 59, 64] },
        { root: 36, notes: [52, 55, 59, 62] },
        { root: 45, notes: [55, 61, 64, 67] },
      ];
      r.s.mel = [62, 65, 67, 69, 72, 74, 77];
      r.s.mi = 3;
    },
    step(r, i, t) {
      const sd = r.stepDur, b = i % 16, ch = r.s.prog[Math.floor(i / 16) % 4];
      if (i % 2) t += sd * 0.22;
      if (b === 0 || b === 10 || (b === 7 && chance(0.3))) I.kick(r, r.s.drums, t, 0.7);
      if (b === 4 || b === 12) I.snare(r, r.s.drums, t, 0.18);
      if (b % 2 === 0) I.hat(r, r.s.drums, t, b % 4 === 0 ? 0.05 : 0.03);
      else if (chance(0.15)) I.hat(r, r.s.drums, t, 0.015);
      if (b === 0) ch.notes.forEach((m, k) => I.ep(r, r.s.keys, m, t + k * 0.012, 0.55, 16 * sd * 0.8));
      if (b === 6 && chance(0.4)) ch.notes.slice(1).forEach(m => I.ep(r, r.s.keys, m, t, 0.3, 0.4));
      if (b === 0 || b === 10) r.tone(r.s.bass, { f: mtof(ch.root), type: 'triangle', t, gain: 0.2, a: 0.01, hold: sd * 3, r: 0.3 });
      if (b % 2 === 0 && b !== 0 && chance(0.14)) {
        r.s.mi = clamp(r.s.mi + pick([-2, -1, 1, 2]), 0, r.s.mel.length - 1);
        I.ep(r, r.s.keys, r.s.mel[r.s.mi], t, 0.35, 0.8, 0.2);
      }
      if (chance(0.25)) r.noiseHit(r.s.vinyl, { t: t + rand(0, sd), filter: 'highpass', freq: 3000, gain: rand(0.005, 0.03), r: 0.004 });
    },
  },

  {
    id: 'rain',
    level: 2.6,
    name: 'Дождь в лесу',
    subtitle: 'Природа · дождь, птицы, мягкий дрон',
    category: 'Расслабление',
    mod: 10,
    bpm: 120,
    colors: ['#10b981', '#0ea5e9'],
    setup(r) {
      const rain = r.loopNoise('pink'), hp = r.filter('highpass', 600), lp = r.filter('lowpass', 8000), rg = r.gain(0.22);
      rain.connect(hp);
      hp.connect(lp);
      lp.connect(rg);
      rg.connect(r.bus(0.8, 0.25));
      const rumble = r.loopNoise('brown'), rlp = r.filter('lowpass', 250), rug = r.gain(0.25);
      rumble.connect(rlp);
      rlp.connect(rug);
      rug.connect(r.bus(1, 0));
      r.s.fx = r.bus(0.5, 0.6);
      r.s.birds = r.bus(0.45, 0.7);
      r.s.drone = r.bus(0.5, 0.6);
      r.s.nextBird = r.ctx.currentTime + 2;
      r.s.chords = [[38, 45, 50], [36, 43, 48]];
    },
    step(r, i, t) {
      if (chance(0.6)) {
        r.tone(r.s.fx, { f: rand(1800, 4500), t: t + rand(0, r.stepDur), gain: rand(0.006, 0.025), a: 0.001, r: 0.03, pan: rand(-0.9, 0.9) });
      }
      if (t >= r.s.nextBird) {
        const n = randInt(3, 7), base = rand(2400, 4200), pan = rand(-0.8, 0.8), gap = rand(0.08, 0.16);
        for (let k = 0; k < n; k++) I.chirp(r, r.s.birds, t + k * gap, base * rand(0.9, 1.15), base * rand(1.2, 1.6), gap * 0.7, 0.03, pan);
        r.s.nextBird = t + rand(3, 10);
      }
      if (i % 128 === 0) {
        I.pad(r, r.s.drone, r.s.chords[(i / 128) % 2], t, 128 * r.stepDur, { type: 'sine', gain: 0.016, cutoff: 360, a: 8, rel: 10, spread: 1.5, tilt: 0.45 });
      }
    },
  },

  {
    id: 'pulse',
    level: 1.3,
    name: 'Импульс',
    subtitle: 'Кинематографичный синт · секвенсор',
    category: 'Фокус',
    mod: 18,
    bpm: 116,
    colors: ['#ec4899', '#8b5cf6'],
    setup(r) {
      const f = r.filter('lowpass', 1400, 7);
      const lfo = r.drone('sine', 0.045), lg = r.gain(900);
      lfo.connect(lg);
      lg.connect(f.frequency);
      const delay = r.ctx.createDelay(1), fb = r.gain(0.35), dl = r.gain(0.5);
      delay.delayTime.value = r.stepDur * 3;
      const out = r.bus(0.55, 0.35);
      f.connect(out);
      f.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(dl);
      r.withPan(dl, 0.5, out);
      r.s.arp = f;
      r.s.low = r.bus(0.8, 0.2);
      r.s.drums = r.bus(0.8, 0.1);
      r.s.pad = r.bus(0.4, 0.7);
      r.s.prog = [
        { root: 28, notes: [52, 55, 59, 64] },
        { root: 24, notes: [52, 55, 60, 64] },
        { root: 31, notes: [50, 55, 59, 62] },
        { root: 26, notes: [50, 54, 57, 62] },
      ];
      r.s.pat = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 0, 3, 2, 1];
    },
    step(r, i, t) {
      const sd = r.stepDur, b = i % 16, bar = Math.floor(i / 16), ch = r.s.prog[Math.floor(i / 32) % 4];
      const m = ch.notes[r.s.pat[b]] + (bar % 4 === 3 && b >= 8 ? 12 : 0);
      r.tone(r.s.arp, { f: mtof(m), type: 'sawtooth', t, gain: b % 4 === 0 ? 0.09 : 0.06, a: 0.003, r: sd * 1.6 });
      if (b % 4 === 0) I.kick(r, r.s.drums, t, 0.45);
      if (b % 4 === 2 && bar % 2) I.hat(r, r.s.drums, t, 0.03);
      if (i % 32 === 0) {
        I.pad(r, r.s.low, [ch.root + 12, ch.root + 24], t, 32 * sd, { gain: 0.05, cutoff: 350, a: 0.3, rel: 1 });
        I.pad(r, r.s.pad, ch.notes.map(n => n + 12), t, 32 * sd, { gain: 0.008, cutoff: 2500, a: 2.5, rel: 3 });
      }
    },
  },

  {
    id: 'techno',
    name: 'Минимал-техно',
    subtitle: 'Ровная бочка · бас на слабую долю · даб-аккорды',
    category: 'Фокус',
    mod: 16,
    bpm: 124,
    colors: ['#22d3ee', '#6366f1'],
    setup(r) {
      r.s.drums = r.bus(0.9, 0.05);
      r.s.bass = r.bus(0.9, 0);
      const stab = r.filter('lowpass', 1200, 3);
      const lfo = r.drone('sine', 0.03), lg = r.gain(700);
      lfo.connect(lg);
      lg.connect(stab.frequency);
      const delay = r.ctx.createDelay(1), fb = r.gain(0.45);
      delay.delayTime.value = r.stepDur * 3;
      const out = r.bus(0.5, 0.6);
      stab.connect(out);
      stab.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      r.withPan(delay, -0.4, out);
      r.s.stab = stab;
      const air = r.loopNoise('pink'), hp = r.filter('highpass', 5000), ag = r.gain(0.006);
      air.connect(hp);
      hp.connect(ag);
      ag.connect(r.bus(0.6, 0.4));
      r.s.prog = [
        { root: 33, notes: [57, 60, 64] },
        { root: 29, notes: [57, 60, 65] },
      ];
    },
    step(r, i, t) {
      const b = i % 16, bar = Math.floor(i / 16), ch = r.s.prog[Math.floor(i / 64) % 2];
      if (b % 4 === 0) I.kick(r, r.s.drums, t, 0.75);
      if (b % 4 === 2) {
        I.hat(r, r.s.drums, t, 0.045, true);
        I.synth(r, r.s.bass, ch.root + 12, t, { gain: 0.12, rel: 0.15, cutoff: 180, env: 900, fdec: 0.08, q: 6 });
      } else if (chance(0.7)) I.hat(r, r.s.drums, t, 0.012);
      if (bar % 8 >= 2 && (b === 4 || b === 12)) I.clap(r, r.s.drums, t, 0.14);
      if ([3, 7, 11, 14].includes(b) && chance(0.3)) {
        ch.notes.forEach(m => I.synth(r, r.s.stab, m, t, { gain: 0.035, rel: 0.2, cutoff: 600, env: 1500, fdec: 0.1, q: 2 }));
      }
    },
  },

  {
    id: 'guitar',
    level: 8,
    name: 'Акустика',
    subtitle: 'Пальцевая гитара · шейкер',
    category: 'Фокус',
    mod: 15,
    bpm: 92,
    colors: ['#d97706', '#65a30d'],
    setup(r) {
      r.s.bass = r.bus(0.7, 0.3, -0.1);
      r.s.treble = r.bus(0.6, 0.4, 0.15);
      r.s.shaker = r.bus(0.6, 0.2, 0.4);
      r.s.prog = [
        { root: 43, notes: [55, 59, 62, 67] },
        { root: 40, notes: [52, 55, 59, 64] },
        { root: 36, notes: [52, 55, 60, 64] },
        { root: 38, notes: [50, 54, 57, 62] },
      ];
    },
    step(r, i, t) {
      const b = i % 16, ch = r.s.prog[Math.floor(i / 32) % 4], hum = rand(0, 0.012);
      const thumb = { 0: ch.root, 4: ch.root + 7, 8: ch.root, 12: ch.root + 7 };
      const finger = { 0: 3, 2: 2, 6: 1, 10: 3, 14: 2 };
      if (b in thumb) I.guitar(r, r.s.bass, thumb[b], t + hum, b === 0 ? 0.6 : 0.45);
      if (b in finger) I.guitar(r, r.s.treble, ch.notes[finger[b]], t + hum, rand(0.3, 0.45));
      else if (b % 2 === 1 && chance(0.12)) I.guitar(r, r.s.treble, pick(ch.notes) + 12, t, 0.2);
      r.noiseHit(r.s.shaker, { t, filter: 'bandpass', freq: 6000, q: 1, gain: b % 4 === 2 ? 0.03 : 0.012, a: 0.01, r: 0.06 });
    },
  },

  {
    id: 'synthwave',
    name: 'Ночное шоссе',
    subtitle: 'Синтвейв · басовые восьмые · гулкий малый',
    category: 'Фокус',
    mod: 16,
    bpm: 100,
    colors: ['#f43f5e', '#a855f7'],
    setup(r) {
      r.s.drums = r.bus(0.8, 0.1);
      r.s.snare = r.bus(0.6, 0.8);
      r.s.bass = r.bus(0.9, 0);
      r.s.pad = r.bus(0.4, 0.6);
      const delay = r.ctx.createDelay(1), fb = r.gain(0.4), lead = r.gain(1);
      delay.delayTime.value = r.stepDur * 3;
      const out = r.bus(0.45, 0.5);
      lead.connect(out);
      lead.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      r.withPan(delay, 0.4, out);
      r.s.lead = lead;
      r.s.prog = [
        { root: 33, notes: [57, 60, 64, 69] },
        { root: 29, notes: [57, 60, 65, 69] },
        { root: 36, notes: [55, 60, 64, 67] },
        { root: 31, notes: [55, 59, 62, 67] },
      ];
    },
    step(r, i, t) {
      const sd = r.stepDur, b = i % 16, ch = r.s.prog[Math.floor(i / 32) % 4];
      if (b === 0 || b === 8 || (b === 10 && chance(0.5))) I.kick(r, r.s.drums, t, 0.7);
      if (b === 4 || b === 12) I.snare(r, r.s.snare, t, 0.22);
      if (b % 2 === 0) I.hat(r, r.s.drums, t, 0.022);
      if (b % 2 === 0) I.synth(r, r.s.bass, ch.root + (b % 4 ? 24 : 12), t, { gain: 0.09, rel: sd * 1.5, cutoff: 250, env: 1200, fdec: 0.12, q: 3 });
      if (i % 32 === 0) I.pad(r, r.s.pad, ch.notes, t, 32 * sd, { gain: 0.012, cutoff: 1800, a: 0.8, rel: 1.5, spread: 12 });
      if (Math.floor(i / 16) % 2 === 1 && [0, 3, 6, 10, 12].includes(b) && chance(0.6)) {
        I.synth(r, r.s.lead, pick(ch.notes) + 12, t, { type: 'square', gain: 0.035, hold: sd, rel: sd * 2, cutoff: 1500, env: 1500, fdec: 0.2, q: 1 });
      }
    },
  },

  {
    id: 'marimba',
    level: 3.8,
    name: 'Минимализм',
    subtitle: 'Маримбы в фазовом сдвиге, как у Стива Райха',
    category: 'Фокус',
    mod: 17,
    bpm: 132,
    colors: ['#14b8a6', '#eab308'],
    setup(r) {
      r.s.a = r.bus(0.7, 0.35, -0.5);
      r.s.b = r.bus(0.7, 0.35, 0.5);
      r.s.low = r.bus(0.7, 0.4);
      r.s.pad = r.bus(0.3, 0.7);
      r.s.pat = [62, 69, 64, 71, 69, 66, 74, 69, 64, 71, 66, 69];
      r.s.roots = [38, 43, 45, 40];
    },
    step(r, i, t) {
      const sd = r.stepDur, root = r.s.roots[Math.floor(i / 96) % 4], p = r.s.pat;
      I.marimba(r, r.s.a, p[i % 12], t, i % 3 === 0 ? 0.5 : 0.35);
      if (i % 2 === 0) I.marimba(r, r.s.b, p[(i / 2) % 11] - 12, t + 0.004, 0.4);
      if (i % 8 === 0) I.marimba(r, r.s.low, root, t, 0.7);
      if (i % 96 === 0) I.pad(r, r.s.pad, [root + 12, root + 19, root + 24], t, 96 * sd, { type: 'sine', gain: 0.03, cutoff: 1500, a: 3, rel: 3, spread: 3 });
    },
  },

  {
    id: 'liquid',
    level: 0.65,
    name: 'Ликвид',
    subtitle: 'Мягкий драм-н-бейс · саб-бас · тёплые аккорды',
    category: 'Фокус',
    mod: 18,
    bpm: 172,
    colors: ['#06b6d4', '#84cc16'],
    setup(r) {
      r.s.drums = r.bus(0.85, 0.08);
      r.s.sub = r.bus(1, 0);
      r.s.pad = r.bus(0.45, 0.6);
      r.s.keys = r.bus(0.4, 0.7, 0.2);
      r.s.prog = [
        { root: 29, notes: [53, 57, 60, 64] },
        { root: 28, notes: [52, 55, 59, 62] },
        { root: 26, notes: [50, 53, 57, 60] },
        { root: 24, notes: [48, 52, 55, 59] },
      ];
    },
    step(r, i, t) {
      const sd = r.stepDur, b = i % 16, ch = r.s.prog[Math.floor(i / 64) % 4];
      if (b === 0 || (b === 10 && chance(0.8))) I.kick(r, r.s.drums, t, 0.65);
      if (b === 4 || b === 12) I.snare(r, r.s.drums, t, 0.2);
      if (b % 2 === 0) I.hat(r, r.s.drums, t, b % 4 === 2 ? 0.03 : 0.015);
      else if (chance(0.3)) I.snare(r, r.s.drums, t, 0.03);
      if (i % 32 === 0) r.tone(r.s.sub, { f: mtof(ch.root + 12), t, gain: 0.25, a: 0.02, hold: 28 * sd, r: 0.3 });
      if (i % 64 === 0) I.pad(r, r.s.pad, ch.notes, t, 64 * sd, { type: 'triangle', gain: 0.03, cutoff: 1400, a: 1.5, rel: 2, spread: 10 });
      if (b % 4 === 2 && chance(0.15)) I.ep(r, r.s.keys, pick(ch.notes) + 12, t, 0.3, 0.8);
    },
  },

  {
    id: 'noise',
    level: 1.4,
    name: 'Чистый шум',
    subtitle: 'Коричневый шум и тихий дрон, без мелодии',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 16,
    bpm: 60,
    colors: ['#64748b', '#a5b4fc'],
    setup(r) {
      const n = r.loopNoise('brown'), lp = r.filter('lowpass', 900, 0.5), g = r.gain(0.4);
      const lfo = r.drone('sine', 0.02), lg = r.gain(300);
      lfo.connect(lg);
      lg.connect(lp.frequency);
      n.connect(lp);
      lp.connect(g);
      g.connect(r.bus(0.9, 0.15));
      r.bed(r.bus(0.55, 0.45), [40, 47], 0.012);
    },
    step() {},
  },

  {
    id: 'ocean',
    level: 1.9,
    name: 'Ночной океан',
    subtitle: 'Волны и низкий дрон',
    category: 'Сон',
    mod: 2,
    bpm: 60,
    colors: ['#3b5bdb', '#0f766e'],
    setup(r) {
      const surf = r.loopNoise('brown'), lp = r.filter('lowpass', 400, 0.5), wg = r.gain(0.05);
      surf.connect(lp);
      lp.connect(wg);
      wg.connect(r.bus(0.85, 0.3));
      const foam = r.loopNoise('pink'), hp = r.filter('highpass', 2500), fg = r.gain(0.005);
      foam.connect(hp);
      hp.connect(fg);
      fg.connect(r.bus(0.6, 0.5, 0.2));
      r.s.wave = { lp, wg, fg };
      r.s.nextWave = r.ctx.currentTime + 0.5;

      r.bed(r.bus(0.5, 0.55), [38, 45, 50], 0.022);
      r.s.bell = r.bus(0.3, 0.9);
    },
    step(r, i, t) {
      const w = r.s.wave;
      if (t >= r.s.nextWave) {
        const rise = rand(3, 5), fall = rand(5, 8), peak = rand(0.35, 0.6);
        w.wg.gain.setTargetAtTime(peak, t, rise / 3);
        w.wg.gain.setTargetAtTime(0.06, t + rise, fall / 3);
        w.lp.frequency.setTargetAtTime(rand(900, 1600), t, rise / 3);
        w.lp.frequency.setTargetAtTime(350, t + rise, fall / 3);
        w.fg.gain.setTargetAtTime(peak * 0.06, t + rise * 0.8, 0.6);
        w.fg.gain.setTargetAtTime(0.003, t + rise + 0.5, fall / 3);
        r.s.nextWave = t + rise + fall * 0.7;
      }
      if (i % 16 === 0 && chance(0.18)) I.bell(r, r.s.bell, pick([62, 66, 69, 74, 78, 81]), t, 0.025, rand(-0.5, 0.5));
    },
  },

  {
    id: 'piano',
    level: 6,
    name: 'Пианино у окна',
    subtitle: 'Неспешное фортепиано · много воздуха',
    category: 'Расслабление',
    mod: 8,
    bpm: 64,
    colors: ['#f472b6', '#fb923c'],
    setup(r) {
      r.s.lh = r.bus(0.55, 0.6, -0.15);
      r.s.rh = r.bus(0.5, 0.7, 0.15);
      const room = r.loopNoise('brown'), lp = r.filter('lowpass', 500), g = r.gain(0.02);
      room.connect(lp);
      lp.connect(g);
      g.connect(r.bus(1, 0));
      r.s.prog = [
        { root: 36, notes: [48, 55, 59, 64] },
        { root: 33, notes: [45, 52, 55, 60] },
        { root: 29, notes: [41, 48, 52, 57] },
        { root: 31, notes: [43, 50, 55, 59] },
      ];
      r.s.scale = [67, 69, 72, 74, 76, 79, 81, 84];
      r.s.mi = 2;
    },
    step(r, i, t) {
      const b = i % 16, ch = r.s.prog[Math.floor(i / 16) % 4];
      if (b === 0) I.piano(r, r.s.lh, ch.root + 12, t, 0.55);
      if (b === 4) I.piano(r, r.s.lh, ch.notes[1], t, 0.35);
      if (b === 8) ch.notes.slice(1).forEach((m, k) => I.piano(r, r.s.lh, m, t + k * 0.06, 0.3));
      if ([0, 4, 6, 10, 12].includes(b) && chance(b === 0 ? 0.7 : 0.35)) {
        r.s.mi = clamp(r.s.mi + pick([-2, -1, -1, 1, 1, 2]), 0, r.s.scale.length - 1);
        I.piano(r, r.s.rh, r.s.scale[r.s.mi], t + rand(0, 0.02), rand(0.3, 0.5));
      }
    },
  },
];
