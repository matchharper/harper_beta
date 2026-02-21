import React, { useEffect, useRef, useState } from "react";

export default function InteractiveDotGridBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // smoothed cursor position (0..1)
  const [p, setP] = useState({ x: 0.5, y: 0.4 });
  const target = useRef({ x: 0.5, y: 0.4 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      target.current = {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      };
    };

    const tick = () => {
      setP((prev) => {
        const a = 0.12; // smoothing
        return {
          x: prev.x + (target.current.x - prev.x) * a,
          y: prev.y + (target.current.y - prev.y) * a,
        };
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      el.removeEventListener("pointermove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const styleVars: React.CSSProperties = {
    ["--mx" as any]: `${p.x * 100}%`,
    ["--my" as any]: `${p.y * 100}%`,
  };

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0"
      style={styleVars}
      aria-hidden
    >
      {/* Base dots */}
      <div className="absolute inset-0 baseDots" />

      {/* Cursor highlight dots (brighter) */}
      <div className="absolute inset-0 highlightDots" />

      {/* Bloom/halo layer (soft glow) */}
      <div className="absolute inset-0 bloom" />

      {/* Optional: subtle noise to make it premium */}
      <div className="absolute inset-0 noise opacity-[0.07] mix-blend-overlay" />

      <style jsx>{`
        /* tweakables */
        :global(.baseDots),
        :global(.highlightDots) {
          background-size: 20px 20px;
        }

        /* base dots: calm, low contrast */
        :global(.baseDots) {
          opacity: 0.4;
          background-image: radial-gradient(
            rgba(255, 255, 255, 0.22) 0.9px,
            transparent 0.9px
          );
        }

        /* highlight dots:
           - same grid, but brighter
           - masked to only show near cursor */
        :global(.highlightDots) {
          opacity: 0.95;
          background-image: radial-gradient(
            rgba(255, 255, 255, 0.55) 1.05px,
            transparent 1.05px
          );

          /* Only near cursor */
          mask-image: radial-gradient(
            260px 260px at var(--mx) var(--my),
            rgba(0, 0, 0, 1),
            rgba(0, 0, 0, 0) 70%
          );
          mask-repeat: no-repeat;

          /* feels like “dots react” */
          transition: opacity 120ms ease;
        }

        /* bloom:
           - soft halo centered at cursor
           - plus a tiny blurred dot grid glow for that premium bloom */
        :global(.bloom) {
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.75;

          background-image:
            radial-gradient(
              420px 340px at var(--mx) var(--my),
              rgba(255, 255, 255, 0.1),
              transparent 60%
            ),
            radial-gradient(rgba(255, 255, 255, 0.22) 1.1px, transparent 1.1px);

          background-size:
            auto,
            20px 20px;
          filter: blur(0.6px);

          mask-image: radial-gradient(
            360px 320px at var(--mx) var(--my),
            rgba(0, 0, 0, 1),
            rgba(0, 0, 0, 0) 72%
          );
          mask-repeat: no-repeat;
        }

        /* noise */
        :global(.noise) {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E");
          background-size: 140px 140px;
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.highlightDots),
          :global(.bloom) {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
