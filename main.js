import { fragmentSource, vertexSource } from "./shaders.js";

const canvas = document.querySelector("#desert");
const grainCanvas = document.querySelector("#grains");
const gl = canvas.getContext("webgl2", {
  antialias: false,
  depth: false,
  stencil: false,
  alpha: false,
  powerPreference: "high-performance",
});
const grainCtx = grainCanvas.getContext("2d", { alpha: true });

if (!gl) {
  document.body.classList.add("no-webgl");
  throw new Error("WebGL2 is not available.");
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram() {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info);
  }
  return program;
}

const program = createProgram();
const uniforms = {
  resolution: gl.getUniformLocation(program, "uResolution"),
  pointer: gl.getUniformLocation(program, "uPointer"),
  time: gl.getUniformLocation(program, "uTime"),
  motionTime: gl.getUniformLocation(program, "uMotionTime"),
  calm: gl.getUniformLocation(program, "uCalm"),
  progress: gl.getUniformLocation(program, "uProgress"),
};

let pointer = { x: 0.52, y: 0.5 };
let renderedStill = false;
let startTime = 0;
let lastFrame = 0;
let motionTime = 0;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const litanyDuration = 40;
const particles = [];
const particleCount = 1200;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function resetParticle(p, burst = false) {
  const angle = randomBetween(0, Math.PI * 2);
  const radius = burst ? randomBetween(0.02, 0.34) : randomBetween(0.0, 1.4);
  p.x = Math.cos(angle) * radius + randomBetween(-0.12, 0.12);
  p.y = Math.sin(angle) * radius * 0.7 + randomBetween(-0.14, 0.14);
  if (burst || Math.random() < 0.64) {
    p.z = randomBetween(0.08, 0.62);
  } else {
    p.z = randomBetween(0.62, 1.45);
  }
  p.vx = randomBetween(-0.34, -0.04);
  p.vy = randomBetween(-0.08, 0.16);
  p.speed = randomBetween(0.48, 1.65);
  p.size = Math.random() < 0.82 ? randomBetween(0.38, 1.35) : randomBetween(1.4, 2.65);
  p.warmth = randomBetween(0.55, 1.0);
  p.phase = randomBetween(0, Math.PI * 2);
}

for (let i = 0; i < particleCount; i += 1) {
  const particle = {};
  resetParticle(particle);
  particles.push(particle);
}

function resetParticles() {
  for (const particle of particles) {
    resetParticle(particle);
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    grainCanvas.width = width;
    grainCanvas.height = height;
    gl.viewport(0, 0, width, height);
  }
}

