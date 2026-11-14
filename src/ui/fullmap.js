// Full-screen map: satellite / styled road map of the real area, live player position, route, venues.
// Open with M, by tapping the minimap, or the MAP button. Drag to pan, wheel/pinch to zoom.
import { CONFIG } from '../config.js';
import { K, tileBounds, localToTile } from '../geo.js';

const EARTH = 40075016.686;
const PLACES = [
  ['home', 'Home', 'Haldi · Sehra Bandi'],
  ['baraat', 'Blessing Garden', 'Nikah · 24 March'],
  ['reception', 'Grand Heritage', 'Walima · 25 March'],
  ['kichha', 'Kichha', 'Town centre'],
];

export class FullMap {
  constructor(game) {
    this.game = game;
    this.mode = 'sat';
    this.tiles = new Map();
    this.el = document.createElement('div');
    this.el.className = 'fullmap';
    this.el.innerHTML = `
      <canvas></canvas>
      <div class="fm-top">
        <div class="fm-title"><span>Kichha · Baheri</span><small>Real roads · ${CONFIG.tiles.attribution}</small></div>
        <button class="fm-btn fm-close" title="Close (M)">✕</button>
      </div>
      <div class="fm-side">
        <button class="fm-btn" data-a="in">+</button>
        <button class="fm-btn" data-a="out">−</button>
        <button class="fm-btn" data-a="me" title="Centre on me">◎</button>
        <button class="fm-btn fm-mode" data-a="mode">Map</button>
      </div>
      <div class="fm-legend"></div>`;
    game.ui.appendChild(this.el);
    this.cv = this.el.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    this.el.querySelector('.fm-close').onclick = () => this.close();
    this.el.querySelector('.fm-side').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      game.audio.sfx('click', { volume: 0.4 });
      if (a === 'in') this.zoomAt(1.6); else if (a === 'out') this.zoomAt(1 / 1.6);
      else if (a === 'me') { const p = this.player(); this.cx = p.x; this.cz = p.z; this.draw(); }
      else if (a === 'mode') { this.mode = this.mode === 'sat' ? 'map' : 'sat'; e.target.textContent = this.mode === 'sat' ? 'Map' : 'Satellite'; this.draw(); }
    });
    // pointer: drag + pinch
    const ptrs = new Map();
    let pinch0 = 0, scale0 = 1;
    this.cv.addEventListener('pointerdown', (e) => { this.cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); scale0 = this.scale; } });
    this.cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) { this.cx -= (e.clientX - prev[0]) / this.scale; this.cz -= (e.clientY - prev[1]) / this.scale; this.draw(); }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); this.setScale(scale0 * d / Math.max(1, pinch0)); }
    });
    const up = (e) => ptrs.delete(e.pointerId);
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY); }, { passive: false });
    addEventListener('resize', () => this.isOpen && this.draw());
    this.onKey = (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyM') { e.preventDefault(); e.stopPropagation(); this.close(); }
      else if (e.key === '+' || e.key === '=') this.zoomAt(1.4);
      else if (e.key === '-') this.zoomAt(1 / 1.4);
    };
    addEventListener('keydown', this.onKey, true);
    this.isOpen = false;
  }

  player() { const c = this.game.mapCtx; return c?.pos || this.game.focus; }

  open() {
    if (this.isOpen) return;
    this.isOpen = true; this.wasPaused = this.game.paused; this.game.paused = true;
    const p = this.player();
    this.cx = p.x; this.cz = p.z;
    this.scale = Math.min(innerWidth, innerHeight) / 2600;
    this.el.classList.add('on');
    this.legend();
    this.draw();
    this.game.audio.sfx('whoosh', { volume: 0.4 });
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.game.paused = this.wasPaused;
    this.el.classList.remove('on');
  }
  toggle() { this.isOpen ? this.close() : this.open(); }

  setScale(s) { this.scale = Math.max(0.02, Math.min(6, s)); this.draw(); }
  zoomAt(f, sx = innerWidth / 2, sy = innerHeight / 2) {
    const wx = this.cx + (sx - innerWidth / 2) / this.scale, wz = this.cz + (sy - innerHeight / 2) / this.scale;
    const ns = Math.max(0.02, Math.min(6, this.scale * f));
    this.cx = wx - (sx - innerWidth / 2) / ns; this.cz = wz - (sy - innerHeight / 2) / ns;
    this.scale = ns; this.draw();
  }

  legend() {
    const c = this.game.mapCtx;
    this.el.querySelector('.fm-legend').innerHTML = `<span><i class="lg-me"></i>You</span>${c?.route ? '<span><i class="lg-route"></i>Route</span>' : ''}${c?.dest ? '<span><i class="lg-dest"></i>Destination</span>' : ''}<span><i class="lg-venue"></i>Wedding venues</span>`;
  }

  tile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let t = this.tiles.get(key);
    if (!t) {
      const img = new Image(); img.crossOrigin = 'anonymous';
      t = { img, ok: false };
      img.onload = () => { t.ok = true; if (this.isOpen) this.queueDraw(); };
      img.src = CONFIG.tiles.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
      this.tiles.set(key, t);
      if (this.tiles.size > 500) { const first = this.tiles.keys().next().value; this.tiles.delete(first); }
    }
    return t;
  }
  queueDraw() { if (this._q) return; this._q = requestAnimationFrame(() => { this._q = 0; this.draw(); }); }

  draw() {
    if (!this.isOpen) return;
    const dpr = Math.min(2, devicePixelRatio), W = innerWidth, H = innerHeight;
    if (this.cv.width !== W * dpr) { this.cv.width = W * dpr; this.cv.height = H * dpr; }
    const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = this.scale, cx = this.cx, cz = this.cz;
    const X = (x) => (x - cx) * S + W / 2, Y = (z) => (z - cz) * S + H / 2;
    const x0 = cx - W / 2 / S, x1 = cx + W / 2 / S, z0 = cz - H / 2 / S, z1 = cz + H / 2 / S;
    const net = this.game.world.net;
    // background
    if (this.mode === 'sat') {
      ctx.fillStyle = '#20301f'; ctx.fillRect(0, 0, W, H);
      const z = Math.max(11, Math.min(18, Math.round(Math.log2((EARTH * K * S * dpr) / 256))));
      const [ax, ay] = localToTile(x0, z0, z), [bx, by] = localToTile(x1, z1, z);
      for (let ty = Math.floor(ay); ty <= Math.floor(by); ty++) for (let tx = Math.floor(ax); tx <= Math.floor(bx); tx++) {
        const t = this.tile(z, tx, ty); const b = tileBounds(z, tx, ty);
        if (t.ok) ctx.drawImage(t.img, X(b.x0), Y(b.z0), b.size * S + 0.6, b.size * S + 0.6);
      }
      ctx.fillStyle = 'rgba(10,30,20,0.12)'; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#f3ead6'; ctx.fillRect(0, 0, W, H);
    }
    // roads
    const sat = this.mode === 'sat';
    const passes = sat ? [['major', 'rgba(255,255,255,0.55)', 0.5]] : [['dirt', '#e2d3b4', 0.9], ['street', '#ffffff', 1], ['major', '#f6e5a8', 1.1]];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!sat) { // outlines
      ctx.strokeStyle = '#d6c6a4';
      for (const r of net.roads) { if (r.cls === 'dirt') continue; this.path(ctx, r.p, X, Y, x0, x1, z0, z1); ctx.lineWidth = Math.max(1.5, r.w * S + 2); ctx.stroke(); }
    }
    for (const [cls, col, k] of passes) {
      ctx.strokeStyle = col;
      for (const r of net.roads) { if (r.cls !== cls) continue; if (!this.path(ctx, r.p, X, Y, x0, x1, z0, z1)) continue; ctx.lineWidth = Math.max(sat ? 1 : 1, r.w * S * k); ctx.stroke(); }
    }
    // route + destination
    const c = this.game.mapCtx;
    if (c?.route?.length) {
      ctx.strokeStyle = '#0f4a38'; ctx.lineWidth = 9; ctx.beginPath(); c.route.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.z)) : ctx.moveTo(X(p.x), Y(p.z)))); ctx.stroke();
      ctx.strokeStyle = '#e9c977'; ctx.lineWidth = 5; ctx.stroke();
    }
    // road names (major, when zoomed in)
    if (S > 0.25) {
      ctx.font = `italic 600 ${13}px "Cormorant Garamond", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const done = new Set();
      for (const r of net.roads) {
        if (r.cls !== 'major' || !r.n || done.has(r.n + Math.round(r.p[0] / 800))) continue;
        const m = (r.p.length / 4 | 0) * 2; const px = r.p[m], pz = r.p[m + 1];
        if (px < x0 || px > x1 || pz < z0 || pz > z1 || m + 3 >= r.p.length) continue;
        done.add(r.n + Math.round(r.p[0] / 800));
        let ang = Math.atan2(r.p[m + 3] - pz, r.p[m + 2] - px); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        ctx.save(); ctx.translate(X(px), Y(pz)); ctx.rotate(ang);
        ctx.lineWidth = 4; ctx.strokeStyle = sat ? 'rgba(0,0,0,0.7)' : '#fffaf0'; ctx.strokeText(r.n, 0, -1); ctx.fillStyle = sat ? '#fff' : '#6b5420'; ctx.fillText(r.n, 0, -1);
        ctx.restore();
      }
    }
    // venues
    const places = this.game.world.places;
    for (const [key, name, sub] of PLACES) {
      const p = places[key]; if (!p) continue;
      const sx = X(p.x), sy = Y(p.z);
      ctx.fillStyle = '#9a7620'; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f6e5a8'; ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '600 12px Cinzel, serif'; const w1 = ctx.measureText(name.toUpperCase()).width;
      ctx.font = 'italic 13px "Cormorant Garamond", serif'; const w2 = ctx.measureText(sub).width;
      const bw = Math.max(w1, w2) + 20;
      ctx.fillStyle = 'rgba(247,240,225,0.95)'; ctx.strokeStyle = '#b8912b'; ctx.lineWidth = 1;
      roundRect(ctx, sx + 14, sy - 20, bw, 38, 8); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#9a7620'; ctx.font = '600 12px Cinzel, serif'; ctx.fillText(name.toUpperCase(), sx + 24, sy - 4);
      ctx.fillStyle = '#40331f'; ctx.font = 'italic 13px "Cormorant Garamond", serif'; ctx.fillText(sub, sx + 24, sy + 11);
    }
    // landmarks on the arrival route
    const marks = this.game.world.routes?.arrival?.marks || {};
    for (const [k, label] of [['darau', 'Darau Chauraha · Mithai'], ['azad', 'Azad Nagar']]) {
      const m = marks[k]; if (!m) continue;
      const sx = X(m.x), sy = Y(m.z);
      ctx.fillStyle = '#0f4a38'; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e9c977'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = 'italic 600 14px "Cormorant Garamond", serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = sat ? 'rgba(0,0,0,0.75)' : '#fffaf0'; ctx.strokeText(label, sx + 10, sy);
      ctx.fillStyle = sat ? '#fff' : '#0f4a38'; ctx.fillText(label, sx + 10, sy);
    }
    if (c?.dest) {
      const sx = X(c.dest.x), sy = Y(c.dest.z);
      ctx.strokeStyle = '#e9b8b5'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#0a2e21'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 20, 0, Math.PI * 2); ctx.stroke();
    }
    // player
    const p = this.player(), h = c?.heading ?? 0;
    const px = X(p.x), py = Y(p.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(Math.cos(h), Math.sin(h)) - Math.PI / 2);
    ctx.fillStyle = 'rgba(15,74,56,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f4a38'; ctx.strokeStyle = '#e9c977'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(11, 11); ctx.lineTo(0, 5); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // scale bar
    const m = niceMeters(120 / S);
    ctx.fillStyle = sat ? '#fff' : '#40331f'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
    const bx = 20, by = H - 28 - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + m * S, by); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5); ctx.moveTo(bx + m * S, by - 5); ctx.lineTo(bx + m * S, by + 5); ctx.stroke();
    ctx.font = '600 12px Cinzel, serif'; ctx.textAlign = 'left'; ctx.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, bx, by - 10);
  }

  path(ctx, p, X, Y, x0, x1, z0, z1) {
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let i = 0; i < p.length; i += 2) { const x = p[i], z = p[i + 1]; if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z; }
    if (maxx < x0 || minx > x1 || maxz < z0 || minz > z1) return false;
    ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[1]));
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
    return true;
  }
}

function niceMeters(m) { const steps = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]; return steps.find((s) => s >= m) || 10000; }
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
