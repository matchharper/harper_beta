import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-button border-(length:--button-border-width) shadow-(--shadow-button) backdrop-blur-button font-button outline-none transition-[background-color,border-color,color,opacity,transform] duration-150 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-(length:--button-border-width) border-button-border bg-button bg-button-image text-button-foreground hover:border-stroke-focus hover:bg-button-hover",
        primary:
          "border-(length:--button-border-width) border-surface-inverse bg-surface-inverse text-on-inverse hover:bg-surface-inverse-hover",
        black:
          "border-(length:--button-border-width) border-surface-inverse bg-surface-inverse text-on-inverse hover:bg-surface-inverse-hover",
        secondary:
          "border-(length:--button-border-width) border-stroke-subtle bg-button bg-button-image text-button-foreground hover:border-button-border hover:bg-button-hover",
        critical:
          "border-(length:--button-border-width) border-critical bg-critical text-on-inverse hover:bg-critical/90",
        positive:
          "border-(length:--button-border-width) border-positive bg-positive text-on-inverse hover:bg-positive/90",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-button px-3 text-xs",
        md: "h-9 px-4 py-2 text-sm",
        lg: "h-11 rounded-button px-5 text-base",
        xl: "h-12 rounded-button px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export interface BareButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const BareButton = React.forwardRef<HTMLButtonElement, BareButtonProps>(
  ({ asChild = false, className, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return <Comp ref={ref} className={className} {...props} />;
  }
);
BareButton.displayName = "BareButton";

const muteButtonVariants = cva(
  "inline-flex h-fit items-center justify-center rounded-button border-(length:--button-border-width) backdrop-blur-button font-button shadow-(--shadow-button) outline-none transition-[background-color,border-color,color,box-shadow,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-basement disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        dark: "border-surface-inverse bg-surface-inverse text-on-inverse hover:border-surface-inverse-hover hover:bg-surface-inverse-hover active:border-button-selected-border active:bg-surface-inverse-pressed",
        primary:
          "border-primary bg-primary text-on-inverse hover:border-primary/90 hover:bg-primary/90 active:border-primary/80 active:bg-primary/80",
        positive:
          "border-positive-strong bg-positive-strong text-on-inverse hover:bg-positive-strong/90 active:border-positive-strong/80 active:bg-positive-strong/80",
        critical:
          "border-critical bg-critical text-on-inverse hover:border-critical/90 hover:bg-critical/90 active:border-critical/80 active:bg-critical/80",
        default:
          "border-button-border bg-button bg-button-image text-button-foreground hover:border-button-border hover:bg-button-hover active:bg-button-pressed",
        transparent:
          "border-transparent bg-transparent text-neutral-muted shadow-none hover:border-transparent hover:bg-button-hover hover:text-button-foreground active:bg-button-pressed",
        warn: "border-critical/25 bg-critical-faded text-critical hover:border-critical/40 hover:bg-critical-faded/70 active:border-critical/50 active:bg-critical-faded",
        // A chip that is on but can't be changed (aria-disabled) shows no hover.
        neutral:
          "border-stroke-subtle bg-button-selected text-button-foreground hover:border-button-border hover:bg-button-pressed active:border-button-border active:bg-button-pressed aria-disabled:cursor-default aria-disabled:hover:border-stroke-subtle aria-disabled:hover:bg-button-selected aria-disabled:active:border-stroke-subtle aria-disabled:active:bg-button-selected",
        // The chosen one among toggle chips (a reason, a template, a writer).
        selected:
          "border-button-selected-border bg-button-selected text-button-foreground hover:border-button-selected-border hover:bg-button-pressed active:border-button-selected-border active:bg-button-pressed",
        // A chip for something being made that is not saved yet.
        draft:
          "border-dashed border-button-selected-border bg-button-selected text-button-foreground hover:bg-button-pressed active:bg-button-pressed",
        link: "border-transparent bg-transparent text-link shadow-none hover:border-transparent hover:text-link-hover active:text-link-hover",
        // White on a tinted surface, e.g. a chip floating above the chat.
        raised:
          "border-button-border bg-button bg-button-image text-button-foreground shadow-(--shadow-button) hover:border-button-border hover:bg-button/90 active:border-button-border active:bg-button/80",
      },
      size: {
        sm: "px-[5px] py-[5px] text-xs gap-1",
        md: "px-[7px] py-[7px] text-[13px] gap-1.5",
        lg: "px-[11px] py-[9px] text-[15px] gap-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

const muteButtonTextPaddingClassName = {
  sm: "px-[7px]",
  md: "px-[9px]",
  lg: "px-[14px]",
} as const;

const muteButtonTextOnlyVerticalPaddingClassName = {
  sm: "py-[3px]",
  md: "py-[5px]",
  lg: "py-[9px]",
} as const;

const hasTextContent = (node: React.ReactNode): boolean =>
  React.Children.toArray(node).some((child) => {
    if (
      typeof child === "string" ||
      typeof child === "number" ||
      typeof child === "bigint"
    ) {
      return String(child).trim().length > 0;
    }

    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
      return false;
    }

    return hasTextContent(child.props.children);
  });

