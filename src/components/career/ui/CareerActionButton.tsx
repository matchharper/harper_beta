"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CareerActionButtonVariant = "primary" | "secondary" | "icon";
type CareerActionButtonRadius = "pill" | "rounded";

export type CareerActionButtonProps = Omit<ButtonProps, "size" | "variant"> & {
  active?: boolean;
  actionVariant?: CareerActionButtonVariant;
  buttonRadius?: CareerActionButtonRadius;
};

const buttonVariantClassName: Record<CareerActionButtonVariant, string> = {
  primary:
    "h-11 border border-beige700 bg-beige700 px-5 text-[14px] text-beige50 hover:border-beige800 hover:bg-beige800 hover:text-beige50",
  secondary:
    "h-10 border border-beige900/15 bg-white/45 px-4 text-[13px] text-beige900 hover:border-beige900/25 hover:bg-white/70 hover:text-beige900",
  icon: "h-10 w-10 border border-beige900/15 bg-white/45 p-0 text-beige900 hover:border-beige900/25 hover:bg-white/70 hover:text-beige900",
};

const radiusClassName: Record<CareerActionButtonRadius, string> = {
  pill: "rounded-full",
  rounded: "rounded-lg",
};

const activeButtonClassName: Partial<
  Record<CareerActionButtonVariant, string>
> = {
  secondary:
    "border-beige700 bg-beige700 text-white hover:bg-beige800 hover:text-white",
};

export const CareerActionButton = React.forwardRef<
  HTMLButtonElement,
  CareerActionButtonProps
>(function CareerActionButton(
  {
    active = false,
    actionVariant = "secondary",
    asChild = false,
    buttonRadius,
    className,
    type,
    ...props
  },
  ref
) {
  const resolvedRadius =
    buttonRadius ?? (actionVariant === "icon" ? "rounded" : "pill");
  const resolvedType = type ?? (asChild ? undefined : "button");

  return (
    <Button
      ref={ref}
      type={resolvedType}
      variant="ghost"
      asChild={asChild}
      className={cn(
        "gap-2 whitespace-nowrap font-medium transition-all duration-150 ease-out hover:-translate-y-px focus-visible:ring-4 focus-visible:ring-beige700/20 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-60",
        buttonVariantClassName[actionVariant],
        radiusClassName[resolvedRadius],
        active &&
          (activeButtonClassName[actionVariant] ??
            buttonVariantClassName[actionVariant]),
        className
      )}
      {...props}
    />
  );
});

CareerActionButton.displayName = "CareerActionButton";

export type CareerInteractiveCardProps = Omit<
  CareerActionButtonProps,
  "actionVariant" | "active" | "buttonRadius"
>;

export const CareerInteractiveCard = React.forwardRef<
  HTMLButtonElement,
  CareerInteractiveCardProps
>(function CareerInteractiveCard(
  { className, type = "button", ...props },
  ref
) {
  return (
    <CareerActionButton
      ref={ref}
      type={type}
      actionVariant="secondary"
      buttonRadius="rounded"
      className={cn(
        "h-auto w-full justify-start whitespace-normal px-4 py-4 text-left",
        className
      )}
      {...props}
    />
  );
});

CareerInteractiveCard.displayName = "CareerInteractiveCard";

export type CareerChoiceCardProps = Omit<
  CareerActionButtonProps,
  "actionVariant" | "active" | "buttonRadius"
> & {
    selected?: boolean;
  };

export const CareerChoiceCard = React.forwardRef<
  HTMLButtonElement,
  CareerChoiceCardProps
>(function CareerChoiceCard(
  { className, selected = false, type = "button", ...props },
  ref
) {
  return (
    <CareerActionButton
      ref={ref}
      type={type}
      actionVariant="secondary"
      buttonRadius="rounded"
      className={cn(
        "h-auto justify-start whitespace-normal px-4 py-3 text-left text-beige900",
        selected
          ? "border-beige900 bg-beige200/80 outline outline-[0.5px] outline-beige900 hover:border-beige900 hover:bg-beige200/80 hover:text-beige900"
          : "border-beige900/15 bg-white/45 text-beige900/70 hover:border-beige900/40 hover:bg-white/70 hover:text-beige900",
        className
      )}
      {...props}
    />
  );
});

CareerChoiceCard.displayName = "CareerChoiceCard";
