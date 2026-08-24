import ChatAttachmentActionMenu from "@/components/chat/ChatAttachmentActionMenu";
import ChatAttachmentDraftList from "@/components/chat/ChatAttachmentDraftList";
import {
  createDraftFileAttachment,
  createDraftLinkAttachment,
  type DraftChatAttachment,
} from "@/lib/chat/attachmentClient";
import { useMessages } from "@/i18n/useMessage";
import {
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type FocusEvent,
  forwardRef,
  type Key,
  type MouseEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowUp, Square } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { BareButton, MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CHAT_COMPOSER_GLASS_SURFACE_CLASS_NAME =
  "border-neutral-1000-a05 bg-bg-floating/55 shadow-sm backdrop-blur-lg";

const DEFAULT_MAX_ROWS = 4;
const MOBILE_COMPOSER_MEDIA_QUERY = "(max-width: 767px)";
const readCssPixelValue = (value: string) => Number.parseFloat(value) || 0;

type ChatComposerCollapsedFrameProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  action: ReactNode;
  children: ReactNode;
  leadingAction: ReactNode;
  textClassName?: string;
};

export const ChatComposerCollapsedFrame = forwardRef<
  HTMLButtonElement,
  ChatComposerCollapsedFrameProps
>(function ChatComposerCollapsedFrame(
  { action, children, className, leadingAction, textClassName, ...props },
  ref
) {
  return (
    <MuteButton
      ref={ref}
      className={cn(
        "grid h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center rounded-[18px] border px-2 py-0 text-left transition-[background-color,border-color,box-shadow,opacity,transform] duration-200 ease-out active:scale-[0.99] motion-reduce:transition-none",
        CHAT_COMPOSER_GLASS_SURFACE_CLASS_NAME,
        className
      )}
      size="lg"
      variant="default"
      {...props}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-muted">
        {leadingAction}
      </span>
      <span
        className={cn(
          "min-w-0 truncate px-2 text-sm font-normal text-neutral-soft",
          textClassName
        )}
      >
        {children}
      </span>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full">
        {action}
      </span>
    </MuteButton>
  );
});

ChatComposerCollapsedFrame.displayName = "ChatComposerCollapsedFrame";

export type ChatComposerFrameProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> & {
  action: ReactNode;
  actionLayout?: "footer" | "overlay";
  className?: string;
  context?: ReactNode;
  maxRows?: number;
  mobileLeadingAction?: ReactNode;
  overlay?: ReactNode;
  textareaKey?: Key;
  textareaClassName?: string;
};

export const ChatComposerFrame = forwardRef<
  HTMLTextAreaElement,
  ChatComposerFrameProps
