export const vertexSource = `#version 300 es
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

export const fragmentSource = `#version 300 es
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
