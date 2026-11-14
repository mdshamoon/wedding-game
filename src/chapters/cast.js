import * as THREE from 'three';
import { createCharacter } from '../core/optional.js';

// Manages characters in a scene: spawn, walk to marks, face, animate, cleanup.
export class Cast {
  constructor(game) {
    this.game = game;
    this.actors = [];
    this.off = game.onUpdate((dt) => this.update(dt));
  }

  add(role, { outfit, seed = Math.floor(Math.random() * 1e6), pos, yaw = 0, anim = 'idle', parent = null } = {}) {
    const c = createCharacter({ role, outfit, seed });
    const a = { c, obj: c.object3d, role, target: null, speed: 1.3, resolve: null, idleAnim: anim, lookAt: null };
    if (pos) c.object3d.position.copy(pos);
    c.object3d.rotation.y = yaw;
    c.setAnim(anim);
    (parent || this.game.scene).add(c.object3d);
    this.actors.push(a);
    return a;
  }

  walkTo(a, pos, { speed = 1.3, anim = 'walk', arriveAnim = null, faceAfter = null } = {}) {
    a.target = pos.clone(); a.speed = speed; a.arriveAnim = arriveAnim; a.faceAfter = faceAfter;
    a.c.setAnim(anim);
    return new Promise((r) => { a.resolve = r; });
  }

  face(a, pos) { a.obj.rotation.y = Math.atan2(pos.x - a.obj.position.x, pos.z - a.obj.position.z); }
  anim(a, name, opts) { a.c.setAnim(name, opts); }

  update(dt) {
    for (const a of this.actors) {
      a.c.update(dt);
      if (!a.target) continue;
      const p = a.obj.position;
      const dx = a.target.x - p.x, dz = a.target.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.08) {
        a.target = null;
        a.c.setAnim(a.arriveAnim || a.idleAnim);
        if (a.faceAfter) this.face(a, a.faceAfter);
        const r = a.resolve; a.resolve = null; r?.();
        continue;
      }
      const step = Math.min(d, a.speed * dt);
      p.x += (dx / d) * step; p.z += (dz / d) * step;
      if (a.target.y !== undefined) p.y += (a.target.y - p.y) * Math.min(1, dt * 4);
      const want = Math.atan2(dx, dz);
      let diff = want - a.obj.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.obj.rotation.y += diff * Math.min(1, dt * 8);
    }
  }

  remove(a) { this.game.scene.remove(a.obj); a.obj.removeFromParent(); a.c.dispose?.(); this.actors = this.actors.filter((x) => x !== a); }
  clear() { for (const a of [...this.actors]) this.remove(a); this.off(); }
}

// Frame helper: local basis from a yaw (forward = +Z rotated)
export function basis(yaw) {
  return { f: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), r: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)) };
}
export const offset = (p, b, right, fwd, y = 0) => p.clone().addScaledVector(b.r, right).addScaledVector(b.f, fwd).setY((p.y || 0) + y);
