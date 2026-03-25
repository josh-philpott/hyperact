export const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const displacementShader = `
precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_ink;
uniform vec2 u_clickPos;
uniform float u_radius;
uniform float u_strength;
uniform float u_active;

void main() {
  if (u_active < 0.5) {
    gl_FragColor = texture2D(u_ink, v_uv);
    return;
  }

  vec2 diff = v_uv - u_clickPos;
  float dist = length(diff);
  vec2 dir = normalize(diff + 1e-7);

  float falloff = smoothstep(u_radius, 0.0, dist);
  vec2 displaced = v_uv - dir * falloff * u_strength;

  gl_FragColor = texture2D(u_ink, displaced);
}
`;

export const stampShader = `
precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_ink;
uniform vec2 u_clickPos;
uniform float u_ringRadius;
uniform float u_ringWidth;
uniform float u_active;

void main() {
  vec4 existing = texture2D(u_ink, v_uv);

  if (u_active < 0.5) {
    gl_FragColor = existing;
    return;
  }

  float dist = length(v_uv - u_clickPos);
  float inner = smoothstep(u_ringRadius - u_ringWidth, u_ringRadius - u_ringWidth * 0.5, dist);
  float outer = smoothstep(u_ringRadius + u_ringWidth * 0.5, u_ringRadius + u_ringWidth, dist);
  float ring = inner - outer;

  float ink = min(existing.r + ring * 0.6, 1.0);
  gl_FragColor = vec4(ink, existing.gba);
}
`;

export const advectShader = `
precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_ink;
uniform float u_time;
uniform float u_dt;
uniform float u_driftSpeed;

//
// Simplex 3D noise — Ashima Arts
// https://github.com/ashima/webgl-noise
//
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  // Permutations
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  float t = u_time;
  vec2 pos = v_uv * 4.0;

  float vx = snoise(vec3(pos, t)) * u_driftSpeed;
  float vy = snoise(vec3(pos + 100.0, t)) * u_driftSpeed;
  vec2 velocity = vec2(vx, vy);

  vec2 srcUV = v_uv - velocity * u_dt;
  srcUV = clamp(srcUV, 0.0, 1.0);

  vec4 color = texture2D(u_ink, srcUV);
  color *= 0.9995;

  gl_FragColor = color;
}
`;

export const outputShader = `
precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_ink;

void main() {
  float density = texture2D(u_ink, v_uv).r;

  vec3 bg = vec3(20.0, 18.0, 16.0) / 255.0;
  vec3 fg = vec3(36.0, 34.0, 32.0) / 255.0;
  vec3 color = mix(bg, fg, density);

  gl_FragColor = vec4(color, 1.0);
}
`;

// ---------------------------------------------------------------------------
// WebGL helper utilities
// ---------------------------------------------------------------------------

export function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${info}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program linking failed: ${info}`);
  }
  return program;
}

export function createFBO(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
): { texture: WebGLTexture; fbo: WebGLFramebuffer } {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("Failed to create framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { texture, fbo };
}

export function createQuadBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Failed to create buffer");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // Two triangles covering [-1, 1] clip space
  // prettier-ignore
  const vertices = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  return buffer;
}
