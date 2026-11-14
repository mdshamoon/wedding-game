// Unified keyboard + touch input. Axes in -1..1, buttons as booleans with edge detection.
import { QUALITY } from '../config.js';

const keys = new Set();
const pressedEdge = new Set();
const touchState = { x: 0, y: 0, buttons: new Set() };
// Phone driving controls: floating steering slider (left thumb), pedals (right thumb), optional tilt.
const driveState = {
  active: false, slider: 0, gas: 0, brake: 0, tilt: false, tiltValue: 0,
  steer() { return !this.active ? 0 : this.slider !== 0 ? this.slider : this.tilt ? this.tiltValue : 0; },
};

const KEYMAP = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  action: ['Space', 'Enter'],
  brake: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
  horn: ['KeyH'],
  ff: ['KeyF'],
  cam: ['KeyC'],
  pause: ['Escape', 'KeyP'],
};

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  pressedEdge.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

export const input = {
  axisX() {
    let v = 0;
    if (KEYMAP.left.some((k) => keys.has(k))) v -= 1;
    if (KEYMAP.right.some((k) => keys.has(k))) v += 1;
    v += touchState.x + driveState.steer();
    return Math.max(-1, Math.min(1, v));
  },
  axisY() { // +1 = forward/up
    let v = 0;
    if (KEYMAP.up.some((k) => keys.has(k))) v += 1;
    if (KEYMAP.down.some((k) => keys.has(k))) v -= 1;
    v += touchState.y + driveState.gas - driveState.brake;
    return Math.max(-1, Math.min(1, v));
  },
  // true while the player is actively steering by touch / tilt (used to switch the steering assist off)
  touchSteering() { return driveState.active && (driveState.slider !== 0 || (driveState.tilt && Math.abs(driveState.tiltValue) > 0.08)); },
  vibrate(ms = 40) { if (this.isTouch) try { navigator.vibrate?.(ms); } catch (e) { /* unsupported */ } },
  held(name) {
    return (KEYMAP[name] || []).some((k) => keys.has(k)) || touchState.buttons.has(name);
  },
  pressed(name) { // edge: true once per press
    const codes = KEYMAP[name] || [];
    for (const c of codes) if (pressedEdge.has(c)) return true;
    return touchEdge.has(name);
  },
  pressedKey(code) { return pressedEdge.has(code); },
  endFrame() { pressedEdge.clear(); touchEdge.clear(); },
  isTouch: QUALITY.isMobile || 'ontouchstart' in window || /[?&]touch/.test(location.search),
};

// ---------------------------------------------------------------- touch UI
const touchEdge = new Set();
let touchRoot = null;

export function setupTouch(uiRoot) {
  if (!input.isTouch) return;
  document.body.classList.add('touch-ui');
  touchRoot = document.createElement('div');
  touchRoot.className = 'touch';
  touchRoot.innerHTML = `
    <div class="stick"><div class="knob"></div></div>
    <div class="btns"></div>`;
  uiRoot.appendChild(touchRoot);
  const stick = touchRoot.querySelector('.stick');
  const knob = touchRoot.querySelector('.knob');
  let id = null, cx = 0, cy = 0;
  const R = 50;
  stick.addEventListener('pointerdown', (e) => {
    id = e.pointerId; stick.setPointerCapture(id);
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e);
  });
  const move = (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchState.x = dx / R;
    touchState.y = -dy / R;
  };
  stick.addEventListener('pointermove', move);
  const end = (e) => { if (e.pointerId !== id) return; id = null; touchState.x = touchState.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
}

// buttons: [{name:'brake', label:'Brake'}]
export function setTouchButtons(buttons, showStick = true) {
  if (!touchRoot) return;
  setDriveControls(null);
  touchRoot.classList.toggle('on', buttons !== null);
  touchRoot.querySelector('.stick').style.display = showStick ? '' : 'none';
  const box = touchRoot.querySelector('.btns');
  box.innerHTML = '';
  touchState.buttons.clear();
  for (const b of buttons || []) {
    const el = document.createElement('div');
    el.className = 'tbtn';
    el.textContent = b.label;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); touchState.buttons.add(b.name); touchEdge.add(b.name); el.classList.add('pressed'); });
    const up = () => { touchState.buttons.delete(b.name); el.classList.remove('pressed'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
    box.appendChild(el);
  }
}

