const canvas = document.getElementById('aurora');
const gl = canvas.getContext('webgl');

if (!gl) {
  alert('WebGL not supported');
  throw new Error('WebGL not supported');
}

function resize() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

resize();
window.addEventListener('resize', resize);

// Vertex shader - fullscreen quad
const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Fragment shader - rich flowing aurora gradient
const fragmentShaderSource = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform vec2 mouse;
  uniform float speed;
  uniform float mouseStrength;
  uniform float intensity;
  uniform float distortionAmount;
  uniform vec3 color1;
  uniform vec3 color2;
  uniform vec3 color3;
  uniform vec3 color4;
  uniform vec3 color5;
  uniform float warmCoolShift; // -1.0 cool (sad) → +1.0 warm (happy)
  uniform float saturationBoost; // additional saturation push from energy
  
  // Simplex noise functions
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
  
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / resolution.y;
    vec2 pos = uv;
    pos.x *= aspect;
    
    // Flowing time - controlled by speed
    float t = time * speed;
    
    // Layered noise for organic flow
    float n1 = snoise(pos * 1.5 + t * 0.8);
    float n2 = snoise(pos * 1.0 - t * 0.6 + 10.0);
    float n3 = snoise(pos * 2.0 + t * 0.5 + 20.0);
    float n4 = snoise(pos * 1.2 + t * 0.7 + 30.0);
    
    // Flowing distortion - controlled by distortionAmount
    vec2 distort = vec2(
      snoise(pos * 0.8 + t * 0.4),
      snoise(pos * 0.8 - t * 0.35 + 5.0)
    ) * distortionAmount;
    
    // Mouse influence - controlled by mouseStrength
    vec2 mousePos = mouse;
    mousePos.x *= aspect;
    vec2 toMouse = mousePos - pos;
    float mouseDist = length(toMouse);
    float mouseInfluence = smoothstep(1.0, 0.1, mouseDist) * mouseStrength;
    distort += normalize(toMouse + 0.001) * mouseInfluence;
    
    vec2 p = pos + distort;
    
    vec3 pink = color1;
    vec3 lavender = color2;
    vec3 mint = color3;
    vec3 peach = color4;
    vec3 lilac = color5;
    
    // Blend colors based on position and noise
    float blend1 = smoothstep(-0.5, 0.5, n1 + p.x - 0.5);
    float blend2 = smoothstep(-0.5, 0.5, n2 + p.y - 0.5);
    float blend3 = smoothstep(-0.5, 0.5, n3);
    float blend4 = smoothstep(-0.4, 0.6, n4);
    
    vec3 color = pink;
    color = mix(color, lavender, blend1);
    color = mix(color, mint, blend2 * 0.8);
    color = mix(color, peach, (1.0 - blend1) * blend2 * 0.7);
    color = mix(color, lilac, blend3 * 0.5);
    color = mix(color, pink, blend4 * (1.0 - blend3) * 0.4);
    
    // Subtle brightness variation
    float soft = snoise(p * 2.0 + t * 0.05) * 0.04;
    color += soft;

    // Valence warm/cool — dramatic tint so happy ≠ sad at a glance
    // Warm pushes reds/oranges, cool pushes blues/violets
    vec3 warmTint = vec3(0.22, 0.06, -0.18);
    vec3 coolTint = vec3(-0.18, -0.06, 0.26);
    float warmCoolMag = abs(warmCoolShift);
    color += mix(coolTint, warmTint, (warmCoolShift + 1.0) * 0.5) * warmCoolMag;

    // Sad/cool songs also slightly darken; happy/warm songs slightly brighten
    color *= 1.0 + warmCoolShift * 0.12;

    // Saturation: sad/calm desaturates noticeably, happy/energetic boosts vividness
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    float satFinal = clamp(intensity + saturationBoost, 0.25, 1.7);
    color = mix(vec3(gray), color, satFinal);

    color = clamp(color, 0.0, 1.0);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
  
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

const program = createProgram(vertexShaderSource, fragmentShaderSource);
gl.useProgram(program);

