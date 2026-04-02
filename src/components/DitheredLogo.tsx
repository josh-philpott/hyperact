import { useEffect, useRef, useCallback } from "react";
import { useDialKit } from "dialkit";

// Logo layout in grid cells (not pixels) — guarantees uniform squares
const SQ_CELLS = 6;
const GAP_CELLS = 1;
const PAD_CELLS = 1;
const LOGO_GRID_SIZE = PAD_CELLS * 2 + SQ_CELLS * 3 + GAP_CELLS * 2; // 22

const LOGO_PATTERN: (false | "solid" | "dim")[][] = [
  ["solid", false,  "dim"],
  ["solid", "solid", "dim"],
  ["solid", false,  "solid"],
];

const GOLD_R = 201,
  GOLD_G = 168,
  GOLD_B = 76;

interface Props {
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

export default function DitheredLogo({ anchorRef }: Props) {
  const params = useDialKit("Logo Dots", {
    grid: {
      gridStep: [4, 1, 12],
      dotSize: [1, 0.5, 4],
      bgAlpha: [0.15, 0, 0.5],
      cornerAlpha: [0.27, 0, 1],
      dimSquareAlpha: [0.29, 0, 1],
    },
    glow: {
      bloomBlur: [20, 0, 20],
      bloomAlpha: [1, 0, 1],
      flickerSpeed: [1, 0, 30],
      flickerAmount: [0.35, 0, 1],
      boostAmount: [0.4, 0, 2],
      boostAmountBg: [0.4, 0, 2],
      boostDecay: [0.01, 0, 0.2],
    },
    interaction: {
      repulseRadius: [45, 5, 200],
      maxDispBase: [15, 0, 100],
      maxDispFast: [80, 0, 200],
      lerpBase: [0.26, 0.01, 0.5],
      lerpFast: [0.1, 0.001, 0.3],
      velocityScale: [0.21, 0.001, 0.3],
    },
  });
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const dotsRef = useRef<{
    originX: Float32Array;
    originY: Float32Array;
    currentX: Float32Array;
    currentY: Float32Array;
    alpha: Float32Array;
    boost: Float32Array; // disruption brightness boost (0-1)
    lerpSpeed: Float32Array; // per-dot heal speed (set when displaced)
    count: number;
  } | null>(null);
  const pointerRef = useRef({ x: -9999, y: -9999, inside: false, speed: 0 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const dpr = Math.min(devicePixelRatio, 2);
    const newX = e.clientX * dpr;
    const newY = e.clientY * dpr;
    const p = pointerRef.current;
    if (p.x > -9000) {
      const dx = newX - p.x;
      const dy = newY - p.y;
      p.speed = Math.sqrt(dx * dx + dy * dy);
    }
    p.x = newX;
    p.y = newY;
    p.inside = true;
    startLoop();
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointerRef.current.x = -9999;
    pointerRef.current.y = -9999;
    pointerRef.current.inside = false;
  }, []);

  function startLoop() {
    if (rafRef.current === 0) {
      rafRef.current = requestAnimationFrame(frame);
    }
  }

  function stopLoop() {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }

  function frame(time: number) {
    rafRef.current = 0;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const dots = dotsRef.current;
    if (!canvas || !ctx || !dots) return;

    const p = paramsRef.current;
    const dpr = Math.min(devicePixelRatio, 2);
    const radius = p.interaction.repulseRadius * dpr;
    const radiusSq = radius * radius;
    const dotSize = p.grid.dotSize * dpr;
    const mouseX = pointerRef.current.x;
    const mouseY = pointerRef.current.y;
    const t_sec = time / 1000;

    // Velocity influence (0 = stationary, 1 = fast)
    const speed = pointerRef.current.speed;
    const velInfluence = Math.min(1, speed * p.interaction.velocityScale);
    const maxDisp = (p.interaction.maxDispBase + (p.interaction.maxDispFast - p.interaction.maxDispBase) * velInfluence) * dpr;
    const currentLerp = p.interaction.lerpBase + (p.interaction.lerpFast - p.interaction.lerpBase) * velInfluence;
    // Decay speed
    pointerRef.current.speed *= 0.85;

    for (let i = 0; i < dots.count; i++) {
      const dx = dots.originX[i] - mouseX;
      const dy = dots.originY[i] - mouseY;
      const distSq = dx * dx + dy * dy;

      let targetX: number;
      let targetY: number;

      if (distSq < radiusSq && distSq > 1) {
        const dist = Math.sqrt(distSq);
        const t = 1 - dist / radius;
        const force = t * t * t;
        const nx = dx / dist;
        const ny = dy / dist;
        targetX = dots.originX[i] + nx * force * maxDisp;
        targetY = dots.originY[i] + ny * force * maxDisp;
        // Boost brightness based on how strongly displaced
        dots.boost[i] = Math.min(1, dots.boost[i] + force * 0.3);
        // Lock in the heal speed at the moment of displacement (slower for faster mouse)
        dots.lerpSpeed[i] = currentLerp;
      } else {
        targetX = dots.originX[i];
        targetY = dots.originY[i];
        // Decay boost
        dots.boost[i] = Math.max(0, dots.boost[i] - p.glow.boostDecay);
      }

      // Use per-dot lerp speed (defaults to base if never displaced)
      const lerp = dots.lerpSpeed[i] || p.interaction.lerpBase;
      dots.currentX[i] += (targetX - dots.currentX[i]) * lerp;
      dots.currentY[i] += (targetY - dots.currentY[i]) * lerp;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = `rgb(${GOLD_R}, ${GOLD_G}, ${GOLD_B})`;

    // Pass 1: render logo dots to bloom canvas, then composite blurred
    const bloomCanvas = bloomCanvasRef.current;
    const bloomCtx = bloomCtxRef.current;
    if (bloomCanvas && bloomCtx) {
      bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
      bloomCtx.fillStyle = `rgb(${GOLD_R}, ${GOLD_G}, ${GOLD_B})`;
      for (let i = 0; i < dots.count; i++) {
        if (dots.alpha[i] > p.grid.bgAlpha) {
          bloomCtx.globalAlpha = dots.alpha[i];
          bloomCtx.fillRect(dots.currentX[i], dots.currentY[i], dotSize, dotSize);
        }
      }
      // Draw the bloom layer blurred and faint onto the main canvas
      ctx.save();
      ctx.filter = `blur(${p.glow.bloomBlur * dpr}px)`;
      ctx.globalAlpha = p.glow.bloomAlpha;
      ctx.drawImage(bloomCanvas, 0, 0);
      ctx.restore();
    }

    // Pass 2: all dots, crisp
    for (let i = 0; i < dots.count; i++) {
      const boost = dots.boost[i] * p.glow.boostAmount;
      if (dots.alpha[i] <= p.grid.bgAlpha) {
        const bgBoost = dots.boost[i] * p.glow.boostAmountBg;
        ctx.globalAlpha = Math.min(1, dots.alpha[i] + bgBoost);
      } else {
        // Flickering pixels — only a few dots across the logo blink
        const dotSeed = Math.abs(Math.sin(i * 127.1));
        const isFlickerer = dotSeed > 0.98; // only ~2% of dots can flicker at all
        let flickerMul = 1.0;
        if (isFlickerer) {
          const dotPhase = dotSeed * 1000;
          const blinkCycle = ((t_sec * p.glow.flickerSpeed + dotPhase) % 6.0); // 6s cycle
          if (blinkCycle < 0.12) flickerMul = 1.0 - p.glow.flickerAmount;
        }
        ctx.globalAlpha = Math.min(1, Math.max(0.1, dots.alpha[i] * flickerMul + boost));
      }
      ctx.fillRect(dots.currentX[i], dots.currentY[i], dotSize, dotSize);
    }

    // Always run — flicker is continuous
    rafRef.current = requestAnimationFrame(frame);
  }

  /**
   * Check if a dot at (localRow, localCol) within a SQ_CELLS x SQ_CELLS square
   * is a corner dot — first/last row AND first/last col.
   */
  function isCorner(localRow: number, localCol: number): boolean {
    const isEdgeRow = localRow === 0 || localRow === SQ_CELLS - 1;
    const isEdgeCol = localCol === 0 || localCol === SQ_CELLS - 1;
    return isEdgeRow && isEdgeCol;
  }

  function buildDots(canvasW: number, canvasH: number) {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const p = paramsRef.current;
    const dpr = Math.min(devicePixelRatio, 2);
    const step = p.grid.gridStep * dpr;

    // Logo pixel size derived from grid cells
    const logoPixelSize = LOGO_GRID_SIZE * step;

    // Anchor position — center the logo grid on the anchor
    const rect = anchor.getBoundingClientRect();
    const anchorCenterX = (rect.left + rect.width / 2) * dpr;
    const anchorCenterY = (rect.top + rect.height / 2) * dpr;
    const logoX = anchorCenterX - logoPixelSize / 2;
    const logoY = anchorCenterY - logoPixelSize / 2;

    // Snap logo origin to the nearest grid point so dots align perfectly
    const snappedLogoX = Math.round(logoX / step) * step;
    const snappedLogoY = Math.round(logoY / step) * step;

    const cols = Math.ceil(canvasW / step);
    const rows = Math.ceil(canvasH / step);
    const maxCount = cols * rows;

    const originX = new Float32Array(maxCount);
    const originY = new Float32Array(maxCount);
    const currentX = new Float32Array(maxCount);
    const currentY = new Float32Array(maxCount);
    const alpha = new Float32Array(maxCount);
    const boost = new Float32Array(maxCount);
    const lerpSpeed = new Float32Array(maxCount);

    let count = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = col * step + step / 2;
        const py = row * step + step / 2;

        let dotAlpha = p.grid.bgAlpha;

        // Check if this grid point is inside the logo area
        const cellX = Math.round((px - snappedLogoX - step / 2) / step);
        const cellY = Math.round((py - snappedLogoY - step / 2) / step);

        if (cellX >= 0 && cellX < LOGO_GRID_SIZE && cellY >= 0 && cellY < LOGO_GRID_SIZE) {
          // Which of the 3x3 squares does this cell belong to?
          for (let sqRow = 0; sqRow < 3; sqRow++) {
            for (let sqCol = 0; sqCol < 3; sqCol++) {
              const fill = LOGO_PATTERN[sqRow][sqCol];
              if (!fill) continue;

              const sqStartX = PAD_CELLS + sqCol * (SQ_CELLS + GAP_CELLS);
              const sqStartY = PAD_CELLS + sqRow * (SQ_CELLS + GAP_CELLS);

              const localCol = cellX - sqStartX;
              const localRow = cellY - sqStartY;

              if (localCol >= 0 && localCol < SQ_CELLS && localRow >= 0 && localRow < SQ_CELLS) {
                if (fill === "dim") {
                  dotAlpha = isCorner(localRow, localCol) ? p.grid.dimSquareAlpha * p.grid.cornerAlpha : p.grid.dimSquareAlpha;
                } else {
                  dotAlpha = isCorner(localRow, localCol) ? p.grid.cornerAlpha : 1.0;
                }
              }
            }
          }
        }

        originX[count] = px;
        originY[count] = py;
        currentX[count] = px;
        currentY[count] = py;
        alpha[count] = dotAlpha;
        count++;
      }
    }

    dotsRef.current = { originX, originY, currentX, currentY, alpha, boost, lerpSpeed, count };
  }

