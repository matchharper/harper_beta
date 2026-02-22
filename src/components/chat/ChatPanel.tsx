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
import {
  UI_END,
  UI_START,
  useChatSessionDB,
} from "@/hooks/chat/useChatSession";
import {
  ArrowDown,
  ArrowLeft,
  Loader2,
  ScreenShareIcon,
  Settings,
  XIcon,
} from "lucide-react";
import { logger } from "@/utils/logger";
import { useRouter } from "next/router";
import { CandidateDetail } from "@/hooks/useCandidateDetail";
import { Skeleton } from "../ui/skeleton";
import ChatSettingsModal from "../Modal/ChatSettingsModal";
import { useSettings } from "@/hooks/useSettings";
import { useCredits } from "@/hooks/useCredit";
import { MIN_CREDITS_FOR_SEARCH } from "@/utils/constantkeys";
import CreditModal from "../Modal/CreditModal";
import { supabase } from "@/lib/supabase";
import { showToast } from "../toast/toast";
import { usePlanStore } from "@/store/usePlanStore";
import { StatusEnum } from "@/types/type";
import type { FileAttachmentPayload } from "@/types/chat";
import { notifyToSlack } from "@/lib/slack";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";

export type ChatScope =
  | { type: "query"; queryId: string }
  | { type: "candid"; candidId: string };

type Props = {
  title: string;
  scope?: ChatScope;
  userId?: string;
  systemPromptOverride?: string;
  memoryMode?: "automation";
  companyDescription?: string;
  teamLocation?: string;
  onBack?: () => void;

  onSearchFromConversation: (messageId: number) => Promise<string | null>;

  disabled?: boolean;
  candidDoc?: CandidateDetail;
  isChatFull?: boolean;
  setIsChatFull?: (isChatFull: boolean) => void;
  finishedTick?: number;
};

export const BOTTOM_THRESHOLD_PX = 120;
export const AUTO_SCROLL_THROTTLE_MS = 120;

function extractCriteriaCardPayload(content: string): {
  thinking: string;
  criteria: string[];
} | null {
  if (!content) return null;

  const start = content.lastIndexOf(UI_START);
  const end = content.lastIndexOf(UI_END);
  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = content.slice(start + UI_START.length, end).trim();
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed?.type !== "criteria_card") return null;
    return {
      thinking: typeof parsed.thinking === "string" ? parsed.thinking : "",
      criteria: Array.isArray(parsed.criteria)
        ? parsed.criteria.filter((item: unknown) => typeof item === "string")
        : [],
    };
  } catch {
    return null;
  }
}

