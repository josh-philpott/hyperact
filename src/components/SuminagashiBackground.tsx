import { useEffect, useRef } from "react";
import {
  vertexShader,
  displacementShader,
  stampShader,
  advectShader,
  outputShader,
  createProgram,
  createFBO,
  createQuadBuffer,
} from "../shaders/suminagashi.ts";

export default function SuminagashiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const glCtx = canvasEl.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!glCtx) {
      console.warn("WebGL not supported");
      return;
    }

    // Non-null references for use in closures (TS doesn't narrow across closures)
    const canvas = canvasEl;
    const gl = glCtx;

    // --- Programs ---
    const displaceProg = createProgram(gl, vertexShader, displacementShader);
    const stampProg = createProgram(gl, vertexShader, stampShader);
    const advectProg = createProgram(gl, vertexShader, advectShader);
    const outputProg = createProgram(gl, vertexShader, outputShader);

    // --- Quad buffer ---
    const quadBuffer = createQuadBuffer(gl);

    // --- State ---
    let scale = 0.5;
    let simW = 0;
    let simH = 0;
    let fboA: { texture: WebGLTexture; fbo: WebGLFramebuffer };
    let fboB: { texture: WebGLTexture; fbo: WebGLFramebuffer };
    let lastTime = 0;
    let slowFrames = 0;
    let rafId = 0;
    // --- Helpers ---
    function drawQuad(program: WebGLProgram) {
      gl.useProgram(program);
      const loc = gl.getAttribLocation(program, "a_position");
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // --- Cached uniform locations ---
    function getLocs(program: WebGLProgram, names: string[]) {
      const locs: Record<string, WebGLUniformLocation | null> = {};
      for (const name of names) {
        locs[name] = gl.getUniformLocation(program, name);
      }
      return locs;
    }

    const displaceLocs = getLocs(displaceProg, ['u_ink', 'u_clickPos', 'u_radius', 'u_strength', 'u_active']);
    const stampLocs = getLocs(stampProg, ['u_ink', 'u_clickPos', 'u_velocity', 'u_speed', 'u_ringWidth', 'u_active']);
    const advectLocs = getLocs(advectProg, ['u_ink', 'u_time', 'u_dt', 'u_driftSpeed']);
    const outputLocs = getLocs(outputProg, ['u_ink']);

    // --- FBO management ---
    function deleteFBOs() {
      if (fboA) {
        gl.deleteTexture(fboA.texture);
        gl.deleteFramebuffer(fboA.fbo);
      }
      if (fboB) {
        gl.deleteTexture(fboB.texture);
        gl.deleteFramebuffer(fboB.fbo);
      }
    }

    function initFBOs() {
      deleteFBOs();
      simW = Math.floor(canvas.width * scale);
      simH = Math.floor(canvas.height * scale);
      fboA = createFBO(gl, simW, simH);
      fboB = createFBO(gl, simW, simH);
    }

    // --- Resize ---
    function resize() {
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      initFBOs();
    }

    resize();

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    // --- Mouse tracking (comet trail behind cursor) ---
    let mouseActive = false;
    let mousePos = { x: 0, y: 0 };
    let prevMousePos = { x: 0, y: 0 };
    let mouseVel = { x: 0, y: 0 };
    let lastMoveTime = 0;

    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      prevMousePos = { ...mousePos };
      mousePos = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1.0 - (e.clientY - rect.top) / rect.height,
      };
      mouseVel = {
        x: mousePos.x - prevMousePos.x,
        y: mousePos.y - prevMousePos.y,
      };
      mouseActive = true;
      lastMoveTime = performance.now();
    }

    function onMouseLeave() {
      mouseActive = false;
    }

    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);

    // --- Render loop ---
    function frame(time: number) {
      rafId = requestAnimationFrame(frame);

      if (lastTime === 0) { lastTime = time; }
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      // Performance monitoring
      if (dt > 0.018) {
        slowFrames++;
        if (slowFrames > 30 && scale > 0.25) {
          scale = 0.25;
          initFBOs();
        }
      } else {
        slowFrames = Math.max(0, slowFrames - 1);
      }

      // Only pour ink while mouse is actively moving
      if (mouseActive) {
        const stillMs = performance.now() - lastMoveTime;
        const speed = Math.sqrt(mouseVel.x * mouseVel.x + mouseVel.y * mouseVel.y);
        const moving = stillMs < 80 && speed > 0.001;

        if (moving) {
          // Displacement pass
          gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
          gl.viewport(0, 0, simW, simH);
          gl.useProgram(displaceProg);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
          gl.uniform1i(displaceLocs.u_ink, 0);
          gl.uniform2f(displaceLocs.u_clickPos, mousePos.x, mousePos.y);
          gl.uniform1f(displaceLocs.u_radius, 0.1);
          gl.uniform1f(displaceLocs.u_strength, 0.005);
          gl.uniform1f(displaceLocs.u_active, 1.0);
          drawQuad(displaceProg);
          [fboA, fboB] = [fboB, fboA];

          // Stamp pass
          gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
          gl.viewport(0, 0, simW, simH);
          gl.useProgram(stampProg);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
          gl.uniform1i(stampLocs.u_ink, 0);
          gl.uniform2f(stampLocs.u_clickPos, mousePos.x, mousePos.y);
          gl.uniform2f(stampLocs.u_velocity, mouseVel.x, mouseVel.y);
          gl.uniform1f(stampLocs.u_speed, speed);
          gl.uniform1f(stampLocs.u_ringWidth, 0.06);
          gl.uniform1f(stampLocs.u_active, 1.0);
          drawQuad(stampProg);
          [fboA, fboB] = [fboB, fboA];
        }
      }

      // Advection pass (every frame)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
      gl.viewport(0, 0, simW, simH);
      gl.useProgram(advectProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
      gl.uniform1i(advectLocs.u_ink, 0);
      gl.uniform1f(advectLocs.u_time, time / 1000);
      gl.uniform1f(advectLocs.u_dt, dt);
      gl.uniform1f(advectLocs.u_driftSpeed, 0.08);
      drawQuad(advectProg);
      [fboA, fboB] = [fboB, fboA];

      // Output pass (to screen)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(outputProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
      gl.uniform1i(outputLocs.u_ink, 0);
      drawQuad(outputProg);
    }

    rafId = requestAnimationFrame(frame);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      ro.disconnect();
      gl.deleteProgram(displaceProg);
      gl.deleteProgram(stampProg);
      gl.deleteProgram(advectProg);
      gl.deleteProgram(outputProg);
      gl.deleteBuffer(quadBuffer);
      deleteFBOs();
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
