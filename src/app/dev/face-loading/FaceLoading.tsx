import { cn } from "@/lib/utils";

export const FACE_LOADING_VARIANTS = [
  "scatter",
  "faces",
  "turn",
  "turn-trail",
  "turn-glint",
  "turn-swoosh",
  "roll",
  "jelly",
  "flip",
  "paint",
  "stamp",
  "echo",
] as const;

export type FaceLoadingVariant = (typeof FACE_LOADING_VARIANTS)[number];

/** Colored copies drawn under the main face, bottom to top. */
const COPY_COLORS: Partial<Record<FaceLoadingVariant, string[]>> = {
  "turn-trail": ["--color-action"],
  stamp: ["--color-action", "--color-positive", "--color-primary"],
  echo: ["--color-action", "--color-positive", "--color-primary"],
};

type FaceLoadingProps = {
  variant: FaceLoadingVariant;
  size?: number;
  className?: string;
};

/** Shapes match /public/svgs/face.svg; parts are split so each can move. */
function FaceSvg() {
  return (
    <svg aria-hidden fill="none" viewBox="0 0 46 47">
      <path
        className="fl-part fl-line fl-brow fl-brow-l"
        d="M19 6C19 6 16.8346 1 10 1C3.43609 1 1 6 1 6"
        pathLength={1}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <path
        className="fl-part fl-line fl-brow fl-brow-r"
        d="M45 6C45 6 42.8346 1 36 1C29.4361 1 27 6 27 6"
        pathLength={1}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <ellipse
        className="fl-part fl-eye fl-eye-l"
        cx={10}
        cy={12.667}
        fill="currentColor"
        rx={3}
        ry={4.5}
      />
      <ellipse
        className="fl-part fl-eye fl-eye-r"
        cx={36}
        cy={12.667}
        fill="currentColor"
        rx={3}
        ry={4.5}
      />
      <path
        className="fl-part fl-line fl-nose"
        d="M21.5 10L13 29H26"
        pathLength={1}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <path
        className="fl-part fl-line fl-mouth"
        d="M16.3994 42.4336C16.3994 42.4336 19.3481 45.9592 26.8173 44.5881C33.9907 43.2712 36.0708 38.8226 36.0708 38.8226"
        pathLength={1}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
      />
    </svg>
  );
}

export function FaceLoading({ variant, size = 56, className }: FaceLoadingProps) {
  const copies = COPY_COLORS[variant] ?? [];

  return (
    <div
      aria-label="Loading"
      className={cn(
        "fl-root",
        `fl-${variant}`,
        variant.startsWith("turn-") && "fl-turn",
        className
      )}
      role="status"
      style={{ width: size }}
    >
      {copies.map((token, index) => (
        <div
          aria-hidden
          className={`fl-face fl-copy fl-copy-${index}`}
          key={token}
          style={{ color: `var(${token})` }}
        >
          <FaceSvg />
        </div>
      ))}
      {variant === "turn-swoosh" ? (
        <svg aria-hidden className="fl-swoosh" fill="none" viewBox="0 0 46 47">
          <path
            d="M-4 9Q23 19 50 9"
            pathLength={1}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={2}
          />
          <path
            d="M-2 33Q23 44 48 33"
            pathLength={1}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={2}
          />
        </svg>
      ) : null}
      <div className="fl-face fl-main">
        <FaceSvg />
      </div>
    </div>
  );
}
