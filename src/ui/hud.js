// In-game HUD: objective, minimap, speed, toasts, centre messages, score, hints.
export class HUD {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="objective" style="display:none"></div>
      <div class="dist" style="display:none"></div>
      <div class="minimap" style="display:none" title="Open map (M)"><canvas width="340" height="340"></canvas></div>
      <button class="map-btn" style="display:none">MAP ▸</button>
      <div class="speedo" style="display:none"><div class="v">0</div><div class="u">KM/H</div></div>
      <div class="toast"><div class="who"></div><div class="msg"></div></div>
      <div class="score" style="display:none"></div>
      <div class="center-msg"></div>
      <div class="hint" style="display:none"></div>
      <div class="meter" style="display:none"><div></div></div>`;
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.$obj = q('.objective'); this.$dist = q('.dist'); this.$map = q('.minimap'); this.$speed = q('.speedo');
    this.$mapBtn = q('.map-btn'); this.$toast = q('.toast'); this.$score = q('.score'); this.$center = q('.center-msg'); this.$hint = q('.hint'); this.$meter = q('.meter');
    this.ctx = this.$map.querySelector('canvas').getContext('2d');
    this.toastTimer = 0; this.centerTimer = 0;
    this.toastQueue = [];
  }

  show(parts) {
    for (const [k, v] of Object.entries(parts)) { const el = this['$' + k]; if (el) el.style.display = v ? '' : 'none'; }
    if ('map' in parts) this.$mapBtn.style.display = parts.map ? '' : 'none';
  }
  onMapClick(fn) { this.$map.onclick = fn; this.$mapBtn.onclick = fn; }
  hideAll() { this.show({ obj: 0, dist: 0, map: 0, speed: 0, score: 0, hint: 0, meter: 0 }); }
  objective(label, text) { this.$obj.style.display = ''; this.$obj.innerHTML = label ? `<b>${label}</b>${text}` : text; }
  distance(m) { this.$dist.style.display = ''; this.$dist.textContent = m > 1000 ? `${(m / 1000).toFixed(1)} km to go` : `${Math.max(0, Math.round(m))} m to go`; }
  speed(kmh) { this.$speed.querySelector('.v').textContent = Math.round(Math.abs(kmh)); }
  score(text) { this.$score.style.display = ''; this.$score.textContent = text; }
  hint(text) { this.$hint.style.display = text ? '' : 'none'; this.$hint.textContent = text || ''; }
  meter(v) { this.$meter.style.display = ''; this.$meter.firstElementChild.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`; }

  toast(who, msg, seconds = 4) {
    this.toastQueue.push({ who, msg, seconds });
    if (this.toastTimer <= 0) this._nextToast();
  }
  _nextToast() {
    const t = this.toastQueue.shift();
    if (!t) { this.$toast.classList.remove('on'); return; }
    this.$toast.querySelector('.who').textContent = t.who;
    this.$toast.querySelector('.msg').textContent = t.msg;
    this.$toast.classList.add('on');
    this.toastTimer = t.seconds;
  }
  center(text, seconds = 1.6) { this.$center.textContent = text; this.$center.classList.add('on'); this.centerTimer = seconds; }

  update(dt) {
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) { this.$toast.classList.remove('on'); setTimeout(() => this._nextToast(), 400); } }
    if (this.centerTimer > 0) { this.centerTimer -= dt; if (this.centerTimer <= 0) this.$center.classList.remove('on'); }
  }

  // Minimap: roads around the player rotated heading-up, route in gold, destination pin.
  drawMap(net, pos, heading, route, dest, radius = 260) {
    const ctx = this.ctx, S = 340, C = S / 2, k = C / radius;
    const fx = Math.sin(heading), fz = Math.cos(heading), rx = -Math.cos(heading), rz = Math.sin(heading);
    const tx = (x, z) => { const dx = x - pos.x, dz = z - pos.z; return [C + (dx * rx + dz * rz) * k, C - (dx * fx + dz * fz) * k]; };
    ctx.fillStyle = '#0d3a2b'; ctx.fillRect(0, 0, S, S);
    // subtle grid pattern
    ctx.strokeStyle = 'rgba(212,175,55,0.06)'; ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    const segs = net.segmentsNear(pos.x, pos.z, radius * 1.45);
    for (const pass of ['dirt', 'street', 'major']) {
      ctx.strokeStyle = pass === 'major' ? '#f7f0e1' : pass === 'street' ? 'rgba(247,240,225,0.55)' : 'rgba(200,170,120,0.35)';
      ctx.beginPath();
      for (const s of segs) {
        const r = net.roads[s.r]; if (r.cls !== pass) continue;
        ctx.lineWidth = Math.max(1.5, s.hw * 2 * k * 0.9);
        const [ax, ay] = tx(s.ax, s.az), [bx, by] = tx(s.bx, s.bz);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
    if (route && route.length) {
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 6; ctx.beginPath();
      route.forEach((p, i) => { const [x, y] = tx(p.x, p.z); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    if (dest) {
      let [x, y] = tx(dest.x, dest.z);
      const dx = x - C, dy = y - C, d = Math.hypot(dx, dy), lim = C - 18;
      if (d > lim) { x = C + dx / d * lim; y = C + dy / d * lim; }
      ctx.fillStyle = '#e9b8b5'; ctx.strokeStyle = '#0a2e21'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0a2e21'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    ctx.fillStyle = '#d4af37'; ctx.strokeStyle = '#0a2e21'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(C, C - 14); ctx.lineTo(C + 10, C + 10); ctx.lineTo(C, C + 5); ctx.lineTo(C - 10, C + 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    // north marker
    const [nx, ny] = (() => { const ang = Math.atan2(-rz * 0 + -1 * rz, 1); void ang; const d = { x: pos.x, z: pos.z - 1 }; const [a, b] = tx(d.x, d.z); const vx = a - C, vy = b - C, L = Math.hypot(vx, vy) || 1; return [C + vx / L * (C - 14), C + vy / L * (C - 14)]; })();
    ctx.fillStyle = '#f7f0e1'; ctx.font = '600 18px Cinzel, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', nx, ny);
  }
}
