(() => {
  const scales = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
  };

  // Each score pairs a chord progression with a melodic contour in chord tones.
  const scores = [
    ['copper', 'Медный свет', 48, 'major', [0, 4, 5, 3], [0, 1, 2, 1, 3, 2], 0],
    ['harbor', 'Тихая гавань', 45, 'minor', [0, 2, 5, 6], [2, 3, 1, 0, 1, 2], -4],
    ['glass', 'Матовое стекло', 50, 'lydian', [0, 1, 4, 1], [0, 2, 3, 2, 1], 2],
    ['meadow', 'Луговая тропа', 43, 'major', [0, 3, 1, 4], [1, 0, 2, 3, 2], 4],
    ['warehouse', 'Пустое депо', 47, 'dorian', [0, 3, 6, 3], [3, 1, 2, 0, 1, 0], -2],
    ['snow', 'Следы на снегу', 44, 'minor', [0, 6, 5, 2, 3, 6], [2, 0, 1, 2, 0], -6],
    ['eaves', 'Капли с крыши', 46, 'dorian', [0, 1, 3, 4], [1, 2, 1, 0, 2, 3], 6],
    ['canal', 'Вдоль канала', 49, 'major', [0, 2, 3, 1, 4, 3], [0, 3, 2, 1, 0], 2],
    ['greenhouse', 'Зимняя оранжерея', 45, 'lydian', [0, 2, 1, 4], [2, 1, 3, 1, 0, 2], 4],
    ['ink', 'Синие чернила', 48, 'minor', [0, 3, 2, 5], [3, 2, 0, 1, 3], 0],
    ['paper', 'Бумажный фонарь', 50, 'major', [0, 5, 1, 4, 2, 3], [0, 1, 3, 2, 1, 0], -2],
    ['pebbles', 'Мокрая галька', 43, 'dorian', [0, 4, 2, 3], [1, 3, 0, 2, 1], 6],
    ['wind', 'Ветер с поля', 47, 'lydian', [0, 4, 2, 1, 5, 4], [2, 3, 2, 0, 1], -4],
    ['valley', 'Тень в долине', 46, 'minor', [0, 5, 3, 4], [0, 2, 1, 3, 0, 1], -6],
    ['bridge', 'Пешеходный мост', 45, 'dorian', [0, 6, 1, 3, 2, 4], [3, 2, 1, 2, 0], 2],
    ['birches', 'Белые берёзы', 44, 'major', [0, 1, 5, 3], [1, 3, 2, 0, 2, 1], 4],
    ['blinds', 'Открытые ставни', 48, 'lydian', [0, 1, 2, 4, 3, 1], [2, 0, 3, 1, 2], 0],
    ['stairs', 'Каменная лестница', 50, 'minor', [0, 3, 6, 2], [0, 1, 0, 2, 1, 3], -2],
    ['tram', 'Последний трамвай', 49, 'dorian', [0, 2, 3, 6], [3, 1, 0, 2, 0], 6],
    ['bay', 'Залив на рассвете', 43, 'lydian', [0, 5, 4, 2], [1, 0, 2, 1, 3, 2], -4],
  ];

  const styles = [
    { id: 'felt', name: 'Мягкое пианино', voice: 'piano', category: 'Фокус', bpm: 60, mod: 12,
      phrase: 32, voicing: [0, 2, 4, 8], rhythm: [0, 7, 16, 26], wet: .42, colors: ['#baa88c', '#91ad9c'] },
    { id: 'nylon', name: 'Нейлоновая гитара', voice: 'guitar', category: 'Фокус', bpm: 76, mod: 14,
      phrase: 32, voicing: [0, 2, 4, 7], rhythm: [0, 4, 10, 14, 18, 24, 28], wet: .28, colors: ['#b69373', '#cbb57d'] },
    { id: 'mallets', name: 'Маримба и шейкер', voice: 'marimba', category: 'Фокус', bpm: 86, mod: 16,
      phrase: 32, voicing: [0, 4, 7, 9], rhythm: [0, 3, 8, 11, 16, 22, 27], hat: [6, 14, 22, 30], wet: .24, colors: ['#b48c68', '#86a68c'] },
    { id: 'tape', name: 'Лоу-фай', voice: 'ep', category: 'Фокус', bpm: 74, mod: 14,
      phrase: 32, voicing: [2, 4, 6, 8], rhythm: [2, 8, 15, 19, 26], bass: [0, 12, 20],
      kick: [0, 11, 16, 26], snare: [4, 12, 20, 28], hat: [2, 10, 18, 24, 30], wet: .24, colors: ['#a8819b', '#bf9c7f'] },
    { id: 'bossa', name: 'Тихая босса', voice: 'guitar', category: 'Фокус', bpm: 92, mod: 12, tags: ['Джаз'],
      phrase: 32, voicing: [2, 4, 6, 8], rhythm: [0, 3, 6, 10, 13, 19, 22, 26, 29], bass: [0, 8, 16, 24],
      kick: [0, 8, 16, 24], hat: [3, 6, 10, 13, 19, 22, 26, 29], wet: .2, colors: ['#b5a06f', '#87ad99'] },
    { id: 'ballad', name: 'Джазовая баллада', voice: 'piano', category: 'Расслабление', bpm: 58, mod: 8, tags: ['Джаз'],
      phrase: 32, voicing: [2, 4, 6, 8], rhythm: [0, 9, 14, 20, 29], bass: [0, 16, 25], wet: .46, colors: ['#9b8eab', '#b19394'] },
    { id: 'arpeggio', name: 'Электронное арпеджио', voice: 'pluck', category: 'Фокус', bpm: 94, mod: 16,
      phrase: 32, voicing: [0, 4, 8, 11], rhythm: [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30],
      bass: [0, 16], kick: [0, 8, 16, 24], wet: .45, colors: ['#8f98c1', '#86b0bc'] },
    { id: 'bells', name: 'Редкие колокола', voice: 'bell', category: 'Расслабление', bpm: 60, mod: 7,
      phrase: 64, voicing: [4, 7, 8, 11], rhythm: [8, 29, 46], wet: .65, colors: ['#90a7b2', '#c0abc6'] },
    { id: 'electric', name: 'Электропиано без ударных', voice: 'ep', category: 'Фокус', bpm: 66, mod: 10,
      phrase: 64, voicing: [0, 2, 6, 8], rhythm: [0, 9, 21, 32, 40, 58], wet: .46, colors: ['#a3927d', '#8da8a1'] },
    { id: 'swell', name: 'Дышащие пэды', voice: 'sine', category: 'Расслабление', bpm: 54, mod: 6,
      phrase: 64, voicing: [0, 2, 6, 8], rhythm: [10, 34, 52], sustain: .028, wet: .66, colors: ['#8698b2', '#a1a4c7'] },
    { id: 'drone', name: 'Низкий дрон', voice: 'sine', category: 'Сон', bpm: 46, mod: 3,
      phrase: 128, voicing: [0, 4, 7, 8], rhythm: [32, 84], sustain: .03, wet: .35, colors: ['#7b92a1', '#a1a5b8'] },
    { id: 'night', name: 'Ночное пианино', voice: 'piano', category: 'Сон', bpm: 50, mod: 4,
      phrase: 64, voicing: [2, 4, 7, 9], rhythm: [4, 28, 48], sustain: .016, wet: .58, colors: ['#9297aa', '#ada0b4'] },
  ];

  function playNote(r, voice, note, t, accent, pan) {
    const dest = r.s.lead;
    if (voice === 'ep') I.ep(r, dest, note, t, .42 * accent, 1.7, pan);
    else if (voice === 'pluck' || voice === 'bell') I[voice](r, dest, note, t, .035 * accent, pan);
    else if (voice === 'sine') r.tone(dest, { f: mtof(note), t, gain: .021 * accent, a: 1.8, hold: 1.4, r: 3.8, pan });
    else I[voice](r, dest, note, t, .42 * accent, pan);
  }

  function arrangement(style, [id, name, tonic, mode, progression, motif, tempoOffset]) {
    const { voice, phrase, rhythm, bass = [], kick = [], snare = [], hat = [], sustain = .01 } = style;
    const scale = scales[mode];
    const pitch = degree => tonic + scale[degree % scale.length] + 12 * Math.floor(degree / scale.length);
    const chords = progression.map(degree => ({
      root: pitch(degree) - 12,
      fifth: pitch(degree + 4) - 12,
      notes: style.voicing.map(interval => pitch(degree + interval)),
    }));
    const percussive = kick.length || snare.length || hat.length;
    return {
      id: `arr-${id}-${style.id}`,
      name: `${name} · ${style.name}`,
      subtitle: `${style.bpm + tempoOffset} BPM · ${percussive ? 'мягкий ритм' : 'без ударных'}`,
      category: style.category,
      tags: ['Новые', 'Фон', ...(style.tags || [])],
      bpm: style.bpm + tempoOffset,
      mod: style.mod,
      colors: style.colors,
      vary: false,
      setup(r) {
        r.s.lead = r.bus(.65, style.wet);
        r.s.pad = r.bus(.5, style.wet);
        if (bass.length) r.s.bass = r.bus(.6, .08);
        if (percussive) r.s.drums = r.bus(.35, .08);
      },
      step(r, i, t) {
        const section = Math.floor(i / phrase);
        const beat = i % phrase;
        const chord = chords[section % chords.length];
        if (!beat) I.pad(r, r.s.pad, [chord.root, ...chord.notes], t, phrase * r.stepDur,
          { type: voice === 'sine' ? 'sine' : 'triangle', gain: sustain, cutoff: 900, a: 2.6, rel: 3.5, spread: 4, tilt: .8 });
        const hit = rhythm.indexOf(beat);
        if (hit !== -1) {
          const note = chord.notes[motif[(section + hit) % motif.length]];
          const strength = style.category === 'Сон' ? .65 : 1;
          playNote(r, voice, note, t, strength * (hit === 0 ? 1 : .72), Math.sin(section + hit) * .24);
        }
        if (bass.includes(beat)) r.tone(r.s.bass, { f: mtof(beat === 0 ? chord.root : chord.fifth), t,
          gain: .06, a: .035, hold: 3 * r.stepDur, r: .4 });
        if (kick.includes(beat)) I.kick(r, r.s.drums, t, .15);
        if (snare.includes(beat)) I.snare(r, r.s.drums, t, .06);
        if (hat.includes(beat)) I.hat(r, r.s.drums, t, .014);
      },
    };
  }

  for (const score of scores) {
    for (const style of styles) TRACKS.push(arrangement(style, score));
  }
})();
