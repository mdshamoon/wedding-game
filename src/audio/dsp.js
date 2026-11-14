// Offline sample rendering: plain JS math written into AudioBuffers once, then reused.
// Everything here is synchronous and deterministic (seeded RNG).

export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// RBJ biquad as a per-sample closure. type: 'lp' | 'hp' | 'bp'
export function biquad(type, f, Q, sr) {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr
  const cs = Math.cos(w)
  const al = Math.sin(w) / (2 * Q)
  let b0, b1, b2
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0 }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0 }
  else { b0 = al; b1 = 0; b2 = -al }
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al
  b0 /= a0; b1 /= a0; b2 /= a0
  const c1 = a1 / a0, c2 = a2 / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - c1 * y1 - c2 * y2
    x2 = x1; x1 = x; y2 = y1; y1 = y
    return y
  }
}

// Create an AudioBuffer from a fill callback; normalises to `peak` and fades the tail.
export function mkBuf(ac, sec, fill, { peak = 0.9, channels = 1, rate = 0, norm = true, loop = false } = {}) {
  const sr = rate || ac.sampleRate
  const n = Math.max(2, Math.floor(sec * sr))
  const data = []
  for (let c = 0; c < channels; c++) data.push(new Float32Array(n))
  fill(data, sr, n)
  let mx = 0
  for (const d of data) for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > mx) mx = v }
  const k = norm && mx > 0 ? peak / mx : 1
  const fadeN = Math.min(n - 1, Math.floor(sr * 0.01))
  const buf = ac.createBuffer(channels, n, sr)
  data.forEach((d, c) => {
    for (let i = 0; i < n; i++) d[i] *= k
    if (norm && !loop) for (let i = 0; i < fadeN; i++) d[n - 1 - i] *= i / fadeN
    buf.getChannelData(c).set(d)
  })
  return buf
}

const TAU = Math.PI * 2

