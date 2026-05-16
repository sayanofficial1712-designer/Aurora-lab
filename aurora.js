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
    
    // Richer pastel colors (more saturated but still soft)
    vec3 pink = vec3(0.96, 0.66, 0.82);      // Richer pink
    vec3 lavender = vec3(0.77, 0.72, 0.96);  // Richer lavender
    vec3 mint = vec3(0.66, 0.91, 0.87);      // Richer mint
    vec3 peach = vec3(0.99, 0.80, 0.71);     // Richer peach
    vec3 lilac = vec3(0.90, 0.66, 0.94);     // Richer lilac
    
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
    
    // Saturation controlled by intensity
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(gray), color, intensity);
    
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

// Control elements
const speedSlider = document.getElementById('speed');
const mouseInfluenceSlider = document.getElementById('mouseInfluence');
const intensitySlider = document.getElementById('intensity');
const distortionSlider = document.getElementById('distortion');

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
  
  // Read control values and map to shader ranges
  const speed = (speedSlider.value / 100) * 0.6;           // 0 to 0.6
  const mouseStrength = (mouseInfluenceSlider.value / 100) * 0.5;  // 0 to 0.5
  const intensity = 0.8 + (intensitySlider.value / 100) * 0.6;     // 0.8 to 1.4
  const distortion = (distortionSlider.value / 100) * 0.6;         // 0 to 0.6
  
  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  gl.uniform1f(timeLocation, elapsed);
  gl.uniform2f(mouseLocation, mouse.x, mouse.y);
  gl.uniform1f(speedLocation, speed);
  gl.uniform1f(mouseStrengthLocation, mouseStrength);
  gl.uniform1f(intensityLocation, intensity);
  gl.uniform1f(distortionLocation, distortion);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(render);
}

render();
