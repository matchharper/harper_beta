import { forwardRef } from "react";
import type {
  ChatComposerToken,
  ChatComposerTokenSegment,
} from "@/lib/chat/composerTokens";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ChatComposerTokenOverlay = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    cursorOffset?: number | null;
    getTokenAriaLabel?: (token: ChatComposerToken) => string;
    onTokenClick?: (token: ChatComposerToken) => void;
    segments: ChatComposerTokenSegment[];
    stackTokens?: boolean;
  }
>(function ChatComposerTokenOverlay(
  {
    className,
    cursorOffset = null,
    getTokenAriaLabel,
    onTokenClick,
    segments,
    stackTokens = false,
  },
  ref
) {
  let segmentOffset = 0;
  let cursorRendered = false;

  const renderCursor = (key: string) => {
    cursorRendered = true;
    return (
      <span
        aria-hidden="true"
        className="inline-block h-[1em] w-px animate-pulse bg-neutral-primary align-[-0.12em] motion-reduce:animate-none"
        data-chat-composer-caret=""
        key={key}
      />
    );
  };

  return (
    <div
      ref={ref}
      aria-hidden={onTokenClick ? undefined : true}
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-0 min-h-[72px] select-none overflow-hidden whitespace-pre-wrap break-words border-none px-3.5 py-4 text-base leading-5 text-neutral-primary max-md:group-data-[expanded=false]/chat-composer:h-12 max-md:group-data-[expanded=false]/chat-composer:min-h-12 max-md:group-data-[expanded=false]/chat-composer:whitespace-nowrap max-md:group-data-[expanded=false]/chat-composer:text-ellipsis md:text-sm lg:text-[14px]",
        className
      )}
    >
      {segments.map((segment, index) => {
        const start = segmentOffset;
        const end = start + segment.text.length;
        segmentOffset = end;

        if (segment.kind === "token") {
          const cursorBefore =
            !cursorRendered && cursorOffset === start
              ? renderCursor(`caret-before-token:${index}`)
              : null;
          const cursorAfter =
            !cursorRendered &&
            cursorOffset === end &&
            index === segments.length - 1
              ? renderCursor(`caret-after-token:${index}`)
              : null;
          const token = onTokenClick ? (
            <MuteButton
              aria-label={getTokenAriaLabel?.(segment.token)}
              className={cn(
                "pointer-events-auto inline h-auto min-h-0 rounded-[4px] border-0 px-0 py-0 align-baseline text-left text-base font-normal leading-[inherit] text-link shadow-none hover:bg-bg-weak hover:text-link md:text-sm lg:text-[14px]",
                stackTokens &&
                  "block w-fit max-w-full max-md:group-data-[expanded=false]/chat-composer:inline max-md:group-data-[expanded=false]/chat-composer:w-auto max-md:group-data-[expanded=false]/chat-composer:max-w-none"
              )}
              data-chat-composer-token=""
              key={`token:${segment.token.id}:${index}`}
              onClick={() => onTokenClick(segment.token)}
              size="sm"
              type="button"
              variant="transparent"
            >
              <span
                className={cn(
                  stackTokens &&
                    "block min-w-0 truncate max-md:group-data-[expanded=false]/chat-composer:inline max-md:group-data-[expanded=false]/chat-composer:overflow-visible max-md:group-data-[expanded=false]/chat-composer:whitespace-nowrap"
                )}
              >
                {segment.text}
              </span>
            </MuteButton>
          ) : (
            <span
              className={cn(
                "font-medium text-link",
                stackTokens &&
                  "block w-fit max-w-full truncate text-left max-md:group-data-[expanded=false]/chat-composer:inline max-md:group-data-[expanded=false]/chat-composer:w-auto max-md:group-data-[expanded=false]/chat-composer:max-w-none"
              )}
              key={`token:${segment.token.id}:${index}`}
            >
              {segment.text}
            </span>
          );

          return (
            <span className="contents" key={`${segment.token.id}:${index}`}>
              {cursorBefore}
              {token}
              {cursorAfter}
            </span>
          );
        }

        const followsStackedToken =
          stackTokens && segments[index - 1]?.kind === "token";
        const hiddenSeparatorLength =
          followsStackedToken && segment.text.startsWith(" ") ? 1 : 0;
        const visibleStart = start + hiddenSeparatorLength;
        const visibleText = segment.text.slice(hiddenSeparatorLength);
        const cursorInSegment =
          !cursorRendered &&
          cursorOffset !== null &&
          cursorOffset >= start &&
          cursorOffset <= end;

        if (!cursorInSegment) {
          return (
            <span aria-hidden="true" key={`text:${index}`}>
              {visibleText}
            </span>
          );
        }

        const visibleCursor = Math.max(
          0,
          Math.min(visibleText.length, cursorOffset - visibleStart)
        );
        return (
          <span aria-hidden="true" key={`text:${index}`}>
            {visibleText.slice(0, visibleCursor)}
            {renderCursor(`caret-in-text:${index}`)}
            {visibleText.slice(visibleCursor)}
          </span>
        );
      })}
    </div>
  );
});

ChatComposerTokenOverlay.displayName = "ChatComposerTokenOverlay";
