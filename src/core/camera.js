import * as THREE from 'three';

// Smooth third-person chase camera for vehicles and characters, plus scripted shots for cutscenes.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.target = null;      // { pos: Vector3, heading: number, speed?: number }
    this.dist = 7.5; this.height = 3.0; this.lookAhead = 4; this.lookHeight = 1.2;
    this.pos = new THREE.Vector3(0, 10, 10);
    this.look = new THREE.Vector3();
    this.camYaw = 0;
    this.shot = null;
    this.shake = 0;
    this.orbitYaw = 0;
  }

  follow(target, { dist = 7.5, height = 3.0, lookAhead = 4, lookHeight = 1.2, snap = true } = {}) {
    this.mode = 'chase'; this.target = target; this.shot = null;
    Object.assign(this, { dist, height, lookAhead, lookHeight });
    if (snap) {
      this.camYaw = target.heading;
      this.update(1, true);
    }
  }

  // Scripted move: from {pos, look} to {pos, look} over duration seconds with easing. Returns promise.
  moveTo(to, duration = 2, from = null) {
    const f = from || { pos: this.camera.position.clone(), look: this.look.clone() };
    this.mode = 'shot';
    return new Promise((resolve) => { this.shot = { f, to, t: 0, d: Math.max(0.001, duration), resolve, ease: to.ease || easeInOut }; });
  }

  // Follow a curve of camera positions while looking at a (possibly moving) target.
  path(points, duration, lookFn) {
    const curve = new THREE.CatmullRomCurve3(points);
    this.mode = 'path';
    return new Promise((resolve) => { this.shot = { curve, t: 0, d: duration, lookFn, resolve }; });
  }

  orbit(center, radius, height, speed = 0.15) {
    this.mode = 'orbit'; this.orbitC = center.clone(); this.orbitR = radius; this.orbitH = height; this.orbitS = speed;
    this.orbitYaw = Math.atan2(this.camera.position.x - center.x, this.camera.position.z - center.z);
  }

  set(pos, look) { this.mode = 'static'; this.camera.position.copy(pos); this.look.copy(look); this.camera.lookAt(this.look); }

  update(dt, snap = false) {
    const cam = this.camera;
    if (this.mode === 'chase' && this.target) {
      const t = this.target;
      // camera yaw lags behind the heading for a nice swing
      let d = t.heading - this.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * (snap ? 1 : Math.min(1, dt * (3.2 + Math.abs(t.speed ?? 0) * 0.06)));
      const back = (t.speed ?? 0) < -1 ? -1 : 1;
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      const spd = Math.abs(t.speed ?? 0);
      const dist = this.dist + spd * 0.06;
      const want = new THREE.Vector3(t.pos.x - fx * dist * back, t.pos.y + this.height + spd * 0.015, t.pos.z - fz * dist * back);
      const lk = new THREE.Vector3(t.pos.x + Math.sin(t.heading) * this.lookAhead, t.pos.y + this.lookHeight, t.pos.z + Math.cos(t.heading) * this.lookAhead);
      if (snap) { this.pos.copy(want); this.look.copy(lk); }
      else { const k = 5 + spd * 0.18; this.pos.lerp(want, Math.min(1, dt * k)); this.look.lerp(lk, Math.min(1, dt * (8 + spd * 0.2))); }
      cam.position.copy(this.pos);
      const fov = 58 + Math.min(14, spd * 0.35);
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
    } else if (this.mode === 'shot' && this.shot) {
      const s = this.shot; s.t += dt;
      const k = s.ease(Math.min(1, s.t / s.d));
      cam.position.lerpVectors(s.f.pos, s.to.pos, k);
      this.look.lerpVectors(s.f.look, s.to.look, k);
      if (s.t >= s.d && s.resolve) { const r = s.resolve; s.resolve = null; r(); }
    } else if (this.mode === 'path' && this.shot) {
      const s = this.shot; s.t += dt;
      const k = easeInOut(Math.min(1, s.t / s.d));
      cam.position.copy(s.curve.getPointAt(k));
      this.look.copy(s.lookFn(k));
      if (s.t >= s.d && s.resolve) { const r = s.resolve; s.resolve = null; r(); }
    } else if (this.mode === 'orbit') {
      this.orbitYaw += dt * this.orbitS;
      cam.position.set(this.orbitC.x + Math.sin(this.orbitYaw) * this.orbitR, this.orbitC.y + this.orbitH, this.orbitC.z + Math.cos(this.orbitYaw) * this.orbitR);
      this.look.copy(this.orbitC);
    }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2); cam.position.x += (Math.random() - 0.5) * this.shake * 0.3; cam.position.y += (Math.random() - 0.5) * this.shake * 0.3; }
    cam.lookAt(this.look);
  }
}

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
