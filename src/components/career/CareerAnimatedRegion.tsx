import type { ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";

// Height changes use one spring; color, focus and press feedback use the CSS tokens.
const revealTransition = {
  type: "spring",
  stiffness: 360,
  damping: 38,
} as const;

function Region({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : revealTransition}
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      className="career-animated-region"
    >
      {children}
    </motion.div>
  );
}

/** Keeps closing content out of the tab order while its height settles. */
export function CareerAnimatedRegion({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? <Region key="content">{children}</Region> : null}
    </AnimatePresence>
  );
}
