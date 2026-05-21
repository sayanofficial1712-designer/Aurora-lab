const canvas = document.getElementById('aurora');
const gl = canvas.getContext('webgl');

if (!gl) {
  alert('WebGL not supported');
  throw new Error('WebGL not supported');
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  gl.viewport(0, 0, canvas.width, canvas.height);
}

resize();
window.addEventListener('resize', resize);

const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

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
  uniform float warmCoolShift;
  uniform float saturationBoost;

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

    float t = time * speed;

    float n1 = snoise(pos * 1.5 + t * 0.8);
    float n2 = snoise(pos * 1.0 - t * 0.6 + 10.0);
    float n3 = snoise(pos * 2.0 + t * 0.5 + 20.0);
    float n4 = snoise(pos * 1.2 + t * 0.7 + 30.0);

    vec2 distort = vec2(
      snoise(pos * 0.8 + t * 0.4),
      snoise(pos * 0.8 - t * 0.35 + 5.0)
    ) * distortionAmount;

    vec2 mousePos = mouse;
    mousePos.x *= aspect;
    vec2 toMouse = mousePos - pos;
    float mouseDist = length(toMouse);
    float mouseInfluence = smoothstep(1.0, 0.1, mouseDist) * mouseStrength;
    distort += normalize(toMouse + 0.001) * mouseInfluence;

    vec2 p = pos + distort;

    float blend1 = smoothstep(-0.5, 0.5, n1 + p.x - 0.5);
    float blend2 = smoothstep(-0.5, 0.5, n2 + p.y - 0.5);
    float blend3 = smoothstep(-0.5, 0.5, n3);
    float blend4 = smoothstep(-0.4, 0.6, n4);

    vec3 color = color1;
    color = mix(color, color2, blend1);
    color = mix(color, color3, blend2 * 0.8);
    color = mix(color, color4, (1.0 - blend1) * blend2 * 0.7);
    color = mix(color, color5, blend3 * 0.5);
    color = mix(color, color1, blend4 * (1.0 - blend3) * 0.4);

    float soft = snoise(p * 2.0 + t * 0.05) * 0.04;
    color += soft;

    vec3 warmTint = vec3(0.22, 0.06, -0.18);
    vec3 coolTint = vec3(-0.18, -0.06, 0.26);
    float warmCoolMag = abs(warmCoolShift);
    color += mix(coolTint, warmTint, (warmCoolShift + 1.0) * 0.5) * warmCoolMag;
    color *= 1.0 + warmCoolShift * 0.12;

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

const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
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

const { MOODS, LIBRARY_MOODS, toLibraryMood } = window.AuroraMoods;

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
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const moodVaultTrack = document.getElementById('moodVaultTrack');
const moodLibraryHint = document.getElementById('moodLibraryHint');
const moodSoundtrack = document.getElementById('moodSoundtrack');
const modeAutoBtn = document.getElementById('modeAutoBtn');
const modeLockBtn = document.getElementById('modeLockBtn');
const brandDot = document.querySelector('.brand-dot');
const stageMood = document.getElementById('stageMood');
const stageAtmosphere = document.getElementById('stageAtmosphere');
const npTrack = document.getElementById('npTrack');
const npMood = document.getElementById('npMood');
const controlsToggle = document.getElementById('controlsToggle');
const controlsCloseBtn = document.getElementById('controlsCloseBtn');
const controlsPanelWrap = document.querySelector('.controls-panel-wrap');
const controlsPanel = document.getElementById('controlsPanel');

const sliderValueLabels = {
  flow: document.getElementById('flowValue'),
  blur: document.getElementById('blurValue'),
  intensity: document.getElementById('intensityValue'),
};

const DEFAULT_SLIDERS = { speed: 28, mouse: 0, intensity: 42, distortion: 36 };

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpHex(a, b, t) {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return '#' + [r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('');
}

let activeMood = null;
let moodConfidence = 0;

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

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  updateSliderLabels();
}

function updateSliderLabels() {
  if (sliderValueLabels.flow) sliderValueLabels.flow.textContent = distortionSlider.value;
  if (sliderValueLabels.blur) sliderValueLabels.blur.textContent = speedSlider.value;
  if (sliderValueLabels.intensity) sliderValueLabels.intensity.textContent = intensitySlider.value;
}

