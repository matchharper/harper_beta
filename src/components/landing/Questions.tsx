import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

type Variant = "large" | "small" | "compact";
type Theme = "dark" | "cream";

function QuestionAnswer({
  question,
  answer,
  index = 1,
  onOpen,
  variant = "large",
  length = 4,
  theme = "dark",
}: {
  question: string;
  answer: React.ReactNode;
  index?: number;
  onOpen?: () => void;
  variant?: Variant;
  length?: number;
  theme?: Theme;
}) {
  const [open, setOpen] = useState(false);
  const answerId = useId();
  const reduceMotion = useReducedMotion();
  const isDark = theme === "dark";

  const size = {
    large: {
      wrapper: "px-1 md:px-[30px] py-6 md:py-[32px]",
      question: "text-sm md:text-base",
      answer: "mt-3 pb-2 pr-10 text-sm md:text-[15px] leading-6",
      icon: "ml-6 h-6 w-6",
    },
    small: {
      wrapper: "py-4 md:py-6",
      question: "text-sm",
      answer: "mt-2 pb-1 pr-6 text-sm md:text-[15px] leading-5",
      icon: "ml-3 h-5 w-5",
    },
    compact: {
      wrapper: "",
      question: "text-[15px] leading-6 md:text-base",
      answer: "pb-4 pr-9 text-sm md:text-[15px] leading-6",
      icon: "ml-4 h-5 w-5",
    },
  }[variant];

  return (
    <div
      className={`border-b w-full gap-4 ${
        isDark ? "border-white/20" : "border-neutral-1000-a10"
      } ${size.wrapper} ${index === length - 1 ? "border-b-0" : ""}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
        className={`flex w-full cursor-pointer items-center rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-400 ${
          variant === "compact"
            ? "justify-between py-4 font-normal"
            : "justify-between md:justify-start font-light"
        }`}
      >
        <span
          className={`${size.question} transition-colors ${
            isDark
              ? `hover:text-white ${open ? "text-white" : "text-neutral-500"}`
              : `hover:text-neutral-primary ${open || variant === "compact" ? "text-neutral-primary" : "text-neutral-muted"}`
          }`}
        >
          {question}
        </span>

        <span
          aria-hidden="true"
          className={`${size.icon} inline-flex shrink-0 items-center justify-center transition-transform duration-300 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
        >
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className={isDark ? "text-neutral-500" : "text-neutral-muted"}
          />
        </span>
      </button>

      <div id={answerId}>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.22,
                ease: "easeInOut",
              }}
              className="overflow-hidden"
            >
              <div
                className={`${size.answer} ${isDark ? "text-white/70" : "text-neutral-muted"} text-left`}
              >
                {answer}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default React.memo(QuestionAnswer);
