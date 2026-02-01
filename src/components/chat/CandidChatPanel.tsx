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
import { ArrowDown, ArrowLeft, Loader2, Lock, Settings } from "lucide-react";
import { logger } from "@/utils/logger";
import { useRouter } from "next/router";
import { CandidateDetail, candidateKey } from "@/hooks/useCandidateDetail";
import { Skeleton } from "../ui/skeleton";
import ConfirmModal from "../Modal/ConfirmModal";
import BaseModal from "../Modal/BaseModal";
import { supabase } from "@/lib/supabase";
import { useCredits } from "@/hooks/useCredit";
import { useQueryClient } from "@tanstack/react-query";
import { CANDID_SYSTEM_PROMPT } from "@/app/api/chat/chat_prompt";
import CreditModal from "../Modal/CreditModal";

const CANDID_SUGGESTIONS = [
  "이 사람이 이직 의사가 있을까?",
  "이 사람이 우리 팀에 적합한지, 근거와 함께 평가해줘.",
  "처음 대화를 할 때, 어떤 주제로 시작하면 좋을지 알려줘.",
];

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

  const [stickToBottom, setStickToBottom] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const { deduct, credits } = useCredits();
  const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isNoCreditModalOpen, setIsNoCreditModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [systemPromptOverride, setSystemPromptOverride] = useState<string | null>(
    null
  );
  const [promptDraft, setPromptDraft] = useState(CANDID_SYSTEM_PROMPT);

  const chat = useChatSessionDB({
    model: "grok-4-fast-reasoning",
    scope,
    userId,
    candidDoc,
    systemPromptOverride: systemPromptOverride ?? undefined,
  }); // ✅ 바뀐 부분

  const candidId = useMemo(() => {
    if (scope?.type === "candid") return scope.candidId;
    return candidDoc?.id;
  }, [scope, candidDoc?.id]);
  const isUnlockProfile = candidDoc?.unlock_profile && candidDoc?.unlock_profile?.length > 0 ? true : false

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
      if (!isUnlockProfile) {
        setIsUnlockConfirmOpen(true);
        return;
      };
      chat.setMessages([{
        role: "user",
        rawContent: text,
        content: text,
        segments: [{ type: "text", content: text }],
      }]);
      await chat.send(text);

      requestAnimationFrame(() => scrollToBottom("smooth"));
    },
    [chat, scrollToBottom, isUnlockProfile]
  );

  const onClickUnlockProfile = useCallback(async () => {
    if (isUnlockProfile) return;
    if (credits && credits.remain_credit <= 0) {
      setIsNoCreditModalOpen(true);
      return;
    }
    setIsUnlockConfirmOpen(true);
  }, [isUnlockProfile, credits]);

  const onConfirmUnlockProfile = useCallback(async () => {
    if (!userId || !candidId) return;
    if (isUnlocking) return;
    if (credits && credits.remain_credit <= 0) {
      setIsNoCreditModalOpen(true);
      return;
    }

    setIsUnlocking(true);
    let insertedRow: any | null = null;

    try {
      const { data, error } = await supabase
        .from("unlock_profile")
        .insert({
          company_user_id: userId,
          candid_id: candidId,
        })
        .select()
        .single();

      if (error) throw error;
      insertedRow = data;

      try {
        await deduct(1);
      } catch (deductError: any) {
        const isInsufficient = String(deductError?.message ?? "").includes(
          "Insufficient credits"
        );
        if (insertedRow?.id) {
          await supabase.from("unlock_profile").delete().eq("id", insertedRow.id);
        }
        if (isInsufficient) {
          setIsNoCreditModalOpen(true);
          return;
        }
        throw deductError;
      }

      queryClient.setQueryData(candidateKey(candidId, userId), (prev: any) => {
        if (!prev) return prev;
        const current = Array.isArray(prev.unlock_profile)
          ? prev.unlock_profile
          : [];
        if (current.some((u: any) => u?.id === insertedRow?.id)) return prev;
        return {
          ...prev,
          unlock_profile: [...current, insertedRow],
        };
      });

      setIsUnlockConfirmOpen(false);
    } catch (error) {
      console.error("Unlock profile failed:", error);
      alert("Unlock에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsUnlocking(false);
    }
  }, [userId, candidId, isUnlocking, deduct, queryClient, credits]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    setPromptDraft(systemPromptOverride ?? CANDID_SYSTEM_PROMPT);
  }, [isSettingsOpen, systemPromptOverride]);

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
            <Settings
              className="w-3.5 h-3.5"
              strokeWidth={1.4}
            />
          </div>
        </div>
      </div>

      {/* Messages (scroll only here) */}
      <div className="flex-1 min-h-0 relative">
        <div ref={scrollRef}
          className="h-full overflow-y-auto px-4 pt-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20">
          <ConfirmModal
            open={isUnlockConfirmOpen}
            onClose={() => setIsUnlockConfirmOpen(false)}
            onConfirm={() => void onConfirmUnlockProfile()}
            title="프로필 잠금 해제"
            description="프로필 잠금을 해제하고 제한없이 대화를 시작할 수 있습니다. 1 크레딧이 차감됩니다."
            confirmLabel="확인"
            cancelLabel="취소"
            isLoading={isUnlocking}
          />
          <CreditModal
            open={isNoCreditModalOpen}
            onClose={() => setIsNoCreditModalOpen(false)}
            isLoading={isUnlocking}
          />
          {chat.isLoadingHistory && (
            <div className="text-xs text-hgray600 flex items-center gap-2 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              대화 기록 불러오는 중...
            </div>
          )}

          {
            !isUnlockProfile && (
              <div className="flex items-center h-[70%] w-full justify-center">
                <div
                  onClick={() => void onClickUnlockProfile()}
                  className="flex flex-row justify-center items-center gap-2 bg-white/10 rounded-md px-3 py-2 cursor-pointer hover:bg-white/15 transition-all duration-200"
                >
                  <Lock className="w-4 h-4 text-hgray600" />
                  <span className="text-xs text-hgray900">Unlock Profile to start the conversation</span>
                </div>
              </div>
            )
          }

          {
            isUnlockProfile && (
              <ChatMessageList
                messages={chat.messages}
                isStreaming={chat.isStreaming}
                error={chat.error}
                onConfirmCriteriaCard={undefined} // ✅ query scope에서만
                onChangeCriteriaCard={() => { }}
              />)
          }
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

      {/* ✅ candid + empty 일 때만 예시 질문 */}
      {isCandidEmpty && (
        <div className="flex flex-col gap-2 p-3">
          {CANDID_SUGGESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void onClickCandidSuggestion(q)}
              className="inline-flex w-fit text-left rounded-lg bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-hgray900 cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Composer (fixed) */}
      <ChatComposer
        value={chat.input}
        onChange={chat.setInput}
        onSend={() => void chat.send()}
        onStop={chat.stop}
        onRetry={() => void chat.reload()}
        disabledSend={!chat.canSend || disabled}
        isStreaming={chat.isStreaming}
      />

      {isSettingsOpen && (
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
            <div className="text-lg font-normal text-hgray900">
              Candid System Prompt (테스트용)
            </div>
            <textarea
              className="w-full min-h-[220px] rounded-xl bg-black/40 border border-white/10 p-3 text-xs text-hgray900"
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-xs text-hgray600 hover:text-hgray900"
                onClick={() => setPromptDraft(CANDID_SYSTEM_PROMPT)}
              >
                기본값 불러오기
              </button>
              <div className="text-xs text-hgray600">
                저장 후 다음 메시지부터 적용됨
              </div>
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
}
