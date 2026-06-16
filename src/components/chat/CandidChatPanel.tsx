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
import { ArrowDown, ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import { CandidateDetail } from "@/hooks/useCandidateDetail";
import { Skeleton } from "../ui/skeleton";
import { useMessages } from "@/i18n/useMessage";
import { BareButton } from "@/components/ui/button";

export type ChatScope =
  | { type: "query"; queryId: string }
  | { type: "candid"; candidId: string };

type Props = {
  title: string;
  scope?: ChatScope;
  userId?: string;

  disabled: boolean;
  candidDoc?: CandidateDetail;
};

export const BOTTOM_THRESHOLD_PX = 120;
export const AUTO_SCROLL_THROTTLE_MS = 120;

export default function CandidChatPanel({
  title,
  scope,
  userId,
  disabled,
  candidDoc,
}: Props) {
  const router = useRouter();
  const { m } = useMessages();

  const [stickToBottom, setStickToBottom] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const chat = useChatSessionDB({
    model: "grok-4-fast-reasoning",
    scope,
    userId,
    candidDoc,
  }); // ✅ 바뀐 부분

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

  const isCandidEmpty = useMemo(() => {
    const hasAnyChat =
      chat.messages?.some((m) => m.role === "user" || m.role === "assistant") ??
      false;
    return !hasAnyChat && !chat.isLoadingHistory;
  }, [chat.messages, chat.isLoadingHistory]);

  // ✅ 예시 질문 클릭 → 바로 대화 시작
  const onClickCandidSuggestion = useCallback(
    async (text: string) => {
      chat.setMessages([
        {
          role: "user",
          rawContent: text,
          content: text,
          segments: [{ type: "text", content: text }],
        },
      ]);
      await chat.send(text);

      requestAnimationFrame(() => scrollToBottom("smooth"));
    },
    [chat, scrollToBottom]
  );

  return (
    <div className="w-full flex flex-col min-h-0 h-screen">
      {/* Header (fixed) */}
      <div className="flex items-center justify-between flex-none h-14 px-4 text-neutral-primary">
        <div
          onClick={() => router.back()}
          className="text-sm font-medium flex items-center gap-1.5 hover:gap-2 cursor-pointer hover:text-neutral-primary transition-all duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-neutral-muted" />
          <div>{title === "" ? <Skeleton className="w-20 h-5" /> : title}</div>
        </div>
        <div className="flex flex-row justify-center items-center gap-2 text-neutral-muted">
          {/* <div
            className="p-1 cursor-pointer"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings
              className="w-3.5 h-3.5"
              strokeWidth={1.4}
            />
          </div> */}
        </div>
      </div>

      {/* Messages (scroll only here) */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto px-4 pt-4 scrollbar-thin scrollbar-thumb-neutral-1000-a10 scrollbar-track-transparent hover:scrollbar-thumb-neutral-1000-a10"
        >
          {chat.isLoadingHistory && (
            <div className="text-xs text-neutral-muted flex items-center gap-2 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {m.chat.loadingHistory}
            </div>
          )}

          <ChatMessageList
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            error={chat.error}
            onConfirmCriteriaCard={undefined}
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
            className="absolute bottom-3 right-3 flex items-center gap-1 cursor-pointer rounded-full bg-bg-floating hover:bg-bg-weak px-2 py-2 text-xs text-neutral-primary"
          >
            <ArrowDown className="w-4 h-4" />
          </BareButton>
        )}
      </div>

      {/* ✅ candid + empty 일 때만 예시 질문 */}
      {isCandidEmpty && (
        <div className="flex flex-col gap-2 p-3">
          {m.chat.candidSuggestions.map((q) => (
            <BareButton
              key={q}
              type="button"
              onClick={() => void onClickCandidSuggestion(q)}
              className="inline-flex w-fit text-left rounded-lg bg-bg-floating hover:bg-bg-weak px-3 py-2 text-xs text-neutral-primary cursor-pointer"
            >
              {q}
            </BareButton>
          ))}
        </div>
      )}

      {/* Composer (fixed) */}
      <ChatComposer
        value={chat.input}
        onChange={chat.setInput}
        onSend={() => {
          void chat.send();
        }}
        onStop={chat.stop}
        onRetry={() => void chat.reload()}
        disabledSend={!chat.canSend || disabled}
        isStreaming={chat.isStreaming}
      />

      {/* {isSettingsOpen && (
        <BaseModal
          onClose={() => setIsSettingsOpen(false)}
          onConfirm={() => {
            setSystemPromptOverride(promptDraft);
            setIsSettingsOpen(false);
          }}
          confirmLabel="적용"
          isCloseButton={true}
          size="lg"
        >
          <div className="space-y-4">
            <div className="text-lg font-normal text-neutral-00/90">
              Candid System Prompt (테스트용)
            </div>
            <UiTextarea
              unstyled
              className="w-full min-h-[220px] rounded-xl bg-black/40 border border-neutral-00/10 p-3 text-xs text-neutral-00/90"
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <BareButton
                type="button"
                className="text-xs text-neutral-00/60 hover:text-neutral-00/90"
                onClick={() => setPromptDraft(CANDID_SYSTEM_PROMPT)}
              >
                기본값 불러오기
              </BareButton>
              <div className="text-xs text-neutral-00/60">
                저장 후 다음 메시지부터 적용됨
              </div>
            </div>
          </div>
        </BaseModal>
      )} */}
    </div>
  );
}
