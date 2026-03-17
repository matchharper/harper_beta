import React, { useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import { useInView } from "react-intersection-observer";

type StaggerTextProps = {
  text: string;
  className?: string;
  by?: "word" | "char";
  delay?: number;
  stagger?: number;
  blur?: number;
  once?: boolean;
  amount?: number;
};

const StaggerText = ({
  text,
  className,
  by = "word",
  delay = 0,
  stagger = 0.05,
  blur = 12,
  once = true,
  amount = 0.35,
}: StaggerTextProps) => {
  const controls = useAnimation();
  const [ref, inView] = useInView({
    triggerOnce: once,
    threshold: amount,
  });

  useEffect(() => {
    if (inView) {
      controls.start("visible");
      return;
    }

    if (!once) {
      controls.start("hidden");
    }
  }, [controls, inView, once]);

  const parts = by === "char" ? Array.from(text) : text.split(" ");

  return (
    <motion.span
      ref={ref}
      initial="hidden"
      animate={controls}
      variants={{
        hidden: {},
        visible: {
          transition: {
            delayChildren: delay,
            staggerChildren: stagger,
          },
        },
      }}
      className={className}
    >
      {parts.map((part, index) => {
        const content =
          by === "char" ? (part === " " ? "\u00A0" : part) : `${part}\u00A0`;

        return (
          <motion.span
            key={`${part}-${index}`}
            variants={{
              hidden: {
                opacity: 0,
                y: by === "char" ? 28 : 18,
                filter: `blur(${blur}px)`,
              },
              visible: {
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
                transition: {
                  duration: 0.9,
                  ease: [0.16, 1, 0.3, 1],
                },
              },
            }}
            className="inline-block whitespace-pre"
          >
            {content}
          </motion.span>
        );
      })}
    </motion.span>
  );
};

export default StaggerText;
