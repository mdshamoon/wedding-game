// Lightweight particle effects: haldi powder, water splash, petals, confetti, fireworks.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const petalGeo = new THREE.PlaneGeometry(0.06, 0.04);
const confGeo = new THREE.PlaneGeometry(0.05, 0.08);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.systems = [];
    // point-sprite pool for glowy particles (powder, water, sparks)
    this.max = 4000;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.grav = new Float32Array(this.max);
    this.drag = new Float32Array(this.max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.soft = new THREE.Points(g.clone(), new THREE.PointsMaterial({ size: 0.12, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
    scene.add(this.points);
    // instanced petals / confetti
    this.petals = this._instPool(petalGeo, 1500);
    this.conf = this._instPool(confGeo, 1500);
  }

  _instPool(geo, n) {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) { m.setMatrixAt(i, zero); m.setColorAt(i, new THREE.Color(1, 1, 1)); }
    this.scene.add(m);
    return { m, n, p: new Float32Array(n * 3), v: new Float32Array(n * 3), r: new Float32Array(n * 3), w: new Float32Array(n * 3), life: new Float32Array(n), cursor: 0 };
  }

  emit(x, y, z, vx, vy, vz, color, life = 1.2, grav = 9.8, drag = 0.8) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag;
  }

  haldi(p, n = 50) {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.setHSL(0.12 + Math.random() * 0.03, 1, 0.45 + Math.random() * 0.15);
      this.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, c, 0.8 + Math.random() * 0.6, 3, 2.5);
    }
  }
  splash(p, dir, n = 120) {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.setRGB(0.55 + Math.random() * 0.2, 0.75 + Math.random() * 0.15, 1);
      const s = 3 + Math.random() * 4;
      this.emit(p.x, p.y, p.z, dir.x * s + (Math.random() - 0.5) * 2.5, 2 + Math.random() * 3, dir.z * s + (Math.random() - 0.5) * 2.5, c, 0.9 + Math.random() * 0.4, 9.8, 0.4);
    }
  }
  firework(p, hue = Math.random()) {
    const c = new THREE.Color();
    for (let i = 0; i < 160; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), s = 9 + Math.random() * 3;
      c.setHSL((hue + Math.random() * 0.06) % 1, 0.9, 0.6);
      this.emit(p.x, p.y, p.z, Math.sin(ph) * Math.cos(th) * s, Math.cos(ph) * s, Math.sin(ph) * Math.sin(th) * s, c, 1.6 + Math.random() * 0.8, 3, 1.4);
    }
    c.setRGB(1, 0.95, 0.8);
    for (let i = 0; i < 40; i++) this.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, c, 0.5, 0, 2);
  }
  launch(from, height = 40, hue) { // rocket trail then burst
    const s = { t: 0, from: from.clone(), h: height, hue: hue ?? Math.random(), done: false };
    this.systems.push((dt) => {
      s.t += dt; const y = from.y + s.t * 34;
      this.emit(from.x + (Math.random() - 0.5) * 0.2, y, from.z, 0, -2, 0, new THREE.Color(1, 0.8, 0.5), 0.4, 0, 1);
      if (y >= from.y + s.h) { this.firework(new THREE.Vector3(from.x, y, from.z), s.hue); return false; }
      return true;
    });
  }

  _spawnInst(pool, p, spread, colors, up = 1) {
    const i = pool.cursor; pool.cursor = (pool.cursor + 1) % pool.n;
    pool.p[i * 3] = p.x + (Math.random() - 0.5) * spread; pool.p[i * 3 + 1] = p.y + Math.random() * up; pool.p[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
    pool.v[i * 3] = (Math.random() - 0.5) * 0.6; pool.v[i * 3 + 1] = -0.6 - Math.random() * 0.6; pool.v[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    pool.r[i * 3] = Math.random() * 6; pool.r[i * 3 + 1] = Math.random() * 6; pool.r[i * 3 + 2] = Math.random() * 6;
    pool.w[i * 3] = (Math.random() - 0.5) * 6; pool.w[i * 3 + 1] = (Math.random() - 0.5) * 6; pool.w[i * 3 + 2] = (Math.random() - 0.5) * 6;
    pool.life[i] = 7;
    pool.m.setColorAt(i, new THREE.Color(colors[(Math.random() * colors.length) | 0]));
    pool.m.instanceColor.needsUpdate = true;
  }
  petalShower(p, n = 200, spread = 6, colors = [0xffffff, 0xf4c7cc, 0xe9b8b5, 0xd94a64]) { for (let i = 0; i < n; i++) this._spawnInst(this.petals, p, spread, colors, 3); }
  confetti(p, n = 200, spread = 6, colors = [0xd4af37, 0xf6e5a8, 0xffffff, 0xe9b8b5, 0x0f4a38]) { for (let i = 0; i < n; i++) this._spawnInst(this.conf, p, spread, colors, 3); }
  // dried dates (chhuare) are brown petals that fall faster
  chhuare(p, n = 40) { for (let i = 0; i < n; i++) this._spawnInst(this.conf, p, 3, [0x6b3a1f, 0x7a4526, 0x5a2e16], 1); }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.life[i] <= 0) { this.pos[k + 1] = -1000; }
      const fade = Math.max(0, this.life[i] / this.maxLife[i]);
      if (fade < 0.3) { this.col[k] *= 0.9; this.col[k + 1] *= 0.9; this.col[k + 2] *= 0.9; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), zero = new THREE.Vector3(0, 0, 0);
    for (const pool of [this.petals, this.conf]) {
      let any = false;
      for (let i = 0; i < pool.n; i++) {
        if (pool.life[i] <= 0) continue; any = true;
        pool.life[i] -= dt; const k = i * 3;
        pool.p[k] += (pool.v[k] + Math.sin(pool.r[k] * 2) * 0.4) * dt; pool.p[k + 1] += pool.v[k + 1] * dt; pool.p[k + 2] += (pool.v[k + 2] + Math.cos(pool.r[k + 1] * 2) * 0.4) * dt;
        pool.r[k] += pool.w[k] * dt; pool.r[k + 1] += pool.w[k + 1] * dt; pool.r[k + 2] += pool.w[k + 2] * dt;
        const ground = pool.p[k + 1] <= 0.15;
        if (ground) { pool.p[k + 1] = 0.15; pool.v[k] = pool.v[k + 2] = 0; pool.w[k] = pool.w[k + 1] = pool.w[k + 2] = 0; }
        e.set(ground ? -Math.PI / 2 : pool.r[k], pool.r[k + 1], ground ? 0 : pool.r[k + 2]); q.setFromEuler(e);
        m4.compose(v.set(pool.p[k], pool.p[k + 1], pool.p[k + 2]), q, pool.life[i] > 0 ? s : zero);
        pool.m.setMatrixAt(i, m4);
      }
      if (any) pool.m.instanceMatrix.needsUpdate = true;
    }
    this.systems = this.systems.filter((f) => f(dt) !== false);
  }

  dispose() { this.scene.remove(this.points, this.petals.m, this.conf.m); }
}
