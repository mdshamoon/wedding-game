// Procedural audio for Dulhe Raja: music, beat clock, SFX, engine, horn, ambience.
// Everything is synthesized with WebAudio (no audio files). Every public method is a safe
// no-op when WebAudio is missing or the context is not running, and nothing sounds before unlock().
//
//   import { audio } from './audio/Audio.js'
//   audio.unlock(); audio.playMusic('title'); audio.sfx('click'); audio.beat.on(n => ...)
import { renderDrums, renderNoise, renderIR, renderBabble, renderCrickets } from './dsp.js'
import { makeWaves, makeVoices, BUSES, DRUMS, instBus } from './voices.js'
import { TRACKS, compileTrack } from './tracks.js'
import { SFX, horn as hornSfx } from './sfx.js'
import { AMBIENCES } from './ambience.js'
import { Engine } from './engine.js'

const LOOKAHEAD = 0.12 // s of audio scheduled ahead
const TICK_MS = 25 // scheduler period
const K_VOL = 'dulheRaja.audio.volume'
const K_MUTE = 'dulheRaja.audio.muted'
const PLUCKS = new Set(['tumbi', 'santoor', 'rubab'])

const clamp = (x, a, b) => Math.min(b, Math.max(a, Number.isFinite(+x) ? +x : a))
const clamp01 = (x) => clamp(x, 0, 1)
const rnd = (a, b) => a + Math.random() * (b - a)
function lsGet(k) { try { return window.localStorage.getItem(k) } catch (e) { return null } }
function lsSet(k, v) { try { window.localStorage.setItem(k, v) } catch (e) { /* storage blocked */ } }
let warned = 0
function warn(e) { if (warned++ < 10 && typeof console !== 'undefined') console.warn('[audio]', e) }

// intensity -> gain for a layer whose threshold is L (smoothstep around L)
function layerGain(L, x) {
  if (!L) return 1
  const u = clamp01((x - (L - 0.1)) / 0.2)
  return u * u * (3 - 2 * u)
}
function fadeTo(param, t, value, dur) {
  param.cancelScheduledValues(t)
  param.setValueAtTime(param.value, t)
  param.linearRampToValueAtTime(value, t + Math.max(0.02, dur))
}

// --------------------------------------------------------------------------- music
class MusicInstance {
  constructor(sys, name, comp, t0, fade) {
    this.sys = sys; this.name = name; this.comp = comp; this.def = comp.def
    this.stepDur = 60 / this.def.bpm / this.def.spb
    this.beatDur = 60 / this.def.bpm
    this.t0 = t0; this.step = 0; this.stopAt = Infinity
    this.intensity = sys._intensity
    this.buses = {}; this.busOut = {}; this.dests = {}; this.layers = []; this.last = {}; this.beats = []
    const ac = sys.ac, now = ac.currentTime
    this.fd = ac.createGain(); this.fr = ac.createGain(); this.fl = ac.createGain()
    this.fd.connect(sys.musicBus); this.fr.connect(sys.revIn); this.fl.connect(sys.delIn)
    const level = this.def.gain ?? 1
    for (const g of [this.fd, this.fr, this.fl]) {
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(level, now + Math.max(0.02, fade))
    }
  }

  bus(name) {
    if (this.buses[name]) return this.buses[name]
    const ac = this.sys.ac, def = BUSES[name] || { gain: 0.3 }
    const input = ac.createGain()
    let node = input
    for (const [type, f, Q, gdb] of def.chain || []) {
      const bq = ac.createBiquadFilter()
      bq.type = type; bq.frequency.value = f; bq.Q.value = Q
      if (gdb != null) bq.gain.value = gdb
      node.connect(bq); node = bq
    }
    const out = ac.createGain()
    out.gain.value = def.gain
    node.connect(out)
    let last = out
    if (def.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = def.pan; out.connect(p); last = p }
    last.connect(this.fd)
    this.busOut[name] = last // post-fader tap (metering/debug)
    if (def.rev) { const s = ac.createGain(); s.gain.value = def.rev; last.connect(s); s.connect(this.fr) }
    if (def.del) { const s = ac.createGain(); s.gain.value = def.del; last.connect(s); s.connect(this.fl) }
    return (this.buses[name] = input)
  }

