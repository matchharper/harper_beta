// components/chat/ChatPanel.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import ChatMessageList from "@/components/chat/ChatMessageList";
import ChatComposer from "@/components/chat/ChatComposer";
import { useChatSessionDB } from "@/hooks/chat/useChatSession";
import { ArrowDown, ArrowLeft, Loader2, ScreenShareIcon, Settings, XIcon } from "lucide-react";
import { logger } from "@/utils/logger";
import { useRouter } from "next/router";
import { CandidateDetail } from "@/hooks/useCandidateDetail";
import { Skeleton } from "../ui/skeleton";
import ChatSettingsModal from "../Modal/ChatSettingsModal";
import { useSettings } from "@/hooks/useSettings";


export type ChatScope =
  | { type: "query"; queryId: string }
  | { type: "candid"; candidId: string };

type Props = {
  title: string;
  scope?: ChatScope;
  userId?: string;

  onSearchFromConversation: (messageId: number) => Promise<void>;

  disabled?: boolean;
  candidDoc?: CandidateDetail;
  isChatFull?: boolean;
  setIsChatFull?: (isChatFull: boolean) => void;
  finishedTick?: number;
};

export const BOTTOM_THRESHOLD_PX = 120;
export const AUTO_SCROLL_THROTTLE_MS = 120;

