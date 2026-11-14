import * as THREE from 'three';
import { SCRIPT, SPEAKERS } from '../story/script.js';
import { Cast, basis, offset } from './cast.js';
import { runDrive } from './drive.js';
import { FX } from '../world/fx.js';

const S = SCRIPT.walima;
const GUEST_ROLE = { khala: 'aunty', mamu: 'uncle', dost: 'youngMan', baji: 'youngWoman', cousins: 'youngMan', abbu: 'elder', ammi: 'aunty', saali: 'youngWoman' };

// Timing ring for the photographer: tap when the shrinking ring meets the frame.
function photoTiming(game, who) {
  const { audio } = game;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:82%;top:34%;transform:translate(-50%,-50%);z-index:22;pointer-events:auto;cursor:pointer;text-align:center';
    el.innerHTML = `<canvas width="420" height="300" style="width:210px;height:150px"></canvas><div style="font-family:var(--display);font-size:11px;letter-spacing:.2em;color:#f6e5a8;text-shadow:0 1px 6px #000">PHOTO WITH ${who.toUpperCase()}</div>`;
    game.ui.appendChild(el);
    const c = el.querySelector('canvas').getContext('2d');
    let t = 0, raf, done = false; const period = 1.6;
    const draw = () => {
      t += 1 / 60;
      const k = (t % period) / period; // 0..1 shrink
      const s = 1.9 - k * 1.3;           // frame scale 1.0 at k≈0.69
      c.clearRect(0, 0, 420, 300);
      c.strokeStyle = '#f7f0e1'; c.lineWidth = 6; c.strokeRect(110, 75, 200, 150);
      c.fillStyle = 'rgba(10,46,33,0.35)'; c.fillRect(110, 75, 200, 150);
      c.strokeStyle = Math.abs(s - 1) < 0.08 ? '#f6e5a8' : '#d4af37'; c.lineWidth = 5;
      c.strokeRect(210 - 100 * s, 150 - 75 * s, 200 * s, 150 * s);
      raf = requestAnimationFrame(draw);
      el._s = s;
    };
    draw();
    const press = () => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      const err = Math.abs(el._s - 1);
      removeEventListener('keydown', onKey); el.remove();
      audio.sfx('shutter');
      resolve(err < 0.08 ? 'perfect' : err < 0.2 ? 'good' : 'blink');
    };
    const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); press(); } };
    addEventListener('keydown', onKey); el.addEventListener('pointerdown', press);
  });
}

