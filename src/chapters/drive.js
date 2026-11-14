import * as THREE from 'three';
import { Car, buildCarModel } from '../entities/Car.js';
import { SPEAKERS } from '../story/script.js';
import { glowTexture } from '../world/textures.js';
import { createCharacter } from '../core/optional.js';
import { Traffic } from '../world/traffic.js';

// Tall golden light pillar used as a destination / checkpoint beacon.
export function beacon(color = 0xe9c977) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 60, 24, 1, true), mat);
  beam.position.y = 30; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.position.y = 0.25; g.add(ring);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(14, 14, 1); glow.position.y = 3; g.add(glow);
  g.userData.tick = (t) => { ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08); mat.opacity = 0.25 + Math.sin(t * 2) * 0.08; };
  return g;
}

function navArrow() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.9); s.lineTo(0.7, -0.2); s.lineTo(0.25, -0.05); s.lineTo(0.25, -0.8); s.lineTo(-0.25, -0.8); s.lineTo(-0.25, -0.05); s.lineTo(-0.7, -0.2); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI); geo.center(); // tip points +Z (forward)
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3, emissive: 0x5a4210, emissiveIntensity: 0.6 }));
  m.scale.setScalar(0.9);
  return m;
}

// Route progress helper
export class RouteTracker {
  constructor(pts) {
    this.pts = pts; this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.total = this.cum[this.cum.length - 1]; this.i = 0;
  }
  update(pos) {
    let best = this.i, bd = 1e9;
    for (let k = Math.max(0, this.i - 5); k < Math.min(this.pts.length, this.i + 40); k++) { const d = this.pts[k].distanceToSquared(pos); if (d < bd) { bd = d; best = k; } }
    this.i = best; this.offRoute = Math.sqrt(bd);
    return this;
  }
  get done() { return this.cum[this.i] / this.total; }
  get remaining() { return this.total - this.cum[this.i] + this.offRoute * 0.5; }
  pointAt(frac) {
    const d = frac * this.total; let k = 1; while (k < this.cum.length - 1 && this.cum[k] < d) k++;
    const t = (d - this.cum[k - 1]) / Math.max(1e-6, this.cum[k] - this.cum[k - 1]);
    return this.pts[k - 1].clone().lerp(this.pts[k], t);
  }
  lookahead(dist = 30) {
    const d = this.cum[this.i] + dist; let k = this.i; while (k < this.cum.length - 1 && this.cum[k] < d) k++;
    return this.pts[k];
  }
  ahead(n = 120) { return this.pts.slice(this.i, this.i + n); }
}

