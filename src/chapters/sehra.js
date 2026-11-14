import * as THREE from 'three';
import { SCRIPT, SPEAKERS } from '../story/script.js';
import { Cast, basis, offset } from './cast.js';
import { runDrive } from './drive.js';
import { FX } from '../world/fx.js';

const S = SCRIPT.ch3;

const LOOKS = {
  sherwani: [['Ivory & Gold', '#f3e7cf'], ['Champagne', '#e8d2a8'], ['Pearl White', '#f7f4ee']],
  safa: [['Blush', '#f1d9c8'], ['Ivory-Gold', '#efe2c4'], ['Emerald', '#0f4a38']],
  sehra: [['Jasmine & Pearl', '#ffffff'], ['Rose & Pearl', '#f4c7cc']],
};

function chooseLook(game) {
  const { story, audio } = game;
  const pick = { sherwani: 0, safa: 0, sehra: 0 };
  return story.panel((el, close) => {
    const row = (k, label) => `<h3 style="margin-top:12px">${label}</h3><div class="row" data-k="${k}">${LOOKS[k].map(([n, c], i) => `<button class="opt ${i === 0 ? 'sel' : ''}" data-i="${i}"><span class="swatch" style="background:${c}"></span>${n}</button>`).join('')}</div>`;
    el.innerHTML = `<h2>${S.choose}</h2>${row('sherwani', 'Sherwani')}${row('safa', 'Safa')}${row('sehra', 'Sehra')}<div class="row" style="margin-top:18px"><button class="btn">Ready</button></div>`;
    el.querySelectorAll('.row[data-k]').forEach((r) => r.addEventListener('click', (e) => {
      const b = e.target.closest('.opt'); if (!b) return;
      r.querySelectorAll('.opt').forEach((o) => o.classList.remove('sel')); b.classList.add('sel');
      pick[r.dataset.k] = +b.dataset.i; audio.sfx('click');
    }));
    el.querySelector('.btn').onclick = () => { audio.sfx('confirm'); close(pick); };
  });
}

// Quick-time sehra tying: press the shown arrow keys in time.
function sehraQTE(game, onStep) {
  const { story, audio } = game;
  const keys = [['ArrowLeft', '←', 'left'], ['ArrowUp', '↑', 'up'], ['ArrowRight', '→', 'right'], ['ArrowDown', '↓', 'down']];
  const seq = Array.from({ length: 6 }, () => keys[(Math.random() * 4) | 0]);
  return story.panel((el, close) => {
    let i = 0, timer = null, misses = 0;
    el.classList.add('bottom');
    el.innerHTML = `<h3>Sehra Bandi</h3><h2>Tie the Sehra</h2><p>Press the arrows as Mamu Jaan ties each strand</p>
      <div class="qte" style="display:flex;gap:10px;justify-content:center;margin:10px 0 6px"></div>
      <div class="row qbtns" style="margin-top:10px"></div><p class="qmsg" style="min-height:1.4em;margin:8px 0 0"></p>`;
    const box = el.querySelector('.qte'), msg = el.querySelector('.qmsg');
    seq.forEach(([, sym]) => { const d = document.createElement('div'); d.textContent = sym; d.style.cssText = 'width:52px;height:52px;border-radius:50%;border:1px solid #b8912b;display:flex;align-items:center;justify-content:center;font-size:26px;color:#9a7620;background:#fffcf5'; box.appendChild(d); });
    const btns = el.querySelector('.qbtns');
    keys.forEach(([code, sym]) => { const b = document.createElement('button'); b.className = 'opt'; b.textContent = sym; b.style.fontSize = '22px'; b.onclick = () => press(code); btns.appendChild(b); });
    const mark = () => { [...box.children].forEach((d, k) => { d.style.background = k < i ? 'linear-gradient(135deg,#f6e5a8,#d4af37)' : k === i ? '#fff' : '#fffcf5'; d.style.transform = k === i ? 'scale(1.15)' : ''; d.style.boxShadow = k === i ? '0 0 0 3px #e9c97788' : ''; }); };
    mark();
    const press = (code) => {
      if (i >= seq.length) return;
      if (code === seq[i][0]) { i++; audio.sfx('dholHit', { volume: 0.6 }); onStep(i / seq.length); msg.textContent = ['Ek…', 'Do…', 'Teen…', 'Bas thoda aur…', 'Mashallah…', 'Ho gaya!'][i - 1]; }
      else { misses++; audio.sfx('miss', { volume: 0.5 }); msg.textContent = 'Arre, seedhe khade raho!'; }
      mark();
      if (i >= seq.length) { removeEventListener('keydown', onKey); clearTimeout(timer); setTimeout(() => close(misses), 700); }
    };
    const onKey = (e) => { if (e.code.startsWith('Arrow')) { e.preventDefault(); press(e.code); } };
    addEventListener('keydown', onKey);
  });
}

