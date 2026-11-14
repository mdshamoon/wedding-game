// Car engine: continuous oscillators + filtered noise, idle rumble to rev, 5 virtual gears.
const GEARS = [0, 0.14, 0.3, 0.48, 0.68, 1.01]
const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0))

export class Engine {
  constructor(sys) {
    this.sys = sys
    this.n = null
    this.speed = 0; this.thr = 0
    this.rpm = 0.12; this.gear = 1
    this.lastT = 0; this.lastApply = 0; this.shiftUntil = 0
  }

  start() {
    try {
      this.sys._want.engine = true
      if (this.sys._ready()) this._build()
    } catch (e) { this.sys._warn(e) }
  }

  stop() {
    try {
      this.sys._want.engine = false
      this._teardown()
    } catch (e) { this.sys._warn(e) }
  }

  update(speed01 = 0, throttle01 = 0) {
    try {
      this.speed = clamp01(speed01)
      this.thr = clamp01(throttle01)
      if (!this.n || !this.sys._ready()) return
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (nowMs - this.lastApply < 30) return
      this._apply(nowMs)
    } catch (e) { this.sys._warn(e) }
  }

  _target(nowMs) {
    const s = this.speed, th = this.thr
    let g = 1
    while (g < 5 && s >= GEARS[g]) g++
    const lo = GEARS[g - 1], hi = GEARS[g]
    const frac = (s - lo) / (hi - lo)
    const base = g === 1 ? 0.14 : 0.4
    let rpm = base + frac * (0.88 - base)
    if (s < 0.02) rpm = 0.12 + th * 0.55 // revving in neutral
    rpm += th * 0.05
    if (g > this.gear && s > 0.02) this.shiftUntil = nowMs + 160 // upshift: brief throttle lift
    this.gear = g
    return rpm
  }

  _apply(nowMs, immediate = false) {
    const n = this.n, ac = this.sys.ac
    const dt = this.lastT ? Math.min(0.2, (nowMs - this.lastT) / 1000) : 0.03
    this.lastT = nowMs; this.lastApply = nowMs
    const target = this._target(nowMs)
    this.rpm += (target - this.rpm) * (immediate ? 1 : Math.min(1, dt * 7))
    const shifting = nowMs < this.shiftUntil
    const load = shifting ? 0.05 : this.thr
    const f = 26 + this.rpm * 150
    const t = ac.currentTime, tc = immediate ? 0.005 : 0.05
    const set = (p, v) => p.setTargetAtTime(v, t, tc)
    set(n.o1.frequency, f)
    set(n.o2.frequency, f / 2)
    set(n.o3.frequency, f * 2)
    set(n.bp.frequency, f * 3.5)
    set(n.lfo.frequency, f / 2)
    set(n.lp.frequency, 230 + 1400 * load + 900 * this.rpm)
    if (!immediate && t > n.readyAt) set(n.vol.gain, 0.1 + 0.1 * this.rpm + 0.12 * load)
  }

  _build() {
    if (this.n) return
    const ac = this.sys.ac, S = this.sys.S
    const g = (v) => { const x = ac.createGain(); x.gain.value = v; return x }
    const o = (type) => { const x = ac.createOscillator(); x.type = type; return x }
    const o1 = o('sawtooth'), o2 = o('sine'), o3 = o('square'), lfo = o('sine')
    const nz = ac.createBufferSource(); nz.buffer = S.noise; nz.loop = true
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.5
    const shaper = ac.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8) }
    shaper.curve = curve
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2
    const am = g(0.75), lfoG = g(0.22), vol = g(0)
    o1.connect(g(0.4)).connect(shaper)
    o2.connect(g(0.7)).connect(shaper)
    o3.connect(g(0.05)).connect(shaper)
    nz.connect(bp).connect(g(0.25)).connect(shaper)
    shaper.connect(lp).connect(am).connect(vol).connect(this.sys.sfxBus)
    lfo.connect(lfoG).connect(am.gain)
    this.n = { o1, o2, o3, lfo, nz, bp, lp, am, vol, readyAt: ac.currentTime + 0.36 }
    this.lastT = 0
    this._apply(typeof performance !== 'undefined' ? performance.now() : Date.now(), true)
    const t = ac.currentTime
    vol.gain.setValueAtTime(0, t)
    vol.gain.linearRampToValueAtTime(0.1 + 0.1 * this.rpm + 0.12 * this.thr, t + 0.35)
    for (const s of [o1, o2, o3, lfo]) s.start(t)
    nz.start(t, Math.random())
  }

  _teardown() {
    const n = this.n
    if (!n) return
    this.n = null
    const ac = this.sys.ac
    if (!ac) return
    const t = ac.currentTime
    n.vol.gain.cancelScheduledValues(t)
    n.vol.gain.setValueAtTime(n.vol.gain.value, t)
    n.vol.gain.linearRampToValueAtTime(0, t + 0.35)
    for (const s of [n.o1, n.o2, n.o3, n.lfo, n.nz]) { try { s.stop(t + 0.4) } catch (e) { /* already stopped */ } }
    setTimeout(() => { try { n.vol.disconnect() } catch (e) { /* ignore */ } }, 700)
  }
}