function updateCenterStage(moodId) {
  const mood = MOODS[moodId];
  if (!mood) return;
  if (stageMood) stageMood.textContent = mood.label;
  if (stageAtmosphere) stageAtmosphere.textContent = mood.atmosphere;
}

function setActiveMood(moodId) {
  const libId = toLibraryMood(moodId);
  activeMood = libId;
  document.querySelectorAll('.mood-cartridge').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.mood === libId);
  });
  updateCenterStage(libId);
  if (moodLibraryHint && !window.spotifyState?.connected && window._auroraAutoMode !== false) {
    moodLibraryHint.textContent = mood.descriptor;
  }
}

function setMoodConfidence(percent) {
  moodConfidence = Math.max(0, Math.min(100, percent));
  if (!npMood) return;
  if (moodConfidence > 0 && activeMood) {
    const label = MOODS[activeMood]?.label || activeMood;
    npMood.hidden = false;
    npMood.innerHTML = window._auroraAutoMode !== false
      ? `<strong>${label}</strong> (${Math.round(moodConfidence)}%)`
      : '';
  } else {
    npMood.hidden = true;
  }
}

function clearActiveMood() {
  activeMood = null;
  document.querySelectorAll('.mood-cartridge').forEach((card) => card.classList.remove('is-active'));
  if (moodLibraryHint) moodLibraryHint.textContent = 'Hover to preview · Click to lock mood';
}

