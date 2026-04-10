import { motion } from "framer-motion";
import React from "react";

const BeigeButton = ({
  icon,
  label,
  size = "md",
  variant = "primary",
  onClick,
  className = "",
  animate = false,
}: {
  icon?: React.ReactNode;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  onClick?: () => void;
  className?: string;
  animate?: boolean;
}) => {
  const isSmall = size === "sm";
  const isPrimary = variant === "primary";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={`group relative inline-flex items-center justify-center overflow-hidden font-geist font-medium tracking-[-0.03em] transition-shadow duration-300 ${
        isPrimary
          ? "rounded-[12px] bg-beige900 text-beige100 shadow-[0_10px_20px_rgba(46,23,6,0.08)] hover:shadow-[0_18px_40px_rgba(46,23,6,0.18)]"
          : "rounded-[12px] bg-beige500/70 text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
      } ${
        isSmall
          ? isPrimary
            ? "h-[44px] px-5 text-[14px]"
            : "h-[42px] px-4 text-[15px]"
          : "h-[44px] px-4 text-base"
      } ${className}`}
    >
      {!isPrimary && (
        <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      )}
      <span className="relative flex h-full items-start overflow-hidden">
        <span
          className={`flex flex-col transition-transform duration-500 ${animate ? "group-hover:-translate-y-1/2" : ""}`}
          style={
            animate
              ? { transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }
              : undefined
          }
        >
          <span
            className={`flex items-center leading-none ${
              isSmall ? (isPrimary ? "h-[44px]" : "h-[42px]") : "h-[44px]"
            }`}
          >
            {icon}
          </span>
          <span
            className={`flex items-center leading-none ${
              isSmall ? (isPrimary ? "h-[44px]" : "h-[42px]") : "h-[44px]"
            }`}
          >
            {label}
          </span>
        </span>
      </span>
    </motion.button>
  );
};

export default React.memo(BeigeButton);