export default function ChatPanel({
  title,
  scope,
  userId,
  onSearchFromConversation,
  disabled,
  candidDoc,
  isChatFull,
  setIsChatFull,
  finishedTick,
}: Props) {
  const [isSearchSyncing, setIsSearchSyncing] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const chat = useChatSessionDB({ model: "grok-4-fast-reasoning", scope, userId, candidDoc }); // ✅ 바뀐 부분
  const autoStartedRef = useRef(false);
  const { settings, isLoading: isSettingsLoading, saveSettings, isSaving } = useSettings(userId);

  const isQueryScope = scope?.type === "query";

  useEffect(() => {
    if (!finishedTick) return;
    logger.log("\n\n FINISHED!! in ChatPanel \n\n")
    setTimeout(() => {
      void chat.loadHistory();
    }, 1000);
  }, [finishedTick]);

  // ✅ auto-start: query scope에서만
  useEffect(() => {
    if (!isQueryScope) return;

    if (!chat.ready) return;
    if (chat.isLoadingHistory) return;

    if (chat.messages.length !== 1) return;
    if (chat.messages[0]?.role !== "user") return;

    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    logger.log("\n 자동 시작 메시지: ", chat.messages);

    void chat.send(chat.messages[0].content ?? "");
  }, [
    isQueryScope,
    chat.ready,
    chat.isLoadingHistory,
    chat.messages,
    chat.send,
  ]);

  // ✅ scope가 바뀌면 autoStarted도 리셋 (중요)
  useEffect(() => {
    autoStartedRef.current = false;
  }, [scope?.type, isQueryScope ? scope?.queryId : scope?.candidId]);

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

  const loadedOnceRef = useRef(false);

  useEffect(() => {
    if (!chat.ready) return;
    if (loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    void chat.loadHistory();
  }, [chat.ready, chat.loadHistory]);

  useEffect(() => {
    if (!chat.ready) return;
    loadedOnceRef.current = true;
    void chat.loadHistory();
  }, [chat.ready, scope]);

  // ✅ attach scroll listener
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => recomputeStickiness();
    el.addEventListener("scroll", onScroll, { passive: true });

    recomputeStickiness();
    return () => el.removeEventListener("scroll", onScroll);
  }, [recomputeStickiness]);

  // ✅ 자연스러운 auto-follow (only if pinned)
  const lastAutoScrollTsRef = useRef(0);
  useEffect(() => {
    if (!stickToBottom) return;

    const now = Date.now();
    if (now - lastAutoScrollTsRef.current < AUTO_SCROLL_THROTTLE_MS) return;
    lastAutoScrollTsRef.current = now;

    const id = requestAnimationFrame(() => {
      scrollToBottom(chat.isStreaming ? "auto" : "smooth");
    });
    return () => cancelAnimationFrame(id);
  }, [chat.messages, chat.isStreaming, stickToBottom, scrollToBottom]);

  // ✅ initial load: jump to bottom once (instant)
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (initialScrollDone.current) return;
    if (chat.isLoadingHistory) return;
    if (chat.messages.length === 0) return;

    initialScrollDone.current = true;
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [chat.isLoadingHistory, chat.messages.length, scrollToBottom]);

  // ✅ 검색 가능한 상태인지 (query scope에서만)
  const canSearch = useMemo(() => {
    if (!isQueryScope) return false;

    if (disabled) return false;
    if (!scope || scope.type !== "query") return false;
    if (!userId) return false;
    if (isSearchSyncing || chat.isStreaming) return false;

    return (
      chat.messages.length > 0 && chat.messages.some((m) => m.role === "user")
    );
  }, [
    isQueryScope,
    disabled,
    scope,
    userId,
    isSearchSyncing,
    chat.isStreaming,
    chat.messages,
  ]);

  const onClickSearch = async (messageId: number) => {
    if (!canSearch) return;
    if (!messageId) return;
    if (!userId) return;

    // const { data } = await supabase
    //   .from("runs")
    //   .select("status, created_at")
    //   .eq("user_id", userId)
    //   .not("status", "in", "(running,error,finished,queued)")
    //   .order("created_at", { ascending: false })
    //   .limit(1)
    //   .single();

    // const createdAt = new Date(data?.created_at ?? "").getTime();
    // const now = Date.now();

    // const isWithin5Min = now - createdAt <= 5 * 60 * 1000;
    // logger.log("isWithin5Min", data, isWithin5Min);
    // if (data && isWithin5Min) {
    //   showToast({
    //     message: "이미 검색이 진행중입니다. 기존 검색이 종료된 후에 다시 시도해주세요.",
    //     variant: "white",
    //   });
    //   return;
    // }

    setIsSearchSyncing(true);
    try {
      await chat.addAssistantMessage(
        "검색을 시작하겠습니다. 최대 1~3분이 소요될 수 있습니다."
      );
      await onSearchFromConversation(messageId);
    } finally {
      setIsSearchSyncing(false);
    }
  };

  return (
    <div className="w-full flex flex-col min-h-0 h-screen">
      {/* Header (fixed) */}
      <div className="flex items-center justify-between flex-none h-14 px-4 text-hgray900">
        <div
          onClick={() => router.back()}
          className="text-sm font-medium flex items-center gap-1.5 hover:gap-2 cursor-pointer hover:text-hgray900 transition-all duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-hgray600" />
          <div>{title === "" ? <Skeleton className="w-20 h-5" /> : title}</div>
        </div>
        <div className="flex flex-row justify-center items-center gap-2 text-hgray700">
          <div
            className="p-1 cursor-pointer"
            onClick={() => setIsSettingsOpen(true)}
          >
            {/* <Settings
              className="w-3.5 h-3.5"
              strokeWidth={1.4}
            /> */}
          </div>
          {
            isChatFull ? (
              <div
                className="p-1 cursor-pointer"
                onClick={() => setIsChatFull?.(false)}>
                <XIcon
                  className="w-3.5 h-3.5"
                  strokeWidth={1.4}
                />
              </div>
            ) : (
              <div className="p-1 cursor-pointer"
                onClick={() => setIsChatFull?.(true)}>
                <ScreenShareIcon
                  className="w-3.5 h-3.5"
                  strokeWidth={1.4}
                />
              </div>
            )
          }
        </div>
      </div>

      {/* Messages (scroll only here) */}
      <div className="flex-1 min-h-0 relative">
        <div ref={scrollRef}
          className="h-full overflow-y-auto px-4 pt-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20">
          {chat.isLoadingHistory && (
            <div className="text-xs text-hgray600 flex items-center gap-2 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              대화 기록 불러오는 중...
            </div>
          )}

          <ChatMessageList
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            error={chat.error}
            onConfirmCriteriaCard={isQueryScope ? onClickSearch : undefined} // ✅ query scope에서만
            onChangeCriteriaCard={(args) => {
              void chat.patchAssistantUiBlock(
                args.messageId,
                args.modifiedBlock
              );
            }}
          />
          <br />
        </div>

        {showJumpToBottom && (
          <button
            type="button"
            onClick={() => {
              scrollToBottom("smooth");
              setStickToBottom(true);
              setShowJumpToBottom(false);
            }}
            className="absolute bottom-3 right-3 flex items-center gap-1 cursor-pointer rounded-full bg-white/5 hover:bg-white/10 px-2 py-2 text-xs text-hgray900"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Composer (fixed) */}
      <ChatComposer
        value={chat.input}
        onChange={chat.setInput}
        onSend={() => void chat.send()}
        onStop={chat.stop}
        onRetry={() => void chat.reload()}
        disabledSend={!chat.canSend || disabled || isSearchSyncing}
        isStreaming={chat.isStreaming}
      />

      <ChatSettingsModal
        open={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={async (next) => {
          await saveSettings(next);
        }}
        isLoading={isSettingsLoading}
        isSaving={isSaving}
      />
    </div>
  );
}
