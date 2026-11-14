// One-shot sound effects. Each takes (X, t, p) -> approximate duration in seconds.
// X = { ac, S (samples), V (voices), out (per-call gain), wet (per-call reverb send) }
// p = pitch multiplier. All envelopes ramp from/to zero.
import { mtof } from './voices.js'

const osc = (X, type, f, t0, t1) => {
  const n = X.ac.createOscillator()
  n.type = type
  n.frequency.setValueAtTime(f, t0)
  n.start(t0); n.stop(t1)
  return n
}
const gain = (X, v = 0) => { const n = X.ac.createGain(); n.gain.value = v; return n }
const filt = (X, type, f, Q = 0.707) => {
  const n = X.ac.createBiquadFilter()
  n.type = type; n.frequency.value = Math.min(f, X.ac.sampleRate * 0.45); n.Q.value = Q
  return n
}
const noise = (X, t0, t1) => {
  const n = X.ac.createBufferSource()
  n.buffer = X.S.noise; n.loop = true
  n.start(t0, Math.random() * 1.5); n.stop(t1)
  return n
}
const play = (X, buffer, t0, rate = 1) => {
  const n = X.ac.createBufferSource()
  n.buffer = buffer; n.playbackRate.value = rate
  n.start(t0)
  return n
}
const pan = (X, p) => {
  if (X.ac.createStereoPanner) { const n = X.ac.createStereoPanner(); n.pan.value = p; return n }
  return gain(X, 1)
}
// attack then exponential decay; returns end time
const perc = (param, t, a, peak, tau) => {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(peak, t + a)
  param.setTargetAtTime(0, t + a, tau)
  return t + a + tau * 7
}
// attack, hold, release
const ahr = (param, t, a, peak, hold, r) => {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(peak, t + a)
  param.setValueAtTime(peak, t + a + hold)
  param.setTargetAtTime(0, t + a + hold, r / 3)
  return t + a + hold + r * 2.6
}
const rnd = (a, b) => a + Math.random() * (b - a)

// a soft mallet note (sine + 4th partial), used by UI sounds
function mallet(X, t, f, vol, decay = 0.25, dest = X.out) {
  const e = gain(X)
  const end = perc(e.gain, t, 0.003, vol, decay)
  const o1 = osc(X, 'sine', f, t, end), o2 = osc(X, 'sine', f * 3.98, t, end)
  const e2 = gain(X)
  perc(e2.gain, t, 0.002, 0.18, decay * 0.25)
  o1.connect(e); o2.connect(e2).connect(e); e.connect(dest)
  return end
}

// a formant "voice" for crowd sounds: saw -> two bandpass formants -> env -> pan
function crowdVoice(X, t, f0, dur, formants, contour, vol, p) {
  const o = osc(X, 'sawtooth', f0 * p, t, t + dur + 0.9)
  contour.forEach(([dt, mul]) => o.frequency.linearRampToValueAtTime(f0 * p * mul, t + dt))
  const lfo = osc(X, 'sine', rnd(4.5, 6.5), t, t + dur + 0.9), lg = gain(X, 14)
  lfo.connect(lg).connect(o.detune)
  const out = gain(X), pn = pan(X, rnd(-0.8, 0.8))
  formants.forEach(([F, Q, a]) => { const b = filt(X, 'bandpass', F * rnd(0.92, 1.08), Q); const ga = gain(X, a * 2.6); o.connect(b).connect(ga).connect(out) })
  out.connect(pn); pn.connect(X.out); pn.connect(X.wet)
  return { o, env: out.gain }
}

