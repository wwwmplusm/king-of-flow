// Drop a track, pull out a repeating moment (or the average of several),
// slow it, and close it into a seamless loop.
const Study = (() => {
  const ANALYSIS = 11025;
  const MIN_SEC = 2.4;
  const MAX_SEC = 14;
  const MAX_TAKES = 6;

  function bandpass(f, sr) {
    const w0 = 2 * Math.PI * f / sr;
    const alpha = Math.sin(w0) / 1.6;
    const a0 = 1 + alpha;
    return [alpha / a0, 0, -alpha / a0, -2 * Math.cos(w0) / a0, (1 - alpha) / a0];
  }

  function mixDown(channels, step, maxN) {
    const n0 = Math.min(channels[0].length, maxN);
    const n = Math.floor(n0 / step);
    const out = new Float32Array(n);
    const inv = 1 / (step * channels.length);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const b = i * step;
      for (let c = 0; c < channels.length; c++) {
        const ch = channels[c];
        for (let k = 0; k < step; k++) s += ch[b + k];
      }
      out[i] = s * inv;
    }
    return out;
  }

  function features(mono, sr) {
    const bands = [90, 220, 550, 1300, 2600, 4200].filter(f => f < sr * 0.45);
    const coeff = bands.map(f => bandpass(f, sr));
    const st = coeff.map(() => [0, 0, 0, 0]);
    const hop = 512;
    const frames = Math.floor(mono.length / hop);
    const dim = bands.length + 1;
    const raw = new Float64Array(frames * dim);
    for (let i = 0; i < frames; i++) {
      const e = new Float64Array(bands.length);
      let rms = 0;
      const base = i * hop;
      for (let n = 0; n < hop; n++) {
        const x = mono[base + n];
        rms += x * x;
        for (let b = 0; b < coeff.length; b++) {
          const [b0, b1, b2, a1, a2] = coeff[b];
          const s = st[b];
          const y = b0 * x + b1 * s[0] + b2 * s[1] - a1 * s[2] - a2 * s[3];
          s[1] = s[0];
          s[0] = x;
          s[3] = s[2];
          s[2] = y;
          e[b] += y * y;
        }
      }
      const row = i * dim;
      for (let b = 0; b < bands.length; b++) raw[row + b] = Math.log(e[b] + 1e-12);
      raw[row + bands.length] = Math.log(rms + 1e-12);
    }
    const mean = new Float64Array(dim);
    const vari = new Float64Array(dim);
    for (let i = 0; i < frames; i++) for (let k = 0; k < dim; k++) mean[k] += raw[i * dim + k];
    for (let k = 0; k < dim; k++) mean[k] /= Math.max(1, frames);
    for (let i = 0; i < frames; i++) for (let k = 0; k < dim; k++) {
      const d = raw[i * dim + k] - mean[k];
      vari[k] += d * d;
    }
    const F = new Float64Array(frames * dim);
    for (let i = 0; i < frames; i++) {
      let nrm = 0;
      for (let k = 0; k < dim; k++) {
        const z = (raw[i * dim + k] - mean[k]) / Math.sqrt(vari[k] / Math.max(1, frames) + 1e-8);
        F[i * dim + k] = z;
        nrm += z * z;
      }
      nrm = Math.sqrt(nrm);
      if (nrm > 1e-6) for (let k = 0; k < dim; k++) F[i * dim + k] /= nrm;
    }
    return { F, frames, dim, hop };
  }

  function dot(F, dim, a, b) {
    let s = 0;
    const ia = a * dim, ib = b * dim;
    for (let k = 0; k < dim; k++) s += F[ia + k] * F[ib + k];
    return s;
  }

  function rangeSim(F, dim, a, b, len) {
    let s = 0, n = 0;
    const step = len > 80 ? 2 : 1;
    for (let i = 0; i < len; i += step) {
      s += dot(F, dim, a + i, b + i);
      n++;
    }
    return s / n;
  }

  function find(channels, sampleRate) {
    const step = Math.max(1, Math.round(sampleRate / ANALYSIS));
    const srA = sampleRate / step;
    const mono = mixDown(channels, step, channels[0].length);
    const { F, frames, dim, hop } = features(mono, srA);
    const hopSec = hop / srA;
    const duration = mono.length / srA;
    const toSample = frame => frame * hop * step;
    const whole = () => ({
      len: channels[0].length,
      takes: [{ start: 0, shift: 0, weight: 1 }],
      kind: 'one',
      score: 0,
    });
    if (duration < MIN_SEC * 2 || frames < 16) return whole();

    const minLag = Math.max(2, Math.round(MIN_SEC / hopSec));
    const maxLag = Math.min(Math.round(MAX_SEC / hopSec), Math.floor(frames * 0.42));
    if (maxLag <= minLag + 2) return whole();

    const raw = new Float64Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0, n = 0;
      for (let i = 0; i + lag < frames; i += 2) {
        s += dot(F, dim, i, i + lag);
        n++;
      }
      raw[lag] = s / n;
    }

    let bestLag = minLag, bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const sec = lag * hopSec;
      const prior = Math.exp(-0.5 * ((sec - 5.5) / 3.4) ** 2);
      const shaped = raw[lag] * (0.72 + 0.28 * prior);
      if (shaped > bestScore) { bestScore = shaped; bestLag = lag; }
    }
    // A longer lag is often just two or three copies of a shorter cell.
    let lag = bestLag;
    for (let div = 2; div <= 4; div++) {
      const h = Math.round(bestLag / div);
      if (h >= minLag && raw[h] >= raw[bestLag] - 0.04) lag = h;
    }

    const even = () => {
      const len = Math.min(maxLag, Math.max(minLag, Math.round(7 / hopSec)));
      let calm = Infinity, at = 0;
      for (let p = 0; p + len < frames; p += 2) {
        let flux = 0, n = 0;
        for (let i = 0; i < len - 1; i += 2) {
          let d = 0;
          for (let k = 0; k < dim; k++) {
            const x = F[(p + i) * dim + k] - F[(p + i + 1) * dim + k];
            d += x * x;
          }
          flux += d;
          n++;
        }
        if (flux / n < calm) { calm = flux / n; at = p; }
      }
      return {
        len: toSample(len),
        takes: [{ start: toSample(at), shift: 0, weight: 1 }],
        kind: 'even',
        score: raw[lag],
      };
    };

    const last = frames - 2 * lag;
    const stride = Math.max(1, Math.round(lag / 10));
    let at = 0, atScore = -Infinity;
    for (let p = 0; p <= last; p += stride) {
      const sim = rangeSim(F, dim, p, p + lag, lag);
      if (sim > atScore) { atScore = sim; at = p; }
    }
    const lo = Math.max(0, at - stride), hi = Math.min(last, at + stride);
    for (let p = lo; p <= hi; p++) {
      const sim = rangeSim(F, dim, p, p + lag, lag);
      if (sim > atScore) { atScore = sim; at = p; }
    }
    if (atScore < 0.4) return even();

    const gate = Math.max(0.58, atScore * 0.9);
    const hits = [{ p: at, sim: atScore }];
    const scan = Math.max(1, Math.round(lag / 5));
    for (let p = 0; p + lag < frames; p += scan) {
      if (Math.abs(p - at) < lag * 0.55) continue;
      const sim = rangeSim(F, dim, at, p, lag);
      if (sim >= gate) hits.push({ p, sim });
    }
    hits.sort((a, b) => b.sim - a.sim);

    const margin = Math.round(0.06 * srA);
    const loopA = lag * hop;
    const low = lowpass(mono, srA, 280);
    const takes = [];
    for (const hit of hits) {
      if (takes.length >= MAX_TAKES) break;
      const startA = hit.p * hop;
      if (hit.p === at) {
        takes.push({ start: toSample(hit.p), shift: 0, weight: 1.4 });
        continue;
      }
      if (startA < margin || startA + loopA + margin >= low.length) continue;
      const aligned = align(low, at * hop, startA, loopA, srA);
      if (aligned.corr < 0.34) continue;
      const shift = aligned.shift * step;
      const start = toSample(hit.p);
      if (start + shift < 0 || start + shift + toSample(lag) > channels[0].length) continue;
      takes.push({ start, shift, weight: aligned.corr });
    }
    if (!takes.length) takes.push({ start: toSample(at), shift: 0, weight: 1 });
    return { len: toSample(lag), takes, kind: 'one', score: raw[lag] };
  }

  function lowpass(x, sr, fc) {
    const a = Math.exp(-2 * Math.PI * fc / sr);
    const b = 1 - a;
    const y = new Float32Array(x.length);
    let z = x[0];
    for (let i = 0; i < x.length; i++) {
      z += b * (x[i] - z);
      y[i] = z;
    }
    return y;
  }

  function align(mono, a, b, len, sr) {
    const max = Math.round(0.05 * sr);
    const stride = Math.max(1, Math.round(sr / 3000));
    let best = 0, bestC = -1;
    for (let s = -max; s <= max; s += stride) {
      let c = 0, ea = 0, eb = 0;
      for (let i = 0; i < len; i += stride * 2) {
        const x = mono[a + i];
        const y = mono[b + i + s];
        c += x * y;
        ea += x * x;
        eb += y * y;
      }
      const corr = c / Math.sqrt(ea * eb + 1e-12);
      if (corr > bestC) { bestC = corr; best = s; }
    }
    return { shift: best, corr: bestC };
  }

  function mixTakes(channels, found, mode) {
    const uses = mode === 'one' ? found.takes.slice(0, 1) : found.takes;
    const len = found.len;
    const acc = channels.map(() => new Float32Array(len));
    let wsum = 0;
    let used = 0;
    for (const take of uses) {
      if (take.start + take.shift < 0 || take.start + take.shift + len > channels[0].length) continue;
      const w = take.weight;
      for (let c = 0; c < channels.length; c++) {
        const src = channels[c], dst = acc[c];
        const p = take.start + take.shift;
        for (let i = 0; i < len; i++) dst[i] += w * src[p + i];
      }
      wsum += w;
      used++;
    }
    if (!wsum) return null;
    for (const dst of acc) for (let i = 0; i < len; i++) dst[i] /= wsum;
    if (used > 1) {
      const proto = uses[0];
      let eAcc = 0, eProto = 0;
      const src = channels[0];
      for (let i = 0; i < len; i += 4) {
        eAcc += acc[0][i] ** 2;
        eProto += src[proto.start + i] ** 2;
      }
      if (eAcc < eProto * 0.25) {
        for (let c = 0; c < channels.length; c++) {
          acc[c].set(channels[c].subarray(proto.start, proto.start + len));
        }
        used = 1;
      }
    }
    return { channels: acc, used };
  }

  function slow(channels, speed) {
    if (speed > 0.985) return channels.map(c => Float32Array.from(c));
    const n = channels[0].length;
    const win = 8192;
    const hs = 4096;
    if (n < win * 2) return resample(channels, speed);
    const ha = Math.max(1, Math.round(hs * speed));
    const seek = Math.min(420, Math.floor((hs - ha) * 0.62));
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (win - 1)));
    const outLen = Math.floor(n / speed) + win;
    const out = channels.map(() => new Float32Array(outLen));
    const norm = new Float32Array(outLen);
    const mono = new Float32Array(n);
    const inv = 1 / channels.length;
    for (let c = 0; c < channels.length; c++) {
      const ch = channels[c];
      for (let i = 0; i < n; i++) mono[i] += ch[i] * inv;
    }
    const overlap = win - hs;
    const place = (pos, syn) => {
      for (let c = 0; c < channels.length; c++) {
        const src = channels[c], dst = out[c];
        for (let i = 0; i < win; i++) dst[syn + i] += src[pos + i] * hann[i];
      }
      for (let i = 0; i < win; i++) norm[syn + i] += hann[i];
    };
    const corrAt = (pos, ref) => {
      let c = 0, e = 0;
      for (let i = 0; i < overlap; i += 8) {
        const y = mono[pos + i];
        c += y * mono[ref + i];
        e += y * y;
      }
      return c / Math.sqrt(e + 1e-12);
    };
    let prev = 0;
    place(0, 0);
    let syn = hs;
    while (syn + win <= outLen) {
      const nominal = prev + ha;
      const ref = prev + hs;
      if (nominal + win > n || ref + overlap > n) break;
      const lo = Math.max(0, nominal - seek);
      const hi = Math.min(n - win, nominal + seek);
      let bestPos = nominal, best = -Infinity;
      for (let pos = lo; pos <= hi; pos += 20) {
        const c = corrAt(pos, ref);
        if (c > best) { best = c; bestPos = pos; }
      }
      const flo = Math.max(lo, bestPos - 20);
      const fhi = Math.min(hi, bestPos + 20);
      for (let pos = flo; pos <= fhi; pos++) {
        const c = corrAt(pos, ref);
        if (c > best) { best = c; bestPos = pos; }
      }
      place(bestPos, syn);
      prev = bestPos;
      syn += hs;
    }
    let a = 0, b = norm.length - 1;
    while (a < b && norm[a] < 0.7) a++;
    while (b > a && norm[b] < 0.7) b--;
    if (b - a < sampleGuard(channels)) return resample(channels, speed);
    return channels.map((_, c) => {
      const src = out[c];
      const o = new Float32Array(b - a + 1);
      for (let i = 0; i < o.length; i++) o[i] = src[a + i] / norm[a + i];
      return o;
    });
  }

  function sampleGuard(channels) {
    return Math.min(channels[0].length, 2048);
  }

  function resample(channels, speed) {
    const n = channels[0].length;
    const outN = Math.max(1, Math.round(n / speed));
    return channels.map(ch => {
      const o = new Float32Array(outN);
      for (let i = 0; i < outN; i++) {
        const x = i * speed;
        const i0 = Math.floor(x);
        const t = x - i0;
        const s0 = ch[Math.max(0, i0 - 1)] || 0;
        const s1 = ch[Math.min(n - 1, i0)] || 0;
        const s2 = ch[Math.min(n - 1, i0 + 1)] || 0;
        const s3 = ch[Math.min(n - 1, i0 + 2)] || 0;
        const t2 = t * t, t3 = t2 * t;
        o[i] = 0.5 * (2 * s1 + (-s0 + s2) * t + (2 * s0 - 5 * s1 + 4 * s2 - s3) * t2 + (-s0 + 3 * s1 - 3 * s2 + s3) * t3);
      }
      return o;
    });
  }

  function rotateQuiet(channels, sampleRate) {
    const n = channels[0].length;
    const win = Math.max(8, Math.round(0.04 * sampleRate));
    const step = Math.max(1, Math.round(0.008 * sampleRate));
    let best = 0, bestE = Infinity;
    for (let p = 0; p < n; p += step) {
      let e = 0;
      for (let i = 0; i < win; i += 4) e += channels[0][(p + i) % n] ** 2;
      if (e < bestE) { bestE = e; best = p; }
    }
    if (!best) return channels;
    return channels.map(ch => {
      const o = new Float32Array(n);
      o.set(ch.subarray(best));
      o.set(ch.subarray(0, best), n - best);
      return o;
    });
  }

  function crossfade(channels, sampleRate) {
    const n = channels[0].length;
    const fade = Math.round(0.14 * sampleRate);
    if (n <= fade * 3) return channels;
    const outN = n - fade;
    return channels.map(ch => {
      const o = new Float32Array(outN);
      o.set(ch.subarray(0, outN));
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        const w = Math.sin(0.5 * Math.PI * t);
        o[i] = ch[n - fade + i] * Math.cos(0.5 * Math.PI * t) + ch[i] * w;
      }
      return o;
    });
  }

  function prepare(channels, sampleRate, opts = {}) {
    if (opts.mode === 'whole') {
      return { channels: channels.length === 1 ? [channels[0], channels[0].slice()] : channels,
        sampleRate, meta: { seconds: channels[0].length / sampleRate, repeats: 1,
          speed: 1, kind: 'whole', score: 0, trimmed: !!opts.trimmed } };
    }
    const found = find(channels, sampleRate);
    const mode = opts.mode === 'one' ? 'one' : 'stack';
    const speed = Number(opts.speed) || 1;
    let mixed = mixTakes(channels, found, found.kind === 'even' ? 'one' : mode);
    if (!mixed) return null;
    let audio = mixed.channels;
    if (audio.length === 1) audio = [audio[0], new Float32Array(audio[0])];
    audio = slow(audio, speed);
    audio = rotateQuiet(audio, sampleRate);
    audio = crossfade(audio, sampleRate);
    for (const ch of audio) {
      let m = 0;
      for (let i = 0; i < ch.length; i++) m += ch[i];
      m /= ch.length;
      for (let i = 0; i < ch.length; i++) ch[i] -= m;
    }
    audio = audio.map(ch => lowpass(ch, sampleRate, Math.min(11000, sampleRate * 0.42)));
    let peak = 0, e = 0, n = 0;
    for (const ch of audio) {
      n += ch.length;
      for (let i = 0; i < ch.length; i++) {
        const x = ch[i];
        e += x * x;
        const a = Math.abs(x);
        if (a > peak) peak = a;
      }
    }
    const rms = Math.sqrt(e / Math.max(1, n));
    if (!peak || rms < 1e-7) return null;
    const g = Math.min(0.85 / peak, 0.09 / rms);
    for (const ch of audio) for (let i = 0; i < ch.length; i++) ch[i] *= g;

    const used = mixed.used;
    const kind = found.kind === 'even' ? 'even' : used > 1 ? 'stack' : 'one';
    return {
      channels: audio,
      sampleRate,
      meta: {
        seconds: audio[0].length / sampleRate,
        repeats: used,
        speed,
        kind,
        score: found.score,
        trimmed: !!opts.trimmed,
      },
    };
  }

  return { prepare, find, slow, resample };
})();

if (typeof globalThis !== 'undefined') globalThis.Study = Study;