// Run a driving section. Resolves when the destination is reached.
// opts: { route: Vector3[], dest: Vector3, destLabel, objective, decor, paint, time, music, toasts:[[frac, who, msg]], stops:[{frac,label,objective,run}], ff, passenger, startHeadingFrom }
export async function runDrive(game, opts) {
  const { world, hud, rig, audio, story, input } = game;
  const route = opts.route;
  const choice = game.load('car', { style: 'suv', paint: 'pearl' });
  const car = new Car(world, { decor: opts.decor, paint: opts.paint || choice.paint, type: choice.style, vmax: opts.vmax });
  game.scene.add(car.object3d);
  game.activeCar = car;
  const start = opts.start || route[0];
  const aim = route[Math.min(route.length - 1, 3)];
  car.place(start.x, start.z, Math.atan2(aim.x - start.x, aim.z - start.z));
  car.onCrash = () => { audio.sfx('crash', { volume: 0.6 }); rig.shake = 0.6; };
  const night = opts.time === 'night' || opts.time === 'evening' || opts.time === 'dusk';
  car.enableHeadlights(game.scene, night);
  // groom (and maybe bride) visible through the windscreen
  const riders = [];
  for (const [role, outfit, x] of opts.riders || [['groom', 'travel', -0.38]]) {
    const ch = createCharacter({ role, outfit, seed: 3 });
    ch.setAnim(role === 'groom' && x < 0 ? 'drive' : 'sit');
    if (outfit === 'sherwani') { ch.setSehra?.(true); }
    ch.object3d.position.set(x, 0.42, 0.05); ch.object3d.scale.setScalar(0.92);
    car.object3d.add(ch.object3d); riders.push(ch);
  }
  // convoy of follower cars that trace the player's exact path
  const convoy = [];
  const trail = [];
  if (opts.convoy) {
    const f0 = car.forward(new THREE.Vector3());
    for (let d = 80; d > 0; d -= 0.5) trail.push({ p: car.pos.clone().addScaledVector(f0, -d), h: car.heading });
    const paints = ['black', 'silver', 'emerald', 'pearl', 'blue', 'red'];
    for (let i = 0; i < opts.convoy; i++) {
      const m = buildCarModel({ paint: paints[i % paints.length], decor: i === 0 ? 'flowers' : null, type: i % 3 === 2 ? 'hatch' : 'suv' });
      game.scene.add(m.group); convoy.push(m);
    }
  }
  const updateConvoy = (dt) => {
    if (!convoy.length) return;
    const last = trail[trail.length - 1];
    if (last.p.distanceTo(car.pos) > 0.5) { trail.push({ p: car.pos.clone(), h: car.heading }); if (trail.length > 600) trail.shift(); }
    convoy.forEach((m, i) => {
      const idx = Math.max(0, trail.length - 1 - (i + 1) * 24);
      const tp = trail[idx];
      m.group.position.lerp(tp.p, Math.min(1, dt * 6));
      let dh = tp.h - m.group.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      m.group.rotation.y += dh * Math.min(1, dt * 6);
      for (const w of m.wheels) w.spin.rotation.x += Math.abs(car.speed) * dt / 0.38;
    });
  };
  const traffic = opts.traffic === false ? null : new Traffic(game, { count: game.QUALITY.isMobile ? 12 : 22 });
  const tracker = new RouteTracker(route);
  const arrow = navArrow(); game.scene.add(arrow);
  const destB = beacon(0xe9c977); destB.position.copy(opts.dest); game.scene.add(destB);
  const stops = (opts.stops || []).map((s) => ({ ...s, pos: s.pos || tracker.pointAt(s.frac), done: false }));
  const stopBeacons = stops.map((s) => { const b = beacon(0xe9b8b5); b.position.copy(s.pos); game.scene.add(b); return b; });
  const fired = new Set();
  hud.show({ map: 1, speed: 1 });
  const nextObjective = () => { const s = stops.find((x) => !x.done); hud.objective(s ? 'Stop' : 'Go', s ? s.objective : opts.objective); };
  nextObjective();
  if (opts.ff) hud.hint(opts.ffHint || 'Hold F to fast-forward');
  else hud.hint(game.input.isTouch ? '' : 'W A S D / arrows to drive · Space brake · H horn');
  game.setTouchButtons([{ name: 'brake', label: 'Brake' }, { name: 'horn', label: 'Horn' }, ...(opts.ff ? [{ name: 'ff', label: '⏩' }] : [])]);
  audio.playMusic(opts.music || 'drive');
  audio.setAmbience(night ? 'night' : 'town');
  audio.engine.start();
  rig.follow({ pos: car.pos, heading: 0, speed: 0 }, { dist: 7.8, height: 3.0 });
  const camTarget = { pos: car.pos, get heading() { return car.heading; }, get speed() { return car.speed; } };
  rig.follow(camTarget, { dist: 7.8, height: 3.0, snap: true });
  story.reveal(0.8);

  let busy = false;
  const ffState = {};
  return new Promise((resolve) => {
    const off = game.onUpdate(async (dt, t) => {
      destB.userData.tick(t); stopBeacons.forEach((b) => b.userData.tick(t));
      riders.forEach((r) => r.update(dt));
      if (busy) { car.drive(dt, 0, 0, true); game.focus.copy(car.pos); return; }
      const ff = opts.ff && input.held('ff');
      if (ff) {
        for (let k = 0; k < 4; k++) car.autopilot(dt, tracker.pts.slice(tracker.update(car.pos).i), 40, ffState);
      } else {
        ffState.i = 0;
        car.drive(dt, input.axisY(), input.axisX(), input.held('brake'), input.held('boost'));
      }
      if (input.pressed('horn')) audio.horn();
      updateConvoy(dt);
      traffic?.update(dt, car.pos, ff ? null : car);
      tracker.update(car.pos);
      game.focus.copy(car.pos);
      audio.engine.update(Math.min(1, Math.abs(car.speed) / 30), Math.max(0, input.axisY()));
      audio.setMusicIntensity(Math.min(1, Math.abs(car.speed) / 25));
      hud.speed(car.speed * 3.6);
      const nextStop = stops.find((s) => !s.done);
      const target = nextStop ? nextStop.pos : opts.dest;
      const remain = nextStop ? car.pos.distanceTo(nextStop.pos) : Math.max(tracker.remaining, car.pos.distanceTo(opts.dest));
      hud.distance(remain);
      hud.drawMap(world.net, car.pos, car.heading, tracker.ahead(160), target);
      game.mapCtx = { pos: car.pos, heading: car.heading, route: tracker.pts.slice(tracker.i), dest: target };
      // arrow floats above the car and points along the route (or straight at the target when close)
      const la = car.pos.distanceTo(target) < 60 ? target : tracker.lookahead(28);
      arrow.position.set(car.pos.x, car.model.height + 0.75 + Math.sin(t * 3) * 0.08, car.pos.z);
      arrow.rotation.order = 'YXZ';
      arrow.rotation.y = Math.atan2(la.x - car.pos.x, la.z - car.pos.z);
      arrow.rotation.x = 0.5; // tilt toward the chase camera so it never goes edge-on
      // story toasts by progress
      for (const [frac, who, msg] of opts.toasts || []) {
        const key = frac + msg;
        if (!fired.has(key) && tracker.done >= frac) { fired.add(key); audio.sfx('phoneBeep'); hud.toast(SPEAKERS[who]?.name || who, msg, 5); }
      }
      // named waypoints along the way (toast when passing)
      for (const w of opts.waypoints || []) {
        if (!w.done && car.pos.distanceTo(w.pos) < 45) { w.done = true; audio.sfx('bell', { volume: 0.4 }); hud.toast(w.who, w.msg, 4); }
      }
      // stops
      if (nextStop && car.pos.distanceTo(nextStop.pos) < 14) {
        busy = true; audio.sfx('coin');
        car.speed *= 0.3;
        const i = stops.indexOf(nextStop);
        await nextStop.run?.(game, car);
        nextStop.done = true; game.scene.remove(stopBeacons[i]);
        nextObjective(); busy = false;
      }
      if (!nextStop && car.pos.distanceTo(opts.dest) < (opts.arriveRadius || 16)) {
        off();
        busy = true;
        audio.sfx('success');
        hud.center(opts.arriveText || 'Arrived', 1.8);
        const settle = game.onUpdate((dt2) => { car.drive(dt2, 0, 0, true); });
        setTimeout(() => {
          settle();
          audio.engine.stop();
          game.scene.remove(arrow, destB);
          traffic?.dispose();
          game.mapCtx = null;
          convoy.forEach((m) => game.scene.remove(m.group));
          hud.hideAll(); game.setTouchButtons(null);
          resolve({ car, riders, convoy });
        }, 900);
      }
    });
  });
}
