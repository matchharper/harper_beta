import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import type { MouseEventHandler } from "react";

type CareerLandingButtonProps = {
  href?: string;
  label: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  showArrow?: boolean;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export default function CareerLandingButton({
  href,
  label,
  size = "md",
  variant = "primary",
  showArrow = true,
  className = "",
  onClick,
}: CareerLandingButtonProps) {
  const isSmall = size === "sm";
  const isPrimary = variant === "primary";
  const classNames = `group relative inline-flex items-center justify-center overflow-hidden font-medium transition-shadow duration-300 ${
    isPrimary
      ? "rounded-[12px] bg-beige900 text-beige100 shadow-lg hover:shadow-xl"
      : "rounded-[12px] bg-beige500/70 text-beige900 shadow-inner"
  } ${
    isSmall
      ? isPrimary
        ? "h-[44px] px-5 text-[14px]"
        : "h-[42px] px-4 text-[15px]"
      : "h-[50px] px-5 text-base"
  } ${className}`;

  const content = (
    <>
      {!isPrimary && (
        <span className="absolute inset-0 bg-beige50/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      )}
      <span className="relative flex h-full items-start overflow-hidden">
        <span
          className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2"
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <span
            className={`flex items-center leading-none ${
              isSmall ? (isPrimary ? "h-[44px]" : "h-[42px]") : "h-[50px]"
            }`}
          >
            {label}
          </span>
          <span
            className={`flex items-center leading-none ${
              isSmall ? (isPrimary ? "h-[44px]" : "h-[42px]") : "h-[50px]"
            }`}
          >
            {label}
          </span>
        </span>
      </span>
      {showArrow && (
        <ArrowUpRight className="relative ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-[2px] group-hover:translate-y-[-2px]" />
      )}
    </>
  );

  if (href) {
    return (
      <motion.a
        href={href}
        onClick={onClick}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.985 }}
        className={classNames}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick as MouseEventHandler<HTMLButtonElement> | undefined}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={classNames}
    >
      {content}
    </motion.button>
  );
}
