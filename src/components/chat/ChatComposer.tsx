import ChatAttachmentActionMenu from "@/components/chat/ChatAttachmentActionMenu";
import ChatAttachmentDraftList from "@/components/chat/ChatAttachmentDraftList";
import {
  createDraftFileAttachment,
  createDraftLinkAttachment,
  type DraftChatAttachment,
} from "@/lib/chat/attachmentClient";
import { useMessages } from "@/i18n/useMessage";
import {
  forwardRef,
  type Key,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useRef,
} from "react";
import { ArrowUp, Square } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { BareButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatComposerFrameProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> & {
  action: ReactNode;
  actionLayout?: "footer" | "overlay";
  className?: string;
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
    overlay,
    rows = 3,
    textareaClassName,
    textareaKey,
    ...textareaProps
  },
  ref
) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[16px] border border-neutral-1000-a10 bg-bg-floating/75 shadow-sm backdrop-blur-xl transition-all duration-200 focus-within:border-neutral-400",
        className
      )}
    >
      <div
        className={cn(
          "relative",
          actionLayout === "footer" ? "flex flex-col" : "flex items-end gap-2"
        )}
      >
        {overlay}
        <Textarea
          key={textareaKey}
          unstyled
          ref={ref}
          rows={rows}
          className={cn(
            "min-h-[72px] min-w-0 resize-none border-none px-3.5 py-4 text-base leading-5 text-neutral-primary outline-none transition-all placeholder:text-neutral-placeholder disabled:cursor-not-allowed md:text-sm lg:text-[14px]",
            actionLayout === "footer" ? "w-full flex-none" : "flex-1",
            textareaClassName
          )}
          {...textareaProps}
        />
        {actionLayout === "footer" ? (
          <div className="flex items-center justify-between px-3 pb-3">
            {action}
          </div>
        ) : (
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {action}
          </div>
        )}
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
