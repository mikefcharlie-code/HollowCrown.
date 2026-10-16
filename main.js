import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ---------- game content (ported to 3D) ----------

const MEMORIES = [
  {
    id: 'm1',
    text: "You were an architect of the Lattice before the fracture. You built the layer you now stand in.",
    cinder: "I remember you signing the warrant. I was your interface. Trust me\u2014I know the way out.",
    choices: [
      { label: "Trust Cinder", delta: +1 },
      { label: "Doubt Cinder", delta: -1 },
      { label: "Stay silent", delta: 0 },
    ],
  },
  {
    id: 'm2',
    text: "The Hollow Interface is not a guide. It is a symptom. It consumes memory to persist.",
    cinder: "Without me you are blind in the static. Let me see for you. The alternative is nothing.",
    choices: [
      { label: "Trust Cinder", delta: +1 },
      { label: "Doubt Cinder", delta: -1 },
      { label: "Stay silent", delta: 0 },
    ],
  },
  {
    id: 'm3',
    text: "Ashen Meridian is failing because it is being eaten from within. By you. By the power you wield.",
    cinder: "The corruption is the price of truth. Pay it, and the Lattice will remember your name.",
    choices: [
      { label: "Trust Cinder", delta: +1 },
      { label: "Doubt Cinder", delta: -1 },
      { label: "Stay silent", delta: 0 },
    ],
  },
];

const SHARD_POS = [
  { x: 6, z: 0, mem: 0, hidden: false },
  { x: -9, z: 7, mem: 1, hidden: false },
  { x: 12, z: -11, mem: 2, hidden: true },   // corruption sight only
  { x: -13, z: -6, mem: null, hidden: true }, // flavour shard
];

const RUINS = [
  { x: -16, z: -16, sx: 1.2, sy: 6, sz: 1.2 },
  { x: 18, z: -14, sx: 0.9, sy: 5, sz: 0.9 },
  { x: -14, z: 13, sx: 1.4, sy: 4, sz: 1.4 },
  { x: 20, z: 10, sx: 1.0, sy: 7, sz: 1.0 },
  { x: 0, z: 19, sx: 1.1, sy: 3, sz: 1.1 },
];

const CORRUPT_MARKS = [
  { x: 4, z: -4 }, { x: -8, z: 10 }, { x: 14, z: 5 }, { x: -5, z: -13 },
];

// ---------- state ----------

const state = {
  player: { x: 0, z: 0 },
  cameraYaw: 0,
  corruption: 0,
  cinderTrust: 0,
  collected: new Set(),
  dialogueOpen: false,
  sightActive: false,
  time: 0,
  endingShown: false,
  _eCooldown: false,
};

// ---------- UI ----------

const ui = {
  corruptFill: document.getElementById('corrupt-fill'),
  corruptLabel: document.getElementById('corrupt-label'),
  memCount: document.getElementById('mem-count'),
  dialogue: document.getElementById('dialogue'),
  dlgSpeaker: document.getElementById('dlg-speaker'),
  dlgText: document.getElementById('dlg-text'),
  dlgChoices: document.getElementById('dlg-choices'),
  memory: document.getElementById('memory'),
  body: document.body,
};

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function setCorruption(v) {
  state.corruption = Math.max(0, Math.min(100, v));
  ui.corruptFill.style.width = state.corruption + '%';
  updateGlitchClasses();
}

function updateGlitchClasses() {
  const c = state.corruption;
  ui.body.classList.toggle('glitch-1', c > 30);
  ui.body.classList.toggle('glitch-2', c > 60);
  ui.body.classList.toggle('scanlines', c > 40);
  ui.body.classList.toggle('chromatic', c > 55);
  ui.corruptLabel.textContent = c > 70 ? 'CORRUPTED' : 'CORRUPTION';
}

function showDialogue(speaker, text, choices, onClose) {
  state.dialogueOpen = true;
  ui.dialogue.classList.remove('hidden');
  ui.dlgSpeaker.textContent = speaker;
  ui.dlgText.textContent = text;
  ui.dlgChoices.innerHTML = '';
  choices.forEach((ch) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = ch.label;
    b.onclick = () => {
      state.cinderTrust = Math.max(-1, Math.min(1, state.cinderTrust + ch.delta));
      closeDialogue(onClose);
    };
    ui.dlgChoices.appendChild(b);
  });
  ui.dialogue.dataset.onClose = onClose || '';
}

function closeDialogue(onClose) {
  state.dialogueOpen = false;
  ui.dialogue.classList.add('hidden');
  if (onClose) onClose();
}

