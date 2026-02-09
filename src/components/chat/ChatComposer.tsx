// components/chat/ChatComposer.tsx
import React, { useCallback, useRef } from "react";
import { SendHorizonal, Square, RotateCcw, ArrowUp } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  disabledSend: boolean;
  isStreaming: boolean;
};

export default function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  onRetry,
  disabledSend,
  isStreaming,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
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

  return (
    <div className="flex flex-col gap-2 px-2 pb-2">
      <div className="relative flex items-end">
        <textarea
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={m.chat.composerPlaceholder}
          className="w-full min-h-[94px] max-h-[140px] resize-none rounded-[20px] bg-white/5 px-4 py-2.5 text-[13px] text-hgray900 outline-none border border-white/10 focus:border-white/20"
        />

        <button
          type="button"
          onClick={handleSendClick}
          className={`absolute right-2 bottom-2 h-8 w-8 rounded-2xl flex items-center justify-center cursor-pointer hover:opacity-90 ${isStreaming
            ? "bg-hgray700 text-hgray100"
            : "bg-accenta1 text-black disabled:opacity-50"
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
  );
}
