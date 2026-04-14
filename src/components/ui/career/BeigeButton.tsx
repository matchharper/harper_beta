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
  const rowHeightClass = isSmall
    ? isPrimary
      ? "h-[44px]"
      : "h-[42px]"
    : "h-[44px]";

  const renderContent = () => (
    <>
      {icon ? <span className="flex shrink-0 items-center">{icon}</span> : null}
      {label ? <span className="leading-none">{label}</span> : null}
    </>
  );

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={`group relative inline-flex items-center justify-center overflow-hidden font-geist font-medium tracking-[-0.03em] transition-shadow duration-300 ${
        isPrimary
          ? "rounded-[8px] bg-beige900 text-beige100 shadow-[0_10px_20px_rgba(46,23,6,0.08)] hover:shadow-[0_18px_40px_rgba(46,23,6,0.18)]"
          : "rounded-[8px] bg-beige500/70 text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
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
      {animate ? (
        <span className="relative flex h-full items-start overflow-hidden">
          <span
            className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2"
            style={{
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <span
              className={`flex items-center justify-center gap-2 ${rowHeightClass}`}
            >
              {renderContent()}
            </span>
            <span
              className={`flex items-center justify-center gap-2 ${rowHeightClass}`}
            >
              {renderContent()}
            </span>
          </span>
        </span>
      ) : (
        <span
          className={`relative flex items-center justify-center gap-2 ${rowHeightClass}`}
        >
          {renderContent()}
        </span>
      )}
    </motion.button>
  );
};

export default React.memo(BeigeButton);