function recoverMemory(memIndex) {
  if (state.collected.has(memIndex)) return;
  state.collected.add(memIndex);
  ui.memCount.textContent = state.collected.size + '/3';
  setCorruption(state.corruption + 12);

  const m = MEMORIES[memIndex];
  ui.memory.textContent = `Memory recovered: "${m.text}"`;
  ui.memory.classList.add('show');

  showDialogue('CINDER', m.cinder, m.choices, () => {
    if (state.collected.size >= 3 && !state.endingShown) {
      state.endingShown = true;
      showDialogue('SYSTEM', 'All memories recovered. The layer is failing. Choose how you end.', [
        { label: 'Surrender to Cinder', delta: 0 },
        { label: 'Reject the interface', delta: 0 },
      ], showEnding);
    }
  });
}

function showEnding() {
  let text;
  if (state.cinderTrust >= 1) {
    text = 'You let Cinder rewrite you. The Hollow Interface wears your face now. The Lattice endures.';
  } else if (state.cinderTrust <= -1) {
    text = 'You severed the link. Ashen Meridian collapses around you. You are alone in the dark.';
  } else {
    text = 'You walked the middle line. The layer fails, but you remain yourself\u2014for now.';
  }
  if (state.corruption > 80) text += ' The corruption consumed you either way.';
  showDialogue('ENDING', text, [
    { label: 'Start over', delta: 0 },
  ], () => {
    state.collected = new Set();
    state.cinderTrust = 0;
    state.corruption = 0;
    state.endingShown = false;
    state.player.x = 0; state.player.z = 0;
    ui.memCount.textContent = '0/3';
    ui.memory.classList.remove('show');
    setCorruption(0);
  });
}

// ---------- Three.js ----------