export async function runSehra(game) {
  const { world, story, rig, audio, hud } = game;
  const home = world.venues.home;
  world.setTime('morning');
  home.setDecor('arrival');
  const b = basis(home.yaw);
  const spot = home.anchors.courtyard.clone().setY(0.12);
  game.focus.copy(spot);
  await world.ground.prime(spot, 3000);
  await story.dateCard(S.title);
  const fx = new FX(game.scene); const fxOff = game.onUpdate((dt) => fx.update(dt));
  const cast = new Cast(game);
  const groom = cast.add('groom', { outfit: 'sherwani', pos: spot, yaw: home.yaw, anim: 'idle' });
  const mamu = cast.add('uncle', { seed: 52, pos: offset(spot, b, 0.75, 0.35).setY(0.12), anim: 'idle' }); cast.face(mamu, spot);
  const ammi = cast.add('aunty', { seed: 11, pos: offset(spot, b, -1.6, -0.2).setY(0.12) }); cast.face(ammi, spot);
  const abbu = cast.add('elder', { seed: 4, pos: offset(spot, b, 1.8, -0.4).setY(0.12) }); cast.face(abbu, spot);
  const baji = cast.add('youngWoman', { seed: 7, pos: offset(spot, b, -0.8, 0.3).setY(0.12) }); cast.face(baji, spot);
  const crowd = [0, 1, 2, 3, 4, 5].map((i) => { const a = cast.add(['youngMan', 'kid', 'aunty', 'uncle', 'youngWoman', 'youngMan'][i], { seed: 200 + i, pos: offset(spot, b, -3 + i * 1.2, -2.4 - (i % 2) * 0.7).setY(0.12) }); cast.face(a, spot); return a; });
  story.cutscene(true);
  audio.playMusic('sehra');
  const look = offset(spot, b, 0, 0, 1.5);
  rig.set(offset(spot, b, 1.4, 3.4, 1.7), look);
  await story.caption('Sherwani, safa, sehra… and a lot of nerves.', CONFIG_TIME(), 2.8);
  story.cutscene(false);
  const pick = await chooseLook(game);
  game.look = pick;
  hud.toast(SPEAKERS.ammi.name, `${LOOKS.sherwani[pick.sherwani][0]} sherwani? Mashallah, bilkul shehzada!`, 4);
  story.cutscene(true);
  await story.lines(S.tie);
  story.cutscene(false);
  cast.anim(mamu, 'applyHaldi');
  rig.set(offset(spot, b, 0.4, 2.0, 1.75), offset(spot, b, 0, 0, 1.65));
  let tied = false;
  await sehraQTE(game, (k) => { if (k >= 0.5 && !tied) { groom.c.setSehra(true); tied = true; } fx.petalShower(offset(spot, b, 0, 0, 2.2), 20, 1.2, ['#ffffff', LOOKS.sehra[pick.sehra][1]].map((c) => new THREE.Color(c).getHex())); });
  groom.c.setSehra(true);
  groom.c.setGarland(true);
  cast.anim(mamu, 'clap');
  story.cutscene(true);
  rig.set(offset(spot, b, 0.8, 3.2, 1.6), look);
  crowd.forEach((a) => cast.anim(a, 'clap'));
  cast.anim(ammi, 'namaste');
  await story.lines(S.tied);
  await game.snapshot('Sehra Bandi · 24 March');
  // walk to the car
  await story.fade(true, 0.8);
  cast.clear(); fxOff(); fx.dispose();
  story.cutscene(false);
  await story.caption('The baraat leaves for Blessing Garden, Baheri', 'Nikah at 11:00 AM', 3);
  const nik = world.venues.nikah;
  await runDrive(game, {
    route: world.routes.baraat.pts.concat(nik.access || []), start: home.roadPoint || home.anchors.outside, dest: nik.anchors.outside, objective: S.driveObj, time: 'morning', music: 'drive',
    decor: 'flowers', convoy: 4, toasts: S.toasts, ff: true, ffHint: S.ffHint,
    riders: [['groom', 'sherwani', -0.38], ['youngMan', null, 0.38]], arriveText: 'Baheri pahunch gaye!', arriveRadius: 30,
  });
  void story;
}

const CONFIG_TIME = () => 'Wednesday · 24 March 2027 · 8:30 AM';