function buildMoodVault() {
  if (!moodVaultTrack) return;
  moodVaultTrack.innerHTML = '';

  LIBRARY_MOODS.forEach((moodId) => {
    const mood = MOODS[moodId];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mood-cartridge';
    card.dataset.mood = moodId;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${mood.label} mood`);

    card.innerHTML = `
      <div class="mood-cartridge-glow" style="--mood-glow:${mood.glow}"></div>
      <div class="mood-cartridge-inner">
        <div class="mood-cartridge-strip" style="--mood-strip:linear-gradient(90deg,${mood.palette.join(',')})"></div>
        <div class="mood-cartridge-body">
          <div class="mood-cartridge-icon"></div>
          <span class="mood-cartridge-label">${mood.label}</span>
          <div class="mood-cartridge-window"></div>
        </div>
      </div>
    `;

    card.addEventListener('mouseenter', () => {
      if (window._auroraAutoMode === false) return;
      applyMoodVisuals(moodId, 600);
    });

    card.addEventListener('click', () => {
      window._auroraManualLock = true;
      window._auroraAutoMode = false;
      if (modeLockBtn) modeLockBtn.classList.add('active');
      if (modeAutoBtn) modeAutoBtn.classList.remove('active');
      applyMoodVisuals(moodId, 850);
      if (typeof window.clearSoundtrackStack === 'function') window.clearSoundtrackStack();
      updateLockMoodUI();
    });

    moodVaultTrack.appendChild(card);
  });
}

function openControls() {
  controlsPanelWrap?.classList.add('is-open');
  controlsPanel?.setAttribute('aria-hidden', 'false');
  controlsToggle?.setAttribute('aria-expanded', 'true');
}

function closeControls() {
  controlsPanelWrap?.classList.remove('is-open');
  controlsPanel?.setAttribute('aria-hidden', 'true');
  controlsToggle?.setAttribute('aria-expanded', 'false');
}

function updateMoodGlow(moodId, colors) {
  const mood = MOODS[moodId];
  if (!mood) return;
  const glow = window.AuroraMoods.paletteGlow(colors || mood.colors);
  document.querySelectorAll(`.mood-cartridge[data-mood="${moodId}"] .mood-cartridge-glow`).forEach((el) => {
    el.style.setProperty('--mood-glow', glow);
  });
  if (brandDot && colors) {
    brandDot.style.background = `radial-gradient(circle at 30% 30%, ${colors[0]}, ${colors[1]} 45%, ${colors[2]} 90%)`;
    brandDot.style.boxShadow = `0 0 14px ${colors[0]}55`;
  }
}

function updateLockMoodUI() {
  const locked = window._auroraAutoMode === false;
  if (moodSoundtrack) moodSoundtrack.hidden = !(locked && activeMood);
  if (locked && activeMood && moodLibraryHint) {
    moodLibraryHint.textContent = MOODS[activeMood]?.descriptor || 'Mood locked';
  }
}

let _transitionToken = 0;

function transitionToMood(moodId, duration = 850) {
  const libId = toLibraryMood(moodId);
  const mood = MOODS[libId];
  if (!mood) return;

  const myToken = ++_transitionToken;
  setActiveMood(libId);
  updateLockMoodUI();

  const startColors = colorSliders.map((i) => i.value);
  const startGlow = startColors.slice(0, 3);
  const endGlow = mood.colors.slice(0, 3);
  const startVals = {
    speed: +speedSlider.value,
    mouse: +mouseInfluenceSlider.value,
    intensity: +intensitySlider.value,
    distortion: +distortionSlider.value,
  };
  const endVals = {
    speed: mood.speed,
    mouse: mood.mouse,
    intensity: mood.intensity,
    distortion: mood.distortion,
  };
  const start = performance.now();

  function tick() {
    if (myToken !== _transitionToken) return;
    const raw = Math.min(1, (performance.now() - start) / duration);
    const t = easeInOutCubic(raw);

    colorSliders.forEach((input, i) => {
      input.value = lerpHex(startColors[i], mood.colors[i], t);
    });
    speedSlider.value = Math.round(lerp(startVals.speed, endVals.speed, t));
    mouseInfluenceSlider.value = Math.round(lerp(startVals.mouse, endVals.mouse, t));
    intensitySlider.value = Math.round(lerp(startVals.intensity, endVals.intensity, t));
    distortionSlider.value = Math.round(lerp(startVals.distortion, endVals.distortion, t));
    updateSliderLabels();

    updateMoodGlow(libId, [
      lerpHex(startGlow[0], endGlow[0], t),
      lerpHex(startGlow[1], endGlow[1], t),
      lerpHex(startGlow[2], endGlow[2], t),
    ]);

    if (raw < 1) requestAnimationFrame(tick);
    else {
      updateMoodGlow(libId, mood.colors);
      updateShareURL();
    }
  }
  tick();
}

function applyMoodVisuals(moodId, duration = 850) {
  transitionToMood(toLibraryMood(moodId), duration);
}

function resetPalette() {
  applyMoodVisuals('dreamy', 850);
}

window.transitionToMood = (moodId, duration = 850) => applyMoodVisuals(moodId, duration);
window.applyMoodVisuals = applyMoodVisuals;
window.getActiveMood = () => activeMood;
window.updateLockMoodUI = updateLockMoodUI;
window.updateCenterStage = updateCenterStage;
window.setStageTrack = (title) => {
  if (npTrack) npTrack.textContent = title || '';
};

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const moodParam = params.get('mood');
  const hasColorParams = colorSliders.some((_, i) => params.has(`c${i + 1}`));

  if (hasColorParams) {
    colorSliders.forEach((input, i) => {
      const fromURL = params.get(`c${i + 1}`);
      if (fromURL && isValidHexColor(fromURL)) input.value = `#${fromURL}`;
    });
  }

  if (moodParam && MOODS[moodParam]) {
    if (!hasColorParams) {
      applyMoodVisuals(moodParam);
      return;
    }
    const mood = MOODS[moodParam];
    const colorsMatchMood = colorSliders.every((input, i) =>
      input.value.toLowerCase() === mood.colors[i].toLowerCase()
    );
    if (colorsMatchMood) {
      setSliders(mood);
      setActiveMood(moodParam);
      return;
    }
  }

  if (hasColorParams) clearActiveMood();
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

buildMoodVault();
loadFromURL();
if (!activeMood && !window.location.search) {
  setSliders(DEFAULT_SLIDERS);
  setActiveMood('dreamy');
  if (moodLibraryHint) moodLibraryHint.textContent = MOODS.dreamy.descriptor;
}
updateSliderLabels();

