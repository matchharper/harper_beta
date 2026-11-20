import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import styles from "./face-loading.module.css";

type FaceLoadingProps = {
  /** Read by screen readers only. */
  label?: string;
  size?: number;
  className?: string;
};

/** Shapes match /public/svgs/face.svg; parts are split so each can move. */
function FaceParts() {
  return (
    <svg aria-hidden fill="none" viewBox="0 0 46 47">
      <path
        className={cn(styles.part, styles.browL)}
        d="M19 6C19 6 16.8346 1 10 1C3.43609 1 1 6 1 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <path
        className={cn(styles.part, styles.browR)}
        d="M45 6C45 6 42.8346 1 36 1C29.4361 1 27 6 27 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <ellipse
        className={cn(styles.part, styles.eyeL)}
        cx={10}
        cy={12.667}
        fill="currentColor"
        rx={3}
        ry={4.5}
      />
      <ellipse
        className={cn(styles.part, styles.eyeR)}
        cx={36}
        cy={12.667}
        fill="currentColor"
        rx={3}
        ry={4.5}
      />
      <path
        className={cn(styles.part, styles.nose)}
        d="M21.5 10L13 29H26"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <path
        className={cn(styles.part, styles.mouth)}
        d="M16.3994 42.4336C16.3994 42.4336 19.3481 45.9592 26.8173 44.5881C33.9907 43.2712 36.0708 38.8226 36.0708 38.8226"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
      />
    </svg>
  );
}

/**
 * Loading mark for a whole screen that has nothing else to show yet.
 * Every instance follows the page clock, so one loading screen handing over
 * to the next keeps the same motion instead of restarting it.
 */
function FaceLoading({ label = "Loading", size = 56, className }: FaceLoadingProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const animations = rootRef.current?.getAnimations?.({ subtree: true }) ?? [];
    for (const animation of animations) animation.startTime = 0;
  }, []);

  return (
    <div
      aria-live="polite"
      className={cn(styles.root, className)}
      ref={rootRef}
      role="status"
      style={{ width: size }}
    >
      <div aria-hidden className={cn(styles.face, styles.trail)}>
        <FaceParts />
      </div>
      <div aria-hidden className={styles.face}>
        <FaceParts />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export { FaceLoading };
