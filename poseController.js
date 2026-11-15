import { FilesetResolver, PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/+esm';

let landmarker = null;
let webcam = null;
let runningMode = 'VIDEO';
let lastVideoTime = -1;

const video = document.getElementById('camPreview');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('statusText');
const overlay = document.getElementById('poseOverlay');
const ctx = overlay.getContext('2d');

function setStatus(text, type = '') {
  statusText.textContent = text;
  statusEl.className = type ? type : '';
}

function resizeOverlay() {
  const rect = video.getBoundingClientRect();
  overlay.width = rect.width * window.devicePixelRatio;
  overlay.height = rect.height * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resizeOverlay);

function drawSkeleton(landmarks) {
  resizeOverlay();
  const w = overlay.width / window.devicePixelRatio;
  const h = overlay.height / window.devicePixelRatio;
  ctx.clearRect(0, 0, w, h);

  const connections = [
    [11,12],[11,13],[13,15],[12,14],[14,16],
    [11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]
  ];

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,210,255,0.55)';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of connections) {
    const pa = landmarks[a], pb = landmarks[b];
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
  }
  ctx.stroke();

  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,78,205,0.92)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export async function initCamera() {
  setStatus('Loading pose model...', 'warn');
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
  );
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelArtifactType: 'ModelType_TFLite',
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU'
    },
    runningMode,
    numPoses: 1
  });

  setStatus('Requesting camera...', 'warn');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });
    video.srcObject = stream;
    await new Promise((res) => { video.onloadeddata = res; });
    setStatus('Camera ready. Stand back.', '');
  } catch (err) {
    setStatus('Camera denied: ' + err.message, 'warn');
    throw err;
  }
}

let baselineHipY = null;
let lastKneeLift = { left: 0, right: 0 };
let runStepCount = 0;
let lastLaneX = null;
let laneHoldFrames = 0;
let jumpCooldown = 0;

export function detectPose(onRun, onJump, onLaneLeft, onLaneRight) {
  if (!landmarker || !video.videoWidth) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const result = landmarker.detectForVideo(video, performance.now());
  if (!result.landmarks || result.landmarks.length === 0) {
    setStatus('No body detected. Step back.', 'warn');
    return;
  }

  setStatus('Body tracked — run / jump / step!', 'active');

  const lm = result.landmarks[0];
  drawSkeleton(lm);
  const lHip = lm[23], rHip = lm[24];
  const lKnee = lm[25], rKnee = lm[26];
  const lAnkle = lm[27], rAnkle = lm[28];
  const avgHipY = (lHip.y + rHip.y) / 2;

  if (baselineHipY === null) baselineHipY = avgHipY;
  baselineHipY = baselineHipY * 0.95 + avgHipY * 0.05;

  // --- Running ---
  const kneeLiftThreshold = 0.11; // fraction of image height
  const leftLift = baselineHipY - lKnee.y;
  const rightLift = baselineHipY - rKnee.y;

  const nowLift = { left: leftLift > kneeLiftThreshold ? leftLift : 0, right: rightLift > kneeLiftThreshold ? rightLift : 0 };
  if (nowLift.left && !lastKneeLift.left) runStepCount++;
  if (nowLift.right && !lastKneeLift.right) runStepCount++;
  lastKneeLift = nowLift;

  // call run on every detected step with a small cooldown
  if (runStepCount > 0) {
    onRun();
    runStepCount = Math.max(0, runStepCount - 1);
  }

  // --- Jump ---
  if (jumpCooldown > 0) jumpCooldown--;
  const avgAnkleY = (lAnkle.y + rAnkle.y) / 2;
  const ankleBaselineShift = baselineHipY + 0.35; // rough estimate
  const suddenRise = ankleBaselineShift - avgAnkleY;
  if (jumpCooldown === 0 && suddenRise > 0.08 && avgHipY < baselineHipY - 0.02) {
    onJump();
    jumpCooldown = 25;
  }

  // --- Lane change via hip X movement ---
  const hipX = (lHip.x + rHip.x) / 2;
  if (lastLaneX !== null) {
    const dx = hipX - lastLaneX;
    const threshold = 0.045;
    if (Math.abs(dx) > threshold) {
      laneHoldFrames++;
      if (laneHoldFrames > 4) {
        if (dx > 0) onLaneRight(); else onLaneLeft();
        laneHoldFrames = -25; // prevent repeat
      }
    } else {
      laneHoldFrames = Math.max(0, laneHoldFrames - 1);
    }
  }
  lastLaneX = hipX;
}
