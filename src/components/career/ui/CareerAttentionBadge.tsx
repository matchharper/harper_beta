import { AlertCircle, CircleAlert } from "lucide-react";
import { careerCx } from "./CareerPrimitives";
import React from "react";

const CareerAttentionBadge = ({
  label,
  className,
}: {
  label: string;
  className?: string;
}) => (
  <span
    role="img"
    aria-label={label}
    className={careerCx(
      "pointer-events-none absolute inline-flex h-4 w-4 text-[10px] items-center justify-center rounded-full bg-amber-300/50 text-amber-950/80",
      className
    )}
  >
    <AlertCircle className="h-3 w-3" strokeWidth={2.7} aria-hidden="true" />
  </span>
);

export default React.memo(CareerAttentionBadge);
