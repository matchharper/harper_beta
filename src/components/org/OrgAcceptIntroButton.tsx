import { type ComponentProps, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { CANDIDATE_DECISION_LABELS } from "@/lib/org/candidateDecision";
import { cn } from "@/lib/utils";
import styles from "./OrgAcceptIntroButton.module.css";

/** The existing candidate card's Accept Intro action, shared with inline review. */
export function OrgAcceptIntroButton({
  className,
  shortcut = false,
  ...props
}: Omit<ComponentProps<typeof MuteButton>, "children" | "variant"> & {
  shortcut?: boolean;
}) {
  const [introEntering, setIntroEntering] = useState(true);
  return (
    <MuteButton
      {...props}
      variant="dark"
      aria-keyshortcuts={shortcut ? "r" : undefined}
      className={cn(
        "bg-positive-strong text-white border-positive-strong hover:bg-positive-strong",
        styles.acceptIntro,
        introEntering && styles.introEntering,
        className
      )}
    >
      <svg
        aria-hidden="true"
        className="size-4 shrink-0 overflow-visible"
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
              setIntroEntering(false);
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
      {CANDIDATE_DECISION_LABELS.connect}
      {shortcut && (
        <kbd
          aria-hidden
          className="ml-2 hidden text-xs opacity-50 @min-[500px]/review:inline"
        >
          R
        </kbd>
      )}
    </MuteButton>
  );
}