  dest(inst, L) {
    const key = inst + '|' + L
    if (this.dests[key]) return this.dests[key]
    const input = this.bus(instBus(inst))
    let d = input
    if (L) {
      d = this.sys.ac.createGain()
      d.gain.value = layerGain(L, this.intensity)
      d.connect(input)
      this.layers.push({ L, node: d })
    }
    return (this.dests[key] = d)
  }

  setIntensity(x) {
    this.intensity = x
    const t = this.sys.ac.currentTime
    for (const { L, node } of this.layers) node.gain.setTargetAtTime(layerGain(L, x), t, 0.25)
  }

  schedule(horizon) {
    const now = this.sys.ac.currentTime
    const { loopSteps, passes } = this.comp, spb = this.def.spb
    for (;;) {
      const t = this.t0 + this.step * this.stepDur
      if (t >= horizon || t >= this.stopAt) break
      const step = this.step++
      if (t < now - 0.03) continue // late (throttled tab): skip instead of bursting
      if (step % spb === 0 && this === this.sys._cur) this._beat(step / spb, t)
      const evs = passes[Math.floor(step / loopSteps) % passes.length][step % loopSteps]
      if (!evs) continue
      for (const e of evs) {
        if (e.L && layerGain(e.L, this.intensity) < 0.02) continue
        try { this._play(e, t) } catch (err) { warn(err) }
      }
    }
  }

  _play(e, t) {
    const V = this.sys.V
    const tt = t + (e.o || 0) * this.stepDur
    const v = e.v * (0.93 + Math.random() * 0.14)
    const d = this.dest(e.i, e.L)
    if (DRUMS.has(e.i)) { V.drum(e.i, tt, v, d); return }
    const fn = V[e.i]
    if (!fn) return
    fn(tt, e.m, e.d * this.stepDur, v, d, e.sl ? this.last[e.i] : null)
    this.last[e.i] = e.m
  }

  _beat(n, t) {
    if (!this.sys._listeners.size) return
    const entry = { n, t, id: 0 }
    this.beats.push(entry)
    this._arm(entry)
  }
  _arm(entry) {
    const delay = (entry.t + this.sys._comp() - this.sys.ac.currentTime) * 1000
    entry.id = setTimeout(() => {
      const i = this.beats.indexOf(entry)
      if (i >= 0) this.beats.splice(i, 1)
      if (this !== this.sys._cur) return
      for (const cb of [...this.sys._listeners]) { try { cb(entry.n) } catch (e) { warn(e) } }
    }, Math.max(0, delay))
  }
  pauseBeats() { for (const b of this.beats) clearTimeout(b.id) }
  resumeBeats() { for (const b of this.beats) this._arm(b) }

  stop(fade) {
    const t = this.sys.ac.currentTime
    this.stopAt = t + Math.max(0.02, fade)
    for (const g of [this.fd, this.fr, this.fl]) fadeTo(g.gain, t, 0, fade)
    this.pauseBeats(); this.beats = []
  }
  dispose() { for (const g of [this.fd, this.fr, this.fl]) { try { g.disconnect() } catch (e) { /* ignore */ } } }
}