const hasIconContent = (node: React.ReactNode): boolean =>
  React.Children.toArray(node).some((child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
      return false;
    }

    if (React.Children.count(child.props.children) > 0) {
      return hasIconContent(child.props.children);
    }

    return child.type !== React.Fragment;
  });

export interface MuteButtonProps
  extends BareButtonProps, VariantProps<typeof muteButtonVariants> {}

const MuteButton = React.forwardRef<HTMLButtonElement, MuteButtonProps>(
  (
    {
      asChild = false,
      children,
      className,
      size = "md",
      type,
      variant = "default",
      ...props
    },
    ref
  ) => {
    const resolvedSize = size ?? "md";
    const hasText = hasTextContent(children);
    const textPaddingClassName = hasText
      ? muteButtonTextPaddingClassName[resolvedSize]
      : undefined;
    const textOnlyVerticalPaddingClassName =
      hasText && !hasIconContent(children)
        ? muteButtonTextOnlyVerticalPaddingClassName[resolvedSize]
        : undefined;

    return (
      <BareButton
        ref={ref}
        asChild={asChild}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(
          muteButtonVariants({ size: resolvedSize, variant }),
          textPaddingClassName,
          textOnlyVerticalPaddingClassName,
          className
        )}
        {...props}
      >
        {children}
      </BareButton>
    );
  }
);
MuteButton.displayName = "MuteButton";

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export type IconButtonProps = Omit<ButtonProps, "children" | "size"> & {
  "aria-label": string;
  icon?: React.ReactNode;
  size?: "sm" | "default" | "md" | "lg" | "xl" | "icon";
};

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, icon, size = "icon", ...props }, ref) => (
    <Button
      ref={ref}
      size={size === "icon" ? "icon" : size}
      className={cn(size !== "icon" && "aspect-square px-0", className)}
      {...props}
    >
      {icon}
    </Button>
  )
);
IconButton.displayName = "IconButton";

type ActionButtonVariant = "primary" | "secondary" | "icon";
type ActionButtonRadius = "pill" | "rounded";

export type ActionButtonProps = Omit<ButtonProps, "size" | "variant"> & {
  active?: boolean;
  actionVariant?: ActionButtonVariant;
  buttonRadius?: ActionButtonRadius;
};

const actionButtonVariantClassName: Record<ActionButtonVariant, string> = {
  primary:
    "h-11 border-(length:--button-border-width) border-surface-inverse bg-surface-inverse px-5 text-[14px] text-on-inverse hover:bg-surface-inverse-hover hover:text-on-inverse",
  secondary:
    "h-10 border-(length:--button-border-width) border-button-border bg-button px-4 text-[13px] text-button-foreground hover:border-stroke-focus hover:bg-button-hover hover:text-button-foreground",
  icon: "h-10 w-10 border-(length:--button-border-width) border-button-border bg-button p-0 text-button-foreground hover:border-stroke-focus hover:bg-button-hover hover:text-button-foreground",
};

const actionButtonActiveClassName: Partial<
  Record<ActionButtonVariant, string>
> = {
  secondary:
    "bg-surface-inverse text-on-inverse hover:bg-surface-inverse-hover hover:text-on-inverse hover:border-button-border",
};

