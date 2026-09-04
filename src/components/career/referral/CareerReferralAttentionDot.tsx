import { cn } from "@/lib/utils";
import React from "react";

const CareerReferralAttentionDot = ({ className }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={cn(
      "pointer-events-none block size-[6px] shrink-0 rounded-full bg-primary/95",
      className
    )}
  />
);

export default React.memo(CareerReferralAttentionDot);
