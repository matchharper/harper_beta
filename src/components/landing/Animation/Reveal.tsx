import React, { useEffect, useRef } from "react";
import { motion, useAnimation } from "framer-motion";

type RevealDirection = "bottom" | "top" | "left" | "right" | "none";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  direction?: RevealDirection;
  distance?: number;
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  once?: boolean;
  amount?: number;
};

const getDirectionalOffset = (direction: RevealDirection, distance: number) => {
  switch (direction) {
    case "top":
      return { x: 0, y: -distance };
    case "left":
      return { x: -distance, y: 0 };
    case "right":
      return { x: distance, y: 0 };
    case "none":
      return { x: 0, y: 0 };
    case "bottom":
    default:
      return { x: 0, y: distance };
  }
};

const Reveal = ({
  children,
  className,
  delay = 0,
  duration = 0.95,
  direction = "bottom",
  distance = 44,
  offsetX,
  offsetY,
  blur = 18,
  once = true,
  amount = 0.2,
}: RevealProps) => {
  const controls = useAnimation();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      void controls.start("visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            void controls.start("visible");
            if (once) observer.unobserve(entry.target);
            return;
          }

          if (!once) {
            void controls.start("hidden");
          }
        });
      },
      { threshold: amount }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [amount, controls, once]);

  const directionalOffset = getDirectionalOffset(direction, distance);
  const hiddenX = offsetX ?? directionalOffset.x;
  const hiddenY = offsetY ?? directionalOffset.y;

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={controls}
      variants={{
        hidden: {
          opacity: 0,
          x: hiddenX,
          y: hiddenY,
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
