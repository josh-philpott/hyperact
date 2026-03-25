import { useState } from "react";

function Logo() {
  // Stylized "H" made of gold squares in a 3x3 grid
  // Pattern: ■ _ ▫  /  ■ ■ ▫  /  ■ _ ■
  // ■ = solid gold, ▫ = dim gold, _ = empty
  const grid = [
    [true, null, "dim"],
    [true, true, "dim"],
    [true, null, true],
  ] as const;

  return (
    <div className="grid grid-cols-3 gap-1" aria-hidden="true">
      {grid.flat().map((cell, i) => (
        <div
          key={i}
          className={`size-4 rounded-[4px] ${
            cell === true
              ? "bg-gold"
              : cell === "dim"
                ? "bg-gold-dim"
                : "bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-5">
      <div className="flex flex-col items-center gap-6">
        {/* Coming Soon label */}
        <p className="font-mono text-[12px] uppercase tracking-[4px] text-muted">
          Coming soon
        </p>

        {/* Logo */}
        <Logo />

        {/* Title */}
        <h1 className="-mt-3 font-mono text-[32px] font-medium leading-tight text-gold sm:text-[56px] sm:leading-[96px]">
          Hyperact
        </h1>

        {/* Tagline */}
        <p className="-mt-4 font-serif text-[18px] italic leading-snug tracking-[-0.5px] text-tagline sm:text-[24px] sm:leading-[37.8px]">
          Skip the hype—practical conversations about AI.
        </p>

        {/* Email form */}
        {status === "success" ? (
          <p className="font-mono text-[14px] text-tagline">
            Thanks! We'll be in touch.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-2 flex w-full flex-col sm:w-auto sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="h-[49px] w-full border border-b-0 border-cream-border bg-bg-input px-5 font-serif-body text-[14px] italic text-tagline placeholder:text-muted focus:outline-none sm:w-[252px] sm:border-b sm:border-r-0"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="h-[49px] w-full border border-cream bg-cream font-mono text-[11px] uppercase tracking-[2px] text-bg transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60 sm:w-[168px]"
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

        {/* Social links */}
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
  );
}
