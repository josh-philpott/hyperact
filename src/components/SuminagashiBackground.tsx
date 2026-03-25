import { useEffect, useRef } from "react";
import {
  particleVertexShader,
  particleFragmentShader,
  createProgram,
} from "../shaders/suminagashi.ts";

const PARTICLE_COUNT = 12000;
const POINT_SIZE = 2.0;
const DAMPING = 0.96;       // velocity damping
const MOUSE_RADIUS = 25;    // repulsion radius in px
const MOUSE_FORCE = 5;      // repulsion strength
const WAVE_SPEED = 400;     // click wave expansion px/s
const WAVE_FORCE = 12;      // click wave push strength
const WAVE_WIDTH = 60;      // wave ring thickness in px
export default function SuminagashiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const glCtx = canvasEl.getContext("webgl", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!glCtx) {
      console.warn("WebGL not supported");
      return;
    }

    const canvas = canvasEl;
    const gl = glCtx;

    // --- Resize ---
    const dpr = Math.min(devicePixelRatio, 2);
    function resize() {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    // --- Particles ---
    const homeX = new Float32Array(PARTICLE_COUNT);
    const homeY = new Float32Array(PARTICLE_COUNT);
    const posX = new Float32Array(PARTICLE_COUNT);
    const posY = new Float32Array(PARTICLE_COUNT);
    const velX = new Float32Array(PARTICLE_COUNT);
    const velY = new Float32Array(PARTICLE_COUNT);
    const alpha = new Float32Array(PARTICLE_COUNT);

    function initParticles() {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        homeX[i] = Math.random() * canvas.width;
        homeY[i] = Math.random() * canvas.height;
        posX[i] = homeX[i];
        posY[i] = homeY[i];
        velX[i] = 0;
        velY[i] = 0;
        alpha[i] = 0.3 + Math.random() * 0.5;
      }
    }
    initParticles();

    // --- GL setup ---
    const program = createProgram(gl, particleVertexShader, particleFragmentShader);
    const aPosition = gl.getAttribLocation(program, "a_position");
    const aAlpha = gl.getAttribLocation(program, "a_alpha");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uPointSize = gl.getUniformLocation(program, "u_pointSize");
    const uColor = gl.getUniformLocation(program, "u_color");

    const posBuf = gl.createBuffer();
    const alphaBuf = gl.createBuffer();
    const posData = new Float32Array(PARTICLE_COUNT * 2);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // --- Mouse state ---
    let mouseX = -9999;
    let mouseY = -9999;
    let mouseVX = 0;
    let mouseVY = 0;
    let prevMouseX = -9999;
    let prevMouseY = -9999;

    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      prevMouseX = mouseX;
      prevMouseY = mouseY;
      mouseX = (e.clientX - rect.left) * dpr;
      mouseY = (e.clientY - rect.top) * dpr;
      if (prevMouseX > -9000) {
        mouseVX = mouseX - prevMouseX;
        mouseVY = mouseY - prevMouseY;
      }
    }

    function onMouseLeave() {
      mouseX = -9999;
      mouseY = -9999;
    }

    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);

    // --- Click waves ---
    const waves: Array<{ x: number; y: number; radius: number }> = [];

    function onClick(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      waves.push({
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top) * dpr,
        radius: 0,
      });
    }

    window.addEventListener("click", onClick);

    // --- Simple noise for ambient drift ---
    function noise(x: number, y: number, t: number): [number, number] {
      const ax = Math.sin(x * 0.003 + t * 0.4) * Math.cos(y * 0.005 + t * 0.3);
      const ay = Math.cos(x * 0.005 + t * 0.3) * Math.sin(y * 0.003 + t * 0.5);
      return [ax, ay];
    }

    // --- Resize observer ---
    const ro = new ResizeObserver(() => {
      resize();
      initParticles();
    });
    ro.observe(canvas);

    // --- Render loop ---
    let rafId = 0;
    let lastTime = 0;

    function frame(time: number) {
      rafId = requestAnimationFrame(frame);

      if (lastTime === 0) { lastTime = time; }
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      const t = time / 1000;

      const mouseRad = MOUSE_RADIUS * dpr;

      // Update waves
      for (let w = waves.length - 1; w >= 0; w--) {
        waves[w].radius += WAVE_SPEED * dpr * dt;
        if (waves[w].radius > Math.max(canvas.width, canvas.height) * 1.5) {
          waves.splice(w, 1);
        }
      }

      // Update particles
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Ambient drift — apply as a continuous force, not a spring target
        const [nx, ny] = noise(posX[i], posY[i], t);
        velX[i] += nx * 0.06;
        velY[i] += ny * 0.06;

        // Very gentle pull toward home to prevent particles escaping to infinity
        velX[i] += (homeX[i] - posX[i]) * 0.0003;
        velY[i] += (homeY[i] - posY[i]) * 0.0003;

        // Mouse as hand through water
        const dx = posX[i] - mouseX;
        const dy = posY[i] - mouseY;
        const distSq = dx * dx + dy * dy;
        const wakeRad = mouseRad * 4;
        const wakeRadSq = wakeRad * wakeRad;

        if (distSq < wakeRadSq && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const mouseSpeed = Math.sqrt(mouseVX * mouseVX + mouseVY * mouseVY);
          const falloff = 1.0 - dist / wakeRad;

          if (mouseSpeed > 0.5) {
            const mdx = mouseVX / mouseSpeed;
            const mdy = mouseVY / mouseSpeed;

            // Close repulsion — only when moving
            if (dist < mouseRad) {
              const pushForce = (1.0 - dist / mouseRad) * MOUSE_FORCE * Math.min(mouseSpeed * 0.3, 1.0);
              velX[i] += (dx / dist) * pushForce;
              velY[i] += (dy / dist) * pushForce;
            }

            const along = -(dx * mdx + dy * mdy);
            const across = -dx * mdy + dy * mdx;

            // Forward drag — particles near the path get carried along
            const dragStrength = falloff * falloff * mouseSpeed * 0.5;
            velX[i] += mdx * dragStrength;
            velY[i] += mdy * dragStrength;

            // Side displacement — gentler, only very close in front
            if (along > 0 && dist < wakeRad * 0.3) {
              const sideForce = falloff * mouseSpeed * 0.1 * Math.sign(across);
              velX[i] += -mdy * sideForce;
              velY[i] += mdx * sideForce;
            }

            // 4. Wake suction — particles behind get pulled inward (eddies)
            if (along < 0 && dist > mouseRad) {
              const suctionStrength = falloff * mouseSpeed * 0.2;
              velX[i] -= (dx / dist) * suctionStrength;
              velY[i] -= (dy / dist) * suctionStrength;

              // 5. Vortex curl — add rotation in the wake for eddy currents
              const curlStrength = falloff * mouseSpeed * 0.15 * Math.sign(across);
              velX[i] += -mdy * curlStrength;
              velY[i] += mdx * curlStrength;
            }
          }
        }

        // Click wave push
        for (let w = 0; w < waves.length; w++) {
          const wave = waves[w];
          const wdx = posX[i] - wave.x;
          const wdy = posY[i] - wave.y;
          const wDist = Math.sqrt(wdx * wdx + wdy * wdy);
          const ringDist = Math.abs(wDist - wave.radius);
          const waveW = WAVE_WIDTH * dpr;
          if (ringDist < waveW && wDist > 1) {
            const strength = (1.0 - ringDist / waveW) * WAVE_FORCE;
            const maxR = Math.max(canvas.width, canvas.height) * 0.8;
            const ageFade = Math.max(0, 1.0 - wave.radius / maxR);
            velX[i] += (wdx / wDist) * strength * ageFade;
            velY[i] += (wdy / wDist) * strength * ageFade;
          }
        }

        // Integrate
        velX[i] *= DAMPING;
        velY[i] *= DAMPING;
        posX[i] += velX[i];
        posY[i] += velY[i];

        posData[i * 2] = posX[i];
        posData[i * 2 + 1] = posY[i];
      }

      // --- Render ---
      gl.clearColor(20 / 255, 18 / 255, 16 / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uPointSize, POINT_SIZE * dpr);
      gl.uniform3f(uColor, 80 / 255, 72 / 255, 58 / 255);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, posData, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
      gl.bufferData(gl.ARRAY_BUFFER, alpha, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(aAlpha);
      gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("click", onClick);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(alphaBuf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      aria-hidden="true"
    />
  );
}
