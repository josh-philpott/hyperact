import { useEffect, useRef, useCallback } from "react";

// Grid and sizing
const GRID_CSS_STEP = 4; // grid spacing across entire viewport (CSS px)
const DOT_SIZE = 1;
const BG_ALPHA = 0.13;
const CORNER_ALPHA = 0.5; // dimmed corners on logo squares
const DIM_SQUARE_ALPHA = 0.25; // the two faint squares

// Logo layout in grid cells (not pixels) — guarantees uniform squares
// Each square is SQ_CELLS x SQ_CELLS dots, separated by GAP_CELLS empty cells
const SQ_CELLS = 6; // dots per square side
const GAP_CELLS = 1; // gap between squares in grid cells
const PAD_CELLS = 1; // padding around the logo
// Total grid: PAD + SQ + GAP + SQ + GAP + SQ + PAD = 1+6+1+6+1+6+1 = 22 cells
const LOGO_GRID_SIZE = PAD_CELLS * 2 + SQ_CELLS * 3 + GAP_CELLS * 2; // 22

// Which cells in the 3x3 grid are filled, and whether dim
// Pattern: ■ _ ▫  /  ■ ■ ▫  /  ■ _ ■
const LOGO_PATTERN: (false | "solid" | "dim")[][] = [
  ["solid", false,  "dim"],
  ["solid", "solid", "dim"],
  ["solid", false,  "solid"],
];

// Glow, flicker, and disruption boost
const BLOOM_BLUR = 5; // CSS px blur radius for bloom pass
const BLOOM_ALPHA = 0.15; // how visible the bloom layer is
const FLICKER_SPEED = 8; // how fast dots flicker
const FLICKER_AMOUNT = 0.2; // max alpha variation (±) for bg dots
const BOOST_AMOUNT = 0.6; // how much brighter disrupted logo dots get
const BOOST_AMOUNT_BG = 0.8; // how much brighter disrupted bg dots get (stronger since they start dim)
const BOOST_DECAY = 0.02; // how fast the boost fades per frame (slow fade = ripple trail)

// Interaction
const REPULSE_RADIUS = 50;
const MAX_DISPLACEMENT_BASE = 20; // displacement at slowest speed
const MAX_DISPLACEMENT_FAST = 60; // displacement at high speed
const LERP_FACTOR_BASE = 0.1; // heal speed at slowest (current default)
const LERP_FACTOR_FAST = 0.02; // heal speed at high velocity (much slower return)
const VELOCITY_SCALE = 0.05; // maps pixel velocity to 0-1 influence
const SETTLE_THRESHOLD = 0.5;

const GOLD_R = 201,
  GOLD_G = 168,
  GOLD_B = 76;

interface Props {
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

export default function DitheredLogo({ anchorRef }: Props) {
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

    const dpr = Math.min(devicePixelRatio, 2);
    const radius = REPULSE_RADIUS * dpr;
    const radiusSq = radius * radius;
    const dotSize = DOT_SIZE * dpr;
    const mouseX = pointerRef.current.x;
    const mouseY = pointerRef.current.y;
    const t_sec = time / 1000;

    // Velocity influence (0 = stationary, 1 = fast)
    const speed = pointerRef.current.speed;
    const velInfluence = Math.min(1, speed * VELOCITY_SCALE);
    const maxDisp = (MAX_DISPLACEMENT_BASE + (MAX_DISPLACEMENT_FAST - MAX_DISPLACEMENT_BASE) * velInfluence) * dpr;
    const currentLerp = LERP_FACTOR_BASE + (LERP_FACTOR_FAST - LERP_FACTOR_BASE) * velInfluence;
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
        dots.boost[i] = Math.max(0, dots.boost[i] - BOOST_DECAY);
      }

      // Use per-dot lerp speed (defaults to base if never displaced)
      const lerp = dots.lerpSpeed[i] || LERP_FACTOR_BASE;
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
        if (dots.alpha[i] > BG_ALPHA) {
          bloomCtx.globalAlpha = dots.alpha[i];
          bloomCtx.fillRect(dots.currentX[i], dots.currentY[i], dotSize, dotSize);
        }
      }
      // Draw the bloom layer blurred and faint onto the main canvas
      ctx.save();
      ctx.filter = `blur(${BLOOM_BLUR * dpr}px)`;
      ctx.globalAlpha = BLOOM_ALPHA;
      ctx.drawImage(bloomCanvas, 0, 0);
      ctx.restore();
    }

    // Pass 2: all dots, crisp
    for (let i = 0; i < dots.count; i++) {
      const boost = dots.boost[i] * BOOST_AMOUNT;
      if (dots.alpha[i] <= BG_ALPHA) {
        const bgBoost = dots.boost[i] * BOOST_AMOUNT_BG;
        ctx.globalAlpha = Math.min(1, dots.alpha[i] + bgBoost);
      } else {
        // Flickering pixels — only a few dots across the logo blink
        const dotSeed = Math.abs(Math.sin(i * 127.1));
        const isFlickerer = dotSeed > 0.98; // only ~2% of dots can flicker at all
        let flickerMul = 1.0;
        if (isFlickerer) {
          const dotPhase = dotSeed * 1000;
          const blinkCycle = ((t_sec + dotPhase) % 6.0); // 6s cycle
          if (blinkCycle < 0.12) flickerMul = 0.3;
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

    const dpr = Math.min(devicePixelRatio, 2);
    const step = GRID_CSS_STEP * dpr;

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

        let dotAlpha = BG_ALPHA;

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
                  dotAlpha = isCorner(localRow, localCol) ? DIM_SQUARE_ALPHA * CORNER_ALPHA : DIM_SQUARE_ALPHA;
                } else {
                  dotAlpha = isCorner(localRow, localCol) ? CORNER_ALPHA : 1.0;
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
    const dotSize = DOT_SIZE * dpr;
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

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full touch-none"
      style={{ zIndex: -5 }}
      aria-hidden="true"
    />
  );
}
