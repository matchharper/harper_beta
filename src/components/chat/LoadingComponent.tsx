import React from "react";

type CandidateCarouselProps = {
  className?: string;
  styleType?: "default" | "neutral";
};

const pattern = [0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1];

export default function CandidateCarousel({
  styleType = "default",
  className = "",
}: CandidateCarouselProps) {
  const isNeutral = styleType === "neutral";
  const matchedStroke = isNeutral
    ? "var(--color-primary)"
    : "var(--color-positive)";
  const unmatchedStroke = isNeutral
    ? "var(--color-neutral-muted)"
    : "var(--color-neutral-muted)";
  const matchedFill = isNeutral
    ? "color-mix(in srgb, var(--color-primary) 35%, transparent)"
    : "color-mix(in srgb, var(--color-positive) 35%, transparent)";
  const unmatchedFill = isNeutral
    ? "color-mix(in srgb, var(--color-neutral-muted) 30%, transparent)"
    : "color-mix(in srgb, var(--color-neutral-muted) 35%, transparent)";
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
              color-mix(in srgb, var(--color-neutral-00) 6%, transparent) 50%,
              transparent 65%
            );
          }

          .harper-shimmer-accent::after {
            background: linear-gradient(
              105deg,
              transparent 35%,
              color-mix(in srgb, var(--color-accent-300) 12%, transparent) 50%,
              transparent 65%
            );
          }
        `}
      </style>

      <div className={`relative w-[480px] overflow-hidden ${className}`}>
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-[140px] bg-linear-to-r ${isNeutral ? "from-bg-default" : "from-neutral-1000"} to-transparent`}
        />
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-[140px] bg-linear-to-l ${isNeutral ? "from-bg-default" : "from-neutral-1000"} to-transparent`}
        />

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
                    stroke={matched ? matchedStroke : unmatchedStroke}
                    strokeOpacity="0.5"
                    strokeWidth="1.5"
                    strokeDasharray="6 3"
                    strokeDashoffset="4"
                    strokeLinecap="round"
                  />
                </svg>

                <div className="relative z-1 flex h-full flex-col items-center gap-4">
                  <div
                    className={[
                      "harper-shimmer relative h-14 w-14 overflow-hidden rounded-full",
                      matched ? "harper-shimmer-accent" : "harper-shimmer-gray",
                    ].join(" ")}
                    style={{
                      backgroundColor: matched ? matchedFill : unmatchedFill,
                    }}
                  />

                  <div className="relative z-1 flex flex-col items-center gap-1.5">
                    <div
                      className="h-3 w-16 rounded-[5px]"
                      style={{
                        backgroundColor: matched ? matchedFill : unmatchedFill,
                      }}
                    />
                    <div
                      className="h-2.5 w-11 rounded-[5px]"
                      style={{
                        backgroundColor: matched ? matchedFill : unmatchedFill,
                      }}
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
