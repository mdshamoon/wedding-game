// Unified keyboard + touch input. Axes in -1..1, buttons as booleans with edge detection.
import { QUALITY } from '../config.js';

const keys = new Set();
const pressedEdge = new Set();
const touchState = { x: 0, y: 0, buttons: new Set() };

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
    v += touchState.x;
    return Math.max(-1, Math.min(1, v));
  },
  axisY() { // +1 = forward/up
    let v = 0;
    if (KEYMAP.up.some((k) => keys.has(k))) v += 1;
    if (KEYMAP.down.some((k) => keys.has(k))) v -= 1;
    v += touchState.y;
    return Math.max(-1, Math.min(1, v));
  },
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
  isTouch: QUALITY.isMobile || 'ontouchstart' in window,
};

// ---------------------------------------------------------------- touch UI
const touchEdge = new Set();
let touchRoot = null;

export function setupTouch(uiRoot) {
  if (!input.isTouch) return;
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
