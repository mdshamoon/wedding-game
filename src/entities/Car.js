import * as THREE from 'three';

export { buildCarModel, PAINTS, CAR_STYLES } from './carModel.js';
import { buildCarModel } from './carModel.js';

export class Car {
  constructor(world, opts = {}) {
    this.world = world;
    const m = buildCarModel(opts);
    this.model = m;
    this.object3d = m.group;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.vmax = opts.vmax ?? m.perf.vmax;
    this.boostMax = opts.boostMax ?? m.perf.boost;
    this.accel = m.perf.accel;
    this.offroad = false;
    this.lastHit = 0;
    this.time = 0;
    this.pitch = 0; this.roll = 0;
    this.headlight = null;
    this.onCrash = null;
    this.controlsEnabled = true;
  }

  place(x, z, heading) { this.pos.set(x, 0, z); this.heading = heading; this.speed = 0; this.sync(); }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  enableHeadlights(scene, on) {
    if (on && !this.headlight) {
      const l = new THREE.SpotLight(0xfff2d8, 260, 95, 0.6, 0.45, 1.4);
      l.position.set(0, 0.9, this.model.length / 2);
      l.target.position.set(0, 0, this.model.length / 2 + 20);
      this.object3d.add(l, l.target);
      this.headlight = l;
    }
    if (this.headlight) this.headlight.visible = on;
    this.model.headM.emissiveIntensity = on ? 3 : 0.4;
  }

  // throttle -1..1, steerIn -1..1 (right +), brake bool, boost bool
  drive(dt, throttle, steerIn, brake = false, boost = false) {
    this.time += dt;
    const q = this.world.net.query(this.pos.x, this.pos.z);
    this.offroad = !q || q.edge > (q.road.cls === 'major' ? 3.2 : 2.0); // drawn shoulders count as road
    this.road = q;
    let vmax = boost ? this.boostMax : this.vmax;
    if (this.offroad) vmax = Math.min(vmax, 14);
    else if (q.road.cls === 'dirt') vmax = Math.min(vmax, 17);
    const accel = (this.accel || 8.5) * (boost ? 1.3 : 1);
    let a = 0;
    if (throttle > 0.05) {
      if (this.speed < -0.5) a = 16 * throttle;
      else a = accel * throttle * Math.max(0.04, 1 - Math.pow(Math.max(0, this.speed) / vmax, 3));
    } else if (throttle < -0.05) {
      if (this.speed > 0.5) a = 18 * throttle;
      else a = 6 * throttle * Math.max(0, 1 + this.speed / 9);
    }
    if (brake) a -= Math.sign(this.speed) * 20;
    this.speed += a * dt;
    // rolling resistance + light aero drag (doesn't cap speed below vmax)
    const drag = (this.offroad ? 0.7 : 0.03) * this.speed + Math.sign(this.speed) * (Math.abs(throttle) < 0.05 ? 1.6 : 0.3);
    this.speed -= drag * dt;
    if (Math.abs(this.speed) < 0.05 && Math.abs(throttle) < 0.05) this.speed = 0;
    if (this.speed > vmax + 1) this.speed -= (this.speed - vmax) * 2.5 * dt;
    // steering: less lock at speed so the highway feels stable
    const lock = THREE.MathUtils.lerp(0.62, 0.1, Math.min(1, Math.abs(this.speed) / 42));
    const target = -steerIn * lock;
    this.steer += (target - this.steer) * Math.min(1, dt * 8);
    const yawRate = (this.speed / this.model.wheelbase) * Math.tan(this.steer);
    this.heading += yawRate * dt;
    const f = this.forward(_v);
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.collide(dt);
    // body dynamics
    this.pitch += ((-a * 0.0035) - this.pitch) * Math.min(1, dt * 5);
    this.roll += (THREE.MathUtils.clamp(yawRate * this.speed * 0.005, -0.06, 0.06) - this.roll) * Math.min(1, dt * 5);
    this.model.tailM.emissiveIntensity = brake || (throttle < -0.05 && this.speed > 0.5) ? 2.5 : 0.3;
    this.sync(dt);
  }

  collide() {
    const col = this.world.colliders;
    const f = this.forward(_v2);
    const half = this.model.length * 0.3;
    let hit = false;
    for (const s of [half, -half]) {
      const cx = this.pos.x + f.x * s, cz = this.pos.z + f.z * s;
      const r = col.resolve(cx, cz, this.model.width * 0.55);
      if (r.hit) {
        this.pos.x += r.x - cx; this.pos.z += r.z - cz; hit = true;
        // lose speed proportional to how head-on the hit is
        const dot = Math.abs(f.x * r.nx + f.z * r.nz);
        this.speed *= 1 - 0.75 * dot;
      }
    }
    if (hit && this.time - this.lastHit > 0.6 && Math.abs(this.speed) > 2) { this.lastHit = this.time; this.onCrash?.(); }
  }

  // Follow a polyline automatically (cutscenes / fast-forward). Returns remaining distance.
  autopilot(dt, path, targetSpeed, state) {
    state.i = state.i ?? 0;
    // advance index to the closest point ahead
    while (state.i < path.length - 1 && path[state.i].distanceTo(this.pos) < 12) state.i++;
    const look = path[Math.min(path.length - 1, state.i)];
    const dx = look.x - this.pos.x, dz = look.z - this.pos.z;
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const steerIn = THREE.MathUtils.clamp(-diff * 2.2, -1, 1);
    const remaining = path[path.length - 1].distanceTo(this.pos);
    const spd = Math.min(targetSpeed, remaining * 0.9 + 2, Math.abs(diff) > 0.5 ? 8 : targetSpeed);
    const throttle = this.speed < spd ? 1 : -0.4;
    const col = this.world.colliders; this.world.colliders = { resolve: (x, z) => ({ x, z, hit: false }) }; // ghost through obstacles
    this.drive(dt, throttle, steerIn, false, targetSpeed > this.vmax);
    this.world.colliders = col;
    return remaining;
  }

  sync(dt = 0) {
    this.object3d.position.copy(this.pos);
    this.object3d.rotation.set(0, this.heading, 0);
    this.model.body.rotation.set(this.pitch, 0, this.roll);
    for (const w of this.model.wheels) {
      w.spin.rotation.x += (this.speed * dt) / 0.38;
      if (w.front) w.pivot.rotation.y = this.steer;
    }
  }
}
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
