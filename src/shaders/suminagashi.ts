/** Vertex shader for point particles */
export const particleVertexShader = `
attribute vec2 a_position;
attribute float a_alpha;
uniform vec2 u_resolution;
uniform float u_pointSize;
varying float v_alpha;

void main() {
  // Convert pixel coords to clip space
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  clip.y *= -1.0; // flip Y
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_alpha = a_alpha;
}
`;

/** Fragment shader for point particles */
export const particleFragmentShader = `
precision mediump float;
varying float v_alpha;
uniform vec3 u_color;

void main() {
  gl_FragColor = vec4(u_color, v_alpha);
}
`;

// --- WebGL Utilities ---

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
    throw new Error(`Shader compile error: ${info}`);
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
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}