// Fullscreen quad vertices
const vertices = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1
]);

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

const positionLocation = gl.getAttribLocation(program, 'position');
gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

const resolutionLocation = gl.getUniformLocation(program, 'resolution');
const timeLocation = gl.getUniformLocation(program, 'time');
const mouseLocation = gl.getUniformLocation(program, 'mouse');
const speedLocation = gl.getUniformLocation(program, 'speed');
const mouseStrengthLocation = gl.getUniformLocation(program, 'mouseStrength');
const intensityLocation = gl.getUniformLocation(program, 'intensity');
const distortionLocation = gl.getUniformLocation(program, 'distortionAmount');
const color1Location = gl.getUniformLocation(program, 'color1');
const color2Location = gl.getUniformLocation(program, 'color2');
const color3Location = gl.getUniformLocation(program, 'color3');
const color4Location = gl.getUniformLocation(program, 'color4');
const color5Location = gl.getUniformLocation(program, 'color5');
const warmCoolShiftLocation = gl.getUniformLocation(program, 'warmCoolShift');
const saturationBoostLocation = gl.getUniformLocation(program, 'saturationBoost');

// Control elements
const speedSlider = document.getElementById('speed');
const mouseInfluenceSlider = document.getElementById('mouseInfluence');
const intensitySlider = document.getElementById('intensity');
const distortionSlider = document.getElementById('distortion');
const colorSliders = [
  document.getElementById('color1'),
  document.getElementById('color2'),
  document.getElementById('color3'),
  document.getElementById('color4'),
  document.getElementById('color5'),
];
const shareBtn = document.getElementById('shareBtn');
const resetBtn = document.getElementById('resetBtn');
const moodGrid = document.getElementById('moodGrid');
const moodResult = document.getElementById('moodResult');

const DEFAULT_COLORS = ['#f5a8d1', '#c4b8f5', '#a8e8de', '#fccccb', '#e6a8f0'];
const DEFAULT_SLIDERS = { speed: 30, mouse: 40, intensity: 50, distortion: 35 };

const MOODS = {
  calm: {
    label: 'Calm',
    message: 'Soft waves, slow breath.',
    colors: ['#a8d4e6', '#b8e0d2', '#d4e8f0', '#c9dde8', '#b5d4c8'],
    speed: 20, mouse: 35, intensity: 45, distortion: 25,
  },
  dreamy: {
    label: 'Dreamy',
    message: 'Floating through pastels.',
    colors: DEFAULT_COLORS,
    speed: 30, mouse: 40, intensity: 50, distortion: 35,
  },
  bold: {
    label: 'Bold',
    message: 'Turn up the volume.',
    colors: ['#ff6b9d', '#c44dff', '#ff8c42', '#6b5bff', '#ff4d8d'],
    speed: 45, mouse: 50, intensity: 60, distortion: 50,
  },
  cozy: {
    label: 'Cozy',
    message: 'Warm blanket energy.',
    colors: ['#f5c4a8', '#e8b4a0', '#ffd4b8', '#f0a888', '#ffdcc8'],
    speed: 22, mouse: 38, intensity: 48, distortion: 30,
  },
  electric: {
    label: 'Electric',
    message: 'Buzzing with ideas.',
    colors: ['#00e5c7', '#7b61ff', '#ff61dc', '#61d4ff', '#c8ff61'],
    speed: 50, mouse: 55, intensity: 65, distortion: 55,
  },
  mellow: {
    label: 'Mellow',
    message: 'Quiet afternoon light.',
    colors: ['#9aabb8', '#b8a9c9', '#a9b8c4', '#c4b8a9', '#8899aa'],
    speed: 18, mouse: 30, intensity: 42, distortion: 22,
  },
};

let activeMood = null;

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function isValidHexColor(value) {
  return /^[0-9a-fA-F]{6}$/.test(value);
}

function setColors(colors) {
  colorSliders.forEach((input, i) => {
    input.value = colors[i];
  });
}

