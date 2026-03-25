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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      console.warn("WebGL not supported");
      return;
    }

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
    const pendingClicks: Array<{ x: number; y: number }> = [];

    // --- Helpers ---
    function drawQuad(program: WebGLProgram) {
      gl.useProgram(program);
      const loc = gl.getAttribLocation(program, "a_position");
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function setUniform1f(prog: WebGLProgram, name: string, v: number) {
      gl.uniform1f(gl.getUniformLocation(prog, name), v);
    }

    function setUniform2f(
      prog: WebGLProgram,
      name: string,
      x: number,
      y: number,
    ) {
      gl.uniform2f(gl.getUniformLocation(prog, name), x, y);
    }

    function setUniform1i(prog: WebGLProgram, name: string, v: number) {
      gl.uniform1i(gl.getUniformLocation(prog, name), v);
    }

    function bindInputTexture(
      program: WebGLProgram,
      texture: WebGLTexture,
      unit: number,
      name: string,
    ) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      setUniform1i(program, name, unit);
    }

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

    // --- Click handling ---
    function onClick(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      pendingClicks.push({ x, y });
    }

    window.addEventListener("click", onClick);

    // --- Render loop ---
    function frame(time: number) {
      rafId = requestAnimationFrame(frame);

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

      // Process pending clicks
      for (const click of pendingClicks) {
        // Displacement pass
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
        gl.viewport(0, 0, simW, simH);
        gl.useProgram(displaceProg);
        bindInputTexture(displaceProg, fboA.texture, 0, "u_ink");
        setUniform2f(displaceProg, "u_clickPos", click.x, click.y);
        setUniform1f(displaceProg, "u_radius", 0.15);
        setUniform1f(displaceProg, "u_strength", 0.04);
        setUniform1f(displaceProg, "u_active", 1.0);
        drawQuad(displaceProg);
        [fboA, fboB] = [fboB, fboA];

        // Stamp pass
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
        gl.viewport(0, 0, simW, simH);
        gl.useProgram(stampProg);
        bindInputTexture(stampProg, fboA.texture, 0, "u_ink");
        setUniform2f(stampProg, "u_clickPos", click.x, click.y);
        setUniform1f(stampProg, "u_ringRadius", 0.06);
        setUniform1f(stampProg, "u_ringWidth", 0.02);
        setUniform1f(stampProg, "u_active", 1.0);
        drawQuad(stampProg);
        [fboA, fboB] = [fboB, fboA];
      }
      pendingClicks.length = 0;

      // Advection pass (every frame)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
      gl.viewport(0, 0, simW, simH);
      gl.useProgram(advectProg);
      bindInputTexture(advectProg, fboA.texture, 0, "u_ink");
      setUniform1f(advectProg, "u_time", time / 1000);
      setUniform1f(advectProg, "u_dt", dt);
      setUniform1f(advectProg, "u_driftSpeed", 0.003);
      drawQuad(advectProg);
      [fboA, fboB] = [fboB, fboA];

      // Output pass (to screen)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(outputProg);
      bindInputTexture(outputProg, fboA.texture, 0, "u_ink");
      drawQuad(outputProg);
    }

    rafId = requestAnimationFrame(frame);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("click", onClick);
      ro.disconnect();
      gl.deleteProgram(displaceProg);
      gl.deleteProgram(stampProg);
      gl.deleteProgram(advectProg);
      gl.deleteProgram(outputProg);
      gl.deleteBuffer(quadBuffer);
      deleteFBOs();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
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
