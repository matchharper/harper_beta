import { memo } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { formatKst } from "./utils";

type MessageItem = {
  content: string;
  createdAt: string;
  id: number;
  messageType: string | null;
  role: string;
};

type MessagesTabProps = {
  messages: MessageItem[];
};

export const MessagesTab = memo(function MessagesTab({
  messages,
}: MessagesTabProps) {
  if (messages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
        대화 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cx(
            "rounded-lg px-4 py-3 font-geist text-sm",
            msg.role === "assistant"
              ? "bg-beige500/40 text-beige900/80"
              : "bg-white/70 text-beige900"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={cx(opsTheme.eyebrow)}>
              {msg.role === "assistant" ? "Harper" : "Talent"}
            </span>
            <span className="font-geist text-[10px] text-beige900/30">
              {formatKst(msg.createdAt)}
            </span>
          </div>
          <div className="whitespace-pre-wrap">{msg.content}</div>
        </div>
      ))}
    </div>
  );
});
