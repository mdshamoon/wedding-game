import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createCharacter, ANIMATIONS } from '../src/entities/Character.js'
import { createHorse } from '../src/entities/Horse.js'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#a9c4dc')
scene.fog = new THREE.Fog('#a9c4dc', 30, 80)
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 200)
camera.position.set(0, 2.2, 9)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1, 0)
controls.enableDamping = true

scene.add(new THREE.HemisphereLight('#dfe9ff', '#7d6d55', 1.1))
const sun = new THREE.DirectionalLight('#fff3e0', 2.6)
sun.position.set(6, 10, 7)
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 8, bottom: -8, near: 1, far: 40 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.02
scene.add(sun)
const fill = new THREE.DirectionalLight('#c9d8ff', 0.6)
fill.position.set(-6, 4, 5)
scene.add(fill)

const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: '#b8ad98', roughness: 0.95 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

function label(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(20,24,36,0.75)'; g.fillRect(0, 0, 256, 48)
  g.fillStyle = '#fff'; g.font = '22px system-ui'; g.textAlign = 'center'; g.fillText(text, 128, 32)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
  s.scale.set(0.8, 0.15, 1)
  return s
}

const specs = [
  { role: 'groom', outfit: 'travel' }, { role: 'groom', outfit: 'haldi' }, { role: 'groom', outfit: 'sherwani' }, { role: 'groom', outfit: 'reception' },
  { role: 'bride', outfit: 'lehenga' }, { role: 'bride', outfit: 'receptionGown' },
  { role: 'qazi', seed: 3 }, { role: 'elder', seed: 2 }, { role: 'elder', seed: 5 },
  { role: 'aunty', seed: 1 }, { role: 'aunty', seed: 2 }, { role: 'aunty', seed: 4 }, { role: 'aunty', seed: 9 },
  { role: 'uncle', seed: 1 }, { role: 'uncle', seed: 2 }, { role: 'uncle', seed: 6 },
  { role: 'youngMan', seed: 1 }, { role: 'youngMan', seed: 3 }, { role: 'youngWoman', seed: 1 }, { role: 'youngWoman', seed: 2 },
  { role: 'kid', seed: 1 }, { role: 'kid', seed: 2 }, { role: 'kid', seed: 7 },
  { role: 'bandMember', seed: 1 }, { role: 'dholPlayer', seed: 1 }, { role: 'photographer', seed: 1 }, { role: 'guest', seed: 11 }, { role: 'guest', seed: 12 },
]
const chars = []
const perRow = 14
specs.forEach((s, i) => {
  const c = createCharacter(s)
  const row = Math.floor(i / perRow), col = i % perRow
  c.object3d.position.set((col - (perRow - 1) / 2) * 1.05, 0, -row * 2.4)
  scene.add(c.object3d)
  const l = label(`${s.role}${s.outfit ? ':' + s.outfit : ''}${s.seed ? ' #' + s.seed : ''}`)
  l.position.set(0, -0.0, 0.5)
  l.position.y = 0.06
  c.object3d.add(l)
  chars.push({ c, s, name: `${i}: ${s.role}${s.outfit ? ':' + s.outfit : ''}${s.seed ? ' #' + s.seed : ''}` })
})
const groomSher = chars.find(x => x.s.outfit === 'sherwani').c
groomSher.setSehra(true)

// horse with rider
const horse = createHorse({ decorated: true })
horse.object3d.position.set(-9.5, 0, 3)
horse.object3d.rotation.y = 0.6
scene.add(horse.object3d)
const rider = createCharacter({ role: 'groom', outfit: 'sherwani' })
rider.setSehra(true)
rider.setGarland(true)
horse.seat.add(rider.object3d)
rider.setAnim('ride')
chars.push({ c: rider, s: { role: 'rider' }, name: 'rider (groom on horse)', rider: true })

// UI
const $ = (id) => document.getElementById(id)
for (const a of ANIMATIONS) $('anim').add(new Option(a, a))
chars.forEach((x, i) => $('focus').add(new Option(x.name, i)))
const apply = () => {
  for (const x of chars) if (!x.rider) x.c.setAnim($('anim').value, { speed: +$('speed').value })
}
$('anim').onchange = apply
$('speed').oninput = apply
$('haldi').oninput = () => chars.forEach(x => x.s.role === 'groom' && x.c.setHaldi(+$('haldi').value))
$('sehra').onchange = () => { groomSher.setSehra($('sehra').checked); rider.setSehra($('sehra').checked) }
$('garland').onchange = () => chars.forEach(x => (x.s.role === 'groom' || x.s.role === 'bride') && x.c.setGarland($('garland').checked))
$('horseAnim').onchange = () => horse.setAnim($('horseAnim').value)
let closeUp = false
function focus() {
  const i = $('focus').value
  if (i === '') { controls.target.set(0, 1, -1); camera.position.set(0, 2.4, 10); return }
  const o = chars[+i].c.object3d
  const p = new THREE.Vector3(); o.getWorldPosition(p)
  const h = chars[+i].c.height
  const ty = closeUp ? p.y + h * 0.92 : p.y + h * 0.55
  controls.target.set(p.x, ty, p.z)
  camera.position.set(p.x + 0.3, ty + 0.05, p.z + (closeUp ? 0.9 : 3.2))
}
$('focus').onchange = focus
$('close').onclick = () => { closeUp = true; focus() }
$('full').onclick = () => { closeUp = false; focus() }
const tri = chars.map(x => `${x.name.padEnd(30)} ${x.c.triangles()}`).join('\n')
$('stats').textContent = tri
window.__chars = chars
window.__horse = horse
window.__cam = { camera, controls, focus }

const clock = new THREE.Clock()
const camPos = new THREE.Vector3()
function loop() {
  const dt = clock.getDelta()
  controls.update()
  camera.getWorldPosition(camPos)
  for (const x of chars) {
    x.c.setLookAt($('look').checked ? camPos : null)
    x.c.update(dt)
  }
  horse.update(dt)
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
loop()
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
