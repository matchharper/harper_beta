import * as React from "react";

import { cn } from "@/lib/utils";

export const textareaSurfaceClassName =
  "w-full resize-none rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-2 text-sm font-normal leading-6 text-neutral-primary outline-none transition-[border-color,background-color] duration-200 placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:bg-bg-weak disabled:text-neutral-disabled disabled:placeholder:text-neutral-placeholder disabled:opacity-70";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    autoResize?: boolean;
    /** Emphasized input surface; ignored when unstyled is true. */
    isMain?: boolean;
    unstyled?: boolean;
  };

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      autoResize = false,
      className,
      isMain = false,
      rows = 4,
      unstyled = false,
      ...props
    },
    forwardedRef
  ) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    React.useImperativeHandle(
      forwardedRef,
      () => textareaRef.current as HTMLTextAreaElement
    );

    React.useLayoutEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (!autoResize) {
        textarea.style.height = "";
        textarea.style.overflowY = "";
        return;
      }

      // Measure the native rows/CSS height before expanding to fit the content.
      textarea.style.height = "";
      const computed = window.getComputedStyle(textarea);
      const borderHeight =
        parseFloat(computed.borderTopWidth) +
        parseFloat(computed.borderBottomWidth);
      const paddingHeight =
        parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom);
      const height = Math.max(
        textarea.getBoundingClientRect().height,
        textarea.scrollHeight + borderHeight
      );
      textarea.style.height = `${
        computed.boxSizing === "border-box"
          ? height
          : height - borderHeight - paddingHeight
      }px`;
      textarea.style.overflowY =
        textarea.scrollHeight > textarea.clientHeight ? "auto" : "hidden";
    }, [
      autoResize,
      isMain,
      unstyled,
      rows,
      className,
      props.style,
      props.value,
    ]);

    return (
      <textarea
        ref={textareaRef}
        rows={rows}
        className={
          unstyled
            ? className
            : cn(
                textareaSurfaceClassName,
                isMain &&
                  "rounded-2xl px-3 py-2.5 shadow-md border-black/5 text-black",
                className
              )
        }
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
export default Textarea;
