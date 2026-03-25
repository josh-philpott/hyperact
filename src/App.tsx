import { useEffect, useRef, useState } from "react";

// Signal to reset particles — set to true, animation loop reads & clears it
let resetParticles = false;

const params = {
  pushRadius: 200,
  pushStrength: 15,
  orbitSpeed: 0.5,
  spring: 0.012,
  damping: 0.96,
  dampenDelay: 1.0,
};

function DebugSliders() {
  const [, rerender] = useState(0);
  const tick = () => rerender((n) => n + 1);

  const sliders: { label: string; key: keyof typeof params; min: number; max: number; step: number }[] = [
    { label: "Push Radius", key: "pushRadius", min: 50, max: 500, step: 10 },
    { label: "Push Strength", key: "pushStrength", min: 1, max: 50, step: 1 },
    { label: "Orbit Speed", key: "orbitSpeed", min: 0, max: 3, step: 0.05 },
    { label: "Spring", key: "spring", min: 0.001, max: 0.05, step: 0.001 },
    { label: "Damping", key: "damping", min: 0.85, max: 0.999, step: 0.001 },
  ];

  return (
    <div className="fixed bottom-4 left-4 z-50 rounded-lg bg-black/80 p-4 font-mono text-[11px] text-white backdrop-blur">
      {sliders.map((s) => (
        <div key={s.key} className="mb-2 flex items-center gap-3">
          <label className="w-28">{s.label}</label>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={params[s.key]}
            onChange={(e) => {
              params[s.key] = parseFloat(e.target.value);
              tick();
            }}
            className="w-32"
          />
          <span className="w-12 text-right">{params[s.key].toFixed(3)}</span>
        </div>
      ))}
      <button
        onClick={() => { resetParticles = true; }}
        className="mt-2 w-full rounded bg-white/10 px-3 py-1.5 hover:bg-white/20"
      >
        Reset
      </button>
    </div>
  );
}

