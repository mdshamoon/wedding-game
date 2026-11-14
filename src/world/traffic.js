// Ambient traffic on the real road network: e-rickshaws, motorbikes, trucks, buses, cars.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildCarModel } from '../entities/Car.js';
import { mat } from './decor.js';

function wheel(r, w, x, y, z, g) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), mat(0x151515));
  m.position.set(x, y, z); g.add(m); return m;
}

function eRickshaw(seed) {
  const g = new THREE.Group();
  const col = [0x2e7d32, 0x1565c0, 0xf9a825, 0x00838f][seed % 4];
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.1, 2.4, 2, 0.12), mat(col)); body.position.set(0, 0.95, 0); g.add(body);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.08, 2.5, 2, 0.04), mat(0x1a1a1a)); roof.position.set(0, 1.9, 0); g.add(roof);
  for (const [x, z] of [[-0.6, 1.1], [0.6, 1.1], [-0.6, -1.1], [0.6, -1.1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), mat(0x888888)); p.position.set(x, 1.5, z); g.add(p); }
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.04), mat(0x223038)); win.position.set(0, 1.55, 1.18); g.add(win);
  wheel(0.25, 0.14, 0, 0.25, 1.0, g); wheel(0.25, 0.14, -0.55, 0.25, -0.9, g); wheel(0.25, 0.14, 0.55, 0.25, -0.9, g);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, len: 2.6, speed: 7 };
}

function motorbike(seed) {
  const g = new THREE.Group();
  const col = [0x111111, 0xb71c1c, 0x0d47a1, 0x424242][seed % 4];
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.35, 0.4, 1.4, 2, 0.1), mat(col)); body.position.set(0, 0.7, 0); g.add(body);
  wheel(0.32, 0.1, 0, 0.32, 0.65, g); wheel(0.32, 0.1, 0, 0.32, -0.65, g);
  // rider
  const shirt = [0xf5f5f5, 0x5d4037, 0x1e88e5, 0x8e24aa, 0x2e7d32][seed % 5];
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.45, 4, 8), mat(shirt)); torso.position.set(0, 1.25, -0.1); torso.rotation.x = 0.25; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(seed % 3 ? 0x111111 : 0xb98361)); head.position.set(0, 1.72, 0.0); g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.6), mat(0x263238)); legs.position.set(0, 0.85, 0.05); g.add(legs);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, len: 1.8, speed: 11 };
}

function truck(seed) {
  const g = new THREE.Group();
  const cab = [0xf57f17, 0xc62828, 0x1565c0, 0x2e7d32][seed % 4];
  const c = new THREE.Mesh(new RoundedBoxGeometry(2.3, 2.2, 2.0, 2, 0.15), mat(cab)); c.position.set(0, 1.6, 2.4); g.add(c);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.05), mat(0x1d2a33)); ws.position.set(0, 2.1, 3.41); g.add(ws);
  // painted Indian truck body
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 256, 0); grd.addColorStop(0, '#f9a825'); grd.addColorStop(0.5, '#e53935'); grd.addColorStop(1, '#1e88e5');
  x.fillStyle = grd; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 10; i++) { x.fillStyle = ['#fff', '#2e7d32', '#fdd835', '#6a1b9a'][i % 4]; x.beginPath(); x.arc(20 + i * 24, 110, 8, 0, 7); x.fill(); }
  x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.fillText('HORN OK PLEASE', 128, 60);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 4.6), [mat(0xd84315), mat(0xd84315), mat(0x5d4037), mat(0x5d4037), new THREE.MeshLambertMaterial({ map: t }), new THREE.MeshLambertMaterial({ map: t })]);
  bed.position.set(0, 1.85, -0.9); g.add(bed);
  const tarp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4.6, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2 * 0), mat(0x1b5e20)); tarp.rotation.z = Math.PI / 2; tarp.rotation.y = Math.PI / 2; tarp.position.set(0, 3.05, -0.9); void tarp;
  for (const z of [2.4, -0.5, -2.2]) for (const s of [-1, 1]) wheel(0.5, 0.3, s * 1.05, 0.5, z, g);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, len: 7.2, speed: 13 };
}

function bus(seed) {
  const g = new THREE.Group();
  const col = [0xf5f5f5, 0x1565c0, 0xc62828][seed % 3];
  const b = new THREE.Mesh(new RoundedBoxGeometry(2.5, 2.8, 10.5, 2, 0.2), mat(col)); b.position.set(0, 1.9, 0); g.add(b);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.3, 10.3), mat(0xf9a825)); stripe.position.set(0, 1.3, 0); g.add(stripe);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 9), mat(0x1d2a33)); w.position.set(s * 1.26, 2.5, 0); g.add(w); }
  const ws = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.05), mat(0x1d2a33)); ws.position.set(0, 2.4, 5.26); g.add(ws);
  for (const z of [3.5, -3.5]) for (const s of [-1, 1]) wheel(0.5, 0.3, s * 1.1, 0.5, z, g);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, len: 10.5, speed: 12 };
}

