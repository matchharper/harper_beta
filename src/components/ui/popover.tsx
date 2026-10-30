"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * A panel floating next to its trigger, rendered in a portal. It draws the
 * shared floating surface unless `surface={false}`, for content that draws
 * its own (e.g. a centered inner box).
 */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    surface?: boolean;
  }
>(({ className, sideOffset = 6, surface = true, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      className={cn(
        "z-[100] outline-none",
        surface &&
          "rounded-lg border border-neutral-1000-a10 bg-bg-floating shadow-lg",
        className
      )}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
