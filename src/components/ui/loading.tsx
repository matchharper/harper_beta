import { cn } from "@/lib/utils";
import { FaceLoading } from "./face-loading";

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
  if (isFullScreen) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center",
          className
        )}
      >
        <FaceLoading label={label} />
      </div>
    );
  }

  const Component = inline ? "span" : "div";

  return (
    <Component
      className={cn(
        inline ? "inline-flex" : "flex",
        "items-center gap-2 text-neutral-600 font-inter",
        textClasses[size],
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "inline-block animate-spin rounded-full border-neutral-300 border-t-neutral-600",
          sizeClasses[size]
        )}
        aria-hidden="true"
      />
      {label ? <span>{label}</span> : null}
    </Component>
  );
}

export { Loading };