const actionButtonRadiusClassName: Record<ActionButtonRadius, string> = {
  pill: "rounded-pill",
  rounded: "rounded-button",
};

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
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
  ) => {
    const resolvedRadius =
      buttonRadius ?? (actionVariant === "icon" ? "rounded" : "pill");
    const resolvedType = type ?? (asChild ? undefined : "button");

    return (
      <Button
        ref={ref}
        type={resolvedType}
        variant="secondary"
        asChild={asChild}
        className={cn(
          "gap-2 whitespace-nowrap font-button transition-all duration-150 ease-out hover:-translate-y-px disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-60",
          actionButtonVariantClassName[actionVariant],
          actionButtonRadiusClassName[resolvedRadius],
          active &&
            (actionButtonActiveClassName[actionVariant] ??
              actionButtonVariantClassName[actionVariant]),
          className
        )}
        {...props}
      />
    );
  }
);
ActionButton.displayName = "ActionButton";

export type InteractiveCardProps = Omit<CardButtonProps, "selected">;

export type CardButtonProps = Omit<ButtonProps, "variant"> & {
  selected?: boolean;
};

const CardButton = React.forwardRef<HTMLButtonElement, CardButtonProps>(
  ({ className, selected = false, type = "button", ...props }, ref) => (
    <Button
      ref={ref}
      type={type}
      variant="default"
      className={cn(
        "h-auto w-full justify-start whitespace-normal rounded-card border-(length:--card-border-width) bg-card-image shadow-(--shadow-card) backdrop-blur-card px-4 py-4 text-left",
        selected
          ? "border-button-selected-border bg-card-selected text-card-foreground outline outline-[0.5px] outline-stroke-strong hover:border-button-selected-border hover:bg-card-hover"
          : "border-card-border bg-card text-card-foreground hover:border-stroke-focus hover:bg-card-hover",
        className
      )}
      {...props}
    />
  )
);
CardButton.displayName = "CardButton";

const InteractiveCard = React.forwardRef<
  HTMLButtonElement,
  InteractiveCardProps
>(({ className, type = "button", ...props }, ref) => (
  <CardButton
    ref={ref}
    type={type}
    className={cn(
      "h-auto w-full justify-start whitespace-normal px-4 py-4 text-left",
      className
    )}
    {...props}
  />
));
InteractiveCard.displayName = "InteractiveCard";

export type ChoiceCardProps = Omit<
  ActionButtonProps,
  "actionVariant" | "active" | "buttonRadius"
> & {
  selected?: boolean;
};

const ChoiceCard = React.forwardRef<HTMLButtonElement, ChoiceCardProps>(
  ({ className, selected = false, type = "button", ...props }, ref) => (
    <CardButton
      ref={ref}
      type={type}
      selected={selected}
      className={cn(
        "h-auto justify-start whitespace-normal px-4 py-3 text-left",
        className
      )}
      {...props}
    />
  )
);
ChoiceCard.displayName = "ChoiceCard";

export type AnimatedButtonVariant =
  | "default"
  | "primary"
  | "black"
  | "secondary"
  | "critical"
  | "positive";
export type AnimatedButtonSize = "sm" | "md" | "lg" | "icon";

export type AnimatedButtonProps = Omit<
  HTMLMotionProps<"button">,
  "children"
> & {
  animate?: boolean;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  label?: React.ReactNode;
  size?: AnimatedButtonSize;
  variant?: AnimatedButtonVariant;
};

const animatedButtonVariantClassNames: Record<AnimatedButtonVariant, string> = {
  default:
    "border-(length:--button-border-width) border-button-border bg-button bg-button-image text-button-foreground hover:border-stroke-focus hover:bg-button-hover",
  primary:
    "border-(length:--button-border-width) border-surface-inverse bg-surface-inverse text-on-inverse hover:bg-surface-inverse-hover",
  black: "border-(length:--button-border-width) border-surface-inverse bg-surface-inverse text-on-inverse hover:bg-surface-inverse-hover",
  secondary:
    "border-(length:--button-border-width) border-stroke-subtle bg-button bg-button-image text-button-foreground hover:border-button-border hover:bg-button-hover",
  critical:
    "border-(length:--button-border-width) border-critical bg-critical text-on-inverse hover:bg-critical/90",
  positive:
    "border-(length:--button-border-width) border-positive bg-positive text-on-inverse hover:bg-positive/90",
};