export async function runWalima(game) {
  const { world, story, rig, audio, hud } = game;
  const home = world.venues.home, wal = world.venues.walima;
  world.setTime('night');
  game.focus.copy(home.anchors.outside);
  await world.ground.prime(home.anchors.outside, 3000);
  await story.dateCard(S.title);
  await runDrive(game, {
    route: world.routes.reception.pts.concat(wal.access || []), start: home.roadPoint || home.anchors.outside, dest: wal.anchors.outside, objective: S.obj, time: 'night', music: 'reception',
    decor: 'justMarried', toasts: S.toasts, riders: [['groom', 'reception', -0.38], ['bride', 'receptionGown', 0.38]], arriveText: 'Grand Heritage', arriveRadius: 24,
  });
  const A = wal.anchors, b = basis(wal.yaw);
  const fx = new FX(game.scene); const fxOff = game.onUpdate((dt) => fx.update(dt));
  const cast = new Cast(game);
  // arrival walk through the gate
  story.cutscene(true);
  audio.playMusic('reception'); audio.setAmbience('party');
  const groom = cast.add('groom', { outfit: 'reception', pos: offset(A.gate, b, -0.5, 4), yaw: wal.yaw + Math.PI });
  const bride = cast.add('bride', { outfit: 'receptionGown', pos: offset(A.gate, b, 0.5, 4), yaw: wal.yaw + Math.PI });
  // guests on the lawn
  const lawnGuests = [];
  for (let i = 0; i < 22; i++) {
    const p = offset(A.lawn, b, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 16);
    const a = cast.add(['aunty', 'uncle', 'youngWoman', 'youngMan', 'elder', 'kid'][i % 6], { seed: 900 + i, pos: p, yaw: Math.random() * 6, anim: ['idle', 'talk', 'clap'][i % 3] });
    lawnGuests.push(a);
  }
  rig.set(offset(A.gate, b, 3, -6, 2.2), A.gate.clone().setY(1.6));
  cast.walkTo(groom, offset(A.gate, b, -0.5, -8), { speed: 1.1 });
  await cast.walkTo(bride, offset(A.gate, b, 0.5, -8), { speed: 1.1 });
  lawnGuests.forEach((a) => { cast.face(a, groom.obj.position); cast.anim(a, 'clap'); });
  audio.sfx('cheer');
  fx.petalShower(groom.obj.position.clone().setY(4), 200, 4);
  await story.lines(S.arrive);
  // on stage
  await story.fade(true, 0.6);
  groom.obj.position.copy(offset(A.stage, b, -0.45, 0.6).setY(A.stage.y)); groom.obj.rotation.y = wal.yaw; cast.anim(groom, 'idle');
  bride.obj.position.copy(offset(A.stage, b, 0.45, 0.6).setY(A.stage.y)); bride.obj.rotation.y = wal.yaw; cast.anim(bride, 'idle');
  const photog = cast.add('photographer', { pos: offset(A.stage, b, 0, 5).setY(0.12), yaw: wal.yaw + Math.PI, anim: 'photo' });
  const camPos = offset(A.stage, b, 0, 7.2, 1.6), camLook = offset(A.stage, b, 0, 0, 1.5);
  rig.set(camPos, camLook);
  await story.fade(false, 0.6);
  story.cutscene(false);
  await story.panel((el, close) => {
    el.innerHTML = `<h3>Walima</h3><h2>Photo-op!</h2><p>${S.photoHow}</p><div class="row"><button class="btn">Smile</button></div>`;
    el.querySelector('.btn').onclick = () => { audio.sfx('confirm'); close(); };
  });
  let perfect = 0;
  for (let i = 0; i < S.guests.length; i++) {
    const [who, line] = S.guests[i];
    const a = cast.add(GUEST_ROLE[who] || 'aunty', { seed: 1000 + i * 3, pos: offset(A.stage, b, (i % 2 ? 1 : -1) * 4, 3).setY(0.12) });
    const side = i % 2 ? 1.25 : -1.25;
    await cast.walkTo(a, offset(A.stage, b, side, 0.7).setY(A.stage.y), { speed: 2.4, faceAfter: offset(A.stage, b, side, 6) });
    hud.toast(SPEAKERS[who].name, line, 3);
    const res = await photoTiming(game, SPEAKERS[who].name);
    const flash = new THREE.PointLight(0xffffff, 80, 15); flash.position.copy(photog.obj.position).setY(1.8); game.scene.add(flash);
    setTimeout(() => game.scene.remove(flash), 120);
    if (res === 'perfect') perfect++;
    hud.center(res === 'perfect' ? 'Perfect shot!' : res === 'good' ? 'Nice!' : 'Oops, someone blinked!', 1);
    if (i % 2 === 0 || res === 'perfect') await game.snapshot(`Walima · with ${SPEAKERS[who].name}`);
    await cast.walkTo(a, offset(A.stage, b, side * 4, 4).setY(0.12), { speed: 2.4 });
    cast.remove(a);
  }
  // finale: fireworks over Grand Heritage
  story.cutscene(true);
  hud.center(`${perfect} / ${S.guests.length} perfect shots`, 2);
  cast.anim(groom, 'wave'); cast.anim(bride, 'wave');
  rig.set(offset(A.stage, b, 0, 26, 9), offset(A.stage, b, 0, -10, 12));
  const fwOff = game.onUpdate(() => { if (Math.random() < 0.05) { fx.launch(offset(A.lawn, b, (Math.random() - 0.5) * 40, -20 + Math.random() * 10), 35 + Math.random() * 20); audio.sfx('firework', { volume: 0.6 }); } });
  await story.wait(2.5);
  await game.snapshot('Walima · Grand Heritage');
  await story.wait(3.5);
  fwOff();
  await story.fade(true, 1.2);
  cast.clear(); fxOff(); fx.dispose();
  story.cutscene(false);
}
