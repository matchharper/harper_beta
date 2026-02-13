import { AnimatePresence, motion } from "framer-motion";
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

type Variant = "large" | "small";

function QuestionAnswer({
  question,
  answer,
  index = 1,
  onOpen,
  variant = "large",
}: {
  question: string;
  answer: string;
  index?: number;
  onOpen?: () => void;
  variant?: Variant;
}) {
  const [open, setOpen] = useState(false);

  const size = {
    large: {
      wrapper: "px-1 md:px-[30px] py-6 md:py-[32px]",
      question: "text-base",
      answer: "mt-3 pb-2 pr-10 text-sm leading-6",
      icon: "ml-6 h-6 w-6",
    },
    small: {
      wrapper: "py-4 md:py-6",
      question: "text-sm",
      answer: "mt-2 pb-1 pr-6 text-sm leading-5",
      icon: "ml-3 h-5 w-5",
    },
  }[variant];

  return (
    <div
      className={`border-b border-white/20 w-full gap-4 ${
        size.wrapper
      } ${index === 3 ? "border-b-0" : ""}`}
    >
      <button
        type="button"
        onClick={() =>
          setOpen((prev) => {
            const next = !prev;
            if (next) onOpen?.();
            return next;
          })
        }
        className="flex w-full items-center justify-between md:justify-start text-left"
      >
        <span
          className={`${size.question} transition-colors hover:text-white ${
            open ? "text-white" : "text-hgray700"
          }`}
        >
          {question}
        </span>

        <span
          className={`${size.icon} inline-flex items-center justify-center transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        >
          <ChevronDown size={16} strokeWidth={1.5} className="text-hgray700" />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={`${size.answer} text-white/70 text-left`}>
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default React.memo(QuestionAnswer);