>(function ChatComposerFrame(
  {
    action,
    actionLayout = "overlay",
    className,
    context,
    maxRows = DEFAULT_MAX_ROWS,
    mobileLeadingAction,
    onBlur,
    onChange,
    onFocus,
    overlay,
    rows = 3,
    textareaClassName,
    textareaKey,
    value,
    ...textareaProps
  },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pointerActive, setPointerActive] = useState(false);

  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      if (ref) ref.current = node;
    },
    [ref]
  );

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof window === "undefined") return;

    const isMobile = window.matchMedia(MOBILE_COMPOSER_MEDIA_QUERY).matches;
    textarea.rows = isMobile ? 1 : Number(rows) || 1;

    if (isMobile && !expanded) {
      textarea.style.height = "";
      textarea.style.overflowY = "hidden";
      return;
    }

    textarea.style.height = "auto";
    const styles = window.getComputedStyle(textarea);
    const lineHeight = readCssPixelValue(styles.lineHeight) || 20;
    const paddingHeight =
      readCssPixelValue(styles.paddingTop) +
      readCssPixelValue(styles.paddingBottom);
    const borderHeight =
      readCssPixelValue(styles.borderTopWidth) +
      readCssPixelValue(styles.borderBottomWidth);
    const maximumHeight =
      lineHeight * Math.max(maxRows, 1) + paddingHeight + borderHeight;
    const contentHeight = textarea.scrollHeight + borderHeight;

    textarea.style.height = `${Math.min(contentHeight, maximumHeight)}px`;
    textarea.style.overflowY =
      contentHeight > maximumHeight ? "auto" : "hidden";
  }, [expanded, maxRows, rows]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, textareaKey, value]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(event);
      window.requestAnimationFrame(resizeTextarea);
    },
    [onChange, resizeTextarea]
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      setExpanded(true);
      onFocus?.(event);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      setExpanded(false);
      onBlur?.(event);
    },
    [onBlur]
  );

  const finishPointerInteraction = useCallback(() => {
    setPointerActive(false);
    if (document.activeElement === textareaRef.current) {
      setExpanded(true);
    }
  }, []);

  const handleCollapsedTokenClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (
        expanded ||
        typeof window === "undefined" ||
        !window.matchMedia(MOBILE_COMPOSER_MEDIA_QUERY).matches
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target?.closest?.("[data-chat-composer-token]")) return;

      event.preventDefault();
      event.stopPropagation();
      textareaRef.current?.focus();
    },
    [expanded]
  );

  return (
    <div
      data-expanded={expanded}
      onClickCapture={handleCollapsedTokenClickCapture}
      onPointerCancel={finishPointerInteraction}
      onPointerDown={() => {
        setPointerActive(true);
      }}
      onPointerUp={finishPointerInteraction}
      className={cn(
        "group/chat-composer origin-bottom overflow-hidden rounded-[18px] border transition-[background-color,border-color,box-shadow,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        CHAT_COMPOSER_GLASS_SURFACE_CLASS_NAME,
        pointerActive &&
          "max-md:scale-[1.01] max-md:opacity-85 max-md:duration-[180ms]",
        className
      )}
    >
      {context ? (
        <div className="relative z-30 px-2 pt-2">{context}</div>
      ) : null}
      <div
        className={cn(
          "relative grid items-center transition-[grid-template-columns,grid-template-rows,gap] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          expanded
            ? "max-md:grid-cols-[minmax(0,1fr)_auto] max-md:grid-rows-[auto_auto]"
            : mobileLeadingAction
              ? "max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:grid-rows-[auto]"
              : "max-md:grid-cols-[minmax(0,1fr)_auto] max-md:grid-rows-[auto]",
          actionLayout === "footer"
            ? "md:flex md:flex-col"
            : "md:flex md:items-end md:gap-2"
        )}
      >
        {overlay}
        {mobileLeadingAction ? (
          <div
            className={cn(
              "relative z-20 flex items-center transition-[margin,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden motion-reduce:transition-none",
              expanded
                ? "col-start-1 row-start-2 mb-1.5 ml-2"
                : "col-start-1 row-start-1 ml-2"
            )}
          >
            {mobileLeadingAction}
          </div>
        ) : null}
        <Textarea
          key={textareaKey}
          unstyled
          ref={setTextareaRef}
          rows={rows}
          value={value}
          onBlur={handleBlur}
          onChange={handleChange}
          onFocus={handleFocus}
          className={cn(
            "min-h-[72px] min-w-0 resize-none border-none px-3.5 py-4 text-base leading-5 text-neutral-primary outline-none transition-[height,min-height,padding,opacity] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] placeholder:text-neutral-placeholder disabled:cursor-not-allowed md:text-sm lg:text-[14px] motion-reduce:transition-none",
            expanded
              ? "max-md:col-span-2 max-md:col-start-1 max-md:row-start-1 max-md:min-h-12 max-md:w-full max-md:px-3.5 max-md:py-3"
              : cn(
                  "max-md:row-start-1 max-md:h-12 max-md:min-h-12 max-md:truncate max-md:py-3",
                  mobileLeadingAction
                    ? "max-md:col-start-2 max-md:pr-2 max-md:pl-0"
                    : "max-md:col-start-1 max-md:pl-3.5 max-md:pr-2"
                ),
            actionLayout === "footer" ? "md:w-full md:flex-none" : "md:flex-1",
            textareaClassName
          )}
          {...textareaProps}
        />
        <div
          className={cn(
            "relative z-20 flex items-center transition-[margin,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            expanded
              ? "max-md:col-start-2 max-md:row-start-2 max-md:mb-1.5 max-md:mr-2 max-md:justify-self-end"
              : cn(
                  "max-md:row-start-1 max-md:mr-2 max-md:justify-self-end",
                  mobileLeadingAction
                    ? "max-md:col-start-3"
                    : "max-md:col-start-2"
                ),
            actionLayout === "footer"
              ? "md:w-full md:justify-between md:px-2 md:pb-2"
              : "md:absolute md:bottom-3 md:right-3 md:gap-2"
          )}
        >
          {action}
        </div>
      </div>
    </div>
  );
});

ChatComposerFrame.displayName = "ChatComposerFrame";

type LegacyChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  disabledSend: boolean;
  isStreaming: boolean;
  allowAttachments?: boolean;
  attachments?: DraftChatAttachment[];
  onAddAttachment?: (attachment: DraftChatAttachment) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  isPreparing?: boolean;
};

export default function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  disabledSend,
  isStreaming,
  allowAttachments = false,
  attachments = [],
  onAddAttachment,
  onRemoveAttachment,
  isPreparing = false,
}: LegacyChatComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { m } = useMessages();

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!disabledSend) {
          onSend();
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }
    },
    [disabledSend, onSend]
  );

  const handleSendClick = useCallback(() => {
    if (isStreaming) {
      onStop();
      return;
    }

    if (disabledSend) return;
    onSend();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [disabledSend, isStreaming, onSend, onStop]);

  return (
    <div className="flex flex-col gap-2 px-2 pb-2">
      {allowAttachments ? (
        <ChatAttachmentDraftList
          attachments={attachments}
          className="mx-2"
          isPreparing={isPreparing}
          onRemove={(attachmentId) => onRemoveAttachment?.(attachmentId)}
        />
      ) : null}

      <div className="relative flex items-end">
        <Textarea
          unstyled
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={m.chat.composerPlaceholder}
          className="w-full min-h-[94px] max-h-[140px] resize-none rounded-[20px] border border-neutral-1000-a05 bg-bg-default px-4 py-2.5 text-[13px] text-neutral-primary outline-none transition focus:border-neutral-1000-a10"
        />

        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {allowAttachments ? (
            <ChatAttachmentActionMenu
              disabled={isPreparing || isStreaming}
              onAddFile={(file) =>
                onAddAttachment?.(createDraftFileAttachment(file))
              }
              onAddLink={(url) =>
                onAddAttachment?.(createDraftLinkAttachment(url))
              }
            />
          ) : null}

          <BareButton
            type="button"
            onClick={handleSendClick}
            className={`flex h-8 w-8 items-center justify-center rounded-[12px] cursor-pointer hover:opacity-90 ${
              isStreaming
                ? "bg-black/70 text-neutral-00"
                : "bg-black text-neutral-00 disabled:opacity-50"
            }`}
            disabled={!isStreaming && disabledSend}
            aria-label="Send"
          >
            {isStreaming ? (
              <Square size={16} fill="currentColor" />
            ) : (
              <ArrowUp size={18} />
            )}
          </BareButton>
        </div>
      </div>
    </div>
  );
}
