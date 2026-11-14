// Real-time instrument voices. Each voice schedules one note at AudioContext time `t`
// into `dest`, with ramped envelopes only (no clicks), and stops its sources itself.
import { renderKS } from './dsp.js'

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

export function makeWaves(ac) {
  const mk = (amps) => {
    const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1)
    amps.forEach((a, i) => { im[i + 1] = a })
    return ac.createPeriodicWave(re, im)
  }
  return {
    reed: mk([0.55, 0.85, 1, 0.8, 0.62, 0.45, 0.36, 0.26, 0.18, 0.12, 0.08, 0.05, 0.03]),
    harm: mk([1, 0.72, 0.6, 0.48, 0.38, 0.3, 0.22, 0.16, 0.11, 0.08, 0.05, 0.03]),
    piano: mk([1, 0.45, 0.28, 0.16, 0.1, 0.07, 0.04, 0.025]),
    tanpura: mk(Array.from({ length: 24 }, (_, i) => 1 / Math.pow(i + 1, 0.85))),
  }
}

// Mixer buses per instrument: serial filter chain, gain, pan, reverb/delay send.
// chain entries: [type, freq, Q, gainDb]
export const BUSES = {
  shehnai: { gain: 0.36, pan: 0.06, rev: 0.3, del: 0.12, chain: [['highpass', 280, 0.7], ['peaking', 1250, 1.3, 5], ['peaking', 2900, 2, 2.5], ['lowpass', 4800, 0.7]] },
  flute: { gain: 0.5, pan: -0.12, rev: 0.36, del: 0.16, chain: [['lowpass', 7000, 0.7]] },
  brass: { gain: 0.52, pan: 0, rev: 0.18, chain: [['peaking', 1400, 1, 3], ['lowpass', 6500, 0.7]] },
  harmonium: { gain: 0.3, pan: -0.06, rev: 0.24, chain: [['highpass', 90, 0.7], ['lowpass', 2700, 0.7], ['peaking', 900, 1, 2]] },
  harmlead: { gain: 0.45, pan: 0.04, rev: 0.26, del: 0.1, chain: [['highpass', 160, 0.7], ['lowpass', 3600, 0.7], ['peaking', 1100, 1.2, 3]] },
  strings: { gain: 0.3, pan: 0, rev: 0.42, chain: [['highpass', 120, 0.7], ['lowpass', 2400, 0.6]] },
  choir: { gain: 0.34, pan: 0, rev: 0.45, chain: [['highpass', 150, 0.7], ['lowpass', 3200, 0.6], ['peaking', 720, 2, 8], ['peaking', 1150, 3, 6], ['peaking', 2600, 4, 4]] },
  piano: { gain: 0.4, pan: 0.04, rev: 0.28 },
  tanpura: { gain: 0.2, pan: 0.15, rev: 0.32, chain: [['highpass', 60, 0.7]] },
  bass: { gain: 0.28, rev: 0, chain: [['lowpass', 900, 0.7]] },
  tuba: { gain: 0.38, rev: 0.06, chain: [['lowpass', 1500, 0.7]] },
  tumbi: { gain: 1.0, pan: 0.16, rev: 0.14, del: 0.2, chain: [['highpass', 200, 0.7], ['peaking', 2500, 1, 2]] },
  santoor: { gain: 0.68, pan: 0.2, rev: 0.3, del: 0.08 },
  rubab: { gain: 0.72, pan: -0.18, rev: 0.26, del: 0.06, chain: [['highpass', 80, 0.7], ['lowpass', 5000, 0.7]] },
  perc: { gain: 0.42, rev: 0.08 },
  clap: { gain: 0.6, pan: -0.15, rev: 0.2 },
  shimmer: { gain: 0.5, pan: 0.25, rev: 0.2, chain: [['highpass', 1500, 0.7]] },
}

export const DRUMS = new Set(['dagga', 'tilli', 'ge', 'na', 'ta', 'tin', 'ka', 'kick', 'clap', 'manjira', 'manjiraC', 'ghungroo', 'shaker'])
export const instBus = (i) => {
  if (!DRUMS.has(i)) return i
  if (i === 'clap') return 'clap'
  if (i === 'manjira' || i === 'manjiraC' || i === 'ghungroo' || i === 'shaker') return 'shimmer'
  return 'perc'
}

