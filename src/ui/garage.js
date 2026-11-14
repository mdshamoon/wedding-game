// Garage: pick body style + paint with a live 3D preview orbiting the car.
import * as THREE from 'three';
import { buildCarModel, PAINTS, CAR_STYLES } from '../entities/Car.js';

const STYLE_KEYS = ['suv', 'sedan', 'coupe'];
const PAINT_KEYS = ['pearl', 'black', 'emerald', 'champagne', 'blue', 'red'];

export function openGarage(game, at, heading = 0) {
  const { story, audio, rig, scene } = game;
  const choice = { style: 'suv', paint: 'pearl', ...game.load('car', {}) };
  let model = null;
  const rebuild = () => {
    if (model) scene.remove(model.group);
    model = buildCarModel({ type: choice.style, paint: choice.paint });
    model.group.position.copy(at); model.group.rotation.y = heading;
    scene.add(model.group);
  };
  rebuild();
  const prevMode = rig.mode;
  rig.orbit(at.clone().setY(0.9), 6.2, 1.4, 0.35);
  game.focus.copy(at);
  return story.panel((el, close) => {
    el.classList.add('bottom');
    const kmh = (k) => `${Math.round(CAR_STYLES[k].vmax * 3.6)}–${Math.round(CAR_STYLES[k].boost * 3.6)} km/h`;
    el.innerHTML = `<h3>Garage</h3><h2>Choose your ride</h2>
      <div class="row" data-k="style">${STYLE_KEYS.map((k) => `<button class="opt ${k === choice.style ? 'sel' : ''}" data-v="${k}">${CAR_STYLES[k].name}<br><small style="opacity:.7">${kmh(k)}</small></button>`).join('')}</div>
      <div class="row" data-k="paint" style="margin-top:10px">${PAINT_KEYS.map((k) => `<button class="opt ${k === choice.paint ? 'sel' : ''}" data-v="${k}"><span class="swatch" style="background:#${PAINTS[k].color.toString(16).padStart(6, '0')}"></span>${PAINTS[k].name}</button>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn">Let's go</button></div>`;
    el.querySelectorAll('.row[data-k]').forEach((row) => row.addEventListener('click', (e) => {
      const b = e.target.closest('.opt'); if (!b) return;
      row.querySelectorAll('.opt').forEach((o) => o.classList.remove('sel')); b.classList.add('sel');
      choice[row.dataset.k] = b.dataset.v; audio.sfx('click'); rebuild();
    }));
    el.querySelector('.btn').onclick = () => {
      audio.sfx('confirm');
      game.save('car', choice);
      scene.remove(model.group);
      rig.mode = prevMode;
      close(choice);
    };
  });
}

export { THREE };