function getAnimatedButtonSizeClassName(size: AnimatedButtonSize) {
  if (size === "icon") return "h-10 w-10 p-0";
  if (size === "lg") return "h-12 px-6 text-[15px] md:text-base";
  if (size === "sm") return "h-[42px] px-4 text-[14px]";
  return "h-[44px] px-4 text-base";
}

function getAnimatedButtonRowClassName(size: AnimatedButtonSize) {
  if (size === "lg") return "h-12";
  if (size === "icon") return "h-10";
  return "h-[44px]";
}

const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  (
    {
      animate = false,
      children,
      className,
      disabled,
      icon,
      label,
      size = "md",
      type = "button",
      variant = "primary",
      ...props
    },
    ref
  ) => {
    const rowHeightClassName = getAnimatedButtonRowClassName(size);
    const content = label ?? children;
    const renderContent = () => (
      <>
        {icon ? (
          <span className="flex shrink-0 items-center">{icon}</span>
        ) : null}
        {content ? <span className="leading-none">{content}</span> : null}
      </>
    );

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled}
        whileHover={disabled ? undefined : { y: -1 }}
        whileTap={disabled ? undefined : { scale: 0.985 }}
        className={cn(
          "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-button border-(length:--button-border-width) shadow-(--shadow-button) backdrop-blur-button font-button tracking-normal outline-none transition-[background-color,border-color,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-basement disabled:cursor-not-allowed disabled:opacity-60",
          animatedButtonVariantClassNames[variant],
          getAnimatedButtonSizeClassName(size),
          className
        )}
        {...props}
      >
        {variant === "secondary" ? (
          <span className="absolute inset-0 bg-button/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        ) : null}
        {animate ? (
          <span className="relative flex h-full items-start overflow-hidden">
            <span
              className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2"
              style={{
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <span
                className={cn(
                  "flex items-center justify-center gap-2",
                  rowHeightClassName
                )}
              >
                {renderContent()}
              </span>
              <span
                className={cn(
                  "flex items-center justify-center gap-2",
                  rowHeightClassName
                )}
              >
                {renderContent()}
              </span>
            </span>
          </span>
        ) : (
          <span className="relative flex items-center justify-center gap-2">
            {renderContent()}
          </span>
        )}
      </motion.button>
    );
  }
);
AnimatedButton.displayName = "AnimatedButton";

const PrimaryButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type = "button", ...props }, ref) => (
  <Button
    ref={ref}
    type={type}
    variant="primary"
    className={cn("h-9 rounded-button px-3.5 text-sm", className)}
    {...props}
  />
));
PrimaryButton.displayName = "PrimaryButton";

const SecondaryButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type = "button", ...props }, ref) => (
  <Button
    ref={ref}
    type={type}
    variant="secondary"
    className={cn("h-10 rounded-button px-4 text-sm", className)}
    {...props}
  />
));
SecondaryButton.displayName = "SecondaryButton";

const ToggleButton = ({
  active,
  children,
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) => (
  <button
    type={type}
    {...props}
    className={cn(
      "inline-flex min-h-[36px] min-w-[calc(30%-4px)] items-center rounded-button border-(length:--button-border-width) shadow-(--shadow-button) backdrop-blur-button px-5 py-3 text-sm font-button leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-55",
      active
        ? "border-button-selected-border bg-button-selected text-button-foreground outline outline-[0.5px] outline-stroke-strong"
        : "border-button-border bg-button text-neutral-muted hover:border-button-selected-border hover:bg-button-hover hover:text-button-foreground",
      className
    )}
  >
    {children}
  </button>
);

export {
  ActionButton,
  AnimatedButton,
  BareButton,
  Button,
  CardButton,
  ChoiceCard,
  IconButton,
  InteractiveCard,
  MuteButton,
  PrimaryButton,
  SecondaryButton,
  ToggleButton,
  buttonVariants,
  muteButtonVariants,
};