// ---------------------------------------------------------------- percussion
export function renderDrums(ac) {
  const S = {}
  const sat = (x, k) => Math.tanh(x * k) / Math.tanh(k)

  // Dhol bass side ("dagga"): deep thump, fast pitch drop, a woody thud.
  S.dagga = mkBuf(ac, 0.75, ([d], sr, n) => {
    const R = rng(11), lp = biquad('lp', 1600, 0.7, sr), bp = biquad('bp', 240, 1.3, sr)
    let ph = 0, ph2 = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const f = 54 + 82 * Math.exp(-t / 0.04)
      ph += (TAU * f) / sr; ph2 += (TAU * f * 1.58) / sr
      const x = R() * 2 - 1
      const v = Math.sin(ph) * Math.exp(-t / 0.24) + Math.sin(ph2) * 0.28 * Math.exp(-t / 0.07) +
        lp(x) * 0.7 * Math.exp(-t / 0.005) + bp(x) * 1.3 * Math.exp(-t / 0.035)
      d[i] = sat(v, 1.6)
    }
  }, { peak: 0.95 })

  // Dhol treble side ("tilli"): thin-stick slap, bright crack + short ring.
  S.tilli = mkBuf(ac, 0.28, ([d], sr, n) => {
    const R = rng(12), bp = biquad('bp', 3200, 0.9, sr), hp = biquad('hp', 6000, 0.7, sr)
    let ph = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const f = 640 + 260 * Math.exp(-t / 0.006)
      ph += (TAU * f) / sr
      const x = R() * 2 - 1
      d[i] = Math.sin(ph) * 0.5 * Math.exp(-t / 0.045) + Math.sin(ph * 1.93) * 0.25 * Math.exp(-t / 0.025) +
        bp(x) * 1.4 * Math.exp(-t / 0.018) + hp(x) * 0.7 * Math.exp(-t / 0.0025)
    }
  }, { peak: 0.85 })

  // Tabla / dholak bass "ge": round, pitch glides slightly up (palm pressure).
  S.ge = mkBuf(ac, 0.7, ([d], sr, n) => {
    const R = rng(13), lp = biquad('lp', 900, 0.7, sr)
    let ph = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const f = 86 + 30 * (1 - Math.exp(-t / 0.09))
      ph += (TAU * f) / sr
      d[i] = Math.sin(ph) * Math.exp(-t / 0.28) + Math.sin(ph * 2.3) * 0.12 * Math.exp(-t / 0.06) +
        lp(R() * 2 - 1) * 0.5 * Math.exp(-t / 0.006)
    }
  }, { peak: 0.9 })

  // Treble "na": ringing, harmonic partials (tabla dayan character).
  const ring = (f0, decays, amps, noiseAmt, seed) => ([d], sr, n) => {
    const R = rng(seed), bp = biquad('bp', 2600, 1.2, sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      let v = 0
      for (let k = 0; k < amps.length; k++) v += Math.sin(TAU * f0 * [1, 2.01, 2.98, 4.05][k] * t) * amps[k] * Math.exp(-t / decays[k])
      d[i] = v + bp(R() * 2 - 1) * noiseAmt * Math.exp(-t / 0.003)
    }
  }
  S.na = mkBuf(ac, 0.45, ring(470, [0.2, 0.13, 0.08, 0.05], [1, 0.5, 0.28, 0.12], 0.9, 14), { peak: 0.8 })
  S.tin = mkBuf(ac, 0.65, ring(470, [0.38, 0.22, 0.12, 0.06], [1, 0.35, 0.15, 0.05], 0.4, 15), { peak: 0.75 })

  S.ta = mkBuf(ac, 0.2, ([d], sr, n) => {
    const R = rng(16), bp = biquad('bp', 1900, 1, sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      d[i] = Math.sin(TAU * 560 * t) * 0.45 * Math.exp(-t / 0.03) + bp(R() * 2 - 1) * 1.2 * Math.exp(-t / 0.02)
    }
  }, { peak: 0.75 })

  S.ka = mkBuf(ac, 0.12, ([d], sr, n) => {
    const R = rng(17), lp = biquad('lp', 700, 0.7, sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      d[i] = Math.sin(TAU * 160 * t) * 0.6 * Math.exp(-t / 0.02) + lp(R() * 2 - 1) * 1.5 * Math.exp(-t / 0.012)
    }
  }, { peak: 0.7 })

  // Hand clap: several tight bursts then a short tail.
  S.clap = mkBuf(ac, 0.32, ([d], sr, n) => {
    const R = rng(18), bp = biquad('bp', 1250, 0.9, sr), hp = biquad('hp', 450, 0.7, sr)
    const bursts = [0, 0.008, 0.017, 0.027]
    for (let i = 0; i < n; i++) {
      const t = i / sr
      let e = 0
      for (const b of bursts) if (t >= b) e += Math.exp(-(t - b) / 0.004)
      if (t >= 0.027) e += 0.5 * Math.exp(-(t - 0.027) / 0.07)
      d[i] = hp(bp(R() * 2 - 1)) * e
    }
  }, { peak: 0.85 })

  // Manjira: small cymbals, inharmonic partials with slow beating.
  const cym = (decay, noiseDecay, seed) => ([d], sr, n) => {
    const R = rng(seed), hp = biquad('hp', 5000, 0.7, sr)
    const parts = [[2350, 1], [3540, 0.7], [4810, 0.55], [6230, 0.4], [7900, 0.25]]
    for (let i = 0; i < n; i++) {
      const t = i / sr
      let v = 0
      for (let k = 0; k < parts.length; k++) {
        const [f, a] = parts[k]
        v += (Math.sin(TAU * f * t) + Math.sin(TAU * (f + 3 + k) * t)) * a * Math.exp(-t / (decay * (1 - k * 0.12)))
      }
      d[i] = v * 0.5 + hp(R() * 2 - 1) * 0.5 * Math.exp(-t / noiseDecay)
    }
  }
  S.manjira = mkBuf(ac, 1.5, cym(0.55, 0.01, 19), { peak: 0.7 })
  S.manjiraC = mkBuf(ac, 0.15, cym(0.04, 0.015, 20), { peak: 0.6 })

  // Ghungroo: a cluster of tiny bells. Three variants for natural variety.
  S.ghungroo = [1, 2, 3].map((v) => mkBuf(ac, 0.35, ([d], sr, n) => {
    const R = rng(30 + v), hp = biquad('hp', 4000, 0.7, sr)
    const bells = []
    for (let k = 0; k < 14; k++) bells.push([R() * 0.06, 4500 + R() * 4200, 0.3 + R() * 0.7])
    for (let i = 0; i < n; i++) {
      const t = i / sr
      let v2 = 0
      for (const [tk, f, a] of bells) if (t >= tk) { const u = t - tk; v2 += Math.sin(TAU * f * u) * a * Math.exp(-u / 0.035) }
      d[i] = v2 + hp(R() * 2 - 1) * 0.3 * Math.exp(-t / 0.02)
    }
  }, { peak: 0.6 }))

  S.shaker = mkBuf(ac, 0.12, ([d], sr, n) => {
    const R = rng(21), hp = biquad('hp', 6000, 0.7, sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const e = t < 0.006 ? t / 0.006 : Math.exp(-(t - 0.006) / 0.03)
      d[i] = hp(R() * 2 - 1) * e
    }
  }, { peak: 0.5 })

  // Clean modern sub kick (used sparingly, under the dhol).
  S.kick = mkBuf(ac, 0.5, ([d], sr, n) => {
    const R = rng(22)
    let ph = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      ph += (TAU * (46 + 95 * Math.exp(-t / 0.03))) / sr
      d[i] = Math.sin(ph) * Math.exp(-t / 0.26) + (R() * 2 - 1) * 0.15 * Math.exp(-t / 0.002)
    }
  }, { peak: 0.9 })

  // Firework crackle: sparse sharp pops.
  S.crackle = mkBuf(ac, 1.6, ([d], sr, n) => {
    const R = rng(23)
    for (let k = 0; k < 110; k++) {
      const t0 = Math.pow(R(), 1.4) * 1.45
      const a = (0.3 + R() * 0.7) * (1 - t0 / 1.6)
      const s0 = Math.floor(t0 * sr), len = Math.floor(sr * 0.012)
      const hp = biquad('hp', 2000 + R() * 3000, 0.7, sr)
      for (let i = 0; i < len && s0 + i < n; i++) d[s0 + i] += hp(R() * 2 - 1) * a * Math.exp(-i / (sr * 0.0018))
    }
  }, { peak: 0.8 })

  // Chhuare (dried dates) shower: small soft knocks scattered over ~1.4 s.
  S.patter = mkBuf(ac, 1.6, ([d], sr, n) => {
    const R = rng(24)
    const hits = 46
    for (let k = 0; k < hits; k++) {
      const t0 = 0.02 + Math.pow(R(), 0.8) * 1.35
      const a = (0.35 + R() * 0.65) * (t0 < 0.2 ? t0 / 0.2 : 1) * (1 - t0 / 1.7)
      const f = 700 + R() * 1300
      const s0 = Math.floor(t0 * sr), len = Math.floor(sr * 0.06)
      const bp = biquad('bp', f * 2.2, 1.5, sr)
      for (let i = 0; i < len && s0 + i < n; i++) {
        const t = i / sr
        d[s0 + i] += (Math.sin(TAU * f * t) * 0.6 * Math.exp(-t / 0.012) + bp(R() * 2 - 1) * 0.8 * Math.exp(-t / 0.004)) * a
        // tiny bounce
        if (t > 0.03) d[s0 + i] += Math.sin(TAU * f * 1.1 * t) * 0.2 * a * Math.exp(-(t - 0.03) / 0.008)
      }
    }
  }, { peak: 0.75 })

  return S
}

