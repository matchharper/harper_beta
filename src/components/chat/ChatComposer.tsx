import ChatAttachmentActionMenu from "@/components/chat/ChatAttachmentActionMenu";
import ChatAttachmentDraftList from "@/components/chat/ChatAttachmentDraftList";
import {
  createDraftFileAttachment,
  createDraftLinkAttachment,
  type DraftChatAttachment,
} from "@/lib/chatAttachmentClient";
import { useMessages } from "@/i18n/useMessage";
import React, { useCallback, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
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
}: Props) {
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
        <textarea
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={m.chat.composerPlaceholder}
          className="w-full min-h-[94px] max-h-[140px] resize-none rounded-[20px] border border-beige900/8 bg-beige50 px-4 py-2.5 text-[13px] text-beige900 outline-none transition focus:border-beige900/20"
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


          <button
            type="button"
            onClick={handleSendClick}
            className={`flex h-8 w-8 items-center justify-center rounded-[12px] cursor-pointer hover:opacity-90 ${
              isStreaming
                ? "bg-beige900/70 text-beige100"
                : "bg-beige900 text-beige100 disabled:opacity-50"
            }`}
            disabled={!isStreaming && disabledSend}
            aria-label={m.chat.send ?? "Send"}
          >
            {isStreaming ? (
              <Square size={16} fill="currentColor" />
            ) : (
              <ArrowUp size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
