// components/chat/ChatComposer.tsx
import React, { useCallback, useRef } from "react";
import { ArrowUp, Paperclip, Plus, Square, X } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  disabledSend: boolean;
  isStreaming: boolean;
  allowAttachments?: boolean;
  attachment?: File | null;
  onAttach?: (file: File | null) => void;
  isPreparing?: boolean;
};

export default function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  onRetry,
  disabledSend,
  isStreaming,
  allowAttachments = false,
  attachment,
  onAttach,
  isPreparing = false,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { m } = useMessages();

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter -> send, Shift+Enter -> newline
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabledSend) {
          onSend();
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }
    },
    [onSend, disabledSend]
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

  const formatBytes = (bytes?: number) => {
    if (!bytes || Number.isNaN(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-2 px-2 pb-2">
      {allowAttachments && attachment && (
        <div className="mx-2 rounded-2xl border border-beige900/8 bg-beige50 px-3 py-2 text-xs text-beige900/65 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paperclip className="w-3 h-3" />
            <span className="text-beige900">{attachment.name}</span>
            <span className="text-beige900/55">
              {formatBytes(attachment.size)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onAttach?.(null)}
            className="text-beige900/55 hover:text-beige900"
            aria-label="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {allowAttachments && isPreparing && (
        <div className="mx-2 text-xs text-beige900/55">
          {m.chat.fileReading ?? "파일을 읽는 중..."}
        </div>
      )}
      <div className="relative flex items-end">
        <textarea
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={m.chat.composerPlaceholder}
          className={`w-full min-h-[94px] max-h-[140px] resize-none rounded-[20px] bg-beige50 py-2.5 text-[13px] text-beige900 outline-none border border-beige900/8 focus:border-beige900/20 px-4`}
        />

        <div className="absolute right-2 bottom-2 flex flex-row items-center justify-center gap-2">
          {allowAttachments && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.txt,.md"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  onAttach?.(file);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 w-8 rounded-2xl flex items-center justify-center text-beige900/65 hover:text-beige900 bg-beige500/55 hover:bg-beige500/70"
                aria-label={m.chat.attachFile ?? "파일 첨부"}
              >
                <Plus size={16} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleSendClick}
            className={`h-8 w-8 rounded-2xl flex items-center justify-center cursor-pointer hover:opacity-90 ${
              isStreaming
                ? "bg-beige900/70 text-beige100"
                : "bg-beige900 text-beige100 disabled:opacity-50"
            }`}
            disabled={!isStreaming && disabledSend}
            aria-label="Send"
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