if (modeAutoBtn) {
  modeAutoBtn.addEventListener('click', () => {
    window._auroraAutoMode = true;
    window._auroraManualLock = false;
    modeAutoBtn.classList.add('active');
    modeLockBtn.classList.remove('active');
    if (moodLibraryHint) moodLibraryHint.textContent = 'Spotify will guide your mood';
    updateLockMoodUI();
    if (typeof window.clearSoundtrackStack === 'function') window.clearSoundtrackStack();
  });
}

if (modeLockBtn) {
  modeLockBtn.addEventListener('click', () => {
    window._auroraAutoMode = false;
    window._auroraManualLock = true;
    modeLockBtn.classList.add('active');
    modeAutoBtn.classList.remove('active');
    updateLockMoodUI();
    if (activeMood && moodLibraryHint) {
      moodLibraryHint.textContent = MOODS[activeMood]?.descriptor || 'Pick a cartridge to lock';
    } else if (moodLibraryHint) {
      moodLibraryHint.textContent = 'Pick a cartridge to lock mood';
    }
  });
}

if (controlsToggle) controlsToggle.addEventListener('click', openControls);
if (controlsCloseBtn) controlsCloseBtn.addEventListener('click', closeControls);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeControls();
});

window.setMoodConfidence = setMoodConfidence;
window.toLibraryMood = toLibraryMood;
window.LIBRARY_MOODS = LIBRARY_MOODS;
window.AuroraMOODS = MOODS;

colorSliders.forEach((input) => {
  input.addEventListener('input', () => {
    if (activeMood) clearActiveMood();
    updateShareURL();
  });
});

[speedSlider, mouseInfluenceSlider, intensitySlider, distortionSlider].forEach((slider) => {
  slider.addEventListener('input', () => {
    if (activeMood) clearActiveMood();
    updateSliderLabels();
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
      shareBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 14a5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 7l-1.5 1.5M14 10a5 5 0 0 1 0 7l-3 3a5 5 0 0 1-7-7l1.5-1.5" stroke-linecap="round"/></svg> Copy mood link`;
      shareBtn.classList.remove('copied');
    }, 2000);
  } catch {
    shareBtn.textContent = 'Copy failed';
    setTimeout(() => { shareBtn.textContent = 'Copy mood link'; }, 2000);
  }
});

exportBtn.addEventListener('click', () => {
  const original = exportBtn.innerHTML;
  try {
    const link = document.createElement('a');
    link.download = `aurora-${activeMood || 'mood'}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    exportBtn.textContent = 'Saved!';
    setTimeout(() => { exportBtn.innerHTML = original; }, 2000);
  } catch {
    exportBtn.textContent = 'Export failed';
    setTimeout(() => { exportBtn.innerHTML = original; }, 2000);
  }
});

const brandBtn = document.getElementById('brandBtn');
if (brandBtn) brandBtn.addEventListener('click', () => applyMoodVisuals('dreamy', 900));

let startTime = Date.now();
const mouse = { x: 0.5, y: 0.5 };

function render() {
  const elapsed = (Date.now() - startTime) / 1000;
  if (window.tickSpotify) window.tickSpotify();

  const scaleValue = (input) => (Number(input.value) - 10) / 40;
  const speed = 0.08 + scaleValue(speedSlider) * 0.62;
  const mouseStrength = 0;
  const intensity = 0.7 + scaleValue(intensitySlider) * 0.8;
  const distortion = 0.08 + scaleValue(distortionSlider) * 0.65;

  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  gl.uniform1f(timeLocation, elapsed);
  gl.uniform2f(mouseLocation, mouse.x, mouse.y);
  gl.uniform1f(speedLocation, speed);
  gl.uniform1f(mouseStrengthLocation, mouseStrength);
  gl.uniform1f(intensityLocation, intensity);
  gl.uniform1f(distortionLocation, distortion);
  gl.uniform1f(warmCoolShiftLocation, 0.0);
  gl.uniform1f(saturationBoostLocation, 0.0);

  const colorLocations = [color1Location, color2Location, color3Location, color4Location, color5Location];
  colorSliders.forEach((input, i) => {
    const [r, g, b] = hexToRgb(input.value);
    gl.uniform3f(colorLocations[i], r, g, b);
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(render);
}

render();
