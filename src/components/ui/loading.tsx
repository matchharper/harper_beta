import { cn } from "@/lib/utils";

type LoadingProps = {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  inline?: boolean;
  isFullScreen?: boolean;
};

const sizeClasses: Record<NonNullable<LoadingProps["size"]>, string> = {
  sm: "h-3.5 w-3.5 border-2",
  md: "h-4 w-4 border-2",
  lg: "h-5 w-5 border-[2.5px]",
};

const textClasses: Record<NonNullable<LoadingProps["size"]>, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

function Loading({
  label = "Loading...",
  className,
  size = "md",
  inline = false,
  isFullScreen = false,
}: LoadingProps) {
  const Component = inline ? "span" : "div";

  return (
    <Component
      className={cn(
        inline ? "inline-flex" : "flex",
        "items-center gap-2 text-xgray800",
        textClasses[size],
        className,
        isFullScreen ? "w-full h-full flex items-center justify-center" : ""
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "inline-block animate-spin rounded-full border-xgray300 border-t-xgray800",
          sizeClasses[size]
        )}
        aria-hidden="true"
      />
      {label ? <span>{label}</span> : null}
    </Component>
  );
}

export { Loading };