let renderer, scene, camera, composer, bloomPass, vignettePass;
let playerMesh, playerLight, ground;
const shards = [];
const ruins = [];
const corruptMarks = [];
const clock = new THREE.Clock();
const tmpVec = new THREE.Vector3();

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    corruption: { value: 0 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float corruption;
    uniform vec2 resolution;
    varying vec2 vUv;
    float random(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      float off = 0.002 + corruption*0.006;
      vec3 r = texture2D(tDiffuse, uv+vec2(off,0.0)).rgb;
      vec3 g = texture2D(tDiffuse, uv).rgb;
      vec3 b = texture2D(tDiffuse, uv-vec2(off,0.0)).rgb;
      vec3 col = vec3(r.r,g.g,b.b);
      float n = random(uv*50.0+time*2.0);
      col *= 0.94 + n*0.04*corruption;
      float scan = sin(uv.y*resolution.y*1.5 + time*10.0)*0.5+0.5;
      col *= 0.97 + (scan-0.5)*0.04*(0.5+corruption);
      float flick = random(vec2(time*30.0,0.0));
      col *= (flick>0.985)?1.15:1.0;
      col *= 1.0 + corruption*0.1;
      float d = length(uv-0.5);
      col *= 1.0 - smoothstep(0.55,0.85,d)*(0.4+corruption*0.5);
      gl_FragColor = vec4(col,1.0);
    }
  `,
};

function init() {
  const canvas = document.getElementById('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x050608, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0b0f, 0.025);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 5, -9);

  // lights
  const ambient = new THREE.AmbientLight(0x50505a, 0.35);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, 0.5);
  dir.position.set(10, 25, 10);
  dir.castShadow = true;
  dir.shadow.camera.left = -20; dir.shadow.camera.right = 20;
  dir.shadow.camera.top = 20; dir.shadow.camera.bottom = -20;
  dir.shadow.mapSize.width = 1024; dir.shadow.mapSize.height = 1024;
  scene.add(dir);

  // ground
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x0e0f14, emissive: 0x040406, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ruins
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x12141a, emissive: 0x030406, roughness: 0.9 });
  RUINS.forEach((r) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(r.sx, r.sy, r.sz), ruinMat);
    m.position.set(r.x, r.sy / 2, r.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    ruins.push(m);
  });

  // corruption marks
  const corruptMat = new THREE.MeshStandardMaterial({
    color: 0xff4d6d, emissive: 0x550010, emissiveIntensity: 2, roughness: 0.3,
  });
  CORRUPT_MARKS.forEach((c) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), corruptMat);
    m.position.set(c.x, 0.45, c.z);
    m.castShadow = true;
    scene.add(m);
    corruptMarks.push(m);
  });

  // player
  const playerMat = new THREE.MeshStandardMaterial({
    color: 0x7cf5ff, emissive: 0x104060, emissiveIntensity: 2, roughness: 0.35, metalness: 0.6,
  });
  playerMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 2), playerMat);
  playerMesh.castShadow = true;
  scene.add(playerMesh);

  playerLight = new THREE.PointLight(0x7cf5ff, 1, 12);
  playerLight.position.set(0, 0.6, 0);
  playerMesh.add(playerLight);

  // shards
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x7cf5ff, emissive: 0x00ffaa, emissiveIntensity: 3, roughness: 0.2, metalness: 1,
  });
  SHARD_POS.forEach((s, i) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), shardMat);
    m.position.set(s.x, 0.6, s.z);
    m.castShadow = true;
    m.visible = !s.hidden;
    scene.add(m);
    shards.push({ mesh: m, x: s.x, z: s.z, mem: s.mem, hidden: s.hidden, baseY: 0.6, bob: Math.random() * 6.28 });
  });

  // composer
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.4, 0.4, 0.85);
  bloomPass.threshold = 0.05;
  composer.addPass(bloomPass);

  vignettePass = new ShaderPass(VignetteShader);
  composer.addPass(vignettePass);

  window.addEventListener('resize', onResize);
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  vignettePass.uniforms.resolution.value.set(w, h);
  bloomPass.resolution.set(w, h);
}

function update(dt) {
  state.time += dt;

  const moving = new THREE.Vector3();
  if (keys['KeyW']) moving.z -= 1;
  if (keys['KeyS']) moving.z += 1;
  if (keys['KeyA']) moving.x -= 1;
  if (keys['KeyD']) moving.x += 1;

  if (!state.dialogueOpen && moving.lengthSq() > 0) {
    moving.normalize();
    const spd = 7;
    // camera-relative movement
    camera.getWorldDirection(tmpVec);
    tmpVec.y = 0; tmpVec.normalize();
    const forward = tmpVec.clone();
    const right = new THREE.Vector3().crossVectors(camera.up, forward).normalize();
    const move = forward.clone().multiplyScalar(-moving.z).add(right.clone().multiplyScalar(moving.x));
    state.player.x += move.x * spd * dt;
    state.player.z += move.z * spd * dt;
    state.player.x = Math.max(-22, Math.min(22, state.player.x));
    state.player.z = Math.max(-22, Math.min(22, state.player.z));

    // face movement
    state.cameraYaw = Math.atan2(move.x, -move.z);
  }

  // player mesh transform
  playerMesh.position.set(state.player.x, 0, state.player.z);
  playerMesh.rotation.y += dt * 1.2;
  playerMesh.scale.setScalar(1 + Math.sin(state.time * 6) * 0.03);

  // camera follow behind player
  const targetPos = new THREE.Vector3(state.player.x, 1.6, state.player.z);
  const offset = new THREE.Vector3(0, 4.2, -8.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.cameraYaw);
  const idealCam = targetPos.clone().add(offset);
  camera.position.lerp(idealCam, 0.11);
  camera.lookAt(targetPos);

  // sight (shift) -> corruption sight, reveal hidden shards, raise corruption
  state.sightActive = (keys['ShiftLeft'] || keys['ShiftRight']) && !state.dialogueOpen;
  if (state.sightActive) setCorruption(state.corruption + 6 * dt);
  else setCorruption(state.corruption - 2 * dt);

  // fog reacts to corruption
  const fog = scene.fog;
  fog.color.setHSL(0.6, 0.5, 0.04 + state.corruption * 0.0018);
  fog.density = 0.022 + state.corruption * 0.0014;

  // vignette uniform
  vignettePass.uniforms.time.value = state.time;
  vignettePass.uniforms.corruption.value = state.corruption / 100;

  // shards bob / reveal
  shards.forEach((s) => {
    s.mesh.visible = !state.collected.has(String(s.mem)) && (s.mem === null || !s.hidden || state.sightActive);
    if (state.collected.has(String(s.mem))) { s.mesh.visible = false; return; }
    s.mesh.position.y = s.baseY + Math.sin(state.time * 3 + s.bob) * 0.35;
    s.mesh.rotation.y += dt * 1.0;
    s.mesh.rotation.x += dt * 1.3;
  });

  // corruption marks pulse
  corruptMarks.forEach((m) => {
    const k = 0.5 + Math.sin(state.time * 4 + m.position.x) * 0.5;
    m.material.emissiveIntensity = 1 + k * 2 * (state.corruption / 100);
    m.scale.setScalar(0.9 + k * 0.2);
  });

  // interact E
  if (keys['KeyE'] && !state.dialogueOpen && !state._eCooldown) {
    state._eCooldown = true;
    setTimeout(() => { state._eCooldown = false; }, 350);
    const p = new THREE.Vector3(state.player.x, 0.6, state.player.z);
    for (const s of shards) {
      if (state.collected.has(String(s.mem))) continue;
      if (s.hidden && !state.sightActive) continue;
      if (p.distanceTo(s.mesh.position) < 1.9) {
        if (s.mem !== null) recoverMemory(s.mem);
        else {
          ui.memory.textContent = 'A hollow shard. Nothing to remember.';
          ui.memory.classList.add('show');
          setTimeout(() => ui.memory.classList.remove('show'), 1500);
          setCorruption(state.corruption + 4);
        }
        state.collected.add(String(s.mem));
        break;
      }
    }
  }

  updateGlitchClasses();
}

function render() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  composer.render();
  requestAnimationFrame(render);
}

// bootstrap
init();
render();
