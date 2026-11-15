import { startGame, setLane, jump, cameraActive } from './game.js';
import { initCamera, detectPose } from './poseController.js';

document.getElementById('startBtn').addEventListener('click', async () => {
  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  btn.textContent = 'Starting...';
  try {
    await initCamera();
    startGame();
    loop();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Start Game';
  }
});

document.getElementById('restartBtn').addEventListener('click', () => {
  startGame();
});

// Keyboard fallback
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { e.preventDefault(); setLane('left'); }
  if (e.key === 'ArrowRight') { e.preventDefault(); setLane('right'); }
  if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); jump(); }
});

let runBoostTimer = 0;
function onRun() {
  if (!cameraActive.get()) return;
  runBoostTimer = 15;
}

function onJump() {
  if (!cameraActive.get()) return;
  jump();
}

function onLaneLeft() {
  if (!cameraActive.get()) return;
  setLane('left');
}

function onLaneRight() {
  if (!cameraActive.get()) return;
  setLane('right');
}

function loop() {
  detectPose(onRun, onJump, onLaneLeft, onLaneRight);
  requestAnimationFrame(loop);
}
