const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// v — безкорневой аккорд для комповки, s — ноты для импровизации, m — полный лад
const QUALITY = {
  maj7: { v: [4, 7, 11, 14], s: [0, 2, 4, 7, 9, 11], m: [0, 2, 4, 5, 7, 9, 11] },
  lyd: { v: [4, 7, 11, 18], s: [0, 2, 4, 6, 7, 11], m: [0, 2, 4, 6, 7, 9, 11] },
  6: { v: [4, 7, 9, 14], s: [0, 2, 4, 7, 9], m: [0, 2, 4, 5, 7, 9, 11] },
  7: { v: [4, 9, 10, 14], s: [0, 2, 4, 7, 9, 10], m: [0, 2, 4, 5, 7, 9, 10] },
  alt: { v: [4, 10, 13, 8], s: [0, 1, 4, 7, 8, 10], m: [0, 1, 4, 5, 7, 8, 10] },
  sus: { v: [5, 10, 14, 7], s: [0, 2, 5, 7, 10], m: [0, 2, 4, 5, 7, 9, 10] },
  m7: { v: [3, 7, 10, 14], s: [0, 3, 5, 7, 10], m: [0, 2, 3, 5, 7, 9, 10] },
  m6: { v: [3, 7, 9, 14], s: [0, 2, 3, 7, 9], m: [0, 2, 3, 5, 7, 9, 11] },
  hd: { v: [3, 6, 10, 5], s: [0, 3, 5, 6, 10], m: [0, 1, 3, 5, 6, 8, 10] },
  dim: { v: [3, 6, 9, 0], s: [0, 3, 6, 9], m: [0, 2, 3, 5, 6, 8, 9, 11] },
};
const ALIAS = {
  '': '6', maj: 'maj7', maj9: 'maj7', 'maj7#11': 'lyd', 9: '7', 13: '7', '7b9': 'alt',
  '7sus': 'sus', m: 'm6', m9: 'm7', m7b5: 'hd', dim7: 'dim',
};

const pcOf = (letter, acc) => PCS[letter] + (acc === 'b' ? -1 : acc === '#' ? 1 : 0);
const mod12 = n => ((n % 12) + 12) % 12;
const near = (pc, ref) => { const d = mod12(pc - ref); return ref + (d > 6 ? d - 12 : d); };
const voice = (c, lo = 52) => c.q.v.map(iv => lo + mod12(c.root + iv - lo)).sort((a, b) => a - b);
const modeNote = (c, k, base) => {
  const m = c.q.m, n = m.length;
  return base + c.root + 12 * Math.floor(k / n) + m[((k % n) + n) % n];
};
const quartal = (c, k = 1, base = 48) => [0, 3, 6, 9, 11].map(j => modeNote(c, k + j, base));