const KS_OPTS = {
  tumbi: { sec: 0.8, tau: 0.3, bright: 0.9, pos: 0.08 },
  santoor: { sec: 1.6, tau: 0.95, bright: 0.6, strings: 2, spread: 0.0013, pos: 0.11 },
  rubab: { sec: 1.5, tau: 0.65, bright: 0.42, pos: 0.2, body: 0.7 },
}

export function makeVoices(ac, W, S) {
  const ksCache = new Map()
  const osc = (type, f) => {
    const o = ac.createOscillator()
    if (typeof type === 'string') o.type = type
    else o.setPeriodicWave(type)
    o.frequency.value = f
    return o
  }
  const gain = (v = 0) => { const g = ac.createGain(); g.gain.value = v; return g }
  const filt = (type, f, Q = 0.707) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b }
  const startStop = (nodes, t0, t1) => nodes.forEach((n) => { n.start(t0); n.stop(t1) })
  const maxF = ac.sampleRate * 0.45
  const cap = (f) => Math.min(f, maxF)

  // pitch: slide from a previous note, or a small expressive scoop from below
  function pitch(oscs, t, f, dur, from, scoop) {
    for (const o of oscs) {
      if (from != null) {
        const glide = Math.min(0.14, dur * 0.45)
        o.frequency.setValueAtTime(mtof(from), t)
        o.frequency.exponentialRampToValueAtTime(f, t + glide)
      } else if (scoop) {
        o.frequency.setValueAtTime(f * scoop, t)
        o.frequency.exponentialRampToValueAtTime(f, t + 0.05)
      } else o.frequency.setValueAtTime(f, t)
    }
  }
  function vibrato(oscs, t, dur, rate, cents, delay) {
    const lfo = osc('sine', rate)
    const lg = gain(0)
    const d = Math.min(delay, dur * 0.4)
    lg.gain.setValueAtTime(0, t)
    lg.gain.setValueAtTime(0, t + d)
    lg.gain.linearRampToValueAtTime(dur > 0.35 ? cents : cents * 0.35, t + d + Math.max(0.15, Math.min(0.4, dur * 0.5)))
    lfo.connect(lg)
    for (const o of oscs) lg.connect(o.detune)
    return lfo
  }
  // sustained envelope: attack -> hold -> exponential release
  function env(p, t, a, peak, dur, rel) {
    p.setValueAtTime(0, t)
    p.linearRampToValueAtTime(peak, t + a)
    const r = Math.max(t + a + 0.005, t + dur)
    p.setValueAtTime(peak, r)
    p.setTargetAtTime(0, r, rel / 3)
    return r + rel * 2.6
  }

  const V = {
    shehnai(t, m, dur, v, dest, from) {
      const f = mtof(m)
      const o1 = osc(W.reed, f), o2 = osc(W.reed, f)
      o2.detune.value = 7
      pitch([o1, o2], t, f, dur, from, 0.982)
      const lfo = vibrato([o1, o2], t, dur, 5.2 + Math.random() * 0.4, 16, 0.2)
      const g = gain(0), g2 = gain(0.32)
      o1.connect(g); o2.connect(g2).connect(g); g.connect(dest)
      const end = env(g.gain, t, 0.035, v * 0.5, dur, 0.09)
      startStop([o1, o2, lfo], t, end)
    },

    flute(t, m, dur, v, dest, from) {
      const f = mtof(m)
      const o1 = osc('sine', f), o2 = osc('triangle', f), o3 = osc('sine', f * 2)
      pitch([o1, o2, o3], t, f, dur, from, 0.99)
      const lfo = vibrato([o1, o2, o3], t, dur, 4.8, 12, 0.25)
      const g = gain(0), g2 = gain(0.22), g3 = gain(0.07)
      o1.connect(g); o2.connect(g2).connect(g); o3.connect(g3).connect(g)
      // breath noise
      const nz = ac.createBufferSource(); nz.buffer = S.noise; nz.loop = true
      const bp = filt('bandpass', cap(Math.max(1800, f * 2.5)), 0.8)
      const ng = gain(0)
      ng.gain.setValueAtTime(0, t)
      ng.gain.linearRampToValueAtTime(v * 0.1, t + 0.03)
      ng.gain.setTargetAtTime(v * 0.03, t + 0.03, 0.08)
      ng.gain.setTargetAtTime(0, t + Math.max(dur, 0.06), 0.03)
      nz.connect(bp).connect(ng).connect(dest)
      g.connect(dest)
      const end = env(g.gain, t, 0.06, v * 0.42, dur, 0.1)
      startStop([o1, o2, o3, lfo], t, end)
      nz.start(t, Math.random() * 1.5); nz.stop(end)
    },

    brass(t, m, dur, v, dest) {
      const f = mtof(m)
      dur = Math.max(dur, 0.07)
      const o1 = osc('sawtooth', f), o2 = osc('sawtooth', f)
      o1.detune.value = -6; o2.detune.value = 6
      pitch([o1, o2], t, f, dur, null, 0.985)
      const lp = filt('lowpass', cap(f * 1.2), 1.4)
      lp.frequency.setValueAtTime(cap(f * 1.2), t)
      lp.frequency.exponentialRampToValueAtTime(cap(Math.min(f * 7, 9000)), t + 0.035)
      lp.frequency.setTargetAtTime(cap(Math.min(f * 4, 7000)), t + 0.035, 0.12)
      lp.frequency.setTargetAtTime(cap(f * 1.3), t + dur, 0.05)
      const g = gain(0)
      o1.connect(lp); o2.connect(lp); lp.connect(g).connect(dest)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(v * 0.34, t + 0.018)
      g.gain.setTargetAtTime(v * 0.26, t + 0.02, 0.1)
      g.gain.setTargetAtTime(0, t + dur, 0.035)
      startStop([o1, o2], t, t + dur + 0.25)
    },

    harmonium(t, m, dur, v, dest) {
      const f = mtof(m)
      const o1 = osc(W.harm, f), o2 = osc(W.harm, f)
      o2.detune.value = 4
      const g = gain(0)
      o1.connect(g); o2.connect(g); g.connect(dest)
      const end = env(g.gain, t, 0.07, v * 0.3, dur, 0.14)
      startStop([o1, o2], t, end)
    },

    // harmonium as a melodic (qawwali-style) lead: quicker bellows, tiny scoop, gentle tremolo
    harmlead(t, m, dur, v, dest, from) {
      const f = mtof(m)
      const o1 = osc(W.harm, f), o2 = osc(W.harm, f * 2)
      o1.detune.value = -2; o2.detune.value = 3
      pitch([o1], t, f, dur, from, null)
      if (from == null) { o2.frequency.setValueAtTime(f * 2, t) }
      else { o2.frequency.setValueAtTime(mtof(from) * 2, t); o2.frequency.exponentialRampToValueAtTime(f * 2, t + Math.min(0.14, dur * 0.45)) }
      const g = gain(0), g2 = gain(0.3)
      o1.connect(g); o2.connect(g2).connect(g); g.connect(dest)
      const end = env(g.gain, t, 0.03, v * 0.36, dur, 0.08)
      startStop([o1, o2], t, end)
    },

    strings(t, m, dur, v, dest) {
      const f = mtof(m)
      const o1 = osc('sawtooth', f), o2 = osc('sawtooth', f)
      o1.detune.value = -9; o2.detune.value = 8
      const g = gain(0)
      o1.connect(g); o2.connect(g); g.connect(dest)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(v * 0.2, t + 0.4)
      const r = t + Math.max(dur, 0.45)
      g.gain.setValueAtTime(v * 0.2, r)
      g.gain.setTargetAtTime(0, r, 0.28)
      startStop([o1, o2], t, r + 1.6)
    },

    // wordless chorus-like "aah" pad (formants live on the bus chain)
    choir(t, m, dur, v, dest) {
      const f = mtof(m)
      const o1 = osc('sawtooth', f), o2 = osc('sawtooth', f)
      o1.detune.value = -11; o2.detune.value = 10
      const lfo = vibrato([o1, o2], t, Math.max(dur, 1), 4.6 + Math.random() * 0.6, 9, 0.5)
      const g = gain(0)
      o1.connect(g); o2.connect(g); g.connect(dest)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(v * 0.22, t + 0.6)
      const r = t + Math.max(dur, 0.7)
      g.gain.setValueAtTime(v * 0.22, r)
      g.gain.setTargetAtTime(0, r, 0.35)
      startStop([o1, o2, lfo], t, r + 2)
    },

    piano(t, m, dur, v, dest) {
      const f = mtof(m)
      const o1 = osc(W.piano, f), o2 = osc(W.piano, f)
      o2.detune.value = 3
      const lp = filt('lowpass', cap(Math.min(f * 12, 14000)), 0.5)
      lp.frequency.setTargetAtTime(Math.max(f * 2, 500), t + 0.01, 0.6)
      const g = gain(0)
      o1.connect(lp); o2.connect(lp); lp.connect(g).connect(dest)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(v * 0.5, t + 0.004)
      g.gain.setTargetAtTime(v * 0.22, t + 0.005, 0.15)
      g.gain.setTargetAtTime(0, t + 0.4, 1.5)
      const r = t + Math.max(dur, 0.45)
      g.gain.setTargetAtTime(0, r, 0.18)
      startStop([o1, o2], t, r + 1.2)
    },

    tanpura(t, m, dur, v, dest) {
      const f = mtof(m)
      const o1 = osc(W.tanpura, f), o2 = osc(W.tanpura, f)
      o2.detune.value = 3 // slow beating between the paired strings
      const lp = filt('lowpass', cap(f * 2), 3)
      lp.frequency.setValueAtTime(cap(f * 2), t)
      lp.frequency.linearRampToValueAtTime(cap(f * 9), t + 0.7)
      lp.frequency.linearRampToValueAtTime(cap(f * 4), t + dur)
      const g = gain(0)
      o1.connect(lp); o2.connect(lp); lp.connect(g).connect(dest)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(v * 0.42, t + 0.012)
      g.gain.setTargetAtTime(0, t + 0.012, dur / 3.4)
      g.gain.setTargetAtTime(0, t + dur, 0.06)
      startStop([o1, o2], t, t + dur + 0.4)
    },

    // clean modern bass: sine body with a little filtered saw for definition
    bass(t, m, dur, v, dest) {
      const f = mtof(m)
      const o1 = osc('sine', f), o2 = osc('sawtooth', f)
      const lp = filt('lowpass', cap(f * 8), 1.5)
      lp.frequency.setTargetAtTime(f * 2.2, t, 0.07)
      const g = gain(0), g2 = gain(0.25)
      o1.connect(g); o2.connect(g2).connect(lp).connect(g); g.connect(dest)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(v * 0.6, t + 0.006)
      g.gain.setTargetAtTime(v * 0.42, t + 0.006, 0.14)
      const r = t + Math.max(dur, 0.05)
      g.gain.setTargetAtTime(0, r, 0.025)
      startStop([o1, o2], t, r + 0.2)
    },

    tuba(t, m, dur, v, dest) {
      const f = mtof(m)
      dur = Math.max(dur, 0.08)
      const o1 = osc('sawtooth', f), o2 = osc('sine', f)
      const lp = filt('lowpass', f * 2, 1)
      lp.frequency.setValueAtTime(f * 2, t)
      lp.frequency.linearRampToValueAtTime(f * 5, t + 0.04)
      lp.frequency.setTargetAtTime(f * 3, t + 0.04, 0.1)
      const g = gain(0), g1 = gain(0.5)
      o1.connect(g1).connect(lp).connect(g); o2.connect(g); g.connect(dest)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(v * 0.55, t + 0.025)
      g.gain.setTargetAtTime(v * 0.44, t + 0.03, 0.1)
      g.gain.setTargetAtTime(0, t + dur, 0.04)
      startStop([o1, o2], t, t + dur + 0.3)
    },

    pluckBuf(kind, m) {
      const key = kind + m
      let b = ksCache.get(key)
      if (!b) { b = renderKS(ac, mtof(m), { ...KS_OPTS[kind], seed: m * 7 + kind.length }); ksCache.set(key, b) }
      return b
    },
    pluck(kind, t, m, v, dest) {
      const s = ac.createBufferSource()
      s.buffer = V.pluckBuf(kind, m)
      const g = gain(v)
      s.connect(g).connect(dest)
      s.start(t)
    },
    tumbi(t, m, dur, v, dest) { V.pluck('tumbi', t, m, v, dest) },
    santoor(t, m, dur, v, dest) { V.pluck('santoor', t, m, v, dest) },
    rubab(t, m, dur, v, dest) { V.pluck('rubab', t, m, v, dest) },

    drum(name, t, v, dest, rate = 1) {
      let buf = S[name]
      if (Array.isArray(buf)) buf = buf[(Math.random() * buf.length) | 0]
      if (!buf) return
      const s = ac.createBufferSource()
      s.buffer = buf
      s.playbackRate.value = rate * (0.988 + Math.random() * 0.024)
      const g = gain(v)
      s.connect(g).connect(dest)
      s.start(t)
    },
  }
  return V
}