// --------------------------------------------------------------------------- ambience
class AmbInstance {
  constructor(sys, name, def, fade) {
    const ac = sys.ac, t = ac.currentTime
    this.sys = sys; this.name = name; this.stopAt = Infinity
    this.inp = ac.createGain(); this.out = ac.createGain(); this.wet = ac.createGain(); this.wout = ac.createGain()
    this.inp.connect(this.out).connect(sys.ambBus)
    this.wet.connect(this.wout).connect(sys.revIn)
    for (const g of [this.out, this.wout]) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade) }
    this.X = { ac, S: sys.S, out: this.inp, wet: this.wet, lazy: (n) => sys._lazy(n) }
    this.srcs = def.beds ? def.beds(this.X) : []
    this.events = (def.events || []).map((e) => ({ ...e, next: t + (e.first ? rnd(e.first[0], e.first[1]) : rnd(e.min * 0.3, e.max * 0.6)) }))
  }
  schedule(horizon) {
    const now = this.sys.ac.currentTime
    for (const e of this.events) {
      while (e.next < horizon && e.next < this.stopAt) {
        if (e.next >= now - 0.05) { try { e.play(this.X, Math.max(e.next, now)) } catch (err) { warn(err) } }
        e.next += rnd(e.min, e.max)
      }
    }
  }
  stop(fade) {
    const t = this.sys.ac.currentTime
    this.stopAt = t + fade
    fadeTo(this.out.gain, t, 0, fade); fadeTo(this.wout.gain, t, 0, fade)
    for (const s of this.srcs) { try { s.stop(t + fade + 0.05) } catch (e) { /* ignore */ } }
  }
  dispose() { for (const g of [this.out, this.wout]) { try { g.disconnect() } catch (e) { /* ignore */ } } }
}

const NOOP_HANDLE = Object.freeze({ stop() {}, get playing() { return false } })

// --------------------------------------------------------------------------- system
class AudioSystem {
  constructor() {
    this.ac = null
    this._graph = false
    this._unlocked = false
    this._paused = false
    const v = parseFloat(lsGet(K_VOL))
    this._vol = Number.isFinite(v) ? clamp01(v) : 0.8
    this._muted = lsGet(K_MUTE) === '1'
    this._want = { music: null, fade: 1.5, amb: null, engine: false }
    this._cur = null; this._fading = []
    this._amb = null; this._ambFading = []
    this._intensity = 1
    this._listeners = new Set()
    this._timer = null
    this._latency = 0; this._offset = 0
    this._compiled = {}; this._lazyBufs = {}
    this.S = null; this.V = null; this.W = null
    this.engine = new Engine(this)

    const sys = this
    this.beat = {
      /** bpm of the current track (0 when no music) */
      get bpm() { return sys._cur ? sys._cur.def.bpm : 0 },
      /** output latency (s) folded into now()/timeOfBeat()/on() */
      get latency() { return sys._latency },
      /** extra user calibration offset (s), added to latency */
      get offset() { return sys._offset },
      set offset(v) { sys._offset = clamp(v, -0.5, 0.5) },
      /** beats heard since the current track's beat 0 (float) */
      now() {
        try { const c = sys._cur; return sys.ac && c ? (sys.ac.currentTime - sys._comp() - c.t0) / c.beatDur : 0 } catch (e) { return 0 }
      },
      /** cb(beatIndex) near the audible time of every beat; returns unsubscribe */
      on(cb) {
        if (typeof cb !== 'function') return () => {}
        sys._listeners.add(cb)
        return () => { sys._listeners.delete(cb) }
      },
      /** AudioContext time at which beat n is heard */
      timeOfBeat(n) {
        try { const c = sys._cur; return sys.ac && c ? c.t0 + (+n || 0) * c.beatDur + sys._comp() : 0 } catch (e) { return 0 }
      },
    }
  }

  // ---- public API --------------------------------------------------------------
  get tracks() { return Object.keys(TRACKS) }
  get sfxNames() { return Object.keys(SFX) }
  get ambiences() { return Object.keys(AMBIENCES) }
  get state() { return !this.ac ? (this._hasWebAudio() ? 'locked' : 'unavailable') : this.ac.state }
  get currentTrack() { return this._cur ? this._cur.name : null }

