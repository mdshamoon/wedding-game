import * as THREE from 'three';
import { SCRIPT } from '../story/script.js';
import { CONFIG } from '../config.js';
import { Cast, basis, offset } from './cast.js';
import { FX } from '../world/fx.js';
import { Car } from '../entities/Car.js';

const S = SCRIPT.nikah;

// "Qubool hai": a ring fills; press when it glows gold.
function quboolRing(game, n) {
  const { audio } = game;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:76%;top:46%;transform:translate(-50%,-50%);z-index:22;text-align:center;pointer-events:auto;cursor:pointer';
    el.innerHTML = `<canvas width="360" height="360" style="width:180px;height:180px"></canvas><div style="font-family:var(--display);letter-spacing:.2em;font-size:12px;color:#f6e5a8;text-shadow:0 1px 6px #000;margin-top:6px">${game.input.isTouch ? 'TAP' : 'SPACE'} WHEN IT GLOWS</div>`;
    game.ui.appendChild(el);
    const c = el.querySelector('canvas').getContext('2d');
    let t = 0, done = false, raf;
    const fillTime = 2.2 - n * 0.3, glowLen = 1.6;
    const draw = () => {
      if (done) return;
      t += 1 / 60;
      const k = Math.min(1, t / fillTime), glowing = t >= fillTime && t < fillTime + glowLen;
      c.clearRect(0, 0, 360, 360);
      c.fillStyle = 'rgba(10,46,33,0.7)'; c.beginPath(); c.arc(180, 180, 150, 0, 7); c.fill();
      c.lineWidth = 14; c.strokeStyle = 'rgba(247,240,225,0.25)'; c.beginPath(); c.arc(180, 180, 130, 0, 7); c.stroke();
      c.strokeStyle = glowing ? '#f6e5a8' : '#b8912b'; c.shadowColor = '#f6e5a8'; c.shadowBlur = glowing ? 40 : 0;
      c.beginPath(); c.arc(180, 180, 130, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke(); c.shadowBlur = 0;
      c.fillStyle = '#f7f0e1'; c.font = '64px "Great Vibes", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('Qubool hai', 180, 185);
      if (t > fillTime + glowLen) t = fillTime * 0.4; // gentle loop, no fail
      raf = requestAnimationFrame(draw);
    };
    draw();
    const press = () => {
      const glowing = t >= fillTime && t < fillTime + glowLen;
      if (!glowing) { audio.sfx('miss', { volume: 0.3 }); el.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(0.94)' }, { transform: 'translate(-50%,-50%) scale(1)' }], 220); return; }
      done = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); el.remove(); resolve();
    };
    const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); press(); } };
    addEventListener('keydown', onKey);
    el.addEventListener('pointerdown', press);
  });
}

// Trace the flourish signature on the nikahnama.
function signNikahnama(game) {
  const { story, audio } = game;
  return story.panel((el, close) => {
    el.innerHTML = `<h3>Nikahnama</h3><h2>Sign Here</h2><p>${S.signHow}</p><canvas width="900" height="360" style="width:100%;max-width:450px;height:auto;touch-action:none;background:#fffcf5;border:1px solid #b8912b66;border-radius:6px;cursor:crosshair"></canvas><p class="sm" style="font-size:15px;color:#40331f99">${game.input.isTouch ? 'Drag along the dots' : 'Drag with the mouse, or hold Space'}</p>`;
    const cv = el.querySelector('canvas'), c = cv.getContext('2d');
    // flourish: cursive-ish "S" loop + underline swash
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const x = 120 + t * 660;
      const y = 180 + Math.sin(t * Math.PI * 3) * 70 * (1 - t * 0.4) + Math.cos(t * Math.PI * 7) * 18;
      pts.push([x, y]);
    }
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([780 - t * 640, 300 - Math.sin(t * Math.PI) * 24]); }
    let k = 0, drawing = false;
    const render = () => {
      c.clearRect(0, 0, 900, 360);
      c.fillStyle = '#40331f55'; c.font = 'italic 26px "Cormorant Garamond", serif'; c.fillText(`${CONFIG.groomFull}`, 30, 40);
      for (let i = k; i < pts.length; i += 3) { c.fillStyle = '#d4af3788'; c.beginPath(); c.arc(pts[i][0], pts[i][1], 4, 0, 7); c.fill(); }
      c.strokeStyle = '#3a2a12'; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); for (let i = 0; i <= k && i < pts.length; i++) (i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1])); c.stroke();
      if (k < pts.length) { c.fillStyle = '#d4af37'; c.beginPath(); c.arc(pts[k][0], pts[k][1], 12, 0, 7); c.fill(); }
    };
    render();
    const advanceTo = (x, y) => {
      while (k < pts.length && Math.hypot(pts[k][0] - x, pts[k][1] - y) < 46) k++;
      render(); if (k >= pts.length) finish();
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 900, (e.clientY - r.top) / r.height * 360]; };
    cv.addEventListener('pointerdown', (e) => { drawing = true; cv.setPointerCapture(e.pointerId); advanceTo(...pos(e)); });
    cv.addEventListener('pointermove', (e) => { if (drawing) advanceTo(...pos(e)); });
    cv.addEventListener('pointerup', () => { drawing = false; });
    let held = false, iv = setInterval(() => { if (held && k < pts.length) { k = Math.min(pts.length, k + 2); render(); if (k >= pts.length) finish(); } }, 16);
    const kd = (e) => { if (e.code === 'Space') { e.preventDefault(); held = true; } }, ku = (e) => { if (e.code === 'Space') held = false; };
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    let finished = false;
    const finish = () => { if (finished) return; finished = true; clearInterval(iv); removeEventListener('keydown', kd); removeEventListener('keyup', ku); audio.sfx('success'); setTimeout(() => close(), 600); };
  });
}

