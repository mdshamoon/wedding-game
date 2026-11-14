import { audio } from '../src/audio/Audio.js'

const $ = (id) => document.getElementById(id)
const logEl = $('log')
const errors = []
function logErr(msg) {
  errors.push(String(msg))
  logEl.textContent = errors.slice(-12).join('\n')
}
window.addEventListener('error', (e) => logErr(e.message))
window.addEventListener('unhandledrejection', (e) => logErr(e.reason))
const origWarn = console.warn
console.warn = (...a) => { origWarn(...a); logErr(a.join(' ')) }

const fade = () => Math.max(0, parseFloat($('fade').value) || 0)

// ---- unlock / volume
$('unlock').onclick = () => audio.unlock()
document.addEventListener('pointerdown', () => audio.unlock(), { once: true })
$('vol').value = audio.volume
$('vol').oninput = (e) => { audio.volume = +e.target.value }
$('mute').checked = audio.muted
$('mute').onchange = (e) => { audio.muted = e.target.checked }

// ---- music
const trackBtns = {}
for (const name of audio.tracks) {
  const b = document.createElement('button')
  b.textContent = name
  b.onclick = () => {
    audio.unlock()
    audio.playMusic(name, { fade: fade() })
    $('intensity').value = 0.5
    setTimeout(() => { $('intensity').value = audio._intensity; $('intv').textContent = (+audio._intensity).toFixed(2) }, 0)
  }
  $('tracks').appendChild(b)
  trackBtns[name] = b
}
$('stop').onclick = () => audio.stopMusic({ fade: fade() })
$('intensity').oninput = (e) => { audio.setMusicIntensity(+e.target.value); $('intv').textContent = (+e.target.value).toFixed(2) }

// ---- beat indicator (driven only by audio.beat.on)
const dot = $('dot'), cells = [...$('bar4').children]
audio.beat.on((n) => {
  dot.classList.remove('flash', 'down')
  void dot.offsetWidth
  dot.classList.add(n % 4 === 0 ? 'down' : 'flash')
  setTimeout(() => dot.classList.remove('flash', 'down'), 90)
  cells.forEach((c, i) => c.classList.toggle('cur', i === n % 4))
})

// tap test: offset of each tap from the nearest heard beat
const taps = []
function tap() {
  if (!audio.beat.bpm) { $('tapres').textContent = 'play a track first'; return }
  const t = audio.ctxTime()
  const n = Math.round(audio.beat.now())
  const err = (t - audio.beat.timeOfBeat(n)) * 1000
  taps.push(err)
  if (taps.length > 16) taps.shift()
  const avg = taps.reduce((a, b) => a + b, 0) / taps.length
  $('tapres').textContent = `beat ${n}: ${err >= 0 ? '+' : ''}${err.toFixed(0)} ms (avg ${avg.toFixed(0)} ms over ${taps.length})`
}
$('tap').onclick = tap
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); tap() }
})

// ---- sfx
for (const name of audio.sfxNames) {
  const b = document.createElement('button')
  b.textContent = name
  b.onclick = () => { audio.unlock(); audio.sfx(name, { pitch: +$('pitch').value }) }
  $('sfx').appendChild(b)
}
$('pitch').oninput = (e) => { $('pv').textContent = (+e.target.value).toFixed(2) }
let ring = null
$('ringloop').onclick = () => {
  audio.unlock()
  if (ring && ring.playing) { ring.stop(); ring = null } else ring = audio.sfx('phoneRing', { loop: true })
  $('ringloop').textContent = 'phoneRing loop: ' + (ring ? 'on' : 'off')
  $('ringloop').classList.toggle('on', !!ring)
}

// ---- car
let engineOn = false
$('engine').onclick = () => {
  audio.unlock()
  engineOn = !engineOn
  engineOn ? audio.engine.start() : audio.engine.stop()
  $('engine').textContent = 'Engine: ' + (engineOn ? 'on' : 'off')
  $('engine').classList.toggle('on', engineOn)
}
$('horn').onclick = () => { audio.unlock(); audio.horn() }
let autoT = 0
function frame(ts) {
  if ($('auto').checked) {
    autoT += 1 / 60
    const ph = autoT % 14
    const accel = ph < 9
    const s = Math.min(1, Math.max(0, +$('speed').value + (accel ? 0.0022 : -0.004)))
    $('speed').value = s
    $('thr').value = accel ? 0.85 : 0
  }
  const s = +$('speed').value, th = +$('thr').value
  $('sv').textContent = s.toFixed(2); $('tv').textContent = th.toFixed(2)
  audio.engine.update(s, th)
  // status
  $('status').textContent =
    `state: ${audio.state}   track: ${audio.currentTrack || '-'}   bpm: ${audio.beat.bpm}   beat.now(): ${audio.beat.now().toFixed(2)}\n` +
    `ctxTime: ${audio.ctxTime().toFixed(3)}   latency comp: ${(audio.beat.latency * 1000).toFixed(1)} ms   volume: ${audio.volume.toFixed(2)}   muted: ${audio.muted}`
  for (const [n, b] of Object.entries(trackBtns)) b.classList.toggle('on', audio.currentTrack === n)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// ---- ambience
const ambBtns = {}
for (const name of [null, ...audio.ambiences]) {
  const b = document.createElement('button')
  b.textContent = name || 'none'
  b.onclick = () => {
    audio.unlock(); audio.setAmbience(name)
    for (const [k, x] of Object.entries(ambBtns)) x.classList.toggle('on', k === String(name))
  }
  $('amb').appendChild(b)
  ambBtns[String(name)] = b
}

window.audio = audio // for console poking