function drawGrains(now, dt, calm) {
  const width = grainCanvas.width;
  const height = grainCanvas.height;
  const t = now;
  const chaos = 1 - calm;
  const motion = Math.pow(chaos, 1.45);
  const centerX = width * (0.5 + (pointer.x - 0.5) * 0.04 * chaos);
  const centerY = height * (0.51 - (pointer.y - 0.5) * 0.04 * chaos);
  const focal = Math.min(width, height) * (0.54 + Math.sin(t * 1.7) * 0.025 * chaos);
  const shakeX = (Math.sin(t * 2.1) + Math.sin(t * 5.7) * 0.35) * width * 0.011 * chaos;
  const shakeY = (Math.cos(t * 1.7) + Math.sin(t * 4.3) * 0.35) * height * 0.01 * chaos;
  const roll = (Math.sin(t * 1.2) * 0.025 + Math.sin(t * 3.8) * 0.012) * chaos;
  const gust = (Math.sin(t * 1.6) * 0.8 + Math.sin(t * 4.2) * 0.28) * chaos;
  const shutter = 0.82 + (Math.sin(t * 18.0) * 0.5 + 0.5) * 0.18 * chaos;

  grainCtx.setTransform(1, 0, 0, 1, 0, 0);
  grainCtx.clearRect(0, 0, width, height);
  grainCtx.translate(centerX + shakeX, centerY + shakeY);
  grainCtx.rotate(roll);
  grainCtx.translate(-centerX, -centerY);
  grainCtx.globalCompositeOperation = "lighter";

  for (const p of particles) {
    const oldZ = p.z;
    const oldX = p.x;
    const oldY = p.y;
    const gustCurl = Math.sin(t * 2.4 + p.phase + p.z * 5.0);
    p.z -= dt * p.speed * motion * (0.42 + Math.max(0, gust) * 0.22);
    p.x += dt * motion * (p.vx + gustCurl * 0.055 - gust * 0.06);
    p.y += dt * motion * (p.vy + Math.cos(t * 1.8 + p.phase) * 0.045);

    if (p.z < 0.035 || Math.abs(p.x / Math.max(p.z, 0.05)) > 2.2 || Math.abs(p.y / Math.max(p.z, 0.05)) > 1.7) {
      resetParticle(p, true);
      continue;
    }

    const sx = centerX + (p.x / p.z) * focal;
    const sy = centerY + (p.y / p.z) * focal;
    const osx = centerX + (oldX / oldZ) * focal;
    const osy = centerY + (oldY / oldZ) * focal;
    const perspective = Math.min(5.5, 1 / Math.max(0.08, p.z));
    const calmFade = 0.18 + chaos * 0.82;
    const alpha = Math.min(0.95, 0.16 + perspective * 0.24) * p.warmth * shutter * calmFade;
    const size = p.size * perspective;

    if (sx < -80 || sx > width + 80 || sy < -80 || sy > height + 80) continue;

    const red = Math.round(222 + p.warmth * 30);
    const green = Math.round(68 + p.warmth * 48);
    const blue = Math.round(8 + p.warmth * 14);
    grainCtx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.34 * chaos})`;
    grainCtx.lineWidth = Math.max(0.4, size * 0.2);
    grainCtx.beginPath();
    grainCtx.moveTo(osx, osy);
    grainCtx.lineTo(sx, sy);
    grainCtx.stroke();

    grainCtx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    grainCtx.beginPath();
    const radius = Math.max(0.28, size * 0.34);
    grainCtx.ellipse(sx, sy, radius * randomBetween(0.65, 1.25), radius * randomBetween(0.45, 0.92), p.phase + t, 0, Math.PI * 2);
    grainCtx.fill();
  }

  grainCtx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 170; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = randomBetween(0.16, 0.92);
    const a = randomBetween(0.018, 0.07) * (0.28 + chaos * 0.72);
    const warm = Math.random() < 0.5;
    grainCtx.fillStyle = warm ? `rgba(217, 77, 20, ${a * 0.42})` : `rgba(18, 7, 3, ${a})`;
    grainCtx.beginPath();
    grainCtx.ellipse(x, y, r * randomBetween(1.1, 2.8), r * randomBetween(0.42, 0.95), randomBetween(0, Math.PI), 0, Math.PI * 2);
    grainCtx.fill();
  }

  grainCtx.setTransform(1, 0, 0, 1, 0, 0);
}

function render(now) {
  resize();
  if (!startTime) startTime = now;
  const dt = Math.min(0.04, Math.max(0.001, (now - lastFrame) / 1000 || 0.016));
  lastFrame = now;
  const elapsed = (now - startTime) / 1000;
  const progress = reduceMotion.matches ? 1 : clamp(elapsed / litanyDuration, 0, 1);
  const calm = Math.pow(smoothstep(0.1, 1, progress), 1.18);
  const chaos = 1 - calm;
  motionTime += dt * Math.pow(chaos, 1.35) * 1.75;
  gl.useProgram(program);
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
  gl.uniform1f(uniforms.time, elapsed);
  gl.uniform1f(uniforms.motionTime, motionTime);
  gl.uniform1f(uniforms.calm, calm);
  gl.uniform1f(uniforms.progress, progress);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  drawGrains(motionTime, dt, calm);

  if (reduceMotion.matches || progress >= 1) {
    renderedStill = true;
    document.body.classList.add("is-ended");
    return;
  }
  requestAnimationFrame(render);
}

window.addEventListener("resize", () => {
  resize();
  if (renderedStill) requestAnimationFrame(render);
});

function restartScene() {
  if (!renderedStill) return;

  document.body.classList.add("is-resetting");
  document.body.offsetWidth;
  startTime = 0;
  lastFrame = 0;
  motionTime = 0;
  renderedStill = false;
  document.body.classList.remove("is-ended");
  resetParticles();
  grainCtx.setTransform(1, 0, 0, 1, 0, 0);
  grainCtx.clearRect(0, 0, grainCanvas.width, grainCanvas.height);
  document.body.classList.remove("is-resetting");
  requestAnimationFrame(render);
}

window.addEventListener("click", restartScene);

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  if (renderedStill) {
    event.preventDefault();
    restartScene();
  }
});

window.addEventListener("pointermove", (event) => {
  pointer = {
    x: event.clientX / Math.max(1, window.innerWidth),
    y: 1 - event.clientY / Math.max(1, window.innerHeight),
  };
  if (renderedStill) {
    requestAnimationFrame(render);
  }
});

reduceMotion.addEventListener("change", () => {
  startTime = 0;
  motionTime = 0;
  renderedStill = false;
  document.body.classList.remove("is-ended");
  requestAnimationFrame(render);
});

requestAnimationFrame(render);
