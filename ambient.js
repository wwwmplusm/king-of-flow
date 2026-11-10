TRACKS.push(
  {
    id: 'cabinet',
    level: 1.8,
    name: 'Тихий кабинет',
    subtitle: 'Комната · низкий дрон и редкое пианино',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 14,
    bpm: 60,
    colors: ['#94a3b8', '#d6c4a8'],
    setup(r) {
      const room = r.loopNoise('brown'), lp = r.filter('lowpass', 420, 0.6), g = r.gain(0.16);
      room.connect(lp);
      lp.connect(g);
      g.connect(r.bus(0.9, 0.15));
      const air = r.loopNoise('pink'), hp = r.filter('highpass', 5000), ag = r.gain(0.008);
      air.connect(hp);
      hp.connect(ag);
      ag.connect(r.bus(0.55, 0.25, 0.2));
      r.s.pad = r.bus(0.45, 0.7);
      r.s.keys = r.bus(0.4, 0.75, 0.1);
      r.s.paper = r.bus(0.5, 0.2);
      r.bed(r.bus(0.65, 0.4), [40, 47, 52], 0.02);
      r.s.chords = [[52, 59, 64, 71], [50, 57, 62, 69], [47, 54, 59, 66], [49, 56, 61, 68]];
      r.s.scale = [64, 66, 69, 71, 74, 76, 78];
    },
    step(r, i, t) {
      const sd = r.stepDur;
      if (i % 128 === 0) {
        I.pad(r, r.s.pad, r.s.chords[(i / 128) % 4], t, 128 * sd, { type: 'triangle', gain: 0.016, cutoff: 800, a: 6, rel: 8, spread: 5 });
      }
      if (i % 32 === 0 && chance(0.6)) I.piano(r, r.s.keys, pick(r.s.scale), t + rand(0, 0.04), rand(0.16, 0.28), rand(-0.25, 0.3));
      if (chance(0.006)) {
        r.noiseHit(r.s.paper, { t, kind: 'pink', filter: 'bandpass', freq: rand(700, 1800), q: 0.6, gain: rand(0.012, 0.03), r: rand(0.08, 0.2), pan: rand(-0.4, 0.4) });
      }
    },
  },

  {
    id: 'pink',
    level: 1.45,
    name: 'Розовый шум',
    subtitle: 'Ровный розовый шум · фильтр медленно дышит',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 16,
    bpm: 60,
    colors: ['#f9a8d4', '#fb7185'],
    setup(r) {
      const n = r.loopNoise('pink'), lp = r.filter('lowpass', 2200, 0.5), g = r.gain(0.26);
      const lfo = r.drone('sine', 0.012), lg = r.gain(1200);
      lfo.connect(lg);
      lg.connect(lp.frequency);
      n.connect(lp);
      lp.connect(g);
      g.connect(r.bus(0.9, 0.18));
      const air = r.loopNoise('white'), hp = r.filter('highpass', 9000), ag = r.gain(0.01);
      air.connect(hp);
      hp.connect(ag);
      ag.connect(r.bus(0.4, 0.25));
      r.bed(r.bus(0.8, 0.25), [33, 40], 0.016);
    },
    step() {},
  },

  {
    id: 'glass',
    level: 2.2,
    name: 'Стекло',
    subtitle: 'Разреженные колокола над длинным пэдом',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 12,
    bpm: 84,
    colors: ['#67e8f9', '#e0f2fe'],
    setup(r) {
      r.s.glass = r.bus(0.35, 0.85, -0.15);
      r.s.high = r.bus(0.3, 0.9, 0.25);
      r.s.pad = r.bus(0.4, 0.65);
      r.s.scale = [60, 64, 67, 72, 74, 79, 72, 67];
      r.s.chords = [[48, 55, 60, 67], [46, 53, 58, 65], [43, 50, 55, 62], [45, 52, 57, 64]];
    },
    step(r, i, t) {
      const sd = r.stepDur, scale = r.s.scale;
      if (i % 4 === 0 && chance(0.85)) I.bell(r, r.s.glass, scale[(i / 4) % scale.length], t, i % 16 === 0 ? 0.04 : 0.024, -0.3);
      if (i % 6 === 3 && chance(0.55)) I.bell(r, r.s.high, scale[Math.floor(i / 3) % scale.length] + 12, t, 0.016, 0.35);
      if (i % 64 === 0) {
        I.pad(r, r.s.pad, r.s.chords[(i / 64) % 4], t, 64 * sd, { type: 'sine', gain: 0.02, cutoff: 1200, a: 4, rel: 5, spread: 6 });
      }
    },
  },

  {
    id: 'strings',
    level: 2.4,
    name: 'Струны',
    subtitle: 'Медленные квартетные аккорды, без ударных',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 10,
    bpm: 52,
    colors: ['#c4b5fd', '#f5d0fe'],
    setup(r) {
      r.s.low = r.bus(0.7, 0.45, -0.1);
      r.s.high = r.bus(0.4, 0.7, 0.15);
      r.s.chords = [
        [41, 48, 55, 60],
        [43, 50, 55, 62],
        [36, 43, 50, 55],
        [38, 45, 52, 57],
      ];
    },
    step(r, i, t) {
      const sd = r.stepDur, ch = r.s.chords[Math.floor(i / 96) % 4];
      if (i % 96 === 0) {
        I.pad(r, r.s.low, ch.slice(0, 3), t, 96 * sd, { type: 'sawtooth', gain: 0.012, cutoff: 520, a: 5, rel: 7, spread: 4 });
        I.pad(r, r.s.high, ch.map(m => m + 12), t, 96 * sd, { type: 'triangle', gain: 0.014, cutoff: 1400, a: 6, rel: 8, spread: 7 });
      }
      if (i % 96 === 48 && chance(0.7)) I.bell(r, r.s.high, ch[3] + 24, t, 0.012, 0.2);
    },
  },

  {
    id: 'window',
    level: 2.3,
    name: 'Дождь за окном',
    subtitle: 'Дождь по стеклу и низкий дрон, без птиц',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 14,
    bpm: 110,
    colors: ['#38bdf8', '#64748b'],
    setup(r) {
      const rain = r.loopNoise('pink'), hp = r.filter('highpass', 700), lp = r.filter('lowpass', 7000), g = r.gain(0.18);
      rain.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(r.bus(0.75, 0.3));
      const rumble = r.loopNoise('brown'), rlp = r.filter('lowpass', 220), rg = r.gain(0.2);
      rumble.connect(rlp);
      rlp.connect(rg);
      rg.connect(r.bus(1, 0));
      r.s.drops = r.bus(0.45, 0.35);
      r.s.drone = r.bus(0.5, 0.55);
      r.s.chords = [[40, 47, 52], [38, 45, 50]];
    },
    step(r, i, t) {
      if (chance(0.4)) {
        r.tone(r.s.drops, { f: rand(1600, 4200), t: t + rand(0, r.stepDur), gain: rand(0.004, 0.016), a: 0.001, r: rand(0.02, 0.05), pan: rand(-0.85, 0.85) });
      }
      if (i % 8 === 0 && chance(0.15)) {
        r.noiseHit(r.s.drops, { t, kind: 'pink', filter: 'bandpass', freq: rand(1200, 2800), q: 2, gain: rand(0.01, 0.025), r: 0.08, pan: rand(-0.5, 0.5) });
      }
      if (i % 128 === 0) {
        I.pad(r, r.s.drone, r.s.chords[(i / 128) % 2], t, 128 * r.stepDur, { type: 'sine', gain: 0.016, cutoff: 380, a: 8, rel: 10, spread: 1.5, tilt: 0.45 });
      }
    },
  },

  {
    id: 'cafe',
    level: 1.7,
    name: 'Кафе',
    subtitle: 'Приглушённый гул зала и редкие аккорды',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 12,
    bpm: 72,
    colors: ['#fb7185', '#fdba74'],
    setup(r) {
      const walla = r.loopNoise('pink'), bp = r.filter('bandpass', 650, 0.45), g = r.gain(0.055);
      const lfo = r.drone('sine', 0.08), lg = r.gain(0.02);
      lfo.connect(lg);
      lg.connect(g.gain);
      walla.connect(bp);
      bp.connect(g);
      g.connect(r.bus(0.7, 0.35));
      const low = r.loopNoise('brown'), lp = r.filter('lowpass', 180), lgain = r.gain(0.08);
      low.connect(lp);
      lp.connect(lgain);
      lgain.connect(r.bus(1, 0));
      r.s.keys = r.bus(0.4, 0.65, 0.1);
      r.s.cups = r.bus(0.35, 0.7);
      r.s.prog = [
        [53, 57, 60, 64],
        [52, 55, 59, 62],
        [50, 53, 57, 60],
        [48, 52, 55, 59],
      ];
    },
    step(r, i, t) {
      const sd = r.stepDur, ch = r.s.prog[Math.floor(i / 64) % 4];
      if (i % 64 === 0) ch.forEach((m, k) => I.ep(r, r.s.keys, m, t + k * 0.02, 0.28, 64 * sd * 0.85, (k - 1.5) * 0.12));
      if (i % 16 === 8 && chance(0.22)) {
        r.tone(r.s.cups, { f: rand(1400, 2800), t, gain: 0.018, a: 0.001, r: 0.35, pan: rand(-0.6, 0.6) });
        r.noiseHit(r.s.cups, { t, filter: 'highpass', freq: 4000, gain: 0.012, r: 0.04, pan: rand(-0.4, 0.4) });
      }
    },
  },

  {
    id: 'softgrid',
    level: 1.15,
    name: 'Мягкий пульс',
    subtitle: 'Тихая бочка и тёплый пэд, без сбивки',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 16,
    bpm: 74,
    colors: ['#818cf8', '#34d399'],
    setup(r) {
      r.s.drums = r.bus(0.7, 0.12);
      r.s.bass = r.bus(0.85, 0.05);
      r.s.pad = r.bus(0.45, 0.6);
      r.s.keys = r.bus(0.4, 0.55, 0.15);
      r.s.prog = [
        { root: 40, notes: [52, 55, 59, 64] },
        { root: 38, notes: [50, 54, 57, 62] },
        { root: 36, notes: [48, 52, 55, 60] },
        { root: 43, notes: [50, 55, 59, 62] },
      ];
    },
    step(r, i, t) {
      const sd = r.stepDur, b = i % 16, ch = r.s.prog[Math.floor(i / 64) % 4];
      if (b === 0 || b === 8) I.kick(r, r.s.drums, t, 0.22);
      if (b % 4 === 2) I.hat(r, r.s.drums, t, 0.012);
      if (b === 0) r.tone(r.s.bass, { f: mtof(ch.root), t, gain: 0.14, a: 0.04, hold: 12 * sd, r: 0.8 });
      if (i % 64 === 0) I.pad(r, r.s.pad, ch.notes, t, 64 * sd, { type: 'triangle', gain: 0.02, cutoff: 900, a: 2.5, rel: 3, spread: 8 });
      if (b === 4 && chance(0.35)) I.ep(r, r.s.keys, pick(ch.notes) + 12, t, 0.22, 1.4, 0.2);
    },
  },

  {
    id: 'depth',
    level: 1.9,
    name: 'Глубина',
    subtitle: 'Суб-дрон и коричневый шум для долгой работы',
    category: 'Фокус',
    tags: ['Фон'],
    mod: 18,
    bpm: 60,
    colors: ['#1e3a5f', '#818cf8'],
    setup(r) {
      const n = r.loopNoise('brown'), lp = r.filter('lowpass', 700, 0.4), g = r.gain(0.22);
      const lfo = r.drone('sine', 0.018), lg = r.gain(180);
      lfo.connect(lg);
      lg.connect(lp.frequency);
      n.connect(lp);
      lp.connect(g);
      g.connect(r.bus(0.95, 0.1));
      r.bed(r.bus(0.75, 0.3), [36, 43, 48], 0.028);
    },
    step() {},
  },
);