  unlock() {
    try {
      if (typeof window === 'undefined') return
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        try { this.ac = new AC({ latencyHint: 'interactive' }) } catch (e) { this.ac = new AC() }
        this._buildGraph()
        this.ac.onstatechange = () => this._onState()
        this._installListeners()
      }
      this._unlocked = true
      if (this.ac.state !== 'running' && this.ac.resume) {
        const p = this.ac.resume()
        if (p && p.then) p.then(() => this._onState(), () => {})
      }
      if (!this._primed) {
        // iOS: a sound started inside the gesture unlocks output
        const b = this.ac.createBuffer(1, 1, 22050), s = this.ac.createBufferSource()
        s.buffer = b; s.connect(this.ac.destination); s.start(0)
        this._primed = true
      }
      this._onState()
    } catch (e) { warn(e) }
  }

  playMusic(name, { fade = 1.5 } = {}) {
    try {
      if (!TRACKS[name]) { warn('unknown track: ' + name); return }
      if (this._want.music !== name) this._intensity = TRACKS[name].intensity ?? 1
      this._want.music = name; this._want.fade = fade
      if (!this._ready()) return
      if (this._cur && this._cur.name === name) return
      this._startMusic(name, fade)
    } catch (e) { warn(e) }
  }

  stopMusic({ fade = 1.5 } = {}) {
    try {
      this._want.music = null
      if (this._ready() && this._cur) this._stopMusic(fade)
    } catch (e) { warn(e) }
  }

  setMusicIntensity(x) {
    try {
      this._intensity = clamp01(x)
      if (!this._cur) return
      if (this._ready()) this._cur.setIntensity(this._intensity)
      else this._cur.intensity = this._intensity
    } catch (e) { warn(e) }
  }

  sfx(name, { volume = 1, pitch = 1, loop = false } = {}) {
    try {
      const fn = SFX[name]
      if (!fn) { warn('unknown sfx: ' + name); return NOOP_HANDLE }
      if (!this._ready()) return NOOP_HANDLE
      return this._oneShot(fn, clamp(volume, 0, 2), clamp(pitch, 0.25, 4), loop)
    } catch (e) { warn(e); return NOOP_HANDLE }
  }

  horn() {
    try {
      if (!this._ready()) return
      this._oneShot(hornSfx, 1, 1, false)
    } catch (e) { warn(e) }
  }

  setAmbience(name) {
    try {
      const n = name && AMBIENCES[name] ? name : null
      if (name && !n) warn('unknown ambience: ' + name)
      this._want.amb = n
      if (this._ready()) this._setAmb(n)
    } catch (e) { warn(e) }
  }

  ctxTime() { try { return this.ac ? this.ac.currentTime : 0 } catch (e) { return 0 } }

  get volume() { return this._vol }
  set volume(v) {
    try { this._vol = clamp01(v); lsSet(K_VOL, String(this._vol)); this._applyVolume() } catch (e) { warn(e) }
  }
  get muted() { return this._muted }
  set muted(m) {
    try { this._muted = !!m; lsSet(K_MUTE, this._muted ? '1' : '0'); this._applyVolume() } catch (e) { warn(e) }
  }

  // ---- internals ---------------------------------------------------------------
  _warn(e) { warn(e) }
  _hasWebAudio() { return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext) }
  _ready() { return !!(this.ac && this._graph && this.S && this._unlocked && this.ac.state === 'running') }
  _comp() { return this._latency + this._offset }

  _buildGraph() {
    const ac = this.ac
    const g = (v) => { const n = ac.createGain(); n.gain.value = v; return n }
    this.out = g(this._muted ? 0 : this._vol * this._vol)
    this.out.connect(ac.destination)
    const lim = ac.createDynamicsCompressor()
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 2.5; comp.attack.value = 0.012; comp.release.value = 0.25
    this.master = g(0.9)
    this.master.connect(comp).connect(lim).connect(this.out)
    this.musicBus = g(0.62); this.musicBus.connect(this.master)
    this.sfxBus = g(0.85); this.sfxBus.connect(this.master)
    this.ambBus = g(0.8); this.ambBus.connect(this.master)
    // gentle convolution reverb
    const conv = ac.createConvolver()
    conv.buffer = renderIR(ac)
    this.revIn = g(1)
    this.revIn.connect(conv).connect(g(0.4)).connect(this.master)
    // tempo-synced feedback echo, filtered in the loop
    this.delIn = g(1)
    const dl = ac.createDelay(2)
    dl.delayTime.value = 0.56
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250
    const fb = g(0.28), dout = g(0.32)
    this.delIn.connect(dl); dl.connect(lp).connect(hp); hp.connect(fb).connect(dl); hp.connect(dout).connect(this.master)
    this.delay = dl
    this._graph = true
  }

  _ensureSamples() {
    if (this.S) return
    const ac = this.ac
    this.S = { ...renderDrums(ac), noise: renderNoise(ac) }
    this.W = makeWaves(ac)
    this.V = makeVoices(ac, this.W, this.S)
  }

  _lazy(name) {
    if (!this._lazyBufs[name]) this._lazyBufs[name] = name === 'crickets' ? renderCrickets(this.ac) : renderBabble(this.ac)
    return this._lazyBufs[name]
  }

  _installListeners() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      try {
        if (!this.ac) return
        clearTimeout(this._visTimer)
        if (document.hidden) {
          // debounce: only suspend if the page stays hidden (saves CPU/battery in background tabs)
          this._visTimer = setTimeout(() => {
            try { if (document.hidden && this.ac.state === 'running') { this._autoSuspended = true; const p = this.ac.suspend(); if (p && p.catch) p.catch(() => {}) } } catch (e) { /* ignore */ }
          }, 400)
        } else if (this._autoSuspended && this._unlocked) {
          this._autoSuspended = false
          const p = this.ac.resume()
          if (p && p.then) p.then(() => this._onState(), () => {})
        }
      } catch (e) { warn(e) }
    })
    // iOS can interrupt the context (calls, app switch): resume on the next gesture
    const regain = () => {
      try {
        if (this.ac && this._unlocked && this.ac.state !== 'running' && !document.hidden) {
          const p = this.ac.resume()
          if (p && p.then) p.then(() => this._onState(), () => {})
        }
      } catch (e) { /* ignore */ }
    }
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, regain, { capture: true, passive: true })
  }

  _onState() {
    try {
      const ac = this.ac
      if (!ac) return
      if (ac.state === 'running' && this._unlocked) {
        this._ensureSamples()
        if (!this._idleQueued) {
          // pre-render the ambience loops off the critical path
          this._idleQueued = true
          const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 50))
          setTimeout(() => idle(() => { try { this._lazy('crickets') } catch (e) { warn(e) } idle(() => { try { this._lazy('babble') } catch (e) { warn(e) } }) }), 2500)
        }
        if (this._paused) { this._paused = false; if (this._cur) this._cur.resumeBeats() }
        if (!this._cur) this._refreshLatency()
        this._reconcile()
        this._kick()
      } else if (!this._paused) {
        this._paused = true
        if (this._cur) this._cur.pauseBeats()
      }
    } catch (e) { warn(e) }
  }

  _reconcile() {
    const w = this._want
    if (w.music && (!this._cur || this._cur.name !== w.music)) this._startMusic(w.music, w.fade)
    else if (!w.music && this._cur) this._stopMusic(w.fade)
    if (w.amb !== (this._amb ? this._amb.name : null)) this._setAmb(w.amb)
    if (w.engine && !this.engine.n) this.engine._build()
  }

  _refreshLatency() {
    const ac = this.ac
    this._latency = clamp((ac.baseLatency || 0) + (ac.outputLatency || 0), 0, 0.5)
  }

  _startMusic(name, fade) {
    const ac = this.ac
    const comp = this._compiled[name] || (this._compiled[name] = compileTrack(name))
    this._prewarm(comp)
    if (this._cur) { this._cur.stop(fade); this._fading.push(this._cur) }
    this._refreshLatency()
    const def = comp.def
    this._cur = new MusicInstance(this, name, comp, ac.currentTime + 0.06, fade)
    const dt = Math.min(1.5, ((def.delayBeats || 0.75) * 60) / def.bpm)
    this.delay.delayTime.setTargetAtTime(dt, ac.currentTime, 0.05)
    this._kick()
  }

  _stopMusic(fade) {
    if (!this._cur) return
    this._cur.stop(fade)
    this._fading.push(this._cur)
    this._cur = null
  }

  // render the plucked-string buffers a track needs before its first note
  _prewarm(comp) {
    if (comp.warm) return
    for (const pass of comp.passes) for (const evs of pass) if (evs) for (const e of evs) if (PLUCKS.has(e.i)) this.V.pluckBuf(e.i, e.m)
    comp.warm = true
  }

  _setAmb(name) {
    if ((this._amb ? this._amb.name : null) === name) return
    if (this._amb) { this._amb.stop(2); this._ambFading.push(this._amb); this._amb = null }
    if (name) this._amb = new AmbInstance(this, name, AMBIENCES[name], 2)
    this._kick()
  }

  _oneShot(fn, volume, pitch, loop) {
    const ac = this.ac
    const out = ac.createGain(), wet = ac.createGain()
    out.gain.value = volume; wet.gain.value = 0.5 * volume
    out.connect(this.sfxBus); wet.connect(this.revIn)
    const X = { ac, S: this.S, V: this.V, out, wet }
    const t0 = ac.currentTime + 0.005
    const dur = Math.max(0.05, fn(X, t0, pitch) || 1)
    let alive = true, timer = 0
    const cleanup = () => { alive = false; clearTimeout(timer); try { out.disconnect(); wet.disconnect() } catch (e) { /* ignore */ } }
    if (loop) {
      let next = t0 + dur
      const again = () => {
        if (!alive) return
        try {
          const now = ac.currentTime
          while (next < now + 0.3) { fn(X, Math.max(next, now + 0.005), pitch); next += dur }
        } catch (e) { warn(e) }
        timer = setTimeout(again, 100)
      }
      timer = setTimeout(again, 100)
    } else timer = setTimeout(cleanup, (dur + 1.5) * 1000)
    return {
      get playing() { return alive },
      stop(fade = 0.06) {
        if (!alive) return
        alive = false
        clearTimeout(timer)
        try {
          const t = ac.currentTime
          fadeTo(out.gain, t, 0, fade); fadeTo(wet.gain, t, 0, fade)
        } catch (e) { /* ignore */ }
        setTimeout(cleanup, (Math.max(0.02, fade) + 0.1) * 1000)
      },
    }
  }

  _applyVolume() {
    if (!this.ac || !this.out) return
    this.out.gain.setTargetAtTime(this._muted ? 0 : this._vol * this._vol, this.ac.currentTime, 0.03)
  }

  _tick() {
    this._timer = null
    try {
      if (!this._ready()) return
      const now = this.ac.currentTime, h = now + LOOKAHEAD
      if (this._cur) this._cur.schedule(h)
      this._fading = this._fading.filter((m) => {
        if (now > m.stopAt + 0.25) { m.dispose(); return false }
        m.schedule(h)
        return true
      })
      if (this._amb) this._amb.schedule(h)
      this._ambFading = this._ambFading.filter((a) => {
        if (now > a.stopAt + 0.25) { a.dispose(); return false }
        return true
      })
    } catch (e) { warn(e) }
    if (this._cur || this._fading.length || this._amb || this._ambFading.length) this._timer = setTimeout(() => this._tick(), TICK_MS)
  }

  _kick() { if (this._timer == null && this._ready()) this._tick() }
}

export const audio = new AudioSystem()
export default audio
