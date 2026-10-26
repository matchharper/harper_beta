import { useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./animated-handshake.module.css";

/** Decorative handshake for buttons: entrance, hover, and keyboard focus. */
export function AnimatedHandshake({ className }: { className?: string }) {
  const [entering, setEntering] = useState(true);
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 overflow-visible",
        styles.icon,
        entering && styles.entering,
        className
      )}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {/* Lucide Handshake paths, grouped by hand for motion. */}
      <g
        className={styles.handshake}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) {
            setEntering(false);
          }
        }}
      >
        <g className={styles.leftHand}>
          <path d="M3 4h8" />
          <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
          <path d="m11 17 2 2a1 1 0 1 0 3-3" />
        </g>
        <g className={styles.rightHand}>
          <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
          <path d="m21 3 1 11h-2" />
        </g>
      </g>
    </svg>
  );
}
