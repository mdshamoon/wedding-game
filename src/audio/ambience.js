// Ambience beds (looping, started once) and sparse random events (scheduled by the core clock).
// X = { ac, S, out, wet, lazy(name) -> AudioBuffer }
const rnd = (a, b) => a + Math.random() * (b - a)

function gain(X, v = 0) { const g = X.ac.createGain(); g.gain.value = v; return g }
function filt(X, type, f, Q = 0.707) { const b = X.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b }
function pan(X, p) {
  if (X.ac.createStereoPanner) { const n = X.ac.createStereoPanner(); n.pan.value = p; return n }
  return gain(X, 1)
}
function loop(X, buffer, rate = 1) {
  const s = X.ac.createBufferSource()
  s.buffer = buffer; s.loop = true; s.playbackRate.value = rate
  s.start(X.ac.currentTime, Math.random() * buffer.duration * 0.9)
  return s
}
function lfo(X, freq, depth, param) {
  const o = X.ac.createOscillator()
  o.frequency.value = freq
  const g = gain(X, depth)
  o.connect(g).connect(param)
  o.start()
  return o
}
function osc(X, type, f, t0, t1) {
  const o = X.ac.createOscillator()
  o.type = type; o.frequency.setValueAtTime(f, t0)
  o.start(t0); o.stop(t1)
  return o
}
function perc(param, t, a, peak, tau) {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(peak, t + a)
  param.setTargetAtTime(0, t + a, tau)
}

function farHorn(X, t) {
  const f1 = rnd(380, 560), f2 = f1 * rnd(1.2, 1.3)
  const lp = filt(X, 'lowpass', 1300), e = gain(X), pn = pan(X, rnd(-0.9, 0.9))
  lp.connect(e).connect(pn); pn.connect(X.out); pn.connect(X.wet)
  const vol = rnd(0.03, 0.07)
  const blasts = Math.random() < 0.5 ? [[0, rnd(0.15, 0.4)]] : [[0, 0.14], [0.22, 0.38]]
  e.gain.setValueAtTime(0, t)
  for (const [a, b] of blasts) {
    e.gain.setValueAtTime(0, t + a)
    e.gain.linearRampToValueAtTime(vol, t + a + 0.015)
    e.gain.setValueAtTime(vol, t + b)
    e.gain.linearRampToValueAtTime(0, t + b + 0.03)
  }
  const end = t + blasts[blasts.length - 1][1] + 0.1
  for (const f of [f1, f2]) osc(X, 'square', f, t, end).connect(lp)
}

function birds(X, t) {
  const n = 2 + Math.floor(Math.random() * 4), base = rnd(2600, 4200), up = Math.random() < 0.5
  const pn = pan(X, rnd(-0.9, 0.9)), out = gain(X, rnd(0.02, 0.04))
  out.connect(pn); pn.connect(X.out); pn.connect(X.wet)
  for (let k = 0; k < n; k++) {
    const tk = t + k * rnd(0.11, 0.17), f = base * rnd(0.95, 1.05)
    const o = osc(X, 'sine', f, tk, tk + 0.12)
    o.frequency.exponentialRampToValueAtTime(f * (up ? 1.35 : 0.72), tk + 0.06)
    o.frequency.exponentialRampToValueAtTime(f, tk + 0.1)
    const e = gain(X)
    perc(e.gain, tk, 0.006, 1, 0.025)
    o.connect(e).connect(out)
  }
}

function dogs(X, t) {
  const n = 1 + Math.floor(Math.random() * 3), pn = pan(X, rnd(-0.9, 0.9))
  const bp = filt(X, 'bandpass', 800, 1.2), lp = filt(X, 'lowpass', 1400), out = gain(X, rnd(0.05, 0.09))
  bp.connect(lp).connect(out).connect(pn); pn.connect(X.out)
  const wet = gain(X, 2); out.connect(wet).connect(X.wet)
  const f0 = rnd(330, 450)
  for (let k = 0; k < n; k++) {
    const tk = t + k * rnd(0.28, 0.42)
    const o = osc(X, 'sawtooth', f0 * 1.15, tk, tk + 0.2)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.75, tk + 0.12)
    const e = gain(X)
    perc(e.gain, tk, 0.01, 1, 0.035)
    o.connect(e).connect(bp)
  }
}