// Chhuare shower: catch the dried dates in a gold rumal.
function chhuareGame(game) {
  const { audio, hud, input } = game;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:12;pointer-events:auto;touch-action:none';
    el.innerHTML = '<canvas style="width:100%;height:100%"></canvas>';
    game.ui.appendChild(el);
    const cv = el.querySelector('canvas'), c = cv.getContext('2d');
    const resize = () => { cv.width = innerWidth * Math.min(2, devicePixelRatio); cv.height = innerHeight * Math.min(2, devicePixelRatio); };
    resize();
    const W = () => cv.width, H = () => cv.height;
    let x = 0.5, t = 0, caught = 0, items = [], spawn = 0, raf, last = performance.now();
    const dur = 20;
    hud.show({ score: 1 });
    el.addEventListener('pointermove', (e) => { x = e.clientX / innerWidth; });
    el.addEventListener('pointerdown', (e) => { x = e.clientX / innerWidth; });
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      x = Math.max(0.06, Math.min(0.94, x + input.axisX() * dt * 0.9));
      spawn -= dt;
      if (spawn <= 0 && t < dur - 1) { items.push({ x: Math.random() * 0.9 + 0.05, y: -0.05, v: 0.25 + Math.random() * 0.25, r: Math.random() * 6, gold: Math.random() < 0.08 }); spawn = 0.18 + Math.random() * 0.25; }
      c.clearRect(0, 0, W(), H());
      const s = Math.min(2, devicePixelRatio);
      const bx = x * W(), by = H() * 0.86, bw = 150 * s;
      for (const it of items) {
        it.y += it.v * dt; it.r += dt * 3;
        const px = it.x * W(), py = it.y * H();
        c.save(); c.translate(px, py); c.rotate(it.r);
        c.fillStyle = it.gold ? '#d4af37' : '#6b3a1f'; c.beginPath(); c.ellipse(0, 0, 9 * s, 15 * s, 0, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(-3 * s, -4 * s, 3 * s, 6 * s, 0, 0, 7); c.fill();
        c.restore();
        if (!it.done && Math.abs(py - by) < 20 * s && Math.abs(px - bx) < bw / 2) { it.done = true; caught += it.gold ? 5 : 1; audio.sfx('coin', { volume: 0.4, pitch: it.gold ? 1.5 : 1 }); }
      }
      items = items.filter((it) => !it.done && it.y < 1.1);
      // rumal (gold cloth)
      c.fillStyle = '#d4af37'; c.strokeStyle = '#9a7620'; c.lineWidth = 3 * s;
      c.beginPath(); c.moveTo(bx - bw / 2, by - 10 * s); c.quadraticCurveTo(bx, by + 34 * s, bx + bw / 2, by - 10 * s); c.lineTo(bx + bw / 2 - 8 * s, by - 16 * s); c.quadraticCurveTo(bx, by + 18 * s, bx - bw / 2 + 8 * s, by - 16 * s); c.closePath(); c.fill(); c.stroke();
      hud.score(`Chhuare ${caught}`); hud.meter(1 - t / dur);
      if (t >= dur) { cancelAnimationFrame(raf); el.remove(); hud.hideAll(); resolve(caught); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}

export async function runNikah(game) {
  const { world, story, rig, audio, hud } = game;
  const nik = world.venues.nikah;
  world.setTime('morning');
  const A = nik.anchors;
  const b = basis(nik.yaw);
  game.focus.copy(A.stageFront);
  await world.ground.prime(A.stageFront, 3000);
  await story.dateCard(S.title);
  const fx = new FX(game.scene); const fxOff = game.onUpdate((dt) => fx.update(dt));
  const cast = new Cast(game);
  const groom = cast.add('groom', { outfit: 'sherwani', pos: A.groomSeat.clone().setY(1.0), yaw: nik.yaw, anim: 'sit' });
  groom.c.setSehra(true); groom.c.setGarland(true);
  const bride = cast.add('bride', { outfit: 'lehenga', pos: A.brideSeat.clone().setY(1.0), yaw: nik.yaw, anim: 'sit' });
  const qazi = cast.add('qazi', { pos: A.qazi.clone(), yaw: nik.yaw + Math.PI, anim: 'talk', seed: 1 });
  // families on stage + seated guests
  const stagePeople = [
    cast.add('elder', { seed: 4, pos: offset(A.groomSeat, b, -1.8, 1.8).setY(0.8), yaw: nik.yaw + 0.6 }),
    cast.add('aunty', { seed: 11, pos: offset(A.groomSeat, b, -2.6, 1.2).setY(0.8), yaw: nik.yaw + 0.5 }),
    cast.add('elder', { seed: 14, pos: offset(A.brideSeat, b, 1.8, 1.8).setY(0.8), yaw: nik.yaw - 0.6 }),
    cast.add('aunty', { seed: 15, pos: offset(A.brideSeat, b, 2.6, 1.2).setY(0.8), yaw: nik.yaw - 0.5 }),
  ];
  const g = nik.group; g.updateMatrixWorld(true);
  const guests = [];
  const roles = ['aunty', 'uncle', 'youngWoman', 'youngMan', 'elder', 'kid'];
  for (let row = 0; row < 4; row++) for (let c = 0; c < 4; c++) for (const s of [-1, 1]) {
    if (Math.random() < 0.25) continue;
    const p = new THREE.Vector3(s * (3.6 + c * 1.0), 0.27, -18 - row * 1.6).applyMatrix4(g.matrixWorld);
    guests.push(cast.add(roles[(row * 7 + c * 3 + (s > 0 ? 1 : 0)) % roles.length], { seed: 700 + row * 10 + c * 2 + (s > 0 ? 1 : 0), pos: p, yaw: nik.yaw + Math.PI, anim: 'sit' }));
  }
  story.cutscene(true);
  audio.playMusic('nikah');
  audio.setAmbience('party');
  const mid = A.groomSeat.clone().lerp(A.brideSeat, 0.5);
  rig.set(offset(mid, b, 0, 16, 4), mid.clone().setY(1.6));
  await rig.moveTo({ pos: offset(mid, b, 0, 6.5, 2.2), look: mid.clone().setY(1.5) }, story.skipping ? 0.01 : 4);
  await story.lines(S.intro);
  story.cutscene(false);
  // three times Qubool hai
  for (let n = 0; n < 3; n++) {
    rig.set(offset(A.groomSeat, b, 0.6, 2.4, 0.9), A.groomSeat.clone().setY(1.9));
    cast.anim(qazi, 'talk');
    await story.say('qazi', S.ask(n), { auto: 0 });
    if (n === 0) hud.toast('Tip', S.howQubool, 4);
    await quboolRing(game, n);
    audio.sfx('bell', { volume: 0.5 + n * 0.2 });
    await story.caption(S.qubool[n], '', 1.6);
  }
  // sign the nikahnama
  rig.set(offset(A.qazi, b, 0.8, 1.6, 2.2), A.qazi.clone().setY(1.0));
  await signNikahnama(game);
  // Mubarak!
  story.cutscene(true);
  rig.set(offset(mid, b, 0, 9, 3), mid.clone().setY(1.6));
  audio.sfx('mubarak'); audio.sfx('cheer');
  guests.forEach((a) => cast.anim(a, 'clap'));
  stagePeople.forEach((a) => cast.anim(a, 'cheer'));
  fx.petalShower(mid.clone().setY(5), 300, 6);
  await story.lines(S.mubarak);
  hud.center('Nikah Mubarak!', 2.4);
  await game.snapshot('Nikah · 24 March 2027');
  story.cutscene(false);
  // chhuare shower
  await story.panel((el, close) => {
    el.innerHTML = `<h3>Mubarak!</h3><h2>Chhuare Shower</h2><p>${S.chhuareHow}</p><div class="row"><button class="btn">Ready</button></div>`;
    el.querySelector('.btn').onclick = () => { audio.sfx('confirm'); close(); };
  });
  const chOff = game.onUpdate(() => { if (Math.random() < 0.2) fx.chhuare(mid.clone().setY(5), 3); });
  audio.sfx('chhuare');
  const caught = await chhuareGame(game);
  chOff();
  hud.center(`${caught} chhuare!`, 1.6);
  // joota chupai
  story.cutscene(true);
  const sisters = [0, 1, 2].map((i) => { const a = cast.add('youngWoman', { seed: 600 + i, pos: offset(A.groomSeat, b, -0.6 + i * 0.7, 1.6).setY(0.8), anim: 'talk' }); cast.face(a, A.groomSeat); return a; });
  rig.set(offset(A.groomSeat, b, 1.6, 3.6, 1.2), A.groomSeat.clone().setY(1.6));
  await story.lines(S.joota);
  story.cutscene(false);
  for (const r of S.jootaRounds) {
    const pick = await story.say('saali', r.offer, { choices: r.choices });
    await story.say(pick === 2 && r.choices[2].startsWith('Ammi') ? 'ammi' : 'saali', r.replies[pick]);
    if (r.choices[pick].includes('chocolates')) break;
  }
  story.cutscene(true);
  await story.lines(S.jootaDone);
  sisters.forEach((a) => cast.anim(a, 'cheer'));
  // rukhsati in the golden afternoon
  await story.fade(true, 1);
  world.setTime('golden');
  cast.clear();
  const cast2 = new Cast(game);
  const gate = A.gate;
  const choice = game.load('car', { style: 'suv', paint: 'pearl' });
  const car = new Car(world, { decor: 'flowers', paint: choice.paint, type: choice.style });
  const out = A.outside;
  car.place(out.x, out.z, nik.yaw + Math.PI / 2);
  game.scene.add(car.object3d);
  const groom2 = cast2.add('groom', { outfit: 'sherwani', pos: offset(gate, b, -0.5, -4), yaw: nik.yaw });
  const bride2 = cast2.add('bride', { outfit: 'lehenga', pos: offset(gate, b, 0.5, -4), yaw: nik.yaw });
  const bAbbu = cast2.add('elder', { seed: 14, pos: offset(gate, b, 1.6, -2.4), yaw: nik.yaw });
  const family = [0, 1, 2, 3, 4].map((i) => cast2.add(['aunty', 'youngWoman', 'uncle', 'aunty', 'kid'][i], { seed: 800 + i, pos: offset(gate, b, -3 + i * 1.5, -6), yaw: nik.yaw, anim: 'wave' }));
  rig.set(offset(gate, b, 5, 9, 2.4), gate.clone().setY(1.6));
  await story.fade(false, 1);
  audio.playMusic('sehra');
  await story.lines(S.rukhsati);
  cast2.walkTo(groom2, offset(gate, b, -0.5, 3), { speed: 1.0 });
  await cast2.walkTo(bride2, offset(gate, b, 0.5, 3), { speed: 1.0 });
  cast2.remove(groom2); cast2.remove(bride2);
  family.forEach((a) => cast2.anim(a, 'wave')); cast2.anim(bAbbu, 'wave');
  fx.petalShower(out.clone().setY(4), 200, 5);
  // car pulls away along the road
  const q = world.net.query(out.x, out.z);
  const dir = q ? new THREE.Vector3(q.dirx, 0, q.dirz) : new THREE.Vector3(1, 0, 0);
  const path = [0, 20, 40, 80, 140].map((d) => out.clone().addScaledVector(dir, d));
  car.heading = Math.atan2(dir.x, dir.z);
  const st = {};
  const drv = game.onUpdate((dt) => { car.autopilot(dt, path, 9, st); game.focus.copy(car.pos); });
  rig.follow({ pos: car.pos, get heading() { return car.heading; }, get speed() { return car.speed; } }, { dist: 12, height: 4 });
  await story.caption('Rukhsati. A new home, a new beginning.', '24 March · Evening', 4);
  await story.fade(true, 1.2);
  drv(); game.scene.remove(car.object3d); cast2.clear(); fxOff(); fx.dispose();
  story.cutscene(false);
}