export function renderNoise(ac, sec = 2) {
  return mkBuf(ac, sec, ([d], sr, n) => {
    const R = rng(99)
    for (let i = 0; i < n; i++) d[i] = R() * 2 - 1
  }, { peak: 1, norm: false, loop: true })
}

// Gentle stereo room/hall impulse: short pre-delay, a few early taps, darkening exponential tail.
export function renderIR(ac, sec = 2.4) {
  return mkBuf(ac, sec, (data, sr, n) => {
    for (let c = 0; c < 2; c++) {
      const R = rng(101 + c * 17), d = data[c]
      const pre = Math.floor(0.014 * sr)
      let y = 0
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr
        const cf = 0.8 * Math.exp(-t / 0.7) + 0.05
        y += cf * (R() * 2 - 1 - y)
        const fadeIn = Math.min(1, t / 0.01)
        d[i] = y * Math.sqrt((2 - cf) / cf) * Math.exp(-t / 0.4) * fadeIn
      }
      const taps = [[0.019, 0.6], [0.027, 0.45], [0.041, 0.35], [0.053, 0.25], [0.067, 0.2]]
      for (const [tt, a] of taps) {
        const i = Math.floor((tt + c * 0.0031) * sr)
        if (i < n) d[i] += a * (c ? -1 : 1)
      }
    }
  }, { peak: 0.9, channels: 2 })
}

