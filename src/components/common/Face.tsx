import Image from "next/image";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";

import { cn } from "@/lib/utils";

import styles from "./Face.module.css";

export type FaceStatus = "idle" | "closing" | "speaking" | "listening";
type FaceExpressionOffset = {
  x?: number | string;
  y?: number | string;
};

type FaceProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  expressionOffset?: FaceExpressionOffset;
  flipped?: boolean;
  size?: number;
  status?: FaceStatus;
  priority?: boolean;
};

const FACE_SVG_BASE_PATH = "/svgs/face";
const FACE_STROKE_COLOR = "#574F4F";

const facePath = {
  browLeft: "M19 6C19 6 16.8346 1 10 1C3.43609 1 1 6 1 6",
  browRight: "M45 6C45 6 42.8346 1 36 1C29.4361 1 27 6 27 6",
  closedEyeLeft:
    "M5.83333 12.6667C5.83333 12.6667 6.81579 15 9.91667 15C12.8947 15 14 12.6667 14 12.6667",
  closedEyeRight:
    "M31.8333 12.6667C31.8333 12.6667 32.8158 15 35.9167 15C38.8947 15 40 12.6667 40 12.6667",
  idleMouth:
    "M16.3994 42.4336C16.3994 42.4336 19.3481 45.9592 26.8173 44.5881C33.9907 43.2712 36.0708 38.8226 36.0708 38.8226",
  nose: "M21.5 10L13 29H26",
  speakingMouth:
    "M24.5752 41.5922C26.6881 41.6307 28.5429 42.1565 29.8301 42.9235C31.1453 43.7071 31.6873 44.6143 31.6732 45.3891C31.6589 46.1638 31.0843 47.0508 29.7415 47.7859C28.4272 48.5055 26.5544 48.9624 24.4416 48.924C22.3286 48.8855 20.473 48.3607 19.1857 47.5937C17.8707 46.8101 17.3286 45.9027 17.3426 45.128C17.3567 44.3533 17.9316 43.4664 19.2742 42.7312C20.5886 42.0115 22.4621 41.5537 24.5752 41.5922Z",
} as const;

function Face({
  expressionOffset,
  flipped = false,
  status = "idle",
  size = 140,
  className,
  priority = false,
  role = "img",
  style,
  "aria-label": ariaLabel = "Harper face",
  ...props
}: FaceProps) {
  const backgroundSize = Math.round((size * 116) / 160);
  const expressionSize = Math.round((size * 44) / 160);

  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className
      )}
      role={role}
      style={{ width: size, height: size, ...style }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 m-auto select-none"
        style={{ transform: flipped ? "scaleX(-1)" : undefined }}
      >
        <Image
          src={`${FACE_SVG_BASE_PATH}/bgblur.svg`}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          priority={priority}
          draggable={false}
          className="pointer-events-none absolute inset-0 z-0 m-auto select-none object-contain"
          style={{ width: size, height: size }}
        />
        <Image
          src={`${FACE_SVG_BASE_PATH}/bg.svg`}
          alt=""
          aria-hidden="true"
          width={backgroundSize}
          height={backgroundSize}
          priority={priority}
          draggable={false}
          className="pointer-events-none absolute inset-0 z-[1] m-auto select-none object-contain"
          style={{ width: backgroundSize, height: backgroundSize }}
        />
        <FaceExpression
          expressionOffset={expressionOffset}
          offsetScale={size / 140}
          size={expressionSize}
          status={status}
        />
      </span>
    </div>
  );
}

function FaceExpression({
  expressionOffset,
  offsetScale,
  status,
  size,
}: {
  expressionOffset?: FaceExpressionOffset;
  offsetScale: number;
  status: FaceStatus;
  size: number;
}) {
  const isClosing = status === "closing";
  const isListening = status === "listening";
  const isSpeaking = status === "speaking";
  const openEyeClassName = cn(
    styles.openEye,
    isClosing && styles.openEyeClosing
  );
  const toCssLength = (value: number | string | undefined) =>
    typeof value === "number" ? `${value}px` : value;
  const expressionStyle = {
    "--face-offset-x": toCssLength(expressionOffset?.x) ?? "0px",
    "--face-offset-y": toCssLength(expressionOffset?.y) ?? "0px",
    ...(isListening
      ? {
          "--face-listening-x-1": `${3 * offsetScale}px`,
          "--face-listening-y-1": `${6 * offsetScale}px`,
          "--face-listening-x-2": `${-6 * offsetScale}px`,
          "--face-listening-y-2": `${-2 * offsetScale}px`,
          "--face-listening-x-3": `${5 * offsetScale}px`,
          "--face-listening-y-3": `${-1 * offsetScale}px`,
        }
      : null),
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-[2] m-auto select-none",
        styles.expressionFrame,
        isListening && styles.expressionMotion
      )}
      style={{ height: size, width: size, ...expressionStyle }}
    >
      <svg
        className={cn(
          styles.expressionSvg,
          styles.expressionFlip,
          isListening && styles.expressionFlipListening
        )}
        fill="none"
        focusable="false"
        height={size}
        viewBox={isSpeaking ? "0 0 46 51" : "0 0 46 47"}
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className={isSpeaking ? styles.speakingMouth : undefined}>
          <path
            d={isSpeaking ? facePath.speakingMouth : facePath.idleMouth}
            stroke={FACE_STROKE_COLOR}
            strokeLinecap="round"
            strokeWidth="2"
          />
        </g>
        <path
          d={facePath.nose}
          stroke={FACE_STROKE_COLOR}
          strokeLinecap="round"
          strokeWidth="2"
        />
        <ellipse
          className={openEyeClassName}
          cx="10"
          cy="12.667"
          fill={FACE_STROKE_COLOR}
          rx="3"
          ry="4"
          stroke={FACE_STROKE_COLOR}
        />
        <ellipse
          className={openEyeClassName}
          cx="36"
          cy="12.667"
          fill={FACE_STROKE_COLOR}
          rx="3"
          ry="4"
          stroke={FACE_STROKE_COLOR}
        />
        {isClosing ? (
          <>
            <path
              className={styles.closedEyeClosing}
              d={facePath.closedEyeLeft}
              stroke={FACE_STROKE_COLOR}
              strokeLinecap="round"
              strokeWidth="2"
            />
            <path
              className={styles.closedEyeClosing}
              d={facePath.closedEyeRight}
              stroke={FACE_STROKE_COLOR}
              strokeLinecap="round"
              strokeWidth="2"
            />
          </>
        ) : null}
        <path
          className={isSpeaking ? styles.speakingBrowLeft : undefined}
          d={facePath.browLeft}
          stroke={FACE_STROKE_COLOR}
          strokeLinecap="round"
          strokeWidth="2"
        />
        <path
          className={isSpeaking ? styles.speakingBrowRight : undefined}
          d={facePath.browRight}
          stroke={FACE_STROKE_COLOR}
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}

export { Face };
export default Face;