const MAKERS = [
  [eRickshaw, 3, ['street', 'major']], [motorbike, 4, ['street', 'major', 'dirt']], [truck, 1.2, ['major']], [bus, 0.6, ['major']],
  [(s) => { const m = buildCarModel({ paint: ['silver', 'black', 'pearl', 'red', 'blue'][s % 5], type: s % 2 ? 'hatch' : 'suv' }); return { group: m.group, len: m.length, speed: 12, wheels: m.wheels }; }, 3, ['street', 'major']],
];

export class Traffic {
  constructor(game, { count = 22, radius = 320 } = {}) {
    this.game = game; this.net = game.world.net; this.count = count; this.radius = radius;
    this.items = []; this.seed = 1;
  }

  spawn(focus) {
    const segs = [...this.net.segmentsNear(focus.x, focus.z, this.radius)];
    for (let tries = 0; tries < 12 && segs.length; tries++) {
      const s = segs[(Math.random() * segs.length) | 0];
      const road = this.net.roads[s.r];
      const totalW = MAKERS.reduce((a, m) => a + (m[2].includes(road.cls) ? m[1] : 0), 0);
      if (!totalW || road.p.length < 4) continue;
      const mid = new THREE.Vector3((s.ax + s.bx) / 2, 0, (s.az + s.bz) / 2);
      if (mid.distanceTo(focus) < 60) continue; // don't pop in right next to the player
      let r = Math.random() * totalW, maker = MAKERS[0];
      for (const m of MAKERS) { if (!m[2].includes(road.cls)) continue; r -= m[1]; if (r <= 0) { maker = m; break; } }
      const v = maker[0](this.seed++);
      const pts = []; for (let i = 0; i < road.p.length; i += 2) pts.push(new THREE.Vector3(road.p[i], 0, road.p[i + 1]));
      const dir = Math.random() < 0.5 ? 1 : -1;
      if (dir < 0) pts.reverse();
      // start index nearest to the chosen segment
      let idx = 0, bd = 1e9; pts.forEach((p, i) => { const d = p.distanceToSquared(mid); if (d < bd) { bd = d; idx = i; } });
      const lane = Math.min(road.w / 4, 1.8) * (road.o ? 0 : 1);
      const it = { v, pts, i: Math.min(idx, pts.length - 2), t: 0, lane, speed: v.speed * (0.8 + Math.random() * 0.4), cur: 0 };
      it.cur = it.speed;
      this.game.scene.add(v.group);
      this.items.push(it);
      return;
    }
  }

  update(dt, focus, player) {
    while (this.items.length < this.count) { const n = this.items.length; this.spawn(focus); if (this.items.length === n) break; }
    for (const it of [...this.items]) {
      const a = it.pts[it.i], b = it.pts[it.i + 1];
      if (!b) { this.kill(it); continue; }
      const seg = b.clone().sub(a); const L = seg.length() || 1; seg.divideScalar(L);
      const side = new THREE.Vector3(-seg.z, 0, seg.x).multiplyScalar(-it.lane); // keep left (India drives on the left)
      const pos = a.clone().addScaledVector(seg, it.t).add(side);
      // brake for the player
      let want = it.speed;
      if (player) {
        const toP = player.pos.clone().sub(pos); const ahead = toP.dot(seg);
        if (ahead > 0 && ahead < 14 && Math.abs(toP.dot(new THREE.Vector3(-seg.z, 0, seg.x))) < 2.4) want = Math.max(0, (ahead - 5) * 0.8);
        if (toP.length() < 2.6 && Math.abs(player.speed) > 4) { player.speed *= 0.5; this.game.audio.sfx('crash', { volume: 0.4 }); this.game.audio.horn(); }
      }
      it.cur += (want - it.cur) * Math.min(1, dt * 2);
      it.t += it.cur * dt;
      while (it.t > L && it.i < it.pts.length - 2) { it.t -= L; it.i++; }
      if (it.i >= it.pts.length - 2 && it.t > L) { this.kill(it); continue; }
      it.v.group.position.copy(pos);
      const yaw = Math.atan2(seg.x, seg.z);
      let d = yaw - it.v.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      it.v.group.rotation.y += d * Math.min(1, dt * 6);
      if (it.v.wheels) for (const w of it.v.wheels) w.spin.rotation.x += it.cur * dt / 0.38;
      if (pos.distanceTo(focus) > this.radius * 1.4) this.kill(it);
    }
  }

  kill(it) { this.game.scene.remove(it.v.group); this.items.splice(this.items.indexOf(it), 1); }
  dispose() { for (const it of [...this.items]) this.kill(it); }
}