function owl(X, t) {
  const pn = pan(X, rnd(-0.8, 0.8)), out = gain(X, 0.035)
  out.connect(pn); pn.connect(X.out); pn.connect(X.wet)
  ;[0, 0.45, 0.62].forEach((dt, k) => {
    const tk = t + dt, f = k ? 360 : 390
    const o = osc(X, 'sine', f, tk, tk + 0.45)
    o.frequency.linearRampToValueAtTime(f * 0.94, tk + 0.3)
    const e = gain(X)
    e.gain.setValueAtTime(0, tk)
    e.gain.linearRampToValueAtTime(1, tk + 0.05)
    e.gain.setTargetAtTime(0, tk + (k ? 0.1 : 0.25), 0.05)
    o.connect(e).connect(out)
  })
}

function clink(X, t) {
  const f = rnd(2600, 4200), pn = pan(X, rnd(-0.8, 0.8)), out = gain(X, rnd(0.012, 0.025))
  out.connect(pn); pn.connect(X.out); pn.connect(X.wet)
  for (const r of [1, 2.71, 4.1]) {
    const o = osc(X, 'sine', f * r, t, t + 0.8), e = gain(X)
    perc(e.gain, t, 0.002, 1 / r, 0.12 / r + 0.05)
    o.connect(e).connect(out)
  }
}

function laugh(X, t) {
  const f0 = Math.random() < 0.5 ? rnd(150, 200) : rnd(230, 300)
  const pn = pan(X, rnd(-0.8, 0.8)), out = gain(X, rnd(0.012, 0.022))
  const b1 = filt(X, 'bandpass', 800, 5), b2 = filt(X, 'bandpass', 1250, 7)
  b1.connect(out); b2.connect(out); out.connect(pn); pn.connect(X.out); pn.connect(X.wet)
  const n = 3 + Math.floor(Math.random() * 3)
  for (let k = 0; k < n; k++) {
    const tk = t + k * 0.15, o = osc(X, 'sawtooth', f0 * (1 - k * 0.04), tk, tk + 0.16), e = gain(X)
    e.gain.setValueAtTime(0, tk)
    e.gain.linearRampToValueAtTime(1, tk + 0.02)
    e.gain.setTargetAtTime(0, tk + 0.07, 0.02)
    o.connect(e); e.connect(b1); e.connect(b2)
  }
}

function paChime(X, t) {
  const notes = Math.random() < 0.6 ? [79, 84, 88] : [88, 84, 79]
  const out = gain(X, 0.05)
  out.connect(X.out); out.connect(X.wet)
  notes.forEach((m, k) => {
    const tk = t + k * 0.42, f = 440 * Math.pow(2, (m - 69) / 12)
    for (const [r, a, d] of [[1, 1, 0.5], [4, 0.15, 0.12]]) {
      const o = osc(X, 'sine', f * r, tk, tk + 2.5), e = gain(X)
      perc(e.gain, tk, 0.004, a, d)
      o.connect(e).connect(out)
    }
  })
  // a muffled, unintelligible announcement afterwards
  if (Math.random() < 0.7) {
    const ta = t + 1.6, s = X.ac.createBufferSource()
    s.buffer = X.lazy('babble')
    const bp = filt(X, 'bandpass', 1000, 1.4), e = gain(X)
    e.gain.setValueAtTime(0, ta)
    e.gain.linearRampToValueAtTime(0.3, ta + 0.2)
    e.gain.setValueAtTime(0.3, ta + 2.4)
    e.gain.linearRampToValueAtTime(0, ta + 2.7)
    s.connect(bp).connect(e); e.connect(X.wet); e.connect(X.out)
    s.start(ta, Math.random() * 3); s.stop(ta + 2.8)
  }
}