export const SFX = {
  click(X, t, p) {
    const o = osc(X, 'triangle', 1500 * p, t, t + 0.1)
    o.frequency.exponentialRampToValueAtTime(900 * p, t + 0.03)
    const e = gain(X)
    perc(e.gain, t, 0.002, 0.28, 0.012)
    o.connect(e).connect(X.out)
    return 0.1
  },

  confirm(X, t, p) {
    mallet(X, t, mtof(76) * p, 0.26, 0.2)
    mallet(X, t + 0.075, mtof(83) * p, 0.26, 0.3)
    return 0.6
  },

  success(X, t, p) {
    ;[72, 76, 79, 84].forEach((m, k) => {
      const s = play(X, X.V.pluckBuf('santoor', m), t + k * 0.075, p)
      const g = gain(X, 0.5)
      s.connect(g); g.connect(X.out); g.connect(X.wet)
    })
    mallet(X, t + 0.3, mtof(88) * p, 0.12, 0.6, X.wet)
    const m = play(X, X.S.manjira, t + 0.3, p)
    const mg = gain(X, 0.15)
    m.connect(mg).connect(X.out)
    return 1.8
  },

  fail(X, t, p) {
    const lp = filt(X, 'lowpass', 1500)
    lp.connect(X.out)
    ;[[67, 0, 0.22], [63, 0.2, 0.42]].forEach(([m, dt, len], k) => {
      const f = mtof(m) * p
      const o = osc(X, 'triangle', f, t + dt, t + dt + len + 0.3)
      if (k) o.frequency.linearRampToValueAtTime(f * 0.97, t + dt + len)
      const e = gain(X)
      ahr(e.gain, t + dt, 0.01, 0.28, len - 0.05, 0.12)
      o.connect(e).connect(lp)
    })
    return 0.9
  },

  coin(X, t, p) {
    const e = gain(X)
    e.gain.setValueAtTime(0, t)
    e.gain.linearRampToValueAtTime(0.2, t + 0.004)
    e.gain.setValueAtTime(0.2, t + 0.07)
    e.gain.setTargetAtTime(0, t + 0.075, 0.07)
    const o1 = osc(X, 'sine', mtof(83) * p, t, t + 0.6), o2 = osc(X, 'triangle', mtof(83) * p, t, t + 0.6)
    o1.frequency.setValueAtTime(mtof(88) * p, t + 0.07); o2.frequency.setValueAtTime(mtof(88) * p, t + 0.07)
    const g2 = gain(X, 0.35)
    o1.connect(e); o2.connect(g2).connect(e); e.connect(X.out); e.connect(X.wet)
    return 0.6
  },

  splash(X, t, p) {
    const n = noise(X, t, t + 0.9)
    const lp = filt(X, 'lowpass', 6000 * p, 0.8)
    lp.frequency.setValueAtTime(6000 * p, t)
    lp.frequency.exponentialRampToValueAtTime(700 * p, t + 0.5)
    const e = gain(X)
    perc(e.gain, t, 0.006, 0.45, 0.14)
    n.connect(lp).connect(e); e.connect(X.out); e.connect(X.wet)
    for (let k = 0; k < 7; k++) {
      const tk = t + rnd(0.04, 0.38), f = rnd(300, 900) * p
      const o = osc(X, 'sine', f, tk, tk + 0.08)
      o.frequency.exponentialRampToValueAtTime(f * 2.2, tk + 0.05)
      const eg = gain(X)
      perc(eg.gain, tk, 0.003, rnd(0.04, 0.09), 0.012)
      o.connect(eg).connect(X.out)
    }
    return 1
  },

  haldiSplat(X, t, p) {
    ;[[0, 0.32, 900], [0.05, 0.18, 600]].forEach(([dt, vol, f0]) => {
      const n = noise(X, t + dt, t + dt + 0.3)
      const bp = filt(X, 'bandpass', f0 * p, 2)
      bp.frequency.setValueAtTime(f0 * p, t + dt)
      bp.frequency.exponentialRampToValueAtTime(220 * p, t + dt + 0.16)
      const e = gain(X)
      perc(e.gain, t + dt, 0.008, vol, 0.04)
      n.connect(bp).connect(e).connect(X.out)
    })
    const o = osc(X, 'sine', 160 * p, t, t + 0.2)
    o.frequency.exponentialRampToValueAtTime(70 * p, t + 0.12)
    const e = gain(X)
    perc(e.gain, t, 0.004, 0.25, 0.035)
    o.connect(e).connect(X.out)
    return 0.4
  },

  shutter(X, t, p) {
    ;[[0, 2500, 0.35], [0.075, 1500, 0.3]].forEach(([dt, f, vol]) => {
      const n = noise(X, t + dt, t + dt + 0.06)
      const hp = filt(X, dt ? 'bandpass' : 'highpass', f * p, dt ? 1.2 : 0.7)
      const e = gain(X)
      perc(e.gain, t + dt, 0.001, vol, 0.006)
      n.connect(hp).connect(e).connect(X.out)
      const o = osc(X, 'sine', (dt ? 420 : 3000) * p, t + dt, t + dt + 0.04)
      const eo = gain(X)
      perc(eo.gain, t + dt, 0.001, 0.12, 0.005)
      o.connect(eo).connect(X.out)
    })
    const w = noise(X, t + 0.01, t + 0.08), bp = filt(X, 'bandpass', 4200 * p, 3), we = gain(X)
    ahr(we.gain, t + 0.01, 0.01, 0.04, 0.03, 0.02)
    w.connect(bp).connect(we).connect(X.out)
    return 0.25
  },

  flash(X, t, p) {
    const o = osc(X, 'sine', 1800 * p, t, t + 0.5)
    o.frequency.exponentialRampToValueAtTime(7000 * p, t + 0.32)
    const e = gain(X)
    ahr(e.gain, t, 0.05, 0.04, 0.22, 0.05)
    o.connect(e).connect(X.out)
    const n = noise(X, t + 0.33, t + 0.5), hp = filt(X, 'highpass', 4000), ne = gain(X)
    perc(ne.gain, t + 0.33, 0.002, 0.3, 0.018)
    n.connect(hp).connect(ne); ne.connect(X.out); ne.connect(X.wet)
    mallet(X, t + 0.33, 2093 * p, 0.06, 0.25, X.wet)
    return 0.8
  },

  phoneRing(X, t, p) {
    const notes = [76, 79, 84, 79, 76, 79, 84, 88, 86, 84, 79, 81, 79]
    notes.forEach((m, k) => {
      const tk = t + k * 0.125, f = mtof(m) * p
      const e = gain(X)
      const end = ahr(e.gain, tk, 0.004, 0.17, 0.07, 0.05)
      const o1 = osc(X, 'sine', f, tk, end), o2 = osc(X, 'triangle', f * 2, tk, end)
      const g2 = gain(X, 0.18)
      o1.connect(e); o2.connect(g2).connect(e); e.connect(X.out)
    })
    return 2.0
  },

  phoneBeep(X, t, p) {
    const e = gain(X)
    const end = ahr(e.gain, t, 0.005, 0.16, 0.07, 0.02)
    const o = osc(X, 'sine', 1200 * p, t, end), o2 = osc(X, 'triangle', 1200 * p, t, end), g2 = gain(X, 0.3)
    o.connect(e); o2.connect(g2).connect(e); e.connect(X.out)
    return 0.15
  },

  whoosh(X, t, p) {
    const n = noise(X, t, t + 0.75)
    const bp = filt(X, 'bandpass', 400 * p, 1.4)
    bp.frequency.setValueAtTime(400 * p, t)
    bp.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.25)
    bp.frequency.exponentialRampToValueAtTime(600 * p, t + 0.55)
    const e = gain(X)
    e.gain.setValueAtTime(0, t)
    e.gain.linearRampToValueAtTime(0.45, t + 0.22)
    e.gain.linearRampToValueAtTime(0, t + 0.58)
    const pn = pan(X, -0.7)
    if (pn.pan) { pn.pan.setValueAtTime(-0.7, t); pn.pan.linearRampToValueAtTime(0.7, t + 0.55) }
    n.connect(bp).connect(e).connect(pn).connect(X.out)
    return 0.7
  },

  cheer(X, t, p) {
    for (let k = 0; k < 10; k++) {
      const tk = t + rnd(0, 0.15), dur = rnd(0.7, 1.1)
      const f0 = Math.random() < 0.5 ? rnd(150, 210) : rnd(240, 330)
      const v = crowdVoice(X, tk, f0, dur, [[560, 6, 1], [1850, 8, 0.6], [2600, 8, 0.25]], [[0.25, 1.18], [dur, 1.0]], 0, p)
      ahr(v.env, tk, 0.06, rnd(0.13, 0.22), dur - 0.3, 0.3)
    }
    const n = noise(X, t, t + 1.4), bp = filt(X, 'bandpass', 1600, 0.6), ne = gain(X)
    ahr(ne.gain, t, 0.05, 0.12, 0.6, 0.5)
    n.connect(bp).connect(ne); ne.connect(X.out); ne.connect(X.wet)
    for (let k = 0; k < 14; k++) {
      const c = play(X, X.S.clap, t + rnd(0.05, 1.3), rnd(0.9, 1.15))
      const cg = gain(X, rnd(0.08, 0.2)), pn = pan(X, rnd(-0.8, 0.8))
      c.connect(cg).connect(pn).connect(X.out)
    }
    return 1.8
  },

  mubarak(X, t, p) {
    // a warm crowd swell with a "mu-baa-rak" syllable rhythm (formant bursts only, no real speech)
    const U = [[320, 6, 1], [870, 8, 0.4]], A = [[740, 6, 1], [1150, 8, 0.6], [2500, 8, 0.2]]
    for (let k = 0; k < 12; k++) {
      const tk = t + rnd(0, 0.06)
      const f0 = Math.random() < 0.55 ? rnd(120, 170) : rnd(200, 280)
      const ou = crowdVoice(X, tk, f0, 0.12, U, [[0.1, 1.04]], 0, p)
      ahr(ou.env, tk, 0.02, rnd(0.1, 0.17), 0.05, 0.05)
      const tb = tk + 0.12
      const ob = crowdVoice(X, tb, f0 * 1.12, 0.62, A, [[0.12, 1.25], [0.3, 1.18], [0.6, 0.95]], 0, p)
      ob.env.setValueAtTime(0, tb)
      ob.env.linearRampToValueAtTime(rnd(0.17, 0.26), tb + 0.04)
      ob.env.setValueAtTime(rnd(0.17, 0.24), tb + 0.26)
      ob.env.linearRampToValueAtTime(0.05, tb + 0.31)
      ob.env.linearRampToValueAtTime(rnd(0.12, 0.19), tb + 0.35)
      ob.env.setTargetAtTime(0, tb + 0.48, 0.05)
      // the closing "k": a tiny noise click
      const kt = tb + 0.5, n = noise(X, kt, kt + 0.05), bp = filt(X, 'bandpass', 2600, 1.5), ke = gain(X)
      perc(ke.gain, kt, 0.002, 0.03, 0.008)
      n.connect(bp).connect(ke).connect(X.out)
    }
    // happy aftermath: soft "aaah" swell, claps
    const n = noise(X, t, t + 2.4), bp = filt(X, 'bandpass', 1200, 0.5), ne = gain(X)
    ne.gain.setValueAtTime(0, t)
    ne.gain.linearRampToValueAtTime(0.05, t + 0.3)
    ne.gain.linearRampToValueAtTime(0.1, t + 0.8)
    ne.gain.setTargetAtTime(0, t + 1.1, 0.35)
    n.connect(bp).connect(ne); ne.connect(X.out); ne.connect(X.wet)
    for (let k = 0; k < 16; k++) {
      const c = play(X, X.S.clap, t + rnd(0.65, 2.0), rnd(0.9, 1.15))
      const cg = gain(X, rnd(0.06, 0.16)), pn = pan(X, rnd(-0.8, 0.8))
      c.connect(cg).connect(pn).connect(X.out)
    }
    return 2.6
  },

  chhuare(X, t, p) {
    ;[[0, 1, 0, 0.9], [0.06, 1.18, -0.5, 0.5], [0.13, 0.86, 0.5, 0.45]].forEach(([dt, r, pp, vol]) => {
      const s = play(X, X.S.patter, t + dt, r * p)
      const g = gain(X, vol), pn = pan(X, pp)
      s.connect(g).connect(pn); pn.connect(X.out); pn.connect(X.wet)
    })
    const n = noise(X, t, t + 1.6), hp = filt(X, 'highpass', 5000), ne = gain(X)
    ahr(ne.gain, t, 0.15, 0.025, 0.7, 0.5)
    n.connect(hp).connect(ne).connect(X.out)
    return 1.8
  },

  firework(X, t, p) {
    const pn = pan(X, rnd(-0.6, 0.6))
    pn.connect(X.out); pn.connect(X.wet)
    const w = osc(X, 'sine', 900 * p, t, t + 1)
    w.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.9)
    const we = gain(X)
    ahr(we.gain, t, 0.1, 0.05, 0.7, 0.06)
    w.connect(we).connect(pn)
    const h = noise(X, t, t + 1), hp = filt(X, 'highpass', 3000), he = gain(X)
    ahr(he.gain, t, 0.1, 0.05, 0.7, 0.06)
    h.connect(hp).connect(he).connect(pn)
    const tc = t + 1.0
    const c = noise(X, tc, tc + 0.6), ce = gain(X)
    perc(ce.gain, tc, 0.002, 0.55, 0.05)
    c.connect(ce).connect(pn)
    const b = osc(X, 'sine', 95 * p, tc, tc + 1)
    b.frequency.exponentialRampToValueAtTime(38 * p, tc + 0.5)
    const be = gain(X)
    perc(be.gain, tc, 0.003, 0.5, 0.14)
    b.connect(be).connect(pn)
    const cr = play(X, X.S.crackle, tc + 0.12, p), cg = gain(X, 0.3)
    cr.connect(cg).connect(pn)
    return 3
  },

  dholHit(X, t, p) {
    const a = play(X, X.S.dagga, t, p), b = play(X, X.S.tilli, t, p)
    const g = gain(X, 0.55)
    a.connect(g); b.connect(g); g.connect(X.out)
    return 0.8
  },

  miss(X, t, p) {
    const o = osc(X, 'sine', 140 * p, t, t + 0.3)
    o.frequency.exponentialRampToValueAtTime(55 * p, t + 0.15)
    const e = gain(X)
    perc(e.gain, t, 0.004, 0.32, 0.05)
    o.connect(e).connect(X.out)
    const n = noise(X, t, t + 0.1), lp = filt(X, 'lowpass', 400), ne = gain(X)
    perc(ne.gain, t, 0.002, 0.2, 0.015)
    n.connect(lp).connect(ne).connect(X.out)
    return 0.35
  },

  crash(X, t, p) {
    const o = osc(X, 'sine', 90 * p, t, t + 0.5)
    o.frequency.exponentialRampToValueAtTime(40 * p, t + 0.3)
    const e = gain(X)
    perc(e.gain, t, 0.003, 0.6, 0.08)
    o.connect(e).connect(X.out)
    const n = noise(X, t, t + 0.5), lp = filt(X, 'lowpass', 2500), ne = gain(X)
    perc(ne.gain, t, 0.002, 0.45, 0.06)
    n.connect(lp).connect(ne).connect(X.out)
    ;[523, 811, 1307, 1999].forEach((f, k) => {
      const m = osc(X, 'sine', f * p * rnd(0.97, 1.03), t, t + 0.6), me = gain(X)
      perc(me.gain, t + 0.005, 0.002, 0.07 / (k + 1) + 0.03, 0.05 + 0.03 * (3 - k))
      m.connect(me).connect(X.out)
    })
    const c = noise(X, t + 0.02, t + 0.2), bp = filt(X, 'bandpass', 3200, 1.2), cee = gain(X)
    perc(cee.gain, t + 0.02, 0.002, 0.2, 0.03)
    c.connect(bp).connect(cee).connect(X.out)
    return 0.7
  },

  doorClose(X, t, p) {
    const o = osc(X, 'sine', 75 * p, t, t + 0.3)
    o.frequency.exponentialRampToValueAtTime(45 * p, t + 0.18)
    const e = gain(X)
    perc(e.gain, t, 0.003, 0.5, 0.05)
    o.connect(e).connect(X.out)
    const n = noise(X, t, t + 0.2), lp = filt(X, 'lowpass', 900), ne = gain(X)
    perc(ne.gain, t, 0.002, 0.4, 0.03)
    n.connect(lp).connect(ne).connect(X.out)
    const tl = t + 0.035
    const l = noise(X, tl, tl + 0.05), hp = filt(X, 'highpass', 3000), le = gain(X)
    perc(le.gain, tl, 0.001, 0.2, 0.004)
    l.connect(hp).connect(le).connect(X.out)
    const lo = osc(X, 'sine', 2200 * p, tl, tl + 0.04), loe = gain(X)
    perc(loe.gain, tl, 0.001, 0.06, 0.006)
    lo.connect(loe).connect(X.out)
    return 0.35
  },

  planeLand(X, t, p) {
    ;[[0, 0.16, 0.7], [0.35, 0.1, 0.45]].forEach(([dt, vol, len]) => {
      const ts = t + dt
      const n = noise(X, ts, ts + len + 0.3), bp = filt(X, 'bandpass', 2400 * p, 6), ne = gain(X)
      ahr(ne.gain, ts, 0.03, vol, len * 0.3, len * 0.6)
      n.connect(bp).connect(ne).connect(X.out)
      const s = osc(X, 'sawtooth', 1850 * p, ts, ts + len + 0.3)
      const lfo = osc(X, 'sine', 23, ts, ts + len + 0.3), lg = gain(X, 45)
      lfo.connect(lg).connect(s.frequency)
      const sl = filt(X, 'bandpass', 1900 * p, 4), se = gain(X)
      ahr(se.gain, ts, 0.03, vol * 0.25, len * 0.3, len * 0.6)
      s.connect(sl).connect(se).connect(X.out)
    })
    const r = noise(X, t + 0.3, t + 4), lp = filt(X, 'lowpass', 300, 0.8), re = gain(X)
    lp.frequency.setValueAtTime(300, t + 0.3)
    lp.frequency.linearRampToValueAtTime(1300, t + 1.3)
    lp.frequency.linearRampToValueAtTime(350, t + 3.6)
    re.gain.setValueAtTime(0, t + 0.3)
    re.gain.linearRampToValueAtTime(0.4, t + 1.3)
    re.gain.linearRampToValueAtTime(0, t + 3.7)
    r.connect(lp).connect(re); re.connect(X.out); re.connect(X.wet)
    const w = osc(X, 'sine', 2600 * p, t + 0.3, t + 3.8), we = gain(X)
    w.frequency.linearRampToValueAtTime(1700 * p, t + 3.5)
    we.gain.setValueAtTime(0, t + 0.3)
    we.gain.linearRampToValueAtTime(0.012, t + 1.2)
    we.gain.linearRampToValueAtTime(0, t + 3.6)
    w.connect(we).connect(X.out)
    return 4
  },

  typing(X, t, p) {
    const n = noise(X, t, t + 0.05), bp = filt(X, 'bandpass', rnd(3000, 4500) * p, 1.5), ne = gain(X)
    perc(ne.gain, t, 0.001, rnd(0.16, 0.24), 0.006)
    n.connect(bp).connect(ne).connect(X.out)
    const o = osc(X, 'sine', rnd(180, 230) * p, t, t + 0.05), oe = gain(X)
    perc(oe.gain, t, 0.001, 0.1, 0.008)
    o.connect(oe).connect(X.out)
    return 0.06
  },

  kiss(X, t, p) {
    const o = osc(X, 'sine', 500 * p, t, t + 0.12)
    o.frequency.exponentialRampToValueAtTime(1400 * p, t + 0.05)
    const e = gain(X)
    ahr(e.gain, t, 0.005, 0.3, 0.03, 0.04)
    o.connect(e).connect(X.out)
    const o2 = osc(X, 'sine', 950 * p, t + 0.06, t + 0.2)
    o2.frequency.exponentialRampToValueAtTime(620 * p, t + 0.14)
    const e2 = gain(X)
    ahr(e2.gain, t + 0.06, 0.005, 0.14, 0.04, 0.04)
    o2.connect(e2).connect(X.out)
    return 0.25
  },

  bell(X, t, p) {
    const f0 = 540 * p
    const parts = [[0.5, 0.25, 3.6], [1, 1, 3], [2.0, 0.55, 2.2], [2.76, 0.4, 1.6], [3.9, 0.22, 1.0], [5.4, 0.14, 0.7], [6.8, 0.08, 0.5]]
    const out = gain(X, 1)
    out.connect(X.out); out.connect(X.wet)
    for (const [r, a, d] of parts) {
      for (const det of [-0.6, 0.6]) {
        const o = osc(X, 'sine', f0 * r + det, t, t + d * 3)
        const e = gain(X)
        perc(e.gain, t, 0.002, a * 0.09, d * 0.45)
        o.connect(e).connect(out)
      }
    }
    const n = noise(X, t, t + 0.05), hp = filt(X, 'highpass', 4000), ne = gain(X)
    perc(ne.gain, t, 0.001, 0.12, 0.004)
    n.connect(hp).connect(ne).connect(out)
    return 4
  },
}

// Indian car horn: two-tone "peep peep" (electric disc horns, about a major third apart)
export function horn(X, t, p = 1) {
  const shaper = X.ac.createWaveShaper()
  const curve = new Float32Array(512)
  for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; curve[i] = Math.tanh(2.5 * x) }
  shaper.curve = curve
  const bp = filt(X, 'bandpass', 1100, 0.7), lp = filt(X, 'lowpass', 3500)
  const e = gain(X)
  shaper.connect(bp).connect(lp).connect(e).connect(X.out)
  e.gain.setValueAtTime(0, t)
  ;[[0, 0.16], [0.25, 0.44]].forEach(([a, b]) => {
    e.gain.setValueAtTime(0, t + a)
    e.gain.linearRampToValueAtTime(0.3, t + a + 0.012)
    e.gain.setValueAtTime(0.3, t + b)
    e.gain.linearRampToValueAtTime(0, t + b + 0.02)
  })
  ;[440, 554].forEach((f) => {
    const o = osc(X, 'square', f * p, t, t + 0.5), g = gain(X, 0.35)
    o.connect(g).connect(shaper)
  })
  return 0.5
}
