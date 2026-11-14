import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { QUALITY } from '../config.js';

// Sun azimuth: degrees from north, clockwise (90 = east, 270 = west). Our world: north = -z, east = +x.
const PRESETS = {
  dusk:      { elev: 5,  azim: 255, turb: 9,  ray: 2.6, mie: 0.006, g: 0.85, exposure: 0.42, sun: 0xffb070, sunI: 2.2, hemiSky: 0xffc9a0, hemiGround: 0x4a3a2a, hemiI: 0.75, fog: 0xc9a283, fogNear: 120 },
  morning:   { elev: 24, azim: 110, turb: 7,  ray: 1.6, mie: 0.004, g: 0.8,  exposure: 0.38, sun: 0xfff0d6, sunI: 3.0, hemiSky: 0xcfe3ff, hemiGround: 0x5d5340, hemiI: 0.9, fog: 0xc9d3d6, fogNear: 150 },
  afternoon: { elev: 42, azim: 215, turb: 6,  ray: 1.2, mie: 0.004, g: 0.8,  exposure: 0.34, sun: 0xfff6e8, sunI: 3.2, hemiSky: 0xd4e6ff, hemiGround: 0x5d5340, hemiI: 0.95, fog: 0xc6d2d8, fogNear: 160 },
  golden:    { elev: 9,  azim: 250, turb: 8,  ray: 2.2, mie: 0.005, g: 0.82, exposure: 0.42, sun: 0xffc88a, sunI: 2.6, hemiSky: 0xffd9b5, hemiGround: 0x4f4232, hemiI: 0.8, fog: 0xd8b897, fogNear: 140 },
  evening:   { elev: 1.2, azim: 262, turb: 10, ray: 3.2, mie: 0.008, g: 0.9, exposure: 0.5, sun: 0xff8a5a, sunI: 1.3, hemiSky: 0xb48ab0, hemiGround: 0x2a2230, hemiI: 0.6, fog: 0x8a6f7d, fogNear: 100 },
  night:     { night: true, moon: 0xa9bcff, moonI: 0.75, hemiSky: 0x3a4c80, hemiGround: 0x1c1822, hemiI: 0.7, fog: 0x141c34, fogNear: 60, exposure: 1.0 },
};

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sky = new Sky();
    this.sky.scale.setScalar(45000);
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = QUALITY.shadows;
    const s = this.sun.shadow;
    s.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
    s.camera.near = 1; s.camera.far = 400;
    const ext = 70;
    s.camera.left = -ext; s.camera.right = ext; s.camera.top = ext; s.camera.bottom = -ext;
    s.bias = -0.0004; s.normalBias = 0.6;
    this.shadowExtent = ext;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(this.hemi);

    // night sky dome + stars
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x050a1c) }, bottom: { value: new THREE.Color(0x1b2444) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6,0.,1.); gl_FragColor = vec4(mix(bottom, top, h),1.); }',
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), domeMat);
    const starGeo = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 1800; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.08;
      const th = u * Math.PI * 2, ph = Math.acos(1 - v);
      pos.push(Math.sin(ph) * Math.cos(th) * 30000, Math.cos(ph) * 30000, Math.sin(ph) * Math.sin(th) * 30000);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    this.dome.add(this.stars);
    this.dome.visible = false;
    scene.add(this.dome);

    scene.fog = new THREE.Fog(0xcccccc, 150, QUALITY.viewDist);
    this.sunDir = new THREE.Vector3();
    this.preset = null;
  }

  set(name) {
    const p = PRESETS[name];
    this.preset = name;
    const r = this.renderer;
    this.dome.visible = !!p.night;
    this.sky.visible = !p.night;
    if (p.night) {
      this.sunDir.set(-0.4, 0.6, -0.3).normalize();
      this.sun.color.setHex(p.moon); this.sun.intensity = p.moonI * 2.4;
      r.toneMappingExposure = p.exposure;
    } else {
      const phi = THREE.MathUtils.degToRad(90 - p.elev);
      const theta = THREE.MathUtils.degToRad(p.azim);
      // azimuth from north clockwise -> x = sin, z = -cos
      this.sunDir.set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), -Math.sin(phi) * Math.cos(theta));
      const u = this.sky.material.uniforms;
      u.turbidity.value = p.turb; u.rayleigh.value = p.ray; u.mieCoefficient.value = p.mie; u.mieDirectionalG.value = p.g;
      u.sunPosition.value.copy(this.sunDir);
      this.sun.color.setHex(p.sun); this.sun.intensity = p.sunI * 2.4;
      r.toneMappingExposure = p.exposure + 0.1;
    }
    this.hemi.color.setHex(p.hemiSky); this.hemi.groundColor.setHex(p.hemiGround); this.hemi.intensity = p.hemiI * 2.2;
    this.scene.fog.color.setHex(p.fog);
    this.scene.fog.near = p.fogNear;
    this.scene.fog.far = QUALITY.viewDist;
    this.scene.background = p.night ? null : null;
  }

  // Keep the shadow frustum centred on the action, snapped to texels to avoid shimmering.
  update(focus) {
    const d = 180;
    const texel = (this.shadowExtent * 2) / QUALITY.shadowMap;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * d, Math.max(20, this.sunDir.y * d), fz + this.sunDir.z * d);
    this.sky.position.set(focus.x, 0, focus.z);
    this.dome.position.set(focus.x, 0, focus.z);
  }
}
