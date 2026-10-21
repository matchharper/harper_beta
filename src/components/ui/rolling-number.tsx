import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Roll changed digits upward while keeping grouping separators and units still. */
export function RollingNumber({
  value,
  locale,
  suffix = "",
  className,
}: {
  value: number;
  locale: string;
  suffix?: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const formatted = Math.floor(value).toLocaleString(locale);
  const characters = Array.from(formatted);

  return (
    <span className={cn("inline-flex items-baseline tabular-nums", className)}>
      <span className="sr-only">
        {formatted}
        {suffix}
      </span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {characters.map((character, index) => (
          <span
            // Anchor positions to the units column so carries keep their identity.
            key={characters.length - index}
            className={cn(
              "relative inline-grid overflow-hidden",
              /\d/.test(character) && "w-[1ch]"
            )}
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={character}
                initial={{
                  y: reducedMotion ? 0 : "100%",
                  opacity: reducedMotion ? 1 : 0,
                }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: reducedMotion ? 0 : "-100%", opacity: 0 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.65,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="col-start-1 row-start-1 block"
              >
                {character}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
        {suffix}
      </span>
    </span>
  );
}
