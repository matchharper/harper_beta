import React from "react";
import Image from "next/image";

const vcLogos = [
  { key: "google", src: "/svgs/google.svg", width: 128 },
  { key: "anthropic", src: "/svgs/anthropic.svg", width: 152 },
  { key: "metalogo", src: "/svgs/metalogo.svg", width: 152 },
  { key: "stanford", src: "/svgs/Logo1.svg", width: 146 },
  { key: "l2", src: "/svgs/Logo2.svg", width: 152 },
  { key: "l1", src: "/svgs/Logo3.svg", width: 152 },
  { key: "mit", src: "/svgs/mit.svg", width: 152 },
  { key: "a16z", src: "/svgs/a16z.svg", width: 136 },
  { key: "nvidia", src: "/svgs/nvidia.svg", width: 136 },
];

function VCLogos() {
  const items = [...vcLogos, ...vcLogos]; // duplicate for seamless loop

  return (
    <div className="relative w-[86%] mx-auto overflow-hidden">
      {/* soft edge fade (optional) */}
      <div className="hidden md:block pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black to-transparent dark:from-black z-10" />
      <div className="hidden md:block pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black to-transparent dark:from-black z-10" />

      <div className="marquee group w-max hidden md:flex">
        {items.map((vc, i) => (
          <div
            key={`${vc.key}-${i}`}
            className="flex h-28 md:h-32 min-w-[160px] md:min-w-[180px] items-center justify-center px-12"
          >
            <Image
              src={vc.src}
              alt={vc.key}
              width={vc.width}
              height={100}
              className="object-contain opacity-90"
              priority={i < vcLogos.length}
            />
          </div>
        ))}
      </div>
      <div className="md:hidden mt-10 grid grid-cols-2 grid-rows-3 w-full justify-center items-center gap-4 flex-wrap">
        {items.slice(0, 6).map((vc, i) => (
          <div
            key={`${vc.key}-${i}`}
            className="flex items-center justify-center"
          >
            <Image
              src={vc.src}
              alt={vc.key}
              width={vc.width - 20}
              height={100}
              className="object-contain max-w-[36vw] opacity-90"
              priority={i < vcLogos.length}
            />
          </div>
        ))}
      </div>

      <style jsx>{`
        /* Move by 50% because we duplicated the list (2x). */
        .marquee {
          animation: marquee 32s linear infinite;
          will-change: transform;
        }
        /* pause on hover */
        .group:hover .marquee {
          animation-play-state: paused;
        }
        @keyframes marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        /* respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .marquee {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default React.memo(VCLogos);
