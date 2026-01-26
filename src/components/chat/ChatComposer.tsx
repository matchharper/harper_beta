// components/chat/ChatComposer.tsx
import React, { useCallback } from "react";
import { SendHorizonal, Square, RotateCcw, ArrowUp } from "lucide-react";

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
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter -> send, Shift+Enter -> newline
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );

  return (
    <div className="flex flex-col gap-2 px-2 pb-2">
      <div className="relative flex items-end">
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="추가 질문을 입력하세요 (Enter 전송 / Shift+Enter 줄바꿈)"
          className="w-full min-h-[94px] max-h-[140px] resize-none rounded-[20px] bg-white/5 px-4 py-2.5 text-[13px] text-hgray900 outline-none border border-white/10 focus:border-white/20"
          disabled={isStreaming}
        />

        <button
          type="button"
          onClick={isStreaming ? onStop : onSend}
          className={`absolute right-2 bottom-2 h-8 w-8 rounded-2xl flex items-center justify-center cursor-pointer hover:opacity-90 ${
            isStreaming
              ? "bg-hgray700 text-hgray100"
              : "bg-accenta1 text-black disabled:opacity-50"
          }`}
          disabled={disabledSend}
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
