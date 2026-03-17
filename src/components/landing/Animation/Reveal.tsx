import React, { useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import { useInView } from "react-intersection-observer";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  once?: boolean;
  amount?: number;
};

const Reveal = ({
  children,
  className,
  delay = 0,
  duration = 0.85,
  offsetX = 0,
  offsetY = 44,
  blur = 18,
  once = true,
  amount = 0.2,
}: RevealProps) => {
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

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={controls}
      variants={{
        hidden: {
          opacity: 0,
          x: offsetX,
          y: offsetY,
          filter: `blur(${blur}px)`,
        },
        visible: {
          opacity: 1,
          x: 0,
          y: 0,
          filter: "blur(0px)",
          transition: {
            delay,
            duration,
            ease: [0.22, 1, 0.36, 1],
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default Reveal;