// Karplus-Strong plucked string with fractional delay (exact pitch).
export function renderKS(ac, f, { sec = 1.2, tau = 0.8, bright = 0.6, strings = 1, spread = 0.0015, pos = 0.13, seed = 7, body = 0 } = {}) {
  return mkBuf(ac, sec, ([out], sr, n) => {
    const R = rng(seed)
    for (let s = 0; s < strings; s++) {
      const fs = f * (1 + (s - (strings - 1) / 2) * spread)
      const D = sr / fs - 0.5
      const Di = Math.floor(D), fr = D - Di
      const g = Math.exp(-1 / (fs * tau))
      const P = Math.ceil(sr / fs)
      const exc = new Float32Array(P)
      let lp = 0
      for (let i = 0; i < P; i++) { lp += bright * (R() * 2 - 1 - lp); exc[i] = lp }
      const off = Math.max(1, Math.round(pos * P))
      const y = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        let v = i < P ? exc[i] - (i >= off ? exc[i - off] : 0) : 0
        const a = i - Di
        if (a >= 0) v += g * 0.5 * ((1 - fr) * y[a] + (a >= 1 ? y[a - 1] : 0) + (a >= 2 ? fr * y[a - 2] : 0))
        y[i] = v
      }
      for (let i = 0; i < n; i++) out[i] += y[i] / strings
    }
    if (body > 0) {
      // skin/body resonance (rubab): a low resonant bandpass blended in
      const bp = biquad('bp', 220, 2.5, sr)
      for (let i = 0; i < n; i++) out[i] += bp(out[i]) * body
    }
    const atk = Math.floor(sr * 0.002)
    for (let i = 0; i < atk; i++) out[i] *= i / atk
  }, { peak: 0.85 })
}

// Seamless looping cricket bed (events written modulo the buffer length).
export function renderCrickets(ac) {
  return mkBuf(ac, 4, (data, sr, n) => {
    const crickets = [
      { f: 4300, pulses: 3, pd: 0.016, gap: 0.012, period: 0.5, pan: -0.6, amp: 0.5, off: 0.05 },
      { f: 4750, pulses: 4, pd: 0.014, gap: 0.011, period: 0.8, pan: 0.55, amp: 0.38, off: 0.23 },
      { f: 5150, pulses: 2, pd: 0.02, gap: 0.015, period: 4 / 7, pan: 0.05, amp: 0.22, off: 0.4 },
    ]
    for (const c of crickets) {
      const gl = Math.sqrt(0.5 * (1 - c.pan)), gr = Math.sqrt(0.5 * (1 + c.pan))
      for (let ct = c.off; ct < 4; ct += c.period) {
        for (let p = 0; p < c.pulses; p++) {
          const s0 = Math.floor((ct + p * (c.pd + c.gap)) * sr), len = Math.floor(c.pd * sr)
          for (let i = 0; i < len; i++) {
            const w = 0.5 - 0.5 * Math.cos((TAU * i) / len)
            const v = Math.sin((TAU * c.f * i) / sr) * w * c.amp
            const j = (s0 + i) % n
            data[0][j] += v * gl; data[1][j] += v * gr
          }
        }
      }
    }
  }, { peak: 0.6, channels: 2, rate: 22050, loop: true })
}

// Seamless crowd murmur: many formant-filtered "syllables" at random, written modulo the length.
export function renderBabble(ac, { sec = 6, voices = 14, seed = 5 } = {}) {
  return mkBuf(ac, sec, (data, sr, n) => {
    const R = rng(seed)
    const VOW = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [440, 1020], [660, 1700], [400, 2000]]
    for (let v = 0; v < voices; v++) {
      const pan = R() * 1.6 - 0.8, gl = Math.sqrt(0.5 * (1 - pan)), gr = Math.sqrt(0.5 * (1 + pan))
      const f0 = R() < 0.5 ? 100 + R() * 45 : 175 + R() * 70
      const amp = 0.4 + R() * 0.6
      let t = R() * 1.2
      while (t < sec) {
        const syl = 2 + Math.floor(R() * 7)
        for (let k = 0; k < syl; k++) {
          const dur = 0.07 + R() * 0.17
          const [F1, F2] = VOW[Math.floor(R() * VOW.length)]
          const b1 = biquad('bp', F1 * (0.9 + R() * 0.2), 4, sr)
          const b2 = biquad('bp', F2 * (0.9 + R() * 0.2), 6, sr)
          const lpf = biquad('lp', 2000, 0.7, sr)
          const len = Math.floor((dur + 0.05) * sr), start = Math.floor(t * sr)
          const pitch = f0 * (0.9 + R() * 0.25), glide = (R() - 0.5) * 0.3
          let ph = 0
          for (let i = 0; i < len; i++) {
            const tt = i / sr
            const env = tt < 0.015 ? tt / 0.015 : tt < dur ? 1 : Math.max(0, 1 - (tt - dur) / 0.05)
            ph += (pitch * (1 + (glide * tt) / dur)) / sr
            if (ph >= 1) ph -= 1
            const src = (2 * ph - 1) * 0.6 + (R() * 2 - 1) * 0.12
            const s = lpf(b1(src) + b2(src) * 0.6) * env * amp
            const j = (start + i) % n
            data[0][j] += s * gl; data[1][j] += s * gr
          }
          t += dur + R() * 0.05
        }
        t += 0.2 + R() * 0.9
      }
    }
  }, { peak: 0.55, channels: 2, rate: 22050, loop: true })
}