// ---------------------------------------------------------------- phone driving controls
let driveEl = null;
const capture = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* pointer already gone */ } };
let tiltZero = null;
const TILT_KEY = 'dr.tilt';
function orientationAngle() { return (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0; }
function onTilt(e) {
  if (e.beta == null) return;
  const a = orientationAngle();
  // roll of the phone around the axis pointing out of the screen's long side
  const v = a === 90 ? e.beta : (a === -90 || a === 270) ? -e.beta : e.gamma;
  if (tiltZero === null) tiltZero = v;
  const d = v - tiltZero;
  const k = Math.max(-1, Math.min(1, d / 24));
  driveState.tiltValue = Math.abs(k) < 0.05 ? 0 : k;
}
async function enableTilt(on) {
  if (on && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') on = false; } catch (e) { on = false; }
  }
  driveState.tilt = on; tiltZero = null; driveState.tiltValue = 0;
  removeEventListener('deviceorientation', onTilt);
  if (on) addEventListener('deviceorientation', onTilt);
  try { localStorage.setItem(TILT_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  return on;
}

// opts: { ff: bool } -> shows steering + pedals + horn/boost(/ff). null hides them.
export function setDriveControls(opts) {
  if (!touchRoot) return;
  driveEl?.remove(); driveEl = null;
  Object.assign(driveState, { active: false, slider: 0, gas: 0, brake: 0 });
  for (const b of ['horn', 'boost', 'ff']) touchState.buttons.delete(b);
  if (!opts) return;
  touchRoot.classList.add('on');
  touchRoot.querySelector('.stick').style.display = 'none';
  touchRoot.querySelector('.btns').innerHTML = '';
  driveState.active = true;
  driveEl = document.createElement('div');
  driveEl.className = 'drive-ctl';
  driveEl.innerHTML = `
    <div class="steer-zone"><div class="steer-track"><div class="steer-knob"></div></div><div class="steer-hint">◀ &nbsp;slide to steer&nbsp; ▶</div></div>
    <div class="aux">
      <div class="dbtn" data-b="horn">HORN</div>
      <div class="dbtn boost" data-b="boost">BOOST</div>
      ${opts.ff ? '<div class="dbtn" data-b="ff">⏩</div>' : ''}
      <div class="dbtn small tilt">TILT<br><b>OFF</b></div>
    </div>
    <div class="pedals">
      <div class="pedal brake" data-p="brake"><span>BRAKE</span><small>hold: reverse</small></div>
      <div class="pedal gas" data-p="gas"><span>GAS</span></div>
    </div>`;
  touchRoot.appendChild(driveEl);

  // steering: floating slider that starts wherever the thumb lands
  const zone = driveEl.querySelector('.steer-zone'), track = driveEl.querySelector('.steer-track'), knob = driveEl.querySelector('.steer-knob'), hint = driveEl.querySelector('.steer-hint');
  const RANGE = 78;
  let sid = null, x0 = 0;
  const place = (x, y) => { const r = zone.getBoundingClientRect(); track.style.left = `${x - r.left}px`; track.style.top = `${y - r.top}px`; };
  zone.addEventListener('pointerdown', (e) => {
    if (sid !== null) return;
    e.preventDefault(); sid = e.pointerId; capture(zone, sid);
    x0 = e.clientX; place(e.clientX, e.clientY); zone.classList.add('active'); hint.style.opacity = 0;
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - x0;
    if (Math.abs(dx) > RANGE) { x0 += dx - Math.sign(dx) * RANGE; dx = Math.sign(dx) * RANGE; } // origin follows past full lock
    const v = dx / RANGE;
    driveState.slider = Math.abs(v) < 0.06 ? 0 : Math.sign(v) * Math.pow(Math.abs(v), 1.35); // finer near centre
    knob.style.transform = `translateX(${dx}px)`;
  });
  const sEnd = (e) => { if (e.pointerId !== sid) return; sid = null; driveState.slider = 0; knob.style.transform = ''; zone.classList.remove('active'); };
  zone.addEventListener('pointerup', sEnd); zone.addEventListener('pointercancel', sEnd);

  // pedals: one container so a thumb can slide between gas and brake
  const pedals = driveEl.querySelector('.pedals'), els = [...pedals.querySelectorAll('.pedal')];
  const ptr = new Map();
  const hit = (x, y) => { for (const el of els) { const r = el.getBoundingClientRect(); if (x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 14 && y <= r.bottom + 14) return el.dataset.p; } return null; };
  const sync = () => {
    const on = new Set(ptr.values());
    driveState.gas = on.has('gas') ? 1 : 0; driveState.brake = on.has('brake') ? 1 : 0;
    for (const el of els) el.classList.toggle('pressed', on.has(el.dataset.p));
  };
  pedals.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(pedals, e.pointerId); ptr.set(e.pointerId, hit(e.clientX, e.clientY)); sync(); input.vibrate(8); });
  pedals.addEventListener('pointermove', (e) => { if (!ptr.has(e.pointerId)) return; const p = hit(e.clientX, e.clientY); if (p !== ptr.get(e.pointerId)) { ptr.set(e.pointerId, p); sync(); if (p) input.vibrate(8); } });
  const pEnd = (e) => { ptr.delete(e.pointerId); sync(); };
  pedals.addEventListener('pointerup', pEnd); pedals.addEventListener('pointercancel', pEnd);

  // horn / boost / fast-forward
  for (const el of driveEl.querySelectorAll('.dbtn[data-b]')) {
    const name = el.dataset.b;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(el, e.pointerId); touchState.buttons.add(name); touchEdge.add(name); el.classList.add('pressed'); });
    const up = () => { touchState.buttons.delete(name); el.classList.remove('pressed'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  // tilt toggle (remembered); tapping it again while on re-centres
  const tiltBtn = driveEl.querySelector('.tilt');
  const showTilt = () => { tiltBtn.querySelector('b').textContent = driveState.tilt ? 'ON' : 'OFF'; tiltBtn.classList.toggle('pressed', driveState.tilt); zone.classList.toggle('tilt-on', driveState.tilt); };
  tiltBtn.addEventListener('pointerdown', async (e) => { e.preventDefault(); await enableTilt(!driveState.tilt); showTilt(); });
  let saved = false; try { saved = localStorage.getItem(TILT_KEY) === '1'; } catch (e) { /* ignore */ }
  if (saved && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') enableTilt(true).then(showTilt);
  else { driveState.tilt = false; showTilt(); }
}