function setSliders({ speed, mouse, intensity, distortion }) {
  speedSlider.value = speed;
  mouseInfluenceSlider.value = mouse;
  intensitySlider.value = intensity;
  distortionSlider.value = distortion;
}

function setActiveMood(moodId) {
  activeMood = moodId;
  document.querySelectorAll('.mood-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.mood === moodId);
  });
}

function clearActiveMood() {
  activeMood = null;
  document.querySelectorAll('.mood-chip').forEach((chip) => chip.classList.remove('active'));
  moodResult.textContent = 'Your own mix — keep tweaking!';
}

function applyMood(moodId) {
  const mood = MOODS[moodId];
  if (!mood) return;

  setColors(mood.colors);
  setSliders(mood);
  setActiveMood(moodId);
  moodResult.textContent = mood.message;
  updateShareURL();
}

function resetPalette() {
  setColors(DEFAULT_COLORS);
  setSliders(DEFAULT_SLIDERS);
  setActiveMood('dreamy');
  moodResult.textContent = MOODS.dreamy.message;
  updateShareURL();
}

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const moodParam = params.get('mood');
  const hasColorParams = colorSliders.some((_, i) => params.has(`c${i + 1}`));

  if (hasColorParams) {
    colorSliders.forEach((input, i) => {
      const fromURL = params.get(`c${i + 1}`);
      if (fromURL && isValidHexColor(fromURL)) {
        input.value = `#${fromURL}`;
      }
    });
  }

  if (moodParam && MOODS[moodParam]) {
    if (!hasColorParams) {
      applyMood(moodParam);
      return;
    }
    const mood = MOODS[moodParam];
    const colorsMatchMood = colorSliders.every((input, i) =>
      input.value.toLowerCase() === mood.colors[i].toLowerCase()
    );
    if (colorsMatchMood) {
      setSliders(mood);
      setActiveMood(moodParam);
      moodResult.textContent = mood.message;
      return;
    }
  }

  if (hasColorParams) {
    clearActiveMood();
  }
}

