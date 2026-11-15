import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const LANES = [-2.2, 0, 2.2];
let laneIndex = 1;
let speed = 0;
let score = 0;
let isPlaying = false;
let gameOver = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.Fog(0x050510, 16, 55);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3.6, 5.2);
camera.lookAt(0, 0.5, -5);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const light = new THREE.DirectionalLight(0xccf2ff, 1.15);
light.position.set(4, 9, 6);
scene.add(light);
scene.add(new THREE.AmbientLight(0x2a2a50, 1.6));

// subtle moving horizon glow
const horizonGeo = new THREE.PlaneGeometry(80, 30, 1, 1);
const horizonMat = new THREE.MeshBasicMaterial({
  color: 0x2b1055, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const horizon = new THREE.Mesh(horizonGeo, horizonMat);
horizon.position.set(0, 8, -34);
horizon.rotation.x = -0.1;
scene.add(horizon);

function createGridMaterial(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 40);
  return tex;
}

const roadGeo = new THREE.PlaneGeometry(12, 200);
const roadMat = new THREE.MeshStandardMaterial({
  map: createGridMaterial('#0a0a1a'),
  roughness: 0.4,
  metalness: 0.2
});
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
road.position.z = -50;
scene.add(road);

const playerGroup = new THREE.Group();
playerGroup.position.set(LANES[laneIndex], 0, 0);
scene.add(playerGroup);

const bodyGeo = new THREE.BoxGeometry(0.75, 1.1, 0.75);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00d2ff, emissive: 0x004466, roughness: 0.35, metalness: 0.4 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 0.55;
playerGroup.add(body);

const coreGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.5, 16);
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
const core = new THREE.Mesh(coreGeo, coreMat);
core.position.set(0, 0.55, 0.42);
core.rotation.x = Math.PI / 2;
playerGroup.add(core);

