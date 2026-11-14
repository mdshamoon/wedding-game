import * as THREE from 'three';
import { QUALITY } from '../config.js';
import { SkySystem } from './sky.js';
import { SatelliteGround } from './ground.js';
import { RoadNetwork, buildRoadMeshes, CHUNK } from './roads.js';
import { buildBuildings } from './buildings.js';
import { buildVegetation } from './vegetation.js';
import { setMaxAnisotropy } from './textures.js';
import { buildVenues } from './venues.js';
import { buildProps } from './props.js';

const BASE = import.meta.env.BASE_URL;
const getJSON = (f) => fetch(`${BASE}data/${f}`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
  }

  async load(onProgress = () => {}) {
    const [meta, roads, routes, buildings, trees] = await Promise.all([
      getJSON('meta.json'), getJSON('roads.json'), getJSON('routes.json'), getJSON('buildings.json'), getJSON('trees.json'),
    ]);
    onProgress(0.35);
    this.meta = meta;
    this.places = Object.fromEntries(Object.entries(meta.places).map(([k, [x, z]]) => [k, new THREE.Vector3(x, 0, z)]));
    this.routes = Object.fromEntries(Object.entries(routes).map(([k, r]) => [k, { len: r.len, pts: r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), marks: Object.fromEntries(Object.entries(r.marks || {}).map(([m, [x, z]]) => [m, new THREE.Vector3(x, 0, z)])) }]));

    this.sky = new SkySystem(this.scene, this.renderer);
    this.ground = new SatelliteGround(this.root, this.renderer);
    this.net = new RoadNetwork(roads);
    await tick();
    this.roads = buildRoadMeshes(this.net);
    this.root.add(this.roads.group);
    onProgress(0.5);
    await tick();
    this.buildings = buildBuildings(buildings);
    this.colliders = this.buildings.colliders;
    this.root.add(this.buildings.group);
    onProgress(0.7);
    await tick();
    this.trees = buildVegetation(trees);
    this.root.add(this.trees.group);
    onProgress(0.8);
    await tick();
    this.props = buildProps(this.net, this.colliders);
    this.root.add(this.props.group);
    this.venues = buildVenues(this);
    this.root.add(this.venues.group);
    onProgress(0.9);
    this._lastCull = -1;
    this.focus = new THREE.Vector3();
  }

  setTime(preset) {
    this.sky.set(preset);
    const night = preset === 'night';
    const tints = { dusk: 0xe8d2c0, morning: 0xffffff, afternoon: 0xffffff, golden: 0xf2e0c8, evening: 0xb8a8b8, night: 0x7a88b0 };
    this.ground.setTint(tints[preset] ?? 0xffffff);
    this.props?.setNight(night || preset === 'evening');
    this.buildings?.setNight(night || preset === 'evening');
    this.venues?.setNight(night || preset === 'evening');
  }

  update(focus, time, dt) {
    this.focus.copy(focus);
    this.sky.update(focus);
    this.ground.update(focus, time);
    this.venues?.update(dt, time);
    if (time - this._lastCull > 0.25) {
      this._lastCull = time;
      const vd = QUALITY.viewDist, td = QUALITY.treeDist;
      const cull = (chunks, dist) => { for (const g of chunks) g.visible = Math.hypot(g.userData.center.x - focus.x, g.userData.center.z - focus.z) < dist + CHUNK * 0.7; };
      cull(this.roads.chunks, vd);
      cull(this.buildings.chunks, vd * 0.75);
      cull(this.trees.chunks, td);
      cull(this.props.chunks, td);
    }
  }

  // Ground height (flat Terai plains).
  heightAt() { return 0; }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
