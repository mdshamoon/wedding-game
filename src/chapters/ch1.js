// Chapter 1: Ghar Wapsi. Drive from Kichha town centre (via the mithai shop) to home; family welcome; night on the terrace.
import * as THREE from 'three';
import { SCRIPT } from '../story/script.js';
import { runDrive } from './drive.js';
import { createCharacter } from '../core/optional.js';
import { openGarage } from '../ui/garage.js';

const S = SCRIPT.ch1;

export function placeFamily(game, anchorPos, facing, list) {
  const out = [];
  list.forEach(([role, seed, dx, dz, anim], i) => {
    const c = createCharacter({ role, seed, outfit: role === 'groom' ? 'travel' : undefined });
    const fx = Math.sin(facing), fz = Math.cos(facing), rx = Math.cos(facing), rz = -Math.sin(facing);
    c.object3d.position.set(anchorPos.x + rx * dx + fx * dz, anchorPos.y || 0, anchorPos.z + rz * dx + fz * dz);
    c.object3d.rotation.y = facing + Math.PI;
    c.setAnim(anim || 'idle');
    game.scene.add(c.object3d);
    out.push(c);
    void i;
  });
  const off = game.onUpdate((dt) => out.forEach((c) => c.update(dt)));
  return { chars: out, remove() { off(); out.forEach((c) => { game.scene.remove(c.object3d); c.dispose?.(); }); } };
}

export async function runCh1(game) {
  const { world, story, hud, rig, audio } = game;
  const home = world.venues.home;
  world.setTime('golden');
  home.setDecor('arrival');
  const route = world.routes.arrival.pts;
  game.focus.copy(route[0]);
  await world.ground.prime(route[0], 3000);
  await story.dateCard(S.title);
  story.cutscene(false);
  // pick the car at the airport parking before the drive
  const aim = route[Math.min(route.length - 1, 3)];
  await openGarage(game, route[0], Math.atan2(aim.x - route[0].x, aim.z - route[0].z));
  // The family waits at the gate
  const gateYaw = home.yaw;
  const fam = placeFamily(game, home.anchors.gate, gateYaw, [
    ['aunty', 11, -1.2, -1.2, 'wave'], ['elder', 4, 0.3, -1.4, 'idle'], ['youngWoman', 7, 1.6, -1.0, 'wave'], ['kid', 9, -2.4, -0.6, 'cheer'], ['youngMan', 21, 2.8, -1.6, 'clap'],
  ]);
  // a little mithai stall at Darau Chauraha
  const marks = world.routes.arrival.marks || {};
  const stall = marks.darau ? mithaiStall(game, marks.darau) : null;
  const res = await runDrive(game, {
    route, dest: home.roadPoint || home.anchors.outside, objective: S.objHome, time: 'golden', music: 'drive',
    toasts: S.toasts, riders: [['groom', 'travel', -0.38]],
    stops: [{ frac: 0.27, pos: marks.darau, objective: S.objMithai, run: async () => { await story.lines(S.mithai); audio.sfx('coin'); hud.toast('Inventory', 'Barfi, laddoo, kaju katli ✓', 3); } }],
    waypoints: marks.azad ? [{ pos: marks.azad, who: S.azad[0], msg: S.azad[1] }] : [],
    arriveText: 'Ghar aa gaye!',
  });
  stall?.remove();
  // Welcome cutscene (the sun has just set; the wedding lights come on)
  story.cutscene(true);
  world.setTime('evening');
  audio.playMusic('story');
  const g = home.anchors.gate;
  const back = new THREE.Vector3(Math.sin(gateYaw), 0, Math.cos(gateYaw));
  const groom = createCharacter({ role: 'groom', outfit: 'travel', seed: 1 });
  groom.object3d.position.copy(g).addScaledVector(back, 4.2);
  groom.object3d.rotation.y = gateYaw + Math.PI;
  groom.setAnim('walk');
  game.scene.add(groom.object3d);
  res.riders.forEach((r) => r.object3d.removeFromParent());
  const gOff = game.onUpdate((dt) => { groom.update(dt); const p = groom.object3d.position; if (p.distanceTo(g) > 2.2) p.addScaledVector(back, -dt * 1.3); else groom.setAnim('namaste'); });
  game.focus.copy(g);
  const side = new THREE.Vector3(Math.cos(gateYaw), 0, -Math.sin(gateYaw));
  rig.set(g.clone().addScaledVector(back, 7).addScaledVector(side, 4).setY(2.2), g.clone().setY(1.5));
  await story.wait(1.5);
  fam.chars.forEach((c, i) => c.setAnim(['namaste', 'wave', 'clap', 'cheer', 'clap'][i] || 'idle'));
  await story.lines(S.welcome);
  // Night on the terrace
  await story.fade(true, 1);
  gOff(); game.scene.remove(groom.object3d); fam.remove(); game.scene.remove(res.car.object3d);
  world.setTime('night');
  const top = home.anchors.houseTop;
  rig.set(top.clone().addScaledVector(back, 26).add(new THREE.Vector3(0, 6, 0)), top.clone().setY(5));
  game.rig.orbit(top.clone().setY(4), 28, 6, 0.05);
  audio.setAmbience('night');
  await story.fade(false, 1.2);
  await story.caption('The house glows. Two days to go.', 'Night · 22 March', 3);
  await story.lines(S.night);
  await story.fade(true, 1);
  story.cutscene(false);
}

