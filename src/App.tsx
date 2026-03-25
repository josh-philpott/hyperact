import { useState, useRef } from "react";
import { Agentation } from "agentation";
import DitheredLogo from "./components/DitheredLogo";

export default function App() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const logoAnchorRef = useRef<HTMLDivElement>(null);

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
    <DitheredLogo anchorRef={logoAnchorRef} />
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6">
        {/* Coming Soon label */}
        <p className="font-mono text-[12px] uppercase tracking-[4px] text-muted">
          Coming soon
        </p>

        {/* Logo placeholder — reserves space in layout, dots render on the canvas */}
        <div ref={logoAnchorRef} style={{ width: 100, height: 100 }} aria-hidden="true" />

        {/* Title */}
        <h1 className="font-mono text-[56px] font-medium leading-[96px] text-gold">
          Hyperact
        </h1>

        {/* Tagline */}
        <p className="-mt-4 font-serif text-[24px] italic leading-[37.8px] tracking-[-0.5px] text-tagline">
          Skip the hype—practical conversations about AI.
        </p>

        {/* Email form */}
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
    {process.env.NODE_ENV === "development" && <Agentation />}
    </>
  );
}
