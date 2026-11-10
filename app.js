(() => {
  const engine = new Engine();
  const DEPTHS = [0, 0.3, 0.55, 0.8];
  const $ = s => document.querySelector(s);

  const SHUFFLE_MIN = [4, 8];

  let idx = 0, rt = null, playing = false, trackStart = 0, timerMin = 0, timerEnd = null, filter = '';
  let shuffle = localStorage.getItem('potok.shuffle') === '1', history = [], autoAt = null;
  let mode = 'track', rig = null;
  let rigParams = loadRig();

  const visible = () => TRACKS.map((tr, k) => k).filter(k => !filter || TRACKS[k].category === filter || TRACKS[k].tags?.includes(filter));
  const randomNext = () => {
    const v = visible(), recent = history.slice(-Math.floor(v.length / 2));
    const pool = v.filter(k => k !== idx && !recent.includes(k));
    return pick(pool.length ? pool : v.filter(k => k !== idx).concat(v.length === 1 ? v : []));
  };
  const shift = d => {
    if (mode === 'rig') {
      const cur = rigMatch(rigParams);
      if (shuffle && d > 0) return applyPreset(pick(RIG_PRESETS.filter(p => p !== cur)));
      const i = RIG_PRESETS.indexOf(cur);
      const n = RIG_PRESETS.length;
      return applyPreset(RIG_PRESETS[i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n]);
    }
    if (shuffle) {
      if (d > 0) return play(randomNext());
      if (history.length) return play(history.pop(), false);
      return;
    }
    const v = visible(), p = v.indexOf(idx);
    play(p < 0 ? v[0] : v[(p + d + v.length) % v.length]);
  };
  const scheduleAuto = () => {
    const live = mode === 'rig' ? rig && rig.running : rt;
    const hold = mode === 'track' && TRACKS[idx] && TRACKS[idx].study;
    autoAt = shuffle && playing && !hold && engine.ctx && live ? engine.ctx.currentTime + rand(...SHUFFLE_MIN) * 60 : null;
  };
  const setShuffle = on => {
    shuffle = on;
    localStorage.setItem('potok.shuffle', on ? '1' : '0');
    $('#shuffle').classList.toggle('on', on);
    scheduleAuto();
  };

  const band = hz => hz >= 12 ? 'β-ритм' : hz >= 8 ? 'α-ритм' : hz >= 4 ? 'θ-ритм' : 'δ-ритм';
  const inkOn = hex => {
    const n = parseInt(hex.slice(1), 16);
    const lin = c => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return L > 0.18 ? '#141415' : '#ededed';
  };
  const fmt = s => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  function renderList() {
    const ul = $('#tracks');
    ul.innerHTML = '';
    visible().forEach(k => {
      const tr = TRACKS[k], li = document.createElement('li');
      const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      li.innerHTML = `
        <button>
          <span class="sw" style="background:${tr.colors[0]}"></span>
          <span><div class="name">${esc(tr.name)}</div><div class="sub">${esc(tr.subtitle)}</div></span>
          <span class="right">${esc(tr.category)}<br>${tr.mod} Гц</span>
        </button>`;
      li.querySelector('button').dataset.k = k;
      li.querySelector('button').onclick = () => play(k);
      ul.appendChild(li);
    });
  }

  function loadRig() {
    const p = {};
    for (const k of RIG_KEYS) p[k] = RIG_PRESETS[0][k];
    try {
      const saved = JSON.parse(localStorage.getItem('potok.rig') || 'null');
      if (saved) for (const k of RIG_KEYS) if (typeof saved[k] === 'number') p[k] = saved[k];
    } catch (_) {}
    return p;
  }

  function saveRig() {
    localStorage.setItem('potok.rig', JSON.stringify(rigParams));
  }

  function refreshRig(p) {
    for (const k of RIG_KEYS) {
      const out = document.getElementById('rig-' + k + '-v');
      if (!out) continue;
      if (k === 'bright') out.textContent = hzText(rigBrightHz(p.bright));
      else if (k === 'lowcut') out.textContent = hzText(rigLowHz(p.lowcut));
      else if (k === 'mod') out.textContent = p.mod ? `${p.mod} Гц` : 'выкл';
      else if (k === 'width') out.textContent = p.width === 0 ? 'моно' : p.width === 100 ? 'стерео' : `${p.width}%`;
      else out.textContent = String(p[k]);
    }
    const bar = $('#rig-balance');
    const parts = [['#d6d3d1', p.white], ['#f472b6', p.pink], ['#c2410c', p.brown]];
    const sum = parts.reduce((s, x) => s + x[1], 0);
    bar.innerHTML = sum ? parts.map(([c, v]) => `<span style="flex:${v} 1 0;background:${c}"></span>`).join('') : '';
    const m = rigMatch(p);
    document.querySelectorAll('#rig-presets button').forEach(b => b.classList.toggle('on', !!(m && b.dataset.id === m.id)));
  }

  function writeRig(p) {
    for (const k of RIG_KEYS) document.getElementById('rig-' + k).value = p[k];
    refreshRig(p);
  }

  function readRig() {
    const p = {};
    for (const k of RIG_KEYS) p[k] = +document.getElementById('rig-' + k).value;
    return p;
  }

  function applyPreset(pre) {
    rigParams = {};
    for (const k of RIG_KEYS) rigParams[k] = pre[k];
    writeRig(rigParams);
    saveRig();
    if (rig && rig.built) rig.apply(rigParams);
    if (playing && mode === 'track') return playRig();
    if (mode === 'rig') updateUI();
  }

  function onRigInput() {
    rigParams = readRig();
    saveRig();
    refreshRig(rigParams);
    if (rig && rig.built) rig.apply(rigParams);
    if (playing && mode === 'track') playRig();
    else if (mode === 'rig') updateUI();
  }

  function presentation() {
    if (mode === 'rig') {
      return {
        name: rigTitle(rigParams),
        subtitle: rigBlurb(rigParams),
        category: 'Конструктор',
        mod: rigParams.mod,
        colors: rigPalette(rigParams),
        tune: rigTune(rigParams),
      };
    }
    return TRACKS[idx];
  }

  function updateUI() {
    const tr = presentation();
    document.documentElement.style.setProperty('--c1', tr.colors[0]);
    document.documentElement.style.setProperty('--c2', tr.colors[1]);
    document.documentElement.style.setProperty('--ink', inkOn(tr.colors[0]));
    $('#cat').textContent = tr.category;
    $('#title').textContent = tr.name;
    $('#subtitle').textContent = tr.subtitle;
    $('#tune').textContent = tr.tune || (rt && mode !== 'rig' ? rt.label : '');
    $('#mod').textContent = tr.mod ? `Модуляция ${tr.mod} Гц · ${band(tr.mod)}` : 'Модуляция выкл';
    document.querySelectorAll('#tracks button').forEach(b => b.classList.toggle('active', mode === 'track' && +b.dataset.k === idx));
    $('#play').classList.toggle('playing', playing);
    document.title = playing ? `${tr.name} — Поток` : 'Поток';
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: tr.name, artist: 'Поток', album: tr.category });
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
  }

  function playRig() {
    engine.init();
    if (!rig) rig = new NoiseRig(engine);
    rig.params = rigParams;
    const ctx = engine.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    engine.master.gain.cancelScheduledValues(ctx.currentTime);
    engine.master.gain.setTargetAtTime(engine.volume, ctx.currentTime, 0.05);
    const cross = (rt && !rt.stopping) || (rig.running && playing);
    if (rt && !rt.stopping) rt.stop(2.5);
    const was = rig.running;
    rig.start(cross ? 2.5 : 1.2);
    if (!was) trackStart = ctx.currentTime;
    mode = 'rig';
    playing = true;
    if (timerMin && !timerEnd) timerEnd = ctx.currentTime + timerMin * 60;
    scheduleAuto();
    updateUI();
  }

  function play(k, remember = true) {
    mode = 'track';
    engine.init();
    const ctx = engine.ctx;
    if (remember && rt && k !== idx) history = [...history, idx].slice(-50);
    idx = (k + TRACKS.length) % TRACKS.length;
    const cross = (rt && !rt.stopping) || (rig && rig.built);
    if (rig && rig.built) rig.stop(2.5);
    if (ctx.state === 'suspended') ctx.resume();
    engine.master.gain.cancelScheduledValues(ctx.currentTime);
    engine.master.gain.setTargetAtTime(engine.volume, ctx.currentTime, 0.05);
    const fadeIn = cross ? 2.5 : 1.2;
    if (rt && !rt.stopping) rt.stop(2.5);
    rt = new TrackRuntime(engine, TRACKS[idx]);
    rt.start(fadeIn);
    trackStart = ctx.currentTime;
    playing = true;
    if (timerMin && !timerEnd) timerEnd = ctx.currentTime + timerMin * 60;
    scheduleAuto();
    updateUI();
  }

  async function pause() {
    if (!engine.ctx || !playing) return;
    playing = false;
    updateUI();
    engine.master.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.08);
    await new Promise(r => setTimeout(r, 400));
    if (!playing) await engine.ctx.suspend();
  }

  async function resume() {
    playing = true;
    updateUI();
    await engine.ctx.resume();
    engine.master.gain.setTargetAtTime(engine.volume, engine.ctx.currentTime, 0.1);
  }

  function toggle() {
    if (mode === 'rig') {
      if (!playing || !rig || !rig.running) return playRig();
      return pause();
    }
    if (!rt) return play(shuffle ? pick(visible()) : idx);
    playing ? pause() : resume();
  }

  function setSeg(id, v) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', +b.dataset.v === v));
  }

  $('#play').onclick = toggle;
  $('#next').onclick = () => shift(1);
  $('#prev').onclick = () => shift(-1);
  $('#shuffle').onclick = () => setShuffle(!shuffle);

  document.querySelectorAll('#filter button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#filter button').forEach(x => x.classList.toggle('on', x === b));
    const cons = b.dataset.v === 'constructor';
    $('#constructor').classList.toggle('on', cons);
    $('#tracks').style.display = cons ? 'none' : '';
    if (cons) {
      if (playing && mode === 'track') playRig();
      else { mode = 'rig'; updateUI(); }
      return;
    }
    filter = b.dataset.v;
    if (mode === 'rig' && (!rig || !rig.running)) mode = 'track';
    renderList();
    updateUI();
  });

  document.querySelectorAll('#depth button').forEach(b => b.onclick = () => {
    const v = +b.dataset.v;
    setSeg('depth', v);
    engine.setDepth(DEPTHS[v]);
    if (rig) rig.setDepth(DEPTHS[v]);
  });

  document.querySelectorAll('#timer button').forEach(b => b.onclick = () => {
    timerMin = +b.dataset.v;
    setSeg('timer', timerMin);
    timerEnd = timerMin && engine.ctx && playing ? engine.ctx.currentTime + timerMin * 60 : null;
  });

  $('#vol').oninput = e => engine.setVolume(Math.pow(e.target.value / 100, 2));

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowRight') shift(1);
    else if (e.code === 'ArrowLeft') shift(-1);
    else if (e.code === 'KeyS') setShuffle(!shuffle);
    else if (/^Digit[1-9]$/.test(e.code)) {
      if ($('#constructor').classList.contains('on')) {
        const pre = RIG_PRESETS[+e.code.slice(5) - 1];
        if (pre) applyPreset(pre);
        return;
      }
      const k = visible()[+e.code.slice(5) - 1];
      if (k !== undefined) play(k);
    }
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
      if (playing) return;
      if (mode === 'rig') return rig && rig.running ? resume() : playRig();
      return rt ? resume() : play(idx);
    });
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('nexttrack', () => shift(1));
    navigator.mediaSession.setActionHandler('previoustrack', () => shift(-1));
  }

  const cv = $('#viz'), g = cv.getContext('2d'), N = 64, smooth = new Float32Array(N);
  let data = null;

  function draw() {
    const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    if (engine.analyser && playing) {
      data = data || new Uint8Array(engine.analyser.frequencyBinCount);
      engine.analyser.getByteFrequencyData(data);
    }
    const tr = presentation(), grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, tr.colors[0]);
    grad.addColorStop(1, tr.colors[1]);
    g.fillStyle = grad;

    const bw = w / N, top = data ? data.length * 0.6 : 1;
    for (let k = 0; k < N; k++) {
      let target = 0;
      if (data && playing) {
        const lo = Math.floor(Math.pow(top, k / N)), hi = Math.max(lo + 1, Math.floor(Math.pow(top, (k + 1) / N)));
        let sum = 0;
        for (let j = lo; j < hi; j++) sum += data[j];
        target = sum / (hi - lo) / 255;
      }
      smooth[k] += (target - smooth[k]) * 0.2;
      const bh = 4 + smooth[k] * h * 0.9;
      g.globalAlpha = 0.35 + smooth[k] * 0.65;
      g.beginPath();
      g.roundRect(k * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh, bw * 0.3);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function frame() {
    draw();
    if (engine.ctx && (rt || rig)) {
      const now = engine.ctx.currentTime;
      $('#clock').textContent = fmt(now - trackStart);
      const tune = mode === 'rig' ? rigTune(rigParams) : (rt ? rt.label : '');
      if ($('#tune').textContent !== tune) $('#tune').textContent = tune;
      $('#upnext').textContent = autoAt ? `Дальше через ${fmt(autoAt - now)}` : '';
      if (autoAt && playing && now >= autoAt) shift(1);
      if (timerEnd) {
        $('#session').textContent = `Осталось ${fmt(timerEnd - now)}`;
        if (now >= timerEnd) {
          timerEnd = null;
          timerMin = 0;
          setSeg('timer', 0);
          $('#session').textContent = 'Сессия завершена';
          pause();
        }
      } else if ($('#session').textContent.startsWith('Осталось')) {
        $('#session').textContent = '';
      }
    }
    requestAnimationFrame(frame);
  }

  let studyMode = localStorage.getItem('potok.studyMode') || 'stack';
  let studySpeed = localStorage.getItem('potok.studySpeed') || '0.85';
  if (studyMode !== 'one' && studyMode !== 'stack') studyMode = 'stack';
  if (!['1', '0.85', '0.7'].includes(studySpeed)) studySpeed = '0.85';
  let studyHold = null, studyJob = 0;

  function markSeg(id, v) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
  }

  function studyName(file) {
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (base || 'Композиция').slice(0, 48);
  }

  function studySubtitle(meta) {
    const sec = meta.seconds.toFixed(1).replace('.', ',');
    const many = meta.repeats % 10 === 1 && meta.repeats % 100 !== 11 ? 'повтора' : 'повторов';
    const what = meta.kind === 'stack' ? `из ${meta.repeats} ${many}` : meta.kind === 'even' ? 'ровный кусок' : 'один момент';
    const rate = Math.abs(meta.speed - 1) < 0.01 ? 'исходный темп' : `×${String(meta.speed).replace('.', ',')}`;
    return `${meta.trimmed ? 'первые 6 мин · ' : ''}${sec} с · ${what} · ${rate}`;
  }

  function studyTrack(name, subtitle, buffer) {
    return {
      name, subtitle, category: 'Учёба', mod: 14, study: true, vary: false, bpm: 40, level: 0.9,
      colors: ['#6f8f72', '#d9c7a1'],
      setup(r) {
        const src = r.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const lp = r.filter('lowpass', 9800, 0.7);
        src.connect(lp);
        lp.connect(r.bus(0.74, 0.38));
        src.start(r.ctx.currentTime);
        r.sources.push(src);
      },
      step() {},
    };
  }

  function mountStudy(tr) {
    let k = TRACKS.findIndex(t => t.study);
    if (k >= 0) TRACKS[k] = tr;
    else {
      TRACKS.unshift(tr);
      k = 0;
      history = history.map(h => h + 1);
    }
    history = history.filter(h => h !== k && h < TRACKS.length);
    filter = 'Учёба';
    $('#constructor').classList.remove('on');
    $('#tracks').style.display = '';
    document.querySelectorAll('#filter button').forEach(b => b.classList.toggle('on', b.dataset.v === 'Учёба'));
    renderList();
    play(k);
  }

  async function renderStudy(id) {
    if (!studyHold || id !== studyJob) return;
    const card = $('#study');
    card.classList.add('busy');
    $('#study-text').textContent = studyMode === 'stack' ? 'Складываем повторы…' : 'Ищем повтор…';
    await new Promise(r => setTimeout(r, 30));
    if (id !== studyJob) return;
    let result = null;
    try {
      result = Study.prepare(studyHold.channels, studyHold.sampleRate, {
        mode: studyMode,
        speed: Number(studySpeed),
        trimmed: studyHold.trimmed,
      });
    } catch (_) {}
    if (id !== studyJob) return;
    card.classList.remove('busy');
    if (!result) {
      $('#study-text').textContent = 'В этом файле почти нет звука. Скинь другую композицию.';
      return;
    }
    const buf = engine.ctx.createBuffer(2, result.channels[0].length, result.sampleRate);
    buf.copyToChannel(result.channels[0], 0);
    buf.copyToChannel(result.channels[1], 1);
    mountStudy(studyTrack(studyHold.name, studySubtitle(result.meta), buf));
    $('#study-text').textContent = 'Готово. Скинь другую композицию, чтобы заменить.';
  }

  async function loadStudy(file) {
    if (!file) return;
    const id = ++studyJob;
    engine.init();
    const card = $('#study');
    card.classList.add('busy');
    $('#study-text').textContent = 'Читаем файл…';
    try {
      const audio = await engine.ctx.decodeAudioData(await file.arrayBuffer());
      if (id !== studyJob) return;
      const cap = Math.min(audio.length, Math.floor(6 * 60 * audio.sampleRate));
      const channels = [];
      for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) {
        const data = audio.getChannelData(c);
        channels.push(cap === data.length ? data : data.subarray(0, cap));
      }
      studyHold = {
        audio, channels, sampleRate: audio.sampleRate, name: studyName(file),
        trimmed: audio.length > cap + audio.sampleRate,
      };
    } catch (_) {
      if (id !== studyJob) return;
      card.classList.remove('busy');
      $('#study-text').textContent = 'Не получилось прочитать этот файл.';
      return;
    }
    await renderStudy(id);
  }

  function chooseStudy(kind, value) {
    if (kind === 'mode') {
      studyMode = value;
      localStorage.setItem('potok.studyMode', value);
      markSeg('study-mode', value);
    } else {
      studySpeed = value;
      localStorage.setItem('potok.studySpeed', value);
      markSeg('study-speed', value);
    }
    if (studyHold && !$('#study').classList.contains('busy')) renderStudy(++studyJob);
  }

  markSeg('study-mode', studyMode);
  markSeg('study-speed', studySpeed);
  document.querySelectorAll('#study-mode button').forEach(b => { b.onclick = () => chooseStudy('mode', b.dataset.v); });
  document.querySelectorAll('#study-speed button').forEach(b => { b.onclick = () => chooseStudy('speed', b.dataset.v); });
  $('#study-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) loadStudy(f);
  });
  const studyCard = $('#study');
  ['dragenter', 'dragover'].forEach(ev => studyCard.addEventListener(ev, e => {
    e.preventDefault();
    studyCard.classList.add('over');
  }));
  studyCard.addEventListener('dragleave', e => {
    if (!studyCard.contains(e.relatedTarget)) studyCard.classList.remove('over');
  });
  studyCard.addEventListener('drop', e => {
    e.preventDefault();
    studyCard.classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadStudy(f);
  });

  for (const pre of RIG_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = pre.id;
    b.textContent = pre.name;
    b.onclick = () => applyPreset(pre);
    $('#rig-presets').appendChild(b);
  }
  for (const k of RIG_KEYS) document.getElementById('rig-' + k).addEventListener('input', onRigInput);
  writeRig(rigParams);

  renderList();
  setSeg('depth', 2);
  setSeg('timer', 0);
  document.querySelector('#filter button').classList.add('on');
  $('#shuffle').classList.toggle('on', shuffle);
  updateUI();
  frame();
})();
