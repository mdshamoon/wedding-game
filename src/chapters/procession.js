import * as THREE from 'three';
import { SCRIPT } from '../story/script.js';
import { Cast, basis } from './cast.js';
import { FX } from '../world/fx.js';
import { createHorse } from '../core/optional.js';
import { garland, mat } from '../world/decor.js';

const S = SCRIPT.ch3;

// Rhythm overlay: notes shrink toward a target ring on each beat.
function rhythmUI(game) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(250px,48vw);height:min(250px,48vw);z-index:12;pointer-events:auto;touch-action:none';
  el.innerHTML = '<canvas width="680" height="680" style="width:100%;height:100%"></canvas>';
  game.ui.appendChild(el);
  return { el, ctx: el.querySelector('canvas').getContext('2d') };
}

export async function runProcession(game) {
  const { world, story, rig, audio, hud } = game;
  const nik = world.venues.nikah;
  world.setTime('morning');
  const g = nik.group; g.updateMatrixWorld(true);
  const L = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld).setY(0);
  let path = [L(-95, 7), L(-40, 7), L(-8, 7), L(0, 4), L(0, -1.5)];
  if (nik.access && nik.roadPoint) {
    // come along the real road, then up the driveway to the gate
    const rp = nik.roadPoint, rd = nik.roadDir.clone();
    const route = world.routes.baraat.pts, from = route[Math.max(0, route.length - 8)];
    if (rp.clone().addScaledVector(rd, 60).distanceTo(from) > rp.clone().addScaledVector(rd, -60).distanceTo(from)) rd.negate();
    const drive = nik.access.slice(1);
    path = [rp.clone().addScaledVector(rd, 70), rp.clone().addScaledVector(rd, 30), rp.clone().addScaledVector(rd, 8), rp.clone(), ...drive.slice(0, -1), L(0, 4), L(0, -1.5)];
  }
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
  const total = curve.getLength();
  const at = (s) => curve.getPointAt(THREE.MathUtils.clamp(s / total, 0, 1));
  const tan = (s) => curve.getTangentAt(THREE.MathUtils.clamp(s / total, 0, 0.999));
  game.focus.copy(path[0]);
  await world.ground.prime(path[0], 3000);
  const fx = new FX(game.scene); const fxOff = game.onUpdate((dt) => fx.update(dt));
  const cast = new Cast(game);
  // horse + rider
  const horse = createHorse({ decorated: true });
  game.scene.add(horse.object3d);
  const groom = cast.add('groom', { outfit: 'sherwani', anim: 'ride', parent: horse.seat });
  groom.obj.position.set(0, 0, 0);
  groom.c.setSehra(true); groom.c.setGarland(true);
  horse.setAnim('idle');
  const hOff = game.onUpdate((dt) => horse.update(dt));
  // procession members: [role, lateral, longitudinal, anim]
  const members = [];
  const addM = (role, lat, lon, anim, seed) => { const a = cast.add(role, { seed, anim }); members.push({ a, lat, lon, anim }); return a; };
  for (let i = 0; i < 6; i++) addM('bandMember', (i % 3 - 1) * 1.3, 14 + Math.floor(i / 3) * 1.6, 'playTrumpet', 300 + i);
  addM('dholPlayer', -1.4, 9.5, 'playDhol', 41); addM('dholPlayer', 1.4, 9.5, 'playDhol', 42);
  const dancerRoles = ['youngMan', 'youngMan', 'youngWoman', 'uncle', 'youngMan', 'aunty', 'kid', 'youngWoman', 'youngMan', 'uncle', 'youngMan', 'youngWoman', 'kid', 'youngMan'];
  dancerRoles.forEach((r, i) => addM(r, ((i % 5) - 2) * 1.2 + (Math.random() - 0.5) * 0.4, 3 + Math.floor(i / 5) * 1.6 + Math.random() * 0.5, ['dance', 'dance2', 'dance3'][i % 3], 400 + i));
  for (let i = 0; i < 8; i++) addM(['aunty', 'elder', 'uncle', 'youngWoman'][i % 4], ((i % 4) - 1.5) * 1.3, -3 - Math.floor(i / 4) * 1.5, 'walk', 500 + i);
  // decorative light-cart (roshni) poles carried along the sides
  const lampM = mat(0xfff2c8, { emissive: 0xffd27a, emissiveIntensity: 0.8 });
  let s = 0, targetS = 0;
  const place = () => {
    const p = at(s), t = tan(s); const n = new THREE.Vector3(-t.z, 0, t.x);
    horse.object3d.position.copy(p); horse.object3d.rotation.y = Math.atan2(t.x, t.z);
    for (const m of members) {
      const q = at(s + m.lon); const tq = tan(s + m.lon); const nq = new THREE.Vector3(-tq.z, 0, tq.x);
      m.a.obj.position.copy(q).addScaledVector(nq, m.lat);
      m.a.obj.rotation.y = Math.atan2(tq.x, tq.z) + (m.anim.startsWith('dance') ? Math.sin(game.time * 0.7 + m.lat) * 1.2 : 0);
    }
    game.focus.copy(p);
    void n;
  };
  place();
  void lampM; void garland;
  // intro
  story.cutscene(true);
  audio.playMusic('baraat');
  audio.setAmbience('party');
  const b0 = basis(horse.object3d.rotation.y);
  const hp = horse.object3d.position;
  rig.set(hp.clone().addScaledVector(b0.f, 7).addScaledVector(b0.r, 3).setY(2.6), hp.clone().setY(2.2));
  await story.reveal(1);
  await story.lines(S.ghodi);
  story.cutscene(false);
  await story.panel((el, close) => {
    el.innerHTML = `<h3>Band · Baaja · Ghodi</h3><h2>Dhol Rhythm</h2><p>${S.rhythmHow}</p><div class="row"><button class="btn">Dhol bajao!</button></div>`;
    el.querySelector('.btn').onclick = () => { audio.sfx('confirm'); close(); };
  });
  // rhythm gameplay
  const ui = rhythmUI(game);
  // beat clock: the music's clock when audio is running, otherwise a steady 120 bpm wall clock
  const audioOK = audio.beat.bpm > 0 && audio.ctxTime() > 0;
  const bpm = audioOK ? audio.beat.bpm : 120, spb = 60 / bpm;
  const t0 = performance.now();
  const beatNow = audioOK ? () => audio.beat.now() : () => ((performance.now() - t0) / 1000) / spb;
  const startBeat = Math.ceil(beatNow()) + 3;
  const notes = [];
  for (let k = 0; k < 72; k++) {
    const beat = startBeat + k;
    if (k % 8 === 7) continue;            // breathe
    notes.push({ beat, hit: false, judged: false });
    if (k % 4 === 1 && k > 16) notes.push({ beat: beat + 0.5, hit: false, judged: false });
  }
  let combo = 0, best = 0, perfect = 0, good = 0, missed = 0, flash = 0, lastMsg = '';
  hud.show({ score: 1 });
  hud.hint(game.input.isTouch ? 'Tap the drum on the beat' : 'Space / tap on the beat');
  game.setTouchButtons([], false);
  const judge = () => {
    const now = beatNow();
    let bestN = null, bd = 1e9;
    for (const n of notes) { if (n.judged) continue; const d = Math.abs(n.beat - now) * spb; if (d < bd) { bd = d; bestN = n; } }
    if (!bestN || bd > 0.22) { audio.sfx('miss', { volume: 0.3 }); return; }
    bestN.judged = true; bestN.hit = true;
    const isPerfect = bd < 0.085;
    combo++; best = Math.max(best, combo);
    if (isPerfect) { perfect++; targetS += 2.4; lastMsg = ['Shandaar!', 'Waah!', 'Kya baat!', 'Mashallah!'][(Math.random() * 4) | 0]; }
    else { good++; targetS += 1.5; lastMsg = 'Achha!'; }
    flash = 1;
    audio.sfx('dholHit', { volume: 0.8 });
    if (combo % 8 === 0) { hud.center(`${combo} combo!`, 0.8); fx.petalShower(horse.object3d.position.clone().setY(4), 60, 4); }
    else hud.center(lastMsg, 0.35);
  };
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) judge(); } };
  addEventListener('keydown', onKey);
  ui.el.addEventListener('pointerdown', (e) => { e.preventDefault(); judge(); });
  rig.follow({ pos: horse.object3d.position, get heading() { return horse.object3d.rotation.y; }, speed: 0 }, { dist: 9, height: 4.2, lookHeight: 2.0, lookAhead: 2 });
  horse.setAnim('walk');
  await new Promise((resolve) => {
    const off = game.onUpdate((dt) => {
      const now = beatNow();
      // auto-miss notes that passed
      for (const n of notes) if (!n.judged && (now - n.beat) * spb > 0.22) { n.judged = true; missed++; combo = 0; }
      // passive drift so nobody gets stuck
      targetS += dt * 0.35;
      s += (Math.min(targetS, total - 1) - s) * Math.min(1, dt * 1.6);
      place();
      audio.setMusicIntensity(Math.min(1, combo / 12));
      hud.score(`Combo ${combo} · ${Math.round((s / total) * 100)}%`);
      // draw rhythm UI
      const c = ui.ctx, W = 680, C = W / 2;
      c.clearRect(0, 0, W, W);
      c.fillStyle = `rgba(10,46,33,${0.55 + flash * 0.2})`; c.beginPath(); c.arc(C, C, 120, 0, Math.PI * 2); c.fill();
      c.lineWidth = 10; c.strokeStyle = flash > 0 ? '#f6e5a8' : '#d4af37'; c.beginPath(); c.arc(C, C, 120, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#f7f0e1'; c.font = '600 46px Cinzel, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DHOL', C, C);
      for (const n of notes) {
        if (n.judged) continue;
        const dtb = (n.beat - now) * spb;
        if (dtb < -0.25 || dtb > 1.6) continue;
        const r = 120 + dtb * 140;
        c.lineWidth = 7; c.strokeStyle = `rgba(233,201,119,${Math.max(0.15, 1 - dtb / 1.6)})`;
        c.beginPath(); c.arc(C, C, Math.max(60, r), 0, Math.PI * 2); c.stroke();
      }
      flash = Math.max(0, flash - dt * 4);
      if (s >= total - 2 || notes.every((n) => n.judged) && s > total * 0.7) {
        off(); resolve();
      } else if (notes.every((n) => n.judged)) { targetS += dt * 6; }
    });
  });
  removeEventListener('keydown', onKey); ui.el.remove();
  hud.hideAll(); game.setTouchButtons(null);
  horse.setAnim('idle');
  members.forEach((m) => cast.anim(m.a, m.anim === 'walk' ? 'clap' : m.anim));
  // celebration at the gate
  story.cutscene(true);
  const gate = nik.anchors.gate;
  for (let i = 0; i < 6; i++) fx.launch(gate.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 6)), 26 + Math.random() * 12);
  fx.confetti(gate.clone().setY(6), 300, 8);
  fx.petalShower(horse.object3d.position.clone().setY(5), 200, 6);
  audio.sfx('firework'); audio.sfx('cheer');
  hud.center(perfect > good ? 'Shandaar Baraat!' : 'Baraat aa gayi!', 2);
  const gb = basis(nik.yaw);
  rig.set(gate.clone().addScaledVector(gb.f, 12).addScaledVector(gb.r, 4).setY(3.2), gate.clone().setY(2.5));
  await game.snapshot('Baraat · Blessing Garden');
  await story.wait(1.5);
  // the bride's sisters block the gate with a ribbon
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.08, 0.02), mat(0xd94a64));
  ribbon.position.copy(gate).setY(1.2); ribbon.rotation.y = nik.yaw; game.scene.add(ribbon);
  const sisters = [-1.6, -0.5, 0.6, 1.7].map((x, i) => { const a = cast.add('youngWoman', { seed: 600 + i, pos: gate.clone().addScaledVector(gb.r, x).addScaledVector(gb.f, -0.6), anim: i % 2 ? 'clap' : 'wave' }); cast.face(a, horse.object3d.position); return a; });
  await story.lines(S.gate);
  const ch = await story.say('saali', 'Kitna neg denge, Jiju?', { choices: S.gateChoices });
  audio.sfx('click');
  await story.lines(S.gateReplies[ch]);
  game.scene.remove(ribbon);
  audio.sfx('cheer');
  fx.confetti(gate.clone().setY(3), 160, 4);
  sisters.forEach((a) => cast.anim(a, 'cheer'));
  await story.wait(1.5);
  await story.fade(true, 1);
  cast.clear(); hOff(); game.scene.remove(horse.object3d); fxOff(); fx.dispose();
  story.cutscene(false);
}