function chord(sym, shift = 0) {
  const [, l, acc, rest] = sym.match(/^([A-G])([b#]?)(.*)$/);
  const q = QUALITY[ALIAS[rest] ?? rest];
  if (!q) throw new Error(`Неизвестный аккорд: ${sym}`);
  return { sym, root: mod12(pcOf(l, acc) + shift), q };
}

function parseForm(form) {
  const beats = [];
  for (const bar of form.split('|').map(s => s.trim()).filter(Boolean)) {
    const [body, times = 1] = bar.split('*'), cs = body.trim().split(/\s+/);
    for (let n = 0; n < +times; n++) cs.forEach(c => { for (let k = 0; k < 4 / cs.length; k++) beats.push(c); });
  }
  return beats;
}

class Songbook {
  constructor(r, tunes, o = {}) {
    this.r = r;
    this.tunes = tunes;
    this.o = { bars: [32, 64], shift: [-3, 3], onTune() {}, ...o };
    this.recent = [];
    this.load();
  }

  load() {
    const pool = this.tunes.filter(t => !this.recent.includes(t));
    const t = pick(pool.length ? pool : this.tunes);
    this.recent = [...this.recent, t].slice(-Math.floor(this.tunes.length / 2));
    const shift = randInt(...this.o.shift), syms = parseForm(t.form), n = syms.length;
    const chords = syms.map(s => chord(s, shift));
    this.beats = syms.map((s, k) => {
      let left = 1;
      while (left < n && syms[(k + left) % n] === s) left++;
      return {
        chord: chords[k], next: chords[(k + left) % n], left,
        first: k === 0 || syms[k - 1] !== s, bar: Math.floor(k / 4), beat: k % 4, lastBar: k >= n - 4,
      };
    });
    const [, l, acc, minor] = t.key.match(/^([A-G])([b#]?)(m?)$/);
    this.tune = t;
    this.pos = 0;
    this.chorus = 0;
    this.total = Math.max(1, Math.round(randInt(...this.o.bars) / (n / 4)));
    this.r.label = `${t.name} · ${KEY_NAMES[mod12(pcOf(l, acc) + shift)]} ${minor ? 'минор' : 'мажор'}`;
    this.o.onTune(t);
  }

  beat() {
    if (this.pos >= this.beats.length) {
      this.pos = 0;
      if (++this.chorus >= this.total) this.load();
    }
    return { ...this.beats[this.pos++], chorus: this.chorus, lastChorus: this.chorus === this.total - 1 };
  }
}

function walk(c, prev = 38) {
  const ch = c.chord;
  let n;
  if (c.first || (c.beat === 0 && chance(0.5))) n = near(ch.root, prev);
  else if (c.left === 1) {
    const target = near(c.next.root, prev);
    n = chance(0.65) ? target + pick([-1, 1]) : near(c.next.root + 7, prev);
  } else {
    const strong = [0, ch.q.v[0], ch.q.v[1]].map(mod12), opts = [];
    for (let m = prev - 5; m <= prev + 5; m++) {
      const rel = mod12(m - ch.root);
      if (m === prev || !ch.q.m.includes(rel)) continue;
      opts.push(m);
      if (strong.includes(rel)) opts.push(m);
    }
    n = pick(opts);
  }
  while (n > 50) n -= 12;
  while (n < 31) n += 12;
  return n;
}

class Improv {
  constructor(lo, hi) {
    this.lo = lo;
    this.hi = hi;
    this.note = Math.round((lo + hi) / 2);
    this.dir = 1;
    this.left = 0;
    this.rest = 4;
  }

  tick(len, gap) {
    if (this.left === 0 && this.rest-- <= 0) {
      this.left = randInt(...len);
      this.rest = randInt(...gap);
    }
    if (this.left === 0) return false;
    this.left--;
    return true;
  }

  next(c, strong) {
    const ch = c.chord, set = (strong && chance(0.6) ? ch.q.v.slice(0, 3) : ch.q.s).map(mod12), opts = [];
    for (let m = this.lo; m <= this.hi; m++) if (set.includes(mod12(m - ch.root))) opts.push(m);
    if (chance(0.25) || this.note + this.dir * 3 > this.hi || this.note + this.dir * 3 < this.lo) this.dir = -this.dir;
    const target = this.note + this.dir * pick([1, 2, 2, 3, 4]);
    let best = opts[0];
    for (const m of opts) if (m !== this.note && Math.abs(m - target) < Math.abs(best - target)) best = m;
    return this.note = best;
  }
}

function vibrato(r, osc, t, dur, depth, rate = 5) {
  const lfo = r.ctx.createOscillator(), g = r.ctx.createGain();
  lfo.frequency.value = rate;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(depth, t + Math.min(0.6, dur * 0.6) + 0.05);
  lfo.connect(g);
  g.connect(osc.frequency);
  lfo.start(t);
  lfo.stop(t + dur + 0.8);
}

Object.assign(I, {
  upright(r, dest, m, t, vel = 0.6, dur = 0.5) {
    const f = mtof(m);
    r.tone(dest, { f, t, gain: vel * 0.3, a: 0.008, hold: dur * 0.25, r: dur });
    r.tone(dest, { f: f * 2, type: 'triangle', t, gain: vel * 0.06, a: 0.004, r: dur * 0.4 });
    r.noiseHit(dest, { t, filter: 'bandpass', freq: Math.min(f * 5, 2000), q: 1.5, gain: vel * 0.03, r: 0.04 });
  },

  ride(r, dest, t, gain = 0.025) {
    r.noiseHit(dest, { t, filter: 'highpass', freq: 6500, gain, r: 0.7 });
    r.noiseHit(dest, { t, filter: 'bandpass', freq: 4200, q: 4, gain: gain * 0.5, r: 0.35 });
    r.tone(dest, { f: 5120, t, gain: gain * 0.05, a: 0.001, r: 0.5 });
  },

  brush(r, dest, t, gain = 0.03, len = 0.1) {
    r.noiseHit(dest, { t, filter: 'bandpass', freq: 3000, q: 0.7, gain, a: Math.max(0.002, len * 0.4), r: len });
  },

  rim(r, dest, t, gain = 0.05, pan = 0) {
    r.tone(dest, { f: 1750, type: 'triangle', t, gain, a: 0.001, r: 0.03, pan });
    r.noiseHit(dest, { t, filter: 'bandpass', freq: 3500, q: 2, gain: gain * 0.5, r: 0.02, pan });
  },

  vibes(r, dest, m, t, vel = 0.5, pan = 0) {
    const f = mtof(m), g = r.gain(1), trem = r.ctx.createOscillator(), tg = r.gain(0.25);
    trem.frequency.value = 5.5;
    trem.connect(tg);
    tg.connect(g.gain);
    r.withPan(g, pan, dest);
    r.tone(g, { f, t, gain: vel * 0.1, a: 0.002, r: 2.8 });
    r.tone(g, { f: f * 4, t, gain: vel * 0.03, a: 0.001, r: 0.5 });
    r.tone(g, { f: f * 10, t, gain: vel * 0.006, a: 0.001, r: 0.12 });
    trem.start(t);
    trem.stop(t + 3.2);
  },

  horn(r, dest, m, t, dur, vel = 0.5, pan = 0) {
    const f = mtof(m);
    const osc = I.synth(r, dest, m, t, { gain: vel * 0.06, a: 0.08, hold: dur, rel: 0.35, cutoff: f * 1.2, env: f * 2.5, fdec: 0.4, q: 1.5, pan });
    vibrato(r, osc, t, dur, f * 0.007);
  },

  flute(r, dest, m, t, dur, vel = 0.5, pan = 0) {
    const f = mtof(m), osc = r.tone(dest, { f, t, gain: vel * 0.07, a: 0.06, hold: dur, r: 0.25, pan });
    r.tone(dest, { f: f * 2, t, gain: vel * 0.012, a: 0.08, hold: dur, r: 0.2, pan });
    r.noiseHit(dest, { t, filter: 'bandpass', freq: f * 2, q: 3, gain: vel * 0.015, a: 0.05, r: dur * 0.6, pan });
    vibrato(r, osc, t, dur, f * 0.005);
  },
});

const RHYTHM_A1 = 'Bb6 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Bb7 | Eb7 Edim7 | Bb6 G7 | Cm7 F7';
const RHYTHM_A2 = 'Bb6 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Bb7 | Eb7 Edim7 | Cm7 F7 | Bb6';
const MISB_A1 = 'Eb6 Edim7 | Fm7 Bb7 | Eb6 Edim7 | Fm7 Bb7 | Eb7 | Ab6 Adim7 | Eb6 C7 | Fm7 Bb7';
const MISB_A2 = 'Eb6 Edim7 | Fm7 Bb7 | Eb6 Edim7 | Fm7 Bb7 | Eb7 | Ab6 Adim7 | Fm7 Bb7 | Eb6';

// Гармонии джазовых стандартов, которые уже в общественном достоянии (до 1931 года), и общие джазовые формы
const SWING = [
  { name: 'Джазовый блюз', key: 'F', form: 'F7 | Bb7 | F7 | Cm7 F7 | Bb7 | Bdim7 | F7 | D7b9 | Gm7 | C7 | F7 D7b9 | Gm7 C7' },
  { name: 'Минорный блюз', key: 'Cm', form: 'Cm7*4 | Fm7*2 | Cm7*2 | Ab7 | G7b9 | Cm7 | G7b9' },
  { name: 'По мотивам «I Got Rhythm» (1930)', key: 'Bb', form: [RHYTHM_A1, RHYTHM_A2, 'D7*2 | G7*2 | C7*2 | F7*2', RHYTHM_A2].join(' | ') },
  { name: 'По мотивам «Honeysuckle Rose» (1929)', key: 'F', form: 'Gm7 C7*4 | F6*3 | Gm7 C7 | Gm7 C7*4 | F6*4 | F7*2 | Bb6*2 | G7*2 | C7*2 | Gm7 C7*4 | F6*3 | Gm7 C7' },
  { name: 'По мотивам «Sweet Georgia Brown» (1925)', key: 'F', form: 'D7*2 | G7*2 | C7*2 | F6*2 | D7*2 | G7*2 | Am6 | E7 | Am6 | E7 | D7*2 | G7*2 | C7*2 | F6*2 | Dm6 | A7 | Dm6 | A7 | F6 | D7 | Gm7 C7 | F6' },
  { name: 'По мотивам «Ain’t Misbehavin’» (1929)', key: 'Eb', form: [MISB_A1, MISB_A2, 'Cm6 | G7 | Cm6 | G7 | Ab7 | G7 | C7 | F7 Bb7', MISB_A2].join(' | ') },
  { name: 'По мотивам «St. Louis Blues» (1914)', key: 'G', form: 'G7 | C7 | G7*2 | C7*2 | G7*2 | D7 | C7 | G7 | D7 | Gm6 | D7*2 | Gm6*2 | D7*2 | Gm6 | Gm6 | D7*2 | Gm6 | Cm7 | D7b9 | Gm6 | D7' },
  { name: 'ii–V–I по кругу', key: 'D', form: 'Em7 | A7 | Dmaj7*2 | Dm7 | G7 | Cmaj7*2 | Cm7 | F7 | Bbmaj7*2 | Em7b5 | A7b9 | Dmaj7 | A7' },
  { name: 'Минорный цикл квинт', key: 'Gm', form: 'Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7b9 | Gm6*2 | Am7b5 | D7b9 | Gm6 | C7 | Cm7 F7 | Bbmaj7 Ebmaj7 | Am7b5 D7b9 | Gm6' },
  { name: 'Рэгтайм-цепочка доминант', key: 'C', form: 'C6 | E7*2 | A7*2 | D7*2 | G7 | C6 | E7*2 | A7*2 | Dm7 G7 | C6 | G7' },
];

const HOP = [
  { name: 'Пасмурный вторник', key: 'C', form: 'Dm9 | G13 | Cmaj9 | A7b9' },
  { name: 'Кофе остыл', key: 'Gm', form: 'Cm9 | F13 | Bbmaj9 | Ebmaj7 | Am7b5 | D7b9 | Gm9*2' },
  { name: 'Конспект', key: 'Eb', form: 'Abmaj7 | Gm7 | Fm9 | Bb13' },
  { name: 'Окно на юг', key: 'Am', form: 'Am9*2 | Dm9 | G13 | Cmaj7 | Fmaj7 | Bm7b5 | E7b9' },
  { name: 'Минорная субдоминанта', key: 'C', form: 'Fmaj7 | Fm6 | Em7 | A7b9 | Dm9 | G13 | Cmaj7*2' },
  { name: 'Ночной автобус', key: 'F', form: 'Bbmaj7 | A7b9 | Dm9 | Cm9 F13' },
  { name: 'Тёплый пол', key: 'D', form: 'Gmaj7 | F#m7 B7b9 | Em9 | A13' },
];

const MODAL = [
  { name: 'Дорийская форма AABA', key: 'Dm', form: 'Dm7*16 | Ebm7*8 | Dm7*8' },
  { name: 'Sus-аккорды по кругу', key: 'D', form: 'D7sus*4 | F7sus*4 | D7sus*4 | F7sus*4 | Eb7sus*4 | Db7sus*4 | D7sus*4 | F7sus*4' },
  { name: 'Лидийский рассвет', key: 'C', form: 'Cmaj7#11*4 | Bbmaj7#11*4 | Abmaj7#11*4 | Bbmaj7#11*4' },
  { name: 'Две краски', key: 'Em', form: 'Em7*8 | Fmaj7#11*8' },
  { name: 'Дорийский вэмп', key: 'Am', form: 'Am7*4 | D7sus*4' },
];

const BOSSA = [
  { name: 'Прибой', key: 'D', form: 'Dmaj7*2 | E7*2 | Em7 | A7 | Dmaj7 | A7' },
  { name: 'Веранда', key: 'Am', form: 'Am9*2 | Dm9*2 | G13*2 | Cmaj7*2 | Fmaj7*2 | Bm7b5 | E7b9 | Am9*2 | Bm7b5 | E7b9' },
  { name: 'Сумерки', key: 'C', form: 'Cmaj7*2 | Cm7 | F7 | Bbmaj7*2 | Bbm7 | Eb7 | Abmaj7*2 | Dm7b5 | G7b9 | Cmaj7 | Am7 | Dm7 | G7' },
  { name: 'Тёплый дождь', key: 'Dm', form: 'Dm9*2 | Em7b5 | A7b9 | Dm9*2 | Gm9 | C13 | Fmaj7 | Bbmaj7 | Em7b5 | A7b9 | Dm9*2 | Em7b5 | A7b9' },
  { name: 'Лагуна', key: 'F', form: 'Fmaj7*2 | G7*2 | Gm7 | C7 | Fmaj7 | C7' },
  { name: 'Кофе на веранде', key: 'G', form: 'Gmaj7*2 | Am7 | D7 | Bm7 | E7b9 | Am7 | D7' },
];

const BALLADS = [
  { name: 'Полночь', key: 'F', form: 'Fmaj7 | Em7b5 A7b9 | Dm7 | Cm7 F7 | Bbmaj7 | Bbm6 Eb7 | Am7 D7 | Gm7 C7 | Fmaj7 | Em7b5 A7b9 | Dm7 G7 | Gm7 C7 | Am7 D7b9 | Gm7 C7 | Fmaj7 | Gm7 C7' },
  { name: 'Огни на реке', key: 'Eb', form: 'Ebmaj7 | Cm7 | Fm7 | Bb7 | Gm7 C7 | Fm7 Bb7 | Ebmaj7 Abmaj7 | Gm7 C7b9 | Fm7 | Bb7 | Ebmaj7 | Abmaj7 | Am7b5 | D7b9 | Gm7 C7 | Fm7 Bb7' },
  { name: 'Письмо', key: 'C', form: 'Dm9 | G13 | Cmaj7 | Am7 | Dm7 | G7 | Em7 A7 | Dm7 G7' },
  { name: 'Сонный город', key: 'Em', form: 'Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7b9 | Em6*2' },
  { name: 'Тихая гавань', key: 'Bb', form: 'Bbmaj7 | Ebmaj7#11 | Dm7 | G7b9 | Cm7 | Ebm6 | Bbmaj7 Gm7 | Cm7 F7' },
];

const COMP = [[0, 3], [1, 4], [3, 6], [0, 5], [2, 7], [3], [1, 6], [4, 7]];
const BOSSA_COMP = [[0, 3, 6, 10, 13], [0, 2, 5, 8, 11, 13], [0, 3, 5, 8, 11, 14], [1, 3, 6, 9, 11, 14]];
const CLAVE = [0, 3, 6, 10, 13];
const HOP_KITS = [{ kick: [0, 10], rim: false }, { kick: [0, 3, 10], rim: true }, { kick: [0, 8, 11], rim: false }, { kick: [0, 6, 10], rim: true }];

TRACKS.push(
  {
    id: 'jazzclub',
    level: 2.4,
    name: 'Джаз-клуб',
    subtitle: 'Свинг-трио · контрабас, тарелка, фортепиано или вибрафон',
    category: 'Фокус',
    tags: ['Джаз'],
    vary: false,
    mod: 16,
    bpm: 128,
    colors: ['#eab308', '#b45309'],
    setup(r) {
      const s = r.s;
      s.bass = r.bus(0.9, 0.1, -0.05);
      s.drums = r.bus(0.7, 0.2, 0.25);
      s.comp = r.bus(0.5, 0.35, -0.2);
      s.lead = r.bus(0.5, 0.45, 0.15);
      s.bn = 38;
      s.solo = new Improv(65, 84);
      s.book = new Songbook(r, SWING, { bars: [48, 96], onTune: () => { s.voice = pick(['piano', 'vibes']); } });
    },
    step(r, i, t) {
      const s = r.s, q = i % 4;
      if (q === 0) {
        s.c = s.book.beat();
        s.phrase = s.solo.tick(s.c.chorus === 0 ? [2, 4] : [4, 10], [2, 6]);
      }
      if (q % 2) return;
      const c = s.c, sw = q === 2, tt = sw ? t + r.stepDur * 0.67 : t, e = c.beat * 2 + (sw ? 1 : 0);
      if (!sw) {
        I.ride(r, s.drums, t, c.beat % 2 ? 0.03 : 0.022);
        if (c.beat % 2) I.hat(r, s.drums, t, 0.02);
        if (c.beat === 0 && chance(0.25)) I.kick(r, s.drums, t, 0.16);
        s.bn = walk(c, s.bn);
        I.upright(r, s.bass, s.bn, t, c.beat === 0 ? 0.7 : 0.58, r.stepDur * 3.5);
        if (c.beat === 0) s.comping = pick(COMP);
      } else {
        if (c.beat % 2 && chance(0.85)) I.ride(r, s.drums, tt, 0.015);
        if (chance(c.lastBar && c.lastChorus ? 0.7 : 0.07)) I.brush(r, s.drums, tt, 0.035);
      }
      if (s.comping.includes(e) || (c.first && !sw && c.beat === 2 && chance(0.5))) {
        const ch = sw && c.left === 1 ? c.next : c.chord;
        voice(ch, 52).forEach((m, k) => I.piano(r, s.comp, m, tt + k * 0.007, rand(0.18, 0.26)));
      }
      const dense = c.chorus === 0 ? !sw && c.beat % 2 === 0 : chance(sw ? 0.5 : 0.75);
      if (s.phrase && dense) {
        const m = s.solo.next(c, !sw);
        if (s.voice === 'vibes') I.vibes(r, s.lead, m, tt, rand(0.35, 0.5));
        else I.piano(r, s.lead, m, tt, rand(0.3, 0.42));
      }
    },
  },

  {
    id: 'jazzhop',
    level: 1.1,
    name: 'Джаз-хоп',
    subtitle: 'Пыльный бит · родес с девятыми · вибрафон',
    category: 'Фокус',
    tags: ['Джаз'],
    vary: false,
    mod: 14,
    bpm: 84,
    colors: ['#a16207', '#7c3aed'],
    setup(r) {
      const s = r.s;
      s.drums = r.bus(0.85, 0.08);
      s.keys = r.bus(0.55, 0.4);
      s.bass = r.bus(0.9, 0);
      s.lead = r.bus(0.4, 0.6, 0.25);
      s.vinyl = r.bus(1, 0);
      const hiss = r.loopNoise('pink'), hp = r.filter('highpass', 2500), g = r.gain(0.012);
      hiss.connect(hp);
      hp.connect(g);
      g.connect(s.vinyl);
      s.solo = new Improv(67, 86);
      s.book = new Songbook(r, HOP, { bars: [24, 48], onTune: () => { s.kit = pick(HOP_KITS); s.voice = pick(['vibes', 'ep']); } });
    },
    step(r, i, t) {
      const s = r.s, sd = r.stepDur, b = i % 16;
      if (i % 4 === 0) {
        s.c = s.book.beat();
        s.phrase = s.solo.tick([3, 6], [6, 14]);
      }
      const c = s.c, low = pc => 36 + mod12(pc);
      if (i % 2) t += sd * 0.25;
      if (s.kit.kick.includes(b) || (b === 7 && chance(0.25))) I.kick(r, s.drums, t, 0.65);
      if (b === 4 || b === 12) s.kit.rim ? I.rim(r, s.drums, t, 0.09) : I.snare(r, s.drums, t, 0.16);
      if (b % 2 === 0) I.hat(r, s.drums, t, b % 4 === 0 ? 0.045 : 0.028);
      else if (chance(0.12)) I.hat(r, s.drums, t, 0.014);
      if (c.first && i % 4 === 0) {
        voice(c.chord, 55).forEach((m, k) => I.ep(r, s.keys, m, t + k * 0.015, 0.5, c.left * 4 * sd * 0.9));
        r.tone(s.bass, { f: mtof(low(c.chord.root)), type: 'triangle', t, gain: 0.22, a: 0.01, hold: sd * 3, r: 0.3 });
      } else if ((b === 6 || b === 14) && chance(0.2)) {
        voice(c.chord, 55).slice(1).forEach(m => I.ep(r, s.keys, m, t, 0.28, 0.4));
      }
      if (b === 10 && chance(0.7)) r.tone(s.bass, { f: mtof(low(c.chord.root + pick([0, 7]))), type: 'triangle', t, gain: 0.18, a: 0.01, hold: sd * 2, r: 0.25 });
      if (b === 14 && c.left === 1 && chance(0.4)) r.tone(s.bass, { f: mtof(low(c.next.root) - 1), type: 'triangle', t, gain: 0.14, a: 0.01, hold: sd, r: 0.15 });
      if (s.phrase && b % 2 === 0 && chance(0.4)) {
        const m = s.solo.next(c, b % 4 === 0);
        if (s.voice === 'vibes') I.vibes(r, s.lead, m, t, 0.35);
        else I.ep(r, s.lead, m, t, 0.35, 0.8);
      }
      if (chance(0.25)) r.noiseHit(s.vinyl, { t: t + rand(0, sd), filter: 'highpass', freq: 3000, gain: rand(0.005, 0.03), r: 0.004 });
    },
  },

  {
    id: 'modal',
    level: 1.85,
    name: 'Модальный вечер',
    subtitle: 'Модальный джаз · кварты, лады, мягкий свинг',
    category: 'Фокус',
    tags: ['Джаз'],
    vary: false,
    mod: 16,
    bpm: 112,
    colors: ['#0ea5e9', '#1e3a8a'],
    setup(r) {
      const s = r.s;
      s.bass = r.bus(0.9, 0.12);
      s.drums = r.bus(0.6, 0.25, 0.25);
      s.comp = r.bus(0.5, 0.45, -0.2);
      s.lead = r.bus(0.45, 0.55, 0.2);
      s.bn = 38;
      s.solo = new Improv(64, 82);
      s.book = new Songbook(r, MODAL, { onTune: () => { s.voice = pick(['vibes', 'piano']); } });
    },
    step(r, i, t) {
      const s = r.s, q = i % 4;
      if (q === 0) {
        s.c = s.book.beat();
        s.phrase = s.solo.tick([3, 8], [4, 10]);
      }
      if (q % 2) return;
      const c = s.c, sw = q === 2, tt = sw ? t + r.stepDur * 0.67 : t;
      const shape = k => quartal(c.chord, k).forEach((m, n) => I.piano(r, s.comp, m, tt + n * 0.01, rand(0.16, 0.22)));
      if (!sw) {
        I.ride(r, s.drums, t, c.beat % 2 ? 0.024 : 0.018);
        if (c.beat % 2) I.hat(r, s.drums, t, 0.018);
        s.bn = walk(c, s.bn);
        I.upright(r, s.bass, s.bn, t, c.beat === 0 ? 0.7 : 0.55, r.stepDur * 3.5);
        if (c.beat === 0 && (c.first || (c.bar % 2 === 0 && chance(0.5)))) shape(c.first ? 1 : pick([1, 0, 2, 4]));
        if (c.beat === 2 && s.amen) shape(1);
      } else {
        if (c.beat % 2 && chance(0.7)) I.ride(r, s.drums, tt, 0.012);
        if (chance(0.05)) I.brush(r, s.drums, tt, 0.03);
        s.amen = c.beat === 1 && chance(0.3);
        if (s.amen) shape(0);
      }
      if (s.phrase && (sw ? chance(0.3) : chance(0.6))) {
        const m = s.solo.next(c, !sw);
        if (s.voice === 'vibes') I.vibes(r, s.lead, m, tt, rand(0.35, 0.48));
        else I.piano(r, s.lead, m, tt, rand(0.3, 0.4));
      }
    },
  },

  {
    id: 'bossa',
    level: 2.0,
    name: 'Босса-нова',
    subtitle: 'Нейлоновая гитара · клаве · флейта',
    category: 'Расслабление',
    tags: ['Джаз'],
    vary: false,
    mod: 10,
    bpm: 128,
    colors: ['#f97316', '#14b8a6'],
    setup(r) {
      const s = r.s;
      s.gtr = r.bus(0.6, 0.35, -0.1);
      s.bass = r.bus(0.85, 0.1);
      s.drums = r.bus(0.6, 0.25, 0.3);
      s.lead = r.bus(0.45, 0.55, 0.2);
      s.solo = new Improv(69, 86);
      s.book = new Songbook(r, BOSSA);
    },
    step(r, i, t) {
      const s = r.s, sd = r.stepDur;
      if (i % 4 === 0) {
        s.c = s.book.beat();
        s.phrase = s.solo.tick([4, 8], [4, 10]);
      }
      const c = s.c;
      r.noiseHit(s.drums, { t, filter: 'bandpass', freq: 6500, q: 1, gain: i % 4 === 2 ? 0.02 : 0.009, a: 0.01, r: 0.05 });
      if (i % 2) return;
      const e = (i % 32) / 2, e8 = e % 8, root = 36 + mod12(c.chord.root);
      if (e === 0) s.pat = pick(BOSSA_COMP);
      if (e8 === 0) I.upright(r, s.bass, root, t, 0.65, sd * 5);
      if (e8 === 4) I.upright(r, s.bass, root - 5, t, 0.55, sd * 5);
      if ((e8 === 3 || e8 === 7) && chance(0.4)) I.upright(r, s.bass, e8 === 3 ? root - 5 : 36 + mod12(c.next.root), t, 0.35, sd);
      if (e8 === 0 || e8 === 4) I.kick(r, s.drums, t, 0.15);
      if (CLAVE.includes(e)) I.rim(r, s.drums, t, 0.045, -0.2);
      if (s.pat.includes(e)) {
        const ch = e % 2 && c.left === 1 ? c.next : c.chord;
        voice(ch, 53).forEach((m, k) => I.guitar(r, s.gtr, m, t + k * 0.01, rand(0.28, 0.36)));
      }
      if (s.phrase && e % 2 === 0 && chance(0.5)) I.flute(r, s.lead, s.solo.next(c, e8 % 4 === 0), t, sd * rand(3, 6), rand(0.4, 0.55));
    },
  },

  {
    id: 'ballad',
    level: 1.8,
    name: 'Полночная баллада',
    subtitle: 'Медленный джаз · щётки, рояль, приглушённый духовой',
    category: 'Расслабление',
    tags: ['Джаз'],
    vary: false,
    mod: 8,
    bpm: 64,
    colors: ['#7c3aed', '#be185d'],
    setup(r) {
      const s = r.s;
      s.bass = r.bus(0.85, 0.15);
      s.drums = r.bus(0.5, 0.35, 0.2);
      s.keys = r.bus(0.5, 0.55, -0.15);
      s.lead = r.bus(0.45, 0.6, 0.15);
      s.solo = new Improv(62, 79);
      s.book = new Songbook(r, BALLADS, { bars: [16, 32], onTune: () => { s.voice = pick(['horn', 'piano']); } });
    },
    step(r, i, t) {
      const s = r.s, sd = r.stepDur, q = i % 4;
      if (q === 0) {
        s.c = s.book.beat();
        s.phrase = s.solo.tick([2, 5], [2, 6]);
      }
      const c = s.c, beat = sd * 4;
      if (q === 0) {
        I.brush(r, s.drums, t, 0.018, beat * 0.9);
        if (c.beat % 2) I.brush(r, s.drums, t + 0.01, 0.03, 0.08);
        if (c.beat === 0 || c.beat === 2 || c.first) {
          const pc = c.first || c.beat === 0 ? c.chord.root : c.chord.root + 7;
          I.upright(r, s.bass, 31 + mod12(pc - 7), t, 0.6, beat * 1.6);
        }
        if (c.first) {
          I.piano(r, s.keys, 36 + mod12(c.chord.root) + 12, t, 0.35);
          voice(c.chord, 55).forEach((m, k) => I.piano(r, s.keys, m, t + 0.05 + k * 0.06, rand(0.2, 0.28)));
        } else if (c.beat === 2 && chance(0.3)) {
          voice(c.chord, 55).slice(1).forEach((m, k) => I.piano(r, s.keys, m, t + k * 0.08, 0.16));
        }
        if (s.phrase && chance(0.6)) {
          const m = s.solo.next(c, true);
          if (s.voice === 'horn') I.horn(r, s.lead, m, t, beat * rand(0.9, 1.8), rand(0.4, 0.55));
          else I.piano(r, s.lead, m + 5, t, rand(0.3, 0.4));
        }
      } else if (q === 2 && s.phrase && s.voice === 'piano' && chance(0.35)) {
        I.piano(r, s.lead, s.solo.next(c, false) + 5, t + sd * 0.67, rand(0.22, 0.32));
      }
    },
  },
);