function updateShareURL() {
  const params = new URLSearchParams();
  if (activeMood) params.set('mood', activeMood);
  colorSliders.forEach((input, i) => {
    params.set(`c${i + 1}`, input.value.replace('#', ''));
  });
  const query = params.toString();
  const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`;
  history.replaceState(null, '', url);
  return url;
}

Object.keys(MOODS).forEach((moodId) => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'mood-chip';
  chip.dataset.mood = moodId;
  chip.textContent = MOODS[moodId].label;
  chip.addEventListener('click', () => applyMood(moodId));
  moodGrid.appendChild(chip);
});

loadFromURL();
if (!activeMood && !window.location.search) {
  setActiveMood('dreamy');
  moodResult.textContent = MOODS.dreamy.message;
}

colorSliders.forEach((input) => {
  input.addEventListener('input', () => {
    if (activeMood) clearActiveMood();
    updateShareURL();
  });
});

[speedSlider, mouseInfluenceSlider, intensitySlider, distortionSlider].forEach((slider) => {
  slider.addEventListener('input', () => {
    if (activeMood) clearActiveMood();
    updateShareURL();
  });
});

resetBtn.addEventListener('click', resetPalette);

shareBtn.addEventListener('click', async () => {
  const url = updateShareURL();
  try {
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = 'Link copied!';
    shareBtn.classList.add('copied');
    setTimeout(() => {
      shareBtn.textContent = 'Copy your aurora link';
      shareBtn.classList.remove('copied');
    }, 2000);
  } catch {
    shareBtn.textContent = 'Copy failed — try again';
    setTimeout(() => {
      shareBtn.textContent = 'Copy your aurora link';
    }, 2000);
  }
});

let startTime = Date.now();

// Mouse tracking with smooth interpolation
let mouse = { x: 0.5, y: 0.5 };
let targetMouse = { x: 0.5, y: 0.5 };

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  targetMouse.x = (e.clientX - rect.left) / rect.width;
  targetMouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
});

canvas.addEventListener('mouseleave', () => {
  targetMouse.x = 0.5;
  targetMouse.y = 0.5;
});

function render() {
  const elapsed = (Date.now() - startTime) / 1000;
  
  // Smooth mouse interpolation - fluid and gentle
  mouse.x += (targetMouse.x - mouse.x) * 0.06;
  mouse.y += (targetMouse.y - mouse.y) * 0.06;
  
  // Tick Spotify interpolation (no-op when not connected)
  if (window.tickSpotify) window.tickSpotify();

  // Base values from sliders (your mood layer)
  let speed = (speedSlider.value / 100) * 0.6;
  let mouseStrength = (mouseInfluenceSlider.value / 100) * 0.5;
  let intensity = 0.8 + (intensitySlider.value / 100) * 0.6;
  let distortion = (distortionSlider.value / 100) * 0.6;
  let warmCoolShift = 0.0;
  let saturationBoost = 0.0;

  // Spotify modulation — amplified for clear, dramatic differences between songs
  if (window.spotifyState && window.spotifyState.connected) {
    const s = window.spotifyState;

    // TEMPO drives breathing speed — 60 BPM → 0.35×, 160+ BPM → 2.6×
    const tempoNorm = Math.min(Math.max((s.tempo - 60) / 100, 0), 1);
    const tempoMul = 0.35 + tempoNorm * 2.25;

    // ENERGY drives speed + distortion massively — 0 → 0.3×, 1 → 2.8×
    const energyMul = 0.3 + s.energy * 2.5;

    // DANCEABILITY drives fluidity — 0 → 0.5×, 1 → 2.2×
    const danceMul = 0.5 + s.danceability * 1.7;

    speed = Math.max(0.05, speed) * tempoMul * (0.4 + s.energy * 1.4);
    distortion = Math.max(0.08, distortion) * energyMul * 0.7 + 0.05 * s.danceability;
    distortion *= 0.6 + s.danceability * 0.9;

    // VALENCE drives strong warm/cool shift — sad = -1.0 cool, happy = +1.0 warm
    warmCoolShift = (s.valence - 0.5) * 2.0;
    warmCoolShift = Math.max(-1.0, Math.min(1.0, warmCoolShift));

    // Saturation: low-energy/sad songs desaturate, high-energy/happy songs boost
    // Range: -0.45 (very desaturated) to +0.45 (very vivid)
    const moodScore = (s.energy + s.valence) / 2;
    saturationBoost = (moodScore - 0.5) * 0.9;

    // Mouse strength softens on calm tracks
    mouseStrength *= 0.6 + s.energy * 0.8;

    // Debug log every ~1.5s
    if (!window._lastSpotifyLog || elapsed - window._lastSpotifyLog > 1.5) {
      window._lastSpotifyLog = elapsed;
      console.log('%c[Aurora] mapping', 'color:#1DB954',
        `E:${s.energy.toFixed(2)} V:${s.valence.toFixed(2)} BPM:${s.tempo.toFixed(0)} D:${s.danceability.toFixed(2)}`,
        '→',
        `speed:${speed.toFixed(2)} dist:${distortion.toFixed(2)} warmCool:${warmCoolShift.toFixed(2)} sat:${saturationBoost.toFixed(2)}`);
    }
  }

  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  gl.uniform1f(timeLocation, elapsed);
  gl.uniform2f(mouseLocation, mouse.x, mouse.y);
  gl.uniform1f(speedLocation, speed);
  gl.uniform1f(mouseStrengthLocation, mouseStrength);
  gl.uniform1f(intensityLocation, intensity);
  gl.uniform1f(distortionLocation, distortion);
  gl.uniform1f(warmCoolShiftLocation, warmCoolShift);
  gl.uniform1f(saturationBoostLocation, saturationBoost);

  const colorLocations = [color1Location, color2Location, color3Location, color4Location, color5Location];
  colorSliders.forEach((input, i) => {
    const [r, g, b] = hexToRgb(input.value);
    gl.uniform3f(colorLocations[i], r, g, b);
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(render);
}

render();