// Roadside sweet stall: canopy, glass counter with trays of mithai, signboard.
function mithaiStall(game, at) {
  const { world, scene } = game;
  const q = world.net.query(at.x, at.z);
  const g = new THREE.Group();
  let nx = 1, nz = 0, hw = 4;
  if (q) { nx = -q.dirz; nz = q.dirx; hw = q.road.w / 2; }
  g.position.set(at.x + nx * (hw + 3.2), 0, at.z + nz * (hw + 3.2));
  g.rotation.y = Math.atan2(-nx, -nz); // face the road
  { // keep any real building off the stall's spot
    const sx = g.position.x, sz = g.position.z, tx = -nz, tz = nx;
    world.buildings.exclude([[sx + tx * 3 - nx * 1.5, sz + tz * 3 - nz * 1.5], [sx - tx * 3 - nx * 1.5, sz - tz * 3 - nz * 1.5], [sx - tx * 3 + nx * 3, sz - tz * 3 + nz * 3], [sx + tx * 3 + nx * 3, sz + tz * 3 + nz * 3]]);
  }
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(3.6, 0.9, 1.0), M(0x7a4a2a), 0, 0.45, 0.6);
  add(new THREE.BoxGeometry(3.4, 0.45, 0.9), M(0xcfe6ee, { transparent: true, opacity: 0.45 }), 0, 1.12, 0.6);
  const cols = [0xf2d16b, 0xffffff, 0xe7a23b, 0xd9718a, 0x9b5a2a, 0xf6e5a8];
  for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), M(0xc0c0c0), -1.35 + i * 0.54, 0.95, 0.6);
  for (let i = 0; i < 6; i++) for (let k = 0; k < 7; k++) add(new THREE.SphereGeometry(0.045, 8, 6), M(cols[i]), -1.35 + i * 0.54 + (Math.random() - 0.5) * 0.25, 1.01, 0.6 + (Math.random() - 0.5) * 0.25);
  for (const x of [-1.8, 1.8]) for (const z of [0, 1.4]) add(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), M(0x555555), x, 1.3, z - 0.2);
  const canopy = add(new THREE.BoxGeometry(4.2, 0.08, 2.2), M(0xc0392b), 0, 2.62, 0.5); canopy.rotation.x = -0.12;
  for (let i = 0; i < 8; i++) add(new THREE.BoxGeometry(0.26, 0.09, 2.21), M(i % 2 ? 0xffffff : 0xc0392b), -1.82 + i * 0.52, 2.63, 0.5).rotation.x = -0.12;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#b3261e'; x.fillRect(0, 0, 1024, 256); x.strokeStyle = '#ffd34d'; x.lineWidth = 12; x.strokeRect(10, 10, 1004, 236);
  x.fillStyle = '#fff'; x.font = 'bold 92px Poppins, Arial'; x.textAlign = 'center'; x.fillText('DARAU MITHAI', 512, 118);
  x.font = 'bold 64px sans-serif'; x.fillStyle = '#ffe9a8'; x.fillText('मिठाई · दरऊ चौराहा', 512, 205);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: t }));
  sign.position.set(0, 3.15, 1.62); g.add(sign);
  const vendor = createCharacter({ role: 'uncle', seed: 77 }); vendor.object3d.position.set(0, 0, -0.2); vendor.setAnim('idle'); g.add(vendor.object3d);
  const off = game.onUpdate((dt) => vendor.update(dt));
  scene.add(g);
  return { remove() { off(); scene.remove(g); } };
}
