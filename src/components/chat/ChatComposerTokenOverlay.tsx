import { forwardRef } from "react";
import type {
  ChatComposerToken,
  ChatComposerTokenSegment,
} from "@/lib/chat/composerTokens";
import { cn } from "@/lib/utils";

export const ChatComposerTokenOverlay = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    getTokenAriaLabel?: (token: ChatComposerToken) => string;
    isTokenClickable?: (token: ChatComposerToken) => boolean;
    onTokenClick?: (token: ChatComposerToken) => void;
    segments: ChatComposerTokenSegment[];
  }
>(function ChatComposerTokenOverlay(
  { className, getTokenAriaLabel, isTokenClickable, onTokenClick, segments },
  ref
) {
  const canClickToken = (token: ChatComposerToken) =>
    Boolean(onTokenClick) && (isTokenClickable?.(token) ?? true);
  const hasClickableToken = segments.some(
    (segment) => segment.kind === "token" && canClickToken(segment.token)
  );
  // This layer mirrors a transparent textarea. Keep every segment inline and
  // metric-neutral so the native caret, selection, and IME composition remain
  // at the same visual position as the highlighted text.
  return (
    <div
      ref={ref}
      aria-hidden={hasClickableToken ? undefined : true}
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-0 min-h-[72px] select-none overflow-hidden whitespace-pre-wrap break-words border-none px-3.5 py-4 text-base leading-5 text-neutral-primary max-md:group-data-[expanded=false]/chat-composer:h-12 max-md:group-data-[expanded=false]/chat-composer:min-h-12 max-md:group-data-[expanded=false]/chat-composer:whitespace-nowrap max-md:group-data-[expanded=false]/chat-composer:text-ellipsis md:text-sm lg:text-[14px]",
        className
      )}
    >
      {segments.map((segment, index) => {
        if (segment.kind === "token") {
          return canClickToken(segment.token) && onTokenClick ? (
            <span
              aria-label={getTokenAriaLabel?.(segment.token)}
              className="pointer-events-auto cursor-pointer rounded-[4px] text-link hover:bg-bg-weak focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-1000-a10"
              data-chat-composer-token=""
              key={`token:${segment.token.id}:${index}`}
              onClick={() => onTokenClick(segment.token)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onTokenClick(segment.token);
              }}
              onMouseDown={(event) => event.preventDefault()}
              role="button"
              tabIndex={0}
            >
              {segment.text}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="rounded-[4px] text-link"
              key={`token:${segment.token.id}:${index}`}
            >
              {segment.text}
            </span>
          );
        }

        return (
          <span aria-hidden="true" key={`text:${index}`}>
            {segment.text}
          </span>
        );
      })}
    </div>
  );
});

ChatComposerTokenOverlay.displayName = "ChatComposerTokenOverlay";
