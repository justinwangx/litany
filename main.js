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

const vertexSource = `#version 300 es
precision highp float;

const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

out vec2 vUv;

void main() {
  vec2 position = positions[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform float uMotionTime;
uniform float uCalm;
uniform float uProgress;

#define TAU 6.28318530718

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec2((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float f = 0.0;
  float amp = 0.52;
  for (int i = 0; i < 4; i++) {
    f += amp * noise(p);
    p = rot(0.72) * p * 2.03 + 19.17;
    amp *= 0.5;
  }
  return f;
}

vec2 cameraOffset(float t) {
  return vec2(
    sin(t * 0.82) * 0.09 + sin(t * 2.31) * 0.05 + sin(t * 4.7) * 0.018,
    cos(t * 0.67) * 0.06 + sin(t * 1.83) * 0.04 + cos(t * 3.9) * 0.016
  );
}

vec3 grade(vec3 color) {
  color = max(color, vec3(0.0));
  color *= vec3(1.18, 0.72, 0.46);
  color = mix(color, vec3(1.0, 0.25, 0.045), 0.18);
  color = color * (1.0 + color * 0.12) / (1.0 + color);
  return pow(color, vec3(0.4545));
}

float projectedGrains(vec2 uv, float scale, float speed, float size, float tail, float density, float seed, float outness) {
  float t = uMotionTime;
  float chaos = 1.0 - uCalm;
  vec2 center = vec2(
    0.16 * sin(t * (0.41 + seed * 0.003) + seed) * chaos,
    -0.03 + 0.12 * cos(t * (0.36 + seed * 0.002) + seed * 1.7) * chaos
  );
  vec2 wind = normalize(vec2(-0.58, 0.22));
  vec2 radial = normalize(uv - center + 0.0001);
  vec2 layerGust = normalize(vec2(sin(seed * 2.4 + t * 0.9), cos(seed * 1.7 - t * 0.6)));
  vec2 baseDir = normalize(mix(wind + layerGust * 0.24, radial, outness));
  vec2 p = uv - baseDir * t * speed;
  p += vec2(sin(t * 1.7 + seed), cos(t * 1.3 - seed)) * 0.035 * chaos;

  vec2 grid = p * scale;
  vec2 id = floor(grid);
  vec2 f = fract(grid);
  vec2 rnd = hash22(id + seed * 23.7);
  float alive = step(1.0 - density * (0.18 + chaos * 0.82), rnd.x);
  vec2 local = rnd - f;
  vec2 screenPos = uv + local / scale;
  vec2 outDir = normalize(screenPos - center + (rnd - 0.5) * 0.45 + layerGust * 0.12);
  vec2 gdir = normalize(mix(wind, outDir, outness + (rnd.y - 0.5) * 0.2));

  float along = dot(local, gdir);
  float perp = abs(local.x * gdir.y - local.y * gdir.x);
  float dotCore = exp(-dot(local, local) / max(0.00001, size * size));
  float smear = exp(-(perp * perp) / max(0.00001, size * size * 0.42));
  smear *= smoothstep(size * tail, -size * 0.8, along) * smoothstep(-size * tail * 1.1, size * 0.7, along);
  float glint = 0.45 + rnd.y * 1.1;
  return alive * (dotCore * 1.08 + smear * 0.055 * chaos) * glint * (0.22 + chaos * 0.78);
}

float lensHits(vec2 uv, float scale, float speed, float seed) {
  vec2 wind = normalize(vec2(-0.62, 0.2));
  vec2 p = uv - wind * uTime * speed + vec2(sin(uTime * 1.7 + seed), cos(uTime * 1.4 - seed)) * 0.16;
  vec2 grid = p * scale;
  vec2 id = floor(grid);
  vec2 f = fract(grid);
  vec2 rnd = hash22(id + seed * 51.0);
  float alive = step(0.945, rnd.x);
  vec2 local = rnd - f;
  float d = dot(local, local);
  float soft = exp(-d / (0.018 + rnd.y * 0.06));
  float core = exp(-d / 0.003);
  return alive * (soft * 0.55 + core) * (0.45 + rnd.y);
}

vec3 storm(vec2 uv) {
  float t = uMotionTime;
  float chaos = 1.0 - uCalm;
  vec2 cam = cameraOffset(t) * chaos;
  float roll = (sin(t * 0.74) * 0.075 + sin(t * 2.4) * 0.032 + sin(t * 5.1) * 0.014) * chaos;
  float push = 1.025 + (0.025 + sin(t * 1.5) * 0.042 + sin(t * 3.3) * 0.018) * chaos;
  uv = rot(roll) * (uv * push) + cam;

  vec2 q = uv;
  q += vec2(t * 1.15, -t * 0.42);
  q += vec2(sin(uv.y * 2.1 + t * 0.9), cos(uv.x * 1.8 - t * 0.7)) * 0.09;

  float fogA = fbm(q * 0.88);
  float fogB = fbm(q * 2.2 + vec2(-t * 0.9, t * 0.38));
  float fog = fogA * 0.66 + fogB * 0.34;
  float gust = noise(vec2(uv.x * 1.4 + t * 3.5, uv.y * 2.8 - t * 1.7));

  vec3 deep = vec3(0.22, 0.07, 0.016);
  vec3 burnt = vec3(0.62, 0.2, 0.04);
  vec3 orange = vec3(1.05, 0.38, 0.065);
  vec3 color = mix(deep, burnt, smoothstep(0.08, 0.86, fog));
  color = mix(color, orange, smoothstep(0.42, 1.0, fog + gust * 0.18) * 0.52);
  float curtainA = fbm(uv * vec2(1.25, 2.4) + vec2(-t * 1.4, t * 0.55));
  float curtainB = noise(uv * vec2(3.1, 1.6) + vec2(t * 2.1, -t * 0.8));
  float curtain = smoothstep(0.44, 0.92, curtainA * 0.72 + curtainB * 0.28);
  color = mix(color * vec3(0.58, 0.42, 0.32), color, 0.76 + curtain * 0.24);

  float fineDust = projectedGrains(uv, 112.0, 5.8, 0.018, 0.75, 0.58, 3.0, 0.18);
  float midDust = projectedGrains(uv, 48.0, 7.4, 0.052, 0.9, 0.64, 17.0, 0.34);
  float nearDust = projectedGrains(uv * 1.08 + vec2(0.04, -0.02), 25.0, 9.1, 0.096, 1.0, 0.6, 29.0, 0.52);
  float frontDust = projectedGrains(uv, 10.0, 12.5, 0.18, 1.15, 0.56, 47.0, 0.68);

  float dustEnergy = 0.22 + chaos * 0.92;
  color += vec3(0.92, 0.28, 0.055) * fineDust * 0.07 * dustEnergy;
  color += vec3(1.0, 0.36, 0.075) * midDust * 0.1 * dustEnergy;
  color += vec3(1.0, 0.42, 0.09) * nearDust * 0.12 * dustEnergy;
  color += vec3(1.0, 0.36, 0.065) * frontDust * 0.12 * dustEnergy;

  float filmGrit = fbm(uv * vec2(78.0, 46.0) + vec2(t * 5.2, -t * 3.7));
  color += vec3(0.12, 0.03, 0.006) * (filmGrit - 0.5) * (0.04 + chaos * 0.05);

  float thickVeil = fbm(uv * vec2(1.8, 2.7) + vec2(t * 2.0, -t * 0.85));
  float hotVeil = smoothstep(0.36, 0.86, thickVeil + fog * 0.18);
  color = mix(color, vec3(0.95, 0.28, 0.045), hotVeil * (0.12 + chaos * 0.18));

  float frameBurn = smoothstep(1.2, 0.18, length(uv * vec2(0.72, 0.95)));
  color = mix(color * 0.86, color, frameBurn * 0.35 + 0.65);
  color += vec3(0.7, 0.18, 0.03) * (1.0 - frameBurn) * 0.08;

  float tealHole = smoothstep(0.58, 0.08, length(uv - cam * 0.35));
  color += vec3(0.0, 0.14, 0.12) * tealHole * (0.1 + uCalm * 0.16);

  vec3 graded = grade(color);
  float collapse = smoothstep(0.88, 1.0, uProgress);
  float auraRadius = mix(0.78, 0.055, collapse);
  float auraAlpha = smoothstep(0.24, 0.92, uCalm) * (1.0 - collapse);
  float calmAura = auraAlpha * smoothstep(auraRadius, auraRadius * 0.18, length(uv));
  graded = mix(graded, vec3(0.34, 0.72, 0.66), calmAura * 0.11);
  return graded;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  vec2 raw = uv;
  float chaos = 1.0 - uCalm;
  uv += (vec2(fbm(raw * 2.0 + uMotionTime * 0.9), fbm(raw * 2.3 - uMotionTime * 0.7)) - 0.5) * (0.006 + chaos * 0.033);
  fragColor = vec4(storm(uv), 1.0);
}
`;

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
