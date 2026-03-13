import React from "react";

type CandidateCarouselProps = {
  className?: string;
};

const pattern = [0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1];

export default function CandidateCarousel({
  className = "",
}: CandidateCarouselProps) {
  return (
    <>
      <style>
        {`
          @keyframes harper-slide {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(calc(-167px * 8));
            }
          }

          @keyframes harper-shimmer {
            0% {
              transform: translateX(-150%);
            }
            100% {
              transform: translateX(150%);
            }
          }

          .harper-track {
            animation: harper-slide 24s linear infinite;
            will-change: transform;
          }

          .harper-shimmer::after {
            content: "";
            position: absolute;
            inset: 0;
            animation: harper-shimmer 2.4s ease-in-out infinite;
          }

          .harper-shimmer-gray::after {
            background: linear-gradient(
              105deg,
              transparent 35%,
              rgba(255, 255, 255, 0.06) 50%,
              transparent 65%
            );
          }

          .harper-shimmer-accent::after {
            background: linear-gradient(
              105deg,
              transparent 35%,
              rgba(239, 255, 63, 0.08) 50%,
              transparent 65%
            );
          }
        `}
      </style>

      <div className={`relative w-[480px] overflow-hidden ${className}`}>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[140px] bg-gradient-to-r from-[#212121] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[140px] bg-gradient-to-l from-[#212121] to-transparent" />

        <div className="harper-track flex gap-3">
          {pattern.map((isMatch, idx) => {
            const matched = isMatch === 1;

            return (
              <div
                key={idx}
                className="relative h-[160px] w-[155px] shrink-0 rounded-2xl p-[22px]"
              >
                <svg
                  className="pointer-events-none absolute inset-0 overflow-visible"
                  width="155"
                  height="160"
                  viewBox="0 0 155 160"
                  fill="none"
                >
                  <rect
                    x="1"
                    y="1"
                    width="153"
                    height="158"
                    rx="16"
                    ry="16"
                    fill="none"
                    stroke={matched ? "#454E0E" : "#393D46"}
                    strokeOpacity="0.5"
                    strokeWidth="1.5"
                    strokeDasharray="6 3"
                    strokeDashoffset="4"
                    strokeLinecap="round"
                  />
                </svg>

                <div className="relative z-[1] flex h-full flex-col items-center gap-4">
                  <div
                    className={[
                      "harper-shimmer relative h-14 w-14 overflow-hidden rounded-full",
                      matched
                        ? "harper-shimmer-accent bg-[#454E0E]/50"
                        : "harper-shimmer-gray bg-[#393D46]/50",
                    ].join(" ")}
                  />

                  <div className="relative z-[1] flex flex-col items-center gap-1.5">
                    <div
                      className={
                        matched
                          ? "h-3 w-16 rounded-[5px] bg-[#454E0E]/50"
                          : "h-3 w-16 rounded-[5px] bg-[#393D46]/50"
                      }
                    />
                    <div
                      className={
                        matched
                          ? "h-2.5 w-11 rounded-[5px] bg-[#454E0E]/50"
                          : "h-2.5 w-11 rounded-[5px] bg-[#393D46]/50"
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