function jetPass(X, t) {
  const s = X.ac.createBufferSource()
  s.buffer = X.S.noise; s.loop = true
  const lp = filt(X, 'lowpass', 200, 0.8), e = gain(X)
  lp.frequency.setValueAtTime(200, t)
  lp.frequency.linearRampToValueAtTime(900, t + 4)
  lp.frequency.linearRampToValueAtTime(200, t + 8)
  e.gain.setValueAtTime(0, t)
  e.gain.linearRampToValueAtTime(0.14, t + 4)
  e.gain.linearRampToValueAtTime(0, t + 8)
  s.connect(lp).connect(e).connect(X.out)
  s.start(t, Math.random()); s.stop(t + 8.1)
}

export const AMBIENCES = {
  town: {
    beds(X) {
      const n1 = loop(X, X.S.noise), lp = filt(X, 'lowpass', 320, 0.5), g1 = gain(X, 0.42)
      const l1 = lfo(X, 0.06, 0.14, g1.gain)
      n1.connect(lp).connect(g1).connect(X.out)
      const n2 = loop(X, X.S.noise, 0.97), bp = filt(X, 'bandpass', 1100, 0.5), g2 = gain(X, 0.03)
      n2.connect(bp).connect(g2).connect(X.out)
      return [n1, n2, l1]
    },
    events: [{ min: 3, max: 9, play: farHorn }, { min: 1.5, max: 5, play: birds }],
  },
  night: {
    beds(X) {
      const c = loop(X, X.lazy('crickets')), cg = gain(X, 0.32)
      c.connect(cg); cg.connect(X.out)
      const n = loop(X, X.S.noise), lp = filt(X, 'lowpass', 260, 0.5), g = gain(X, 0.1)
      const l = lfo(X, 0.05, 0.05, g.gain)
      n.connect(lp).connect(g).connect(X.out)
      return [c, n, l]
    },
    events: [{ min: 6, max: 18, play: dogs }, { min: 14, max: 32, play: owl }],
  },
  party: {
    beds(X) {
      const b = loop(X, X.lazy('babble')), g = gain(X, 0.55)
      const l = lfo(X, 0.08, 0.12, g.gain)
      const b2 = loop(X, X.lazy('babble'), 0.93), g2 = gain(X, 0.3)
      b.connect(g).connect(X.out); b2.connect(g2); g2.connect(X.out); g2.connect(X.wet)
      return [b, b2, l]
    },
    events: [{ min: 1.5, max: 5, play: clink }, { min: 4, max: 11, play: laugh }],
  },
  airport: {
    beds(X) {
      const r = loop(X, X.S.noise), lp = filt(X, 'lowpass', 160, 0.6), rg = gain(X, 0.38)
      r.connect(lp).connect(rg).connect(X.out)
      const w = loop(X, X.S.noise, 1.03), bp = filt(X, 'bandpass', 3300, 4), wg = gain(X, 0.025)
      w.connect(bp).connect(wg).connect(X.out)
      const o = X.ac.createOscillator(); o.frequency.value = 2950
      const og = gain(X, 0.004)
      const l = lfo(X, 0.03, 25, o.frequency)
      o.connect(og).connect(X.out); o.start()
      const b = loop(X, X.lazy('babble'), 0.97), blp = filt(X, 'lowpass', 1500), bg = gain(X, 0.2)
      b.connect(blp).connect(bg); bg.connect(X.out); bg.connect(X.wet)
      return [r, w, o, l, b]
    },
    events: [{ min: 14, max: 28, play: paChime, first: [3, 6] }, { min: 20, max: 40, play: jetPass }],
  },
}
