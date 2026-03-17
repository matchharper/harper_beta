import React, { useEffect, useMemo } from "react";
import { motion, useAnimation } from "framer-motion";
import { useInView } from "react-intersection-observer";

const Animate = ({
  children,
  className,
  duration = 0.6,
  delay = 0,
  isUp = true,
  triggerOnce = false,
  isSpring = false,
}: {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
  isUp?: boolean;
  triggerOnce?: boolean;
  isSpring?: boolean;
}) => {
  const controls = useAnimation();
  const [ref, inView] = useInView({
    triggerOnce,
  });

  useEffect(() => {
    if (inView) {
      controls.start("visible");
    } else {
      controls.start("hidden");
    }
  }, [controls, inView]);

  const transitionSet = useMemo(() => {
    return isSpring
      ? {
          type: "spring",
          stiffness: 400, // 탄성 (클수록 더 탱탱)
          damping: 22, // 감쇠 (작을수록 더 많이 튕김)
          bounce: 0.3, // 0 ~ 1 정도로 조절해서 살짝만 튕기게
        }
      : {};
  }, [isSpring]);

  const variants = {
    hidden: { opacity: 0, y: isUp ? 40 : 0 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration,
        delay,
        ease: "easeInOut",
        ...transitionSet,
      },
    },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={controls}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default Animate;