  function renderStatic() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const dots = dotsRef.current;
    if (!canvas || !ctx || !dots) return;

    const dpr = Math.min(devicePixelRatio, 2);
    const dotSize = paramsRef.current.grid.dotSize * dpr;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgb(${GOLD_R}, ${GOLD_G}, ${GOLD_B})`;
    for (let i = 0; i < dots.count; i++) {
      ctx.globalAlpha = dots.alpha[i];
      ctx.fillRect(dots.currentX[i], dots.currentY[i], dotSize, dotSize);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(devicePixelRatio, 2);

    // Create bloom offscreen canvas
    let bloom = bloomCanvasRef.current;
    if (!bloom) {
      bloom = document.createElement("canvas");
      bloomCanvasRef.current = bloom;
    }

    function resize() {
      if (!canvas) return;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      if (bloom) {
        bloom.width = canvas.width;
        bloom.height = canvas.height;
        bloomCtxRef.current = bloom.getContext("2d");
      }
    }
    resize();

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;

    // Defer to next frame so anchor layout is ready, then start continuous loop
    const initRaf = requestAnimationFrame(() => {
      buildDots(canvas.width, canvas.height);
      startLoop();
    });

    const ro = new ResizeObserver(() => {
      resize();
      buildDots(canvas.width, canvas.height);
      renderStatic();
    });
    ro.observe(canvas);

    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      cancelAnimationFrame(initRaf);
      stopLoop();
      ro.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      dotsRef.current = null;
      ctxRef.current = null;
      bloomCanvasRef.current = null;
      bloomCtxRef.current = null;
    };
  }, [anchorRef, handlePointerMove, handlePointerLeave]);

  // Rebuild dots when grid params change (these are baked into the dot array)
  const { gridStep, bgAlpha, cornerAlpha, dimSquareAlpha } = params.grid;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;
    buildDots(canvas.width, canvas.height);
  }, [gridStep, bgAlpha, cornerAlpha, dimSquareAlpha]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full touch-none"
      style={{ zIndex: -5 }}
      aria-hidden="true"
    />
  );
}
