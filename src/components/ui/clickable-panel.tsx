import * as React from "react";
import { cn } from "@/lib/utils";

const DEFAULT_INTERACTIVE_SELECTOR =
  "a,button,input,select,textarea,[data-clickable-panel-ignore='true'],[data-career-card-action='true']";

type ClickablePanelProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onClick" | "onKeyDown"
> & {
  disabled?: boolean;
  ignoreInteractiveChildren?: boolean;
  onActivate: (
    event:
      | React.MouseEvent<HTMLDivElement>
      | React.KeyboardEvent<HTMLDivElement>
  ) => void;
};

const ClickablePanel = React.forwardRef<HTMLDivElement, ClickablePanelProps>(
  (
    {
      className,
      disabled = false,
      ignoreInteractiveChildren = true,
      onActivate,
      tabIndex,
      ...props
    },
    ref
  ) => {
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (ignoreInteractiveChildren) {
        const interactiveTarget = (event.target as HTMLElement).closest(
          DEFAULT_INTERACTIVE_SELECTOR
        );
        if (interactiveTarget && interactiveTarget !== event.currentTarget) {
          return;
        }
      }
      onActivate(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled || event.currentTarget !== event.target) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onActivate(event);
    };

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : (tabIndex ?? 0)}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
          disabled && "pointer-events-none opacity-60",
          className
        )}
        {...props}
      />
    );
  }
);
ClickablePanel.displayName = "ClickablePanel";

export { ClickablePanel };