const trailGeo = new THREE.BufferGeometry();
const trailCount = 18;
const trailPos = new Float32Array(trailCount * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trailMat = new THREE.PointsMaterial({ color: 0x00d2ff, size: 0.18, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
const trail = new THREE.Points(trailGeo, trailMat);
playerGroup.add(trail);
const trailHistory = [];

const obstacles = [];
const particles = [];

function addObstacle() {
  const lane = Math.floor(Math.random() * 3);
  const type = Math.random();
  const obsGroup = new THREE.Group();
  let hitY = 0;

  if (type < 0.33) {
    const geo = new THREE.BoxGeometry(1, 1.1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff4ecd, emissive: 0x4a0044, roughness: 0.35, metalness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.55;
    obsGroup.add(mesh);
    hitY = 0.55;
  } else if (type < 0.66) {
    const geo = new THREE.CylinderGeometry(0.42, 0.42, 1.7, 20);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff4ecd, emissive: 0x4a0044, roughness: 0.35, metalness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.85;
    obsGroup.add(mesh);
    hitY = 0.85;
  } else {
    const geo = new THREE.BoxGeometry(2.9, 0.55, 1.05);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff4ecd, emissive: 0x4a0044, roughness: 0.35, metalness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.275;
    obsGroup.add(mesh);
    hitY = 0.275;
  }

  // warning rim light
  const rimGeo = new THREE.EdgesGeometry(obsGroup.children[0].geometry);
  const rimMat = new THREE.LineBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.8 });
  const rim = new THREE.LineSegments(rimGeo, rimMat);
  rim.position.copy(obsGroup.children[0].position);
  obsGroup.add(rim);

  obsGroup.position.set(LANES[lane], 0, -80);
  obsGroup.userData = { lane, hitY };
  scene.add(obsGroup);
  obstacles.push(obsGroup);
}

let spawnTimer = 0;
let runDistance = 0;

export function setLane(direction) {
  if (!isPlaying) return;
  if (direction === 'left' && laneIndex > 0) laneIndex--;
  if (direction === 'right' && laneIndex < 2) laneIndex++;
}

export function jump() {
  if (!isPlaying || player.userData.jumping) return;
  player.userData.jumping = true;
  player.userData.jumpVel = 0.22;
  showFeedback('Jump!');
}

export function startGame() {
  if (isPlaying) return;
  isPlaying = true;
  gameOver = false;
  score = 0;
  speed = 0.18;
  runDistance = 0;
  spawnTimer = 0;
  laneIndex = 1;
  playerGroup.position.set(LANES[laneIndex], 0, 0);
  body.position.y = 0.55;
  body.userData.jumping = false;
  body.userData.jumpVel = 0;
  trailHistory.length = 0;
  obstacles.forEach(o => scene.remove(o));
  obstacles.length = 0;
  document.getElementById('startScreen').style.opacity = '0';
  document.getElementById('startScreen').style.pointerEvents = 'none';
  document.getElementById('gameOverScreen').style.opacity = '0';
  document.getElementById('gameOverScreen').style.pointerEvents = 'none';
  document.getElementById('restartBtn').focus();
  updateScore(0);
}

function endGame() {
  isPlaying = false;
  gameOver = true;
  document.getElementById('finalScore').textContent = `Score: ${Math.floor(score)}`;
  document.getElementById('gameOverScreen').style.opacity = '1';
  document.getElementById('gameOverScreen').style.pointerEvents = 'auto';
}

function updateScore(s) {
  document.getElementById('scoreBoard').textContent = Math.floor(s).toLocaleString();
}

function showFeedback(text) {
  const el = document.getElementById('feedback');
  el.textContent = text;
  el.classList.add('pop');
  clearTimeout(showFeedback.t);
  showFeedback.t = setTimeout(() => el.classList.remove('pop'), 800);
}

export const cameraActive = { get: () => isPlaying };

let lastTime = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 16.67, 3);
  lastTime = now;

  if (isPlaying) {
    speed += 0.00003 * dt;
    runDistance += speed * dt;
    score += speed * dt * 12;
    updateScore(score);

    // lane smoothing
    playerGroup.position.x += (LANES[laneIndex] - playerGroup.position.x) * 0.18 * dt;

    // jump physics
    if (body.userData.jumping) {
      body.position.y += body.userData.jumpVel * dt;
      core.position.y = body.position.y;
      body.userData.jumpVel -= 0.018 * dt;
      if (body.position.y <= 0.55) {
        body.position.y = 0.55;
        core.position.y = 0.55;
        body.userData.jumping = false;
        body.userData.jumpVel = 0;
      }
    }

    // running bob
    if (!body.userData.jumping) {
      const bob = Math.sin(performance.now() * 0.02) * 0.04;
      body.position.y = 0.55 + bob;
      core.position.y = 0.55 + bob;
    }

    // particle trail
    trailHistory.unshift(new THREE.Vector3(playerGroup.position.x, body.position.y - 0.1, 0.6));
    if (trailHistory.length > trailCount) trailHistory.pop();
    const positions = trail.geometry.attributes.position.array;
    for (let i = 0; i < trailCount; i++) {
      const p = trailHistory[i] || trailHistory[trailHistory.length - 1] || new THREE.Vector3();
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y - i * 0.015;
      positions[i * 3 + 2] = p.z + i * 0.12;
    }
    trail.geometry.attributes.position.needsUpdate = true;

    // road texture scroll
    roadMat.map.offset.y -= speed * 0.03 * dt;

    // spawn
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      addObstacle();
      spawnTimer = 90 - Math.min(60, score / 30);
    }

    // move obstacles / collision
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.position.z += speed * dt * 12;
      if (o.position.z > 6) {
        scene.remove(o);
        obstacles.splice(i, 1);
        score += 5;
        continue;
      }
      if (
        Math.abs(o.position.z - playerGroup.position.z) < 0.85 &&
        Math.abs(o.position.x - playerGroup.position.x) < 0.95 &&
        body.position.y < o.userData.hitY + 0.55
      ) {
        endGame();
        break;
      }
    }
  }

  // idle animation
  if (!isPlaying) {
    playerGroup.rotation.y += 0.02;
  } else {
    playerGroup.rotation.y *= 0.9;
  }

  scene.fog.color.setHSL(0.68, 0.6, 0.04 + Math.sin(performance.now() * 0.0003) * 0.01);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

requestAnimationFrame(loop);