export default function ChatPanel({
  title,
  scope,
  userId,
  systemPromptOverride,
  memoryMode,
  companyDescription,
  teamLocation,
  onBack,
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
  const [isNoCreditModalOpen, setIsNoCreditModalOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const { companyUser } = useCompanyUserStore();

  const { credits } = useCredits();
  const { planKey, load: loadPlan } = usePlanStore();

  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const chat = useChatSessionDB({
    model: "grok-4-fast-reasoning",
    scope,
    userId,
    candidDoc,
    systemPromptOverride,
    memoryMode,
    companyDescription,
    teamLocation,
  });
  const autoStartedRef = useRef(false);
  const {
    settings,
    isLoading: isSettingsLoading,
    saveSettings,
    isSaving,
  } = useSettings(userId);

  const isQueryScope = scope?.type === "query";

  const allowAttachments = memoryMode === "automation";
  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  const normalizeText = useCallback((text: string) => {
    return text
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }, []);

  const readFileContent = useCallback(
    async (file: File): Promise<{ text: string; truncated: boolean }> => {
      const MAX_CHARS = 12000;
      let text = "";

      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/pdf", { method: "POST", body: formData });
        if (!res.ok) {
          throw new Error("PDF read failed");
        }
        const data = await res.json();
        text = String(data?.text ?? "");
      } else {
        text = await file.text();
      }

      const normalized = normalizeText(text);
      if (!normalized) {
        throw new Error("Empty file content");
      }
      const truncated = normalized.length > MAX_CHARS;
      return {
        text: truncated ? normalized.slice(0, MAX_CHARS) : normalized,
        truncated,
      };
    },
    [normalizeText]
  );

  useEffect(() => {
    if (!finishedTick) return;
    logger.log("\n\n FINISHED!! in ChatPanel \n\n");
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

  useEffect(() => {
    if (!userId) return;
    loadPlan(userId);
  }, [userId, loadPlan]);

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

  const lastScopeKeyRef = useRef<string | null>(null);

  const scopeKey = useMemo(() => {
    if (!scope) return null;
    return scope.type === "query"
      ? `q:${scope.queryId}`
      : `c:${scope.candidId}`;
  }, [scope]);

  useEffect(() => {
    if (!chat.ready) return;
    if (!scopeKey) return;

    // scope가 진짜 바뀐 경우에만
    if (lastScopeKeyRef.current === scopeKey) return;
    lastScopeKeyRef.current = scopeKey;

    // ✅ 스트리밍 중이면 로드하지 마 (제일 중요)
    if (chat.isStreaming) return;

    void chat.loadHistory();
  }, [chat.ready, scopeKey, chat.loadHistory, chat.isStreaming]);

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

    const maxParallel = planKey === "max" ? 3 : 1;
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", [
        StatusEnum.DONE,
        StatusEnum.RUNNING,
        StatusEnum.PARTIAL,
        StatusEnum.FOUND,
        StatusEnum.STARTING,
        StatusEnum.QUEUED,
        StatusEnum.RERANKING_STREAMING,
        StatusEnum.PARSING,
        StatusEnum.REFINE,
        StatusEnum.EXPANDING,
        StatusEnum.RERANKING,
      ])
      .gte("created_at", threeMinAgo);

    if (error) {
      console.error("Failed to check running searches:", error);
    } else if ((count ?? 0) >= maxParallel) {
      showToast({
        message:
          maxParallel === 3
            ? "동시 검색은 최대 3개까지 가능합니다."
            : "이미 검색이 진행중입니다. 기존 검색이 종료된 후에 다시 시도해주세요.<br />(Max 플랜의 경우 동시에 3개까지 가능합니다.)",
        variant: "white",
      });
      return;
    }
    if (credits && credits.remain_credit <= MIN_CREDITS_FOR_SEARCH) {
      setIsNoCreditModalOpen(true);
      return;
    }

    try {
      const { data: messageData, error: messageError } = await supabase
        .from("messages")
        .select("content")
        .eq("id", messageId)
        .single();

      if (messageError) {
        console.error("search message load error:", messageError);
      } else {
        const criteriaCard = extractCriteriaCardPayload(messageData?.content ?? "");
        const criteriaText =
          criteriaCard && criteriaCard.criteria.length > 0
            ? criteriaCard.criteria.map((criteria, idx) => `${idx + 1}. ${criteria}`).join("\n")
            : "N/A";

        await notifyToSlack(`🔎 *Search Started (Confirm)*

• *User*: ${companyUser?.name ?? "Unknown"} (${companyUser?.email ?? "N/A"})
• *User ID*: ${userId}
• *Query ID*: ${scope?.type === "query" ? scope.queryId : "N/A"}
• *Thinking*: ${criteriaCard?.thinking || "N/A"}
• *Criteria*:
${criteriaText}
• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
      }
    } catch (notifyError) {
      console.error("search start slack notify error:", notifyError);
    }

    const searchStartText =
      "검색을 시작하겠습니다. 최대 1~3분이 소요될 수 있습니다.";
    const searchStartBlock = {
      type: "search_start",
      text: searchStartText,
      run_id: "",
    };

    setIsSearchSyncing(true);
    try {
      const pendingMsg = await chat.addAssistantMessage(
        `${UI_START}\n${JSON.stringify(searchStartBlock)}\n${UI_END}`
      );

      const runId = await onSearchFromConversation(messageId);
      if (pendingMsg?.id && runId) {
        await chat.patchAssistantUiBlock(Number(pendingMsg.id), {
          ...searchStartBlock,
          run_id: runId,
        });
      }
    } finally {
      setIsSearchSyncing(false);
    }
  };

  const handleSend = useCallback(async () => {
    if (isReadingFile) return;

    let attachments: FileAttachmentPayload[] | undefined;

    if (allowAttachments && attachedFile) {
      setIsReadingFile(true);
      try {
        const { text, truncated } = await readFileContent(attachedFile);
        const excerpt = text.slice(0, 600);
        attachments = [
          {
            name: attachedFile.name,
            size: attachedFile.size,
            mime: attachedFile.type,
            text,
            excerpt,
            truncated,
          },
        ];
        setAttachedFile(null);
      } catch (error) {
        showToast({
          message: "파일을 읽지 못했습니다. 다시 시도해주세요.",
          variant: "white",
        });
        setIsReadingFile(false);
        return;
      } finally {
        setIsReadingFile(false);
      }
    }

    void chat.send(undefined, { attachments });
  }, [allowAttachments, attachedFile, chat, isReadingFile, readFileContent]);

  const handleAttach = useCallback(
    (file: File | null) => {
      if (!file) {
        setAttachedFile(null);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showToast({
          message: "파일 용량이 너무 큽니다. 10MB 이하로 업로드해주세요.",
          variant: "white",
        });
        return;
      }
      setAttachedFile(file);
    },
    [MAX_FILE_BYTES]
  );

  return (
    <div className="w-full flex flex-col min-h-0 h-screen">
      <CreditModal
        open={isNoCreditModalOpen}
        onClose={() => setIsNoCreditModalOpen(false)}
      />
      {/* Header (fixed) */}
      <div className="flex items-center justify-between flex-none h-14 px-4 text-hgray900">
        <div
          onClick={() => {
            if (onBack) {
              onBack();
            } else {
              router.back();
            }
          }}
          className="text-sm font-medium flex items-center gap-1.5 hover:gap-2 cursor-pointer hover:text-hgray900 transition-all duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-hgray600" />
          <div>{title === "" ? <Skeleton className="w-20 h-5" /> : title}</div>
        </div>
        <div className="flex flex-row justify-center items-center gap-2 text-hgray700">
          <div
            className="p-1 cursor-pointer"
            onClick={() => setIsSettingsOpen(true)}
          ></div>
          {!systemPromptOverride && (
            <>
              {isChatFull ? (
                <div
                  className="p-1 cursor-pointer"
                  onClick={() => setIsChatFull?.(false)}
                >
                  <XIcon className="w-3.5 h-3.5" strokeWidth={1.4} />
                </div>
              ) : (
                <div
                  className="p-1 cursor-pointer"
                  onClick={() => setIsChatFull?.(true)}
                >
                  <ScreenShareIcon className="w-3.5 h-3.5" strokeWidth={1.4} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {systemPromptOverride && <br />}

      {/* Messages (scroll only here) */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto px-4 pt-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20"
        >
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
        onSend={handleSend}
        onStop={chat.stop}
        onRetry={() => void chat.reload()}
        disabledSend={
          (!chat.canSend && !(allowAttachments && attachedFile)) ||
          disabled ||
          isSearchSyncing ||
          isReadingFile
        }
        isStreaming={chat.isStreaming}
        allowAttachments={allowAttachments}
        attachment={attachedFile}
        onAttach={handleAttach}
        isPreparing={isReadingFile}
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