function ParticleLogo({ anchorRef }: { anchorRef: React.RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -9999, y: -9999, speed: 0, lastMove: 0 });
  const prevMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const anchor = anchorRef.current;
    if (!canvas || !anchor) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    let w = 0;
    let h = 0;

    const grid = [
      [1, 0, 0.15],
      [1, 1, 0.15],
      [1, 0, 1],
    ];

    const cellSize = 16;
    const gap = 4;
    const gridW = 3 * cellSize + 2 * gap;

    interface Particle {
      // Offset relative to grid origin (stable)
      localX: number;
      localY: number;
      // Absolute positions (computed each frame)
      homeX: number;
      homeY: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      baseAlpha: number;
      phase: number;
      orbitDir: number;
      orbitOffset: number;
    }

    const particles: Particle[] = [];
    let initialized = false;

    function buildParticles() {
      particles.length = 0;

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const alpha = grid[row][col];
          if (alpha === 0) continue;

          const cellLocalX = col * (cellSize + gap);
          const cellLocalY = row * (cellSize + gap);
          const dir = 1; // All orbit same direction

          // Dense grid — particles tile to form a solid square
          const step = alpha === 1 ? 1.4 : 3;
          const radius = step * 0.75; // overlap slightly so no gaps
          for (let px = step / 2; px < cellSize; px += step) {
            for (let py = step / 2; py < cellSize; py += step) {
              const lx = cellLocalX + px;
              const ly = cellLocalY + py;
              particles.push({
                localX: lx,
                localY: ly,
                homeX: 0,
                homeY: 0,
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                size: radius,
                baseAlpha: alpha === 1 ? 0.95 + Math.random() * 0.05 : 0.1 + Math.random() * 0.05,
                phase: Math.random() * Math.PI * 2,
                orbitDir: dir,
                orbitOffset: 0.5 + Math.random() * 1.0,
              });
            }
          }
        }
      }
    }
    buildParticles();

    let lastOriginX = 0;
    let lastOriginY = 0;

    function updateHomePositions() {
      const rect = anchor!.getBoundingClientRect();
      if (rect.width === 0) return;

      const originX = rect.left + rect.width / 2 - gridW / 2;
      const originY = rect.top + rect.height / 2 - gridW / 2;

      for (const p of particles) {
        const newHomeX = originX + p.localX;
        const newHomeY = originY + p.localY;

        if (!initialized) {
          // First valid frame — snap everything to home
          p.x = newHomeX;
          p.y = newHomeY;
        } else {
          // Subsequent frames — if home moved (resize), shift current positions too
          p.x += newHomeX - p.homeX;
          p.y += newHomeY - p.homeY;
        }
        p.homeX = newHomeX;
        p.homeY = newHomeY;
      }
      initialized = true;
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
    }
    resize();

    function onMove(e: MouseEvent) {
      const speed = Math.hypot(e.clientX - prevMouse.current.x, e.clientY - prevMouse.current.y);
      prevMouse.current = { x: e.clientX, y: e.clientY };
      mouse.current = { x: e.clientX, y: e.clientY, speed: Math.min(speed, 80), lastMove: performance.now() };
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", resize);

    let raf: number;

    function draw(t: number) {
      ctx.clearRect(0, 0, w * dpr, h * dpr);
      updateHomePositions();

      // Reset particles to home positions
      if (resetParticles) {
        for (const p of particles) {
          p.x = p.homeX;
          p.y = p.homeY;
          p.vx = 0;
          p.vy = 0;
        }
        resetParticles = false;
      }

      // Logo center for orbit
      const anchorRect = anchor!.getBoundingClientRect();
      const logoCx = anchorRect.left + anchorRect.width / 2;
      const logoCy = anchorRect.top + anchorRect.height / 2;

      // How long since mouse last moved
      const timeSinceMove = (performance.now() - mouse.current.lastMove) / 1000;
      // 0 = just moved, 1 = fully settled (over ~4 seconds)
      const settleProgress = Math.min(timeSinceMove / 4, 1);
      // Orbit fades out as particles settle
      const orbitFade = Math.max(0, 1 - settleProgress);

      // Mouse speed scales push force
      const speedScale = Math.min(mouse.current.speed / 30, 1);

      for (const p of particles) {
        const dx = p.x - mouse.current.x;
        const dy = p.y - mouse.current.y;
        const dist = Math.hypot(dx, dy);

        // Mouse pushes particles — force scales with mouse speed
        // Launch direction based on particle's home position relative to logo center
        if (dist < params.pushRadius && dist > 0 && speedScale > 0.05) {
          const strength = ((params.pushRadius - dist) / params.pushRadius) ** 2 * params.pushStrength * speedScale;
          // Direction from logo center to home position — fans particles outward
          const fromCenterX = p.homeX - logoCx;
          const fromCenterY = p.homeY - logoCy;
          const fromCenterDist = Math.hypot(fromCenterX, fromCenterY) || 1;
          // Push along home-from-center angle (each particle launches differently)
          p.vx += (fromCenterX / fromCenterDist) * strength * 1.5;
          p.vy += (fromCenterY / fromCenterDist) * strength * 1.5;
          // Plus tangential kick to start the orbit
          p.vx += (-fromCenterY / fromCenterDist) * strength * 0.8 * p.orbitDir;
          p.vy += (fromCenterX / fromCenterDist) * strength * 0.8 * p.orbitDir;
        }

        const hx = p.homeX - p.x;
        const hy = p.homeY - p.y;
        const homeDist = Math.hypot(hx, hy);

        // Orbit around logo center — per-particle direction & speed
        const toCenterX = p.x - logoCx;
        const toCenterY = p.y - logoCy;
        const centerDist = Math.hypot(toCenterX, toCenterY);

        if (centerDist > 5 && homeDist > 3) {
          const orbitStrength = Math.min(homeDist / 60, 1) * params.orbitSpeed * orbitFade * p.orbitOffset;
          p.vx += (-toCenterY / centerDist) * orbitStrength * p.orbitDir;
          p.vy += (toCenterX / centerDist) * orbitStrength * p.orbitDir;
        }

        // Spring always pulls home — ramps up as settle progresses
        const springStrength = params.spring * 0.3 + settleProgress * params.spring * 2;
        p.vx += hx * springStrength;
        p.vy += hy * springStrength;

        // Damping — light while orbiting, heavy when settling
        const dampNow = 0.995 - settleProgress * (1 - params.damping + 0.04);
        p.vx *= dampNow;
        p.vy *= dampNow;

        p.x += p.vx;
        p.y += p.vy;

        // Only flicker when displaced — solid at rest
        const scatter = Math.min(homeDist / 500, 1);
        const flicker = homeDist > 5
          ? 0.85 + Math.sin(t * 0.003 + p.phase) * 0.15
          : 1;
        const alpha = p.baseAlpha * flicker * (1 - scatter * 0.6);

        ctx.fillStyle = `rgba(201, 168, 76, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x * dpr, p.y * dpr, p.size * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, [anchorRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}

export default function App() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const logoAnchor = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <ParticleLogo anchorRef={logoAnchor} />
      <DebugSliders />
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-6">
          <p className="font-mono text-[12px] uppercase tracking-[4px] text-muted">
            Coming soon
          </p>

          <div ref={logoAnchor} className="size-[56px]" />

          <h1 className="font-mono text-[56px] font-medium leading-[96px] text-gold">
            Hyperact
          </h1>

          <p className="-mt-4 font-serif text-[24px] italic leading-[37.8px] tracking-[-0.5px] text-tagline">
            Skip the hype—practical conversations about AI.
          </p>

          {status === "success" ? (
            <p className="font-mono text-[14px] text-tagline">
              Thanks! We'll be in touch.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-2 flex">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="h-[49px] w-[252px] border border-r-0 border-cream-border bg-bg-input px-5 font-serif-body text-[14px] italic text-tagline placeholder:text-muted focus:outline-none"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="h-[49px] w-[168px] border border-cream bg-cream font-mono text-[11px] uppercase tracking-[2px] text-bg transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
              >
                {status === "loading" ? "Submitting..." : "Get early access"}
              </button>
            </form>
          )}
          {status === "error" && (
            <p className="font-mono text-[12px] text-red-400">
              Something went wrong. Please try again.
            </p>
          )}

          <nav className="mt-4 flex items-center gap-6">
            <a
              href="https://x.com/hyperactdoting"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] uppercase tracking-[2px] text-muted transition-colors hover:text-tagline"
            >
              Twitter / X
            </a>
            <a
              href="https://www.linkedin.com/company/113013698/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] uppercase tracking-[2px] text-muted transition-colors hover:text-tagline"
            >
              LinkedIn
            </a>
            <a
              href="/feed.xml"
              className="font-mono text-[11px] uppercase tracking-[2px] text-muted transition-colors hover:text-tagline"
            >
              RSS
            </a>
          </nav>
        </div>
      </main>
    </>
  );
}
