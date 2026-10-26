import { type ComponentProps } from "react";
import { MuteButton } from "@/components/ui/button";
import { CANDIDATE_DECISION_LABELS } from "@/lib/org/candidateDecision";
import { cn } from "@/lib/utils";
import { AnimatedHandshake } from "@/components/ui/animated-handshake";

/** The existing candidate card's Accept Intro action, shared with inline review. */
export function OrgAcceptIntroButton({
  className,
  shortcut = false,
  ...props
}: Omit<ComponentProps<typeof MuteButton>, "children" | "variant"> & {
  shortcut?: boolean;
}) {
  return (
    <MuteButton
      {...props}
      variant="dark"
      aria-keyshortcuts={shortcut ? "r" : undefined}
      className={cn(
        "bg-positive-strong text-white border-positive-strong hover:bg-positive-strong",
        className
      )}
    >
      <AnimatedHandshake />
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
