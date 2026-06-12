import React, { useCallback, useEffect, useRef, useState } from "react";
import ChatMessageList from "./ChatMessageList";
import { BOTTOM_THRESHOLD_PX } from "./ChatPanel";
import { ArrowDown } from "lucide-react";
import { extractUiSegments } from "@/hooks/chat/useChatSession";
import { BareButton } from "@/components/ui/button";

const SharedChatPanel = ({
  title,
  messages,
}: {
  title: string;
  messages: any[];
}) => {
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const recomputeStickiness = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceToBottom <= BOTTOM_THRESHOLD_PX;

    setStickToBottom(atBottom);
    setShowJumpToBottom(!atBottom);
  }, []);

  // ✅ attach scroll listener
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => recomputeStickiness();
    el.addEventListener("scroll", onScroll, { passive: true });

    recomputeStickiness();
    return () => el.removeEventListener("scroll", onScroll);
  }, [recomputeStickiness]);

  const hydrated = messages.map((m: any) => {
    const raw = (m as any).rawContent ?? m.content ?? "";
    const { segments } = extractUiSegments(raw);
    return {
      ...m,
      role: m.role === 0 ? "user" : "assistant",
      rawContent: raw,
      segments,
    };
  });

  return (
    <div className="flex h-screen w-full min-w-[390px] max-w-[460px] flex-col border-r border-neutral-00/10 bg-black font-sans text-neutral-00 lg:w-[30%]">
      {/* Header (fixed) */}
      <div className="flex items-center justify-between flex-none h-14 px-4 text-neutral-00/90">
        <div className="text-sm font-medium flex items-center gap-1.5 hover:gap-2 cursor-pointer hover:text-neutral-00/90 transition-all duration-200">
          <div>{title}</div>
        </div>
        <div></div>
      </div>

      {/* Messages (scroll only here) */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto pr-2 px-4 pt-4 pb-20"
        >
          <ChatMessageList
            messages={hydrated}
            isStreaming={false}
            error={null}
            theme="dark"
            onConfirmCriteriaCard={() => {}}
            onChangeCriteriaCard={() => {}}
          />
          <br />
        </div>

        {showJumpToBottom && (
          <BareButton
            type="button"
            onClick={() => {
              scrollToBottom("smooth");
              setStickToBottom(true);
              setShowJumpToBottom(false);
            }}
            className="absolute bottom-3 right-3 flex items-center gap-1 cursor-pointer rounded-full bg-neutral-00/5 hover:bg-neutral-00/10 px-2 py-2 text-xs text-neutral-00/90"
          >
            <ArrowDown className="w-4 h-4" />
          </BareButton>
        )}
      </div>
    </div>
  );
};

export default React.memo(SharedChatPanel);
