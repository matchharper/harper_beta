import { Info, LoaderCircle } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChatThinkingLogPanel } from "@/components/chat/ChatThinkingLogPanel";
import {
  ChatLoadOlderButton,
  getChatMessageDateKey,
  getPreviousChatMessageDateKey,
} from "@/components/chat/ChatTimeline";
import { OrgAgentComposer } from "@/components/org/agent/OrgAgentComposer";
import {
  OrgAgentDateDivider,
  OrgAgentMessageBubble,
  OrgAgentPendingBubble,
  OrgAgentStreamingBubble,
} from "@/components/org/agent/OrgAgentMessage";
import { MuteButton } from "@/components/ui/button";
import {
  useConfirmOrgRoleCreation,
  useOrgAgentChat,
  useOrgAgentMessageHistory,
} from "@/hooks/org/useOrgAgent";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import {
  DEFAULT_ORG_AGENT_MODEL,
  isOrgAgentModelId,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import { splitRoleCreationCompletionSentences } from "@/lib/org/agent/roleCreationCompletionMessage";
import { cn } from "@/lib/utils";

const ORG_AGENT_COMPOSER_DEFAULT_HEIGHT_PX = 148;
const ORG_AGENT_TIMELINE_BOTTOM_GAP_PX = 48;
const ORG_AGENT_BOTTOM_THRESHOLD_PX = 120;
const ROLE_CREATION_COMPLETION_SENTENCE_INTERVAL_MS = 240;

function OrgAgentInfo() {
  return (
    <div className="group relative">
      <MuteButton
        type="button"
        aria-describedby="org-agent-info-tooltip"
        aria-label="채팅 안내"
        size="sm"
        variant="transparent"
      >
        <Info className="h-4 w-4" strokeWidth={1.8} />
      </MuteButton>
      <div
        id="org-agent-info-tooltip"
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-[300px] max-w-[calc(100vw-64px)] translate-y-1 rounded-lg border border-neutral-1000-a10 bg-neutral-1000 px-3.5 py-3 text-[12px] leading-4 text-neutral-00 opacity-0 shadow-xl transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <div className="absolute -top-1.5 right-2.5 h-3 w-3 rotate-45 border-l border-t border-neutral-1000-a10 bg-neutral-1000" />
        <div className="relative space-y-2">
          <p>회사 전체 채용 정보를 읽고 다루는 채팅입니다.</p>
          <p>
            포지션이나 후보자를 이름으로 말하면 Harper가 대상을 찾습니다. 여러
            포지션이 모호하게 겹치면 먼저 확인합니다.
          </p>
          <p>
            @로 특정 후보자를 지정해 해당 후보자 연결의 좋은 점과 아쉬운 점을
            설명할 수 있습니다.
          </p>
          <p>수락, 거절, 단계 이동은 후보자 프로필에서 직접 처리해야 합니다.</p>
          <p>회사·포지션 정보와 채용 기준 변경도 요청할 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
}

export function OrgAgentChatSurface({
  autoFocus = true,
  className,
  onClose,
  onRoleCreated,
  purpose = "general",
  roleId,
  header = null,
}: {
  autoFocus?: boolean;
  className?: string;
  onClose?: () => void;
  onRoleCreated?: (roleId: string) => void;
  purpose?: "general" | "role-creation";
  roleId?: string | null;
  header?: ReactNode;
}) {
  const { bootstrap, currentUser, currentUserEmail, user, workspace } =
    useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const mode = purpose === "role-creation" ? "role_creation" : "general";
  const initialRoleCreation = purpose === "role-creation" && !roleId;
  const history = useOrgAgentMessageHistory({
    enabled: Boolean(workspaceId) && (mode === "general" || Boolean(roleId)),
    mode,
    roleId,
    workspaceId,
  });
  const chat = useOrgAgentChat({
    appendMessagesToCache: history.appendMessagesToCache,
    currentUserId: user.id,
    mode,
    onRoleCreated,
    roleId,
    workspaceId,
  });
  const confirmRoleCreation = useConfirmOrgRoleCreation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerOverlayRef = useRef<HTMLDivElement | null>(null);
  const [model, setModel] = useState<OrgAgentModelId>(DEFAULT_ORG_AGENT_MODEL);
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(
    ORG_AGENT_COMPOSER_DEFAULT_HEIGHT_PX
  );
  const [stickToBottom, setStickToBottom] = useState(true);
  const [completionReveal, setCompletionReveal] = useState<{
    content: string;
    messageId: number;
    revealedSentenceCount: number;
  } | null>(null);
  const completionRevealChunks = completionReveal
    ? splitRoleCreationCompletionSentences(completionReveal.content)
    : [];

  const handleModelChange = (nextModel: OrgAgentModelId) => {
    setModel(nextModel);
    window.localStorage.setItem("harper:org-agent:model", nextModel);
  };

  useEffect(() => {
    const savedModel = window.localStorage.getItem("harper:org-agent:model");
    if (!isOrgAgentModelId(savedModel)) return;
    const frame = window.requestAnimationFrame(() => setModel(savedModel));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const syncScrollState = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceToBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    setStickToBottom(distanceToBottom <= ORG_AGENT_BOTTOM_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    if (!stickToBottom) return;
    const node = scrollRef.current;
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
      syncScrollState();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    history.messages.length,
    chat.optimisticUserMessage?.id,
    chat.streamingText,
    chat.thinkingLogs.length,
    completionReveal?.revealedSentenceCount,
    stickToBottom,
    syncScrollState,
  ]);

  useEffect(() => {
    if (
      !completionReveal ||
      completionReveal.revealedSentenceCount >= completionRevealChunks.length
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCompletionReveal((current) =>
        current
          ? {
              ...current,
              revealedSentenceCount: current.revealedSentenceCount + 1,
            }
          : null
      );
    }, ROLE_CREATION_COMPLETION_SENTENCE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [completionReveal, completionRevealChunks.length]);

  useEffect(() => {
    if (initialRoleCreation) return;
    const element = composerOverlayRef.current;
    if (!element) return;

    let frameId: number | null = null;
    const updateComposerHeight = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const nextHeight = Math.ceil(element.getBoundingClientRect().height);
        if (nextHeight <= 0) return;
        setComposerOverlayHeight((currentHeight) =>
          Math.abs(currentHeight - nextHeight) <= 1 ? currentHeight : nextHeight
        );
      });
    };

    updateComposerHeight();
    const observer = window.ResizeObserver
      ? new window.ResizeObserver(updateComposerHeight)
      : null;
    observer?.observe(element);
    window.addEventListener("resize", updateComposerHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateComposerHeight);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [initialRoleCreation]);

  useEffect(() => {
    if (!stickToBottom || initialRoleCreation) return;
    const node = scrollRef.current;
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
      syncScrollState();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    composerOverlayHeight,
    initialRoleCreation,
    stickToBottom,
    syncScrollState,
  ]);

  const showModelSelector =
    currentUserEmail?.toLowerCase().endsWith("@matchharper.com") ||
    process.env.NEXT_PUBLIC_ORG_AGENT_MODEL_SELECTOR_ENABLED === "true";
  const lastHistoryMessage = history.messages.at(-1);
  const showOptimisticDateDivider = Boolean(
    chat.optimisticUserMessage &&
    getChatMessageDateKey(chat.optimisticUserMessage.createdAt) !==
      getChatMessageDateKey(lastHistoryMessage?.createdAt ?? "")
  );
  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-default",
        className
      )}
    >
      {header && header}

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10",
          header ? "pt-12" : "pt-4",
          initialRoleCreation && "hidden"
        )}
        style={
          initialRoleCreation
            ? undefined
            : {
                paddingBottom:
                  composerOverlayHeight + ORG_AGENT_TIMELINE_BOTTOM_GAP_PX,
                scrollPaddingBottom:
                  composerOverlayHeight + ORG_AGENT_TIMELINE_BOTTOM_GAP_PX,
              }
        }
        onScroll={(event) => {
          const node = event.currentTarget;
          syncScrollState();
          if (
            node.scrollTop < 80 &&
            history.hasOlderMessages &&
            !history.loadingOlderMessages
          ) {
            void history.loadOlderMessages();
          }
        }}
      >
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-1">
          {history.hasOlderMessages && (
            <div className="sticky top-0 z-10 flex justify-center pb-2">
              <ChatLoadOlderButton
                label="이전 대화 더 보기"
                loading={history.loadingOlderMessages}
                loadingLabel="불러오는 중..."
                onClick={() => {
                  void history.loadOlderMessages();
                }}
              />
            </div>
          )}

          {history.isLoading ? (
            <div className="flex items-center justify-center py-12 text-neutral-muted">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              대화 불러오는 중
            </div>
          ) : history.messages.length === 0 &&
            !chat.optimisticUserMessage &&
            purpose !== "role-creation" ? (
            <div className="flex min-h-[260px] items-center justify-center px-8">
              <p className="max-w-[320px] text-center leading-5 text-neutral-muted">
                후보자나 포지션을 찾아보거나, 회사·채용 정보를
                <br />
                확인하고 변경할 내용을 알려주세요.
              </p>
            </div>
          ) : (
            history.messages.map((message, index) => {
              const dateKey = getChatMessageDateKey(message.createdAt);
              const previousDateKey = getPreviousChatMessageDateKey(
                history.messages,
                index
              );
              const authorMember = message.authorUserId
                ? bootstrap.members.find(
                    (member) => member.userId === message.authorUserId
                  )
                : null;
              const authorName =
                message.metadata.slackUserName ||
                authorMember?.name ||
                authorMember?.email ||
                (message.authorUserId === user.id ||
                (!message.authorUserId && message.sourceSurface !== "slack")
                  ? currentUser?.name || currentUser?.email || user.email
                  : null);
              return (
                <div key={message.id} className="space-y-3">
                  {dateKey && dateKey !== previousDateKey && (
                    <OrgAgentDateDivider createdAt={message.createdAt} />
                  )}
                  <OrgAgentMessageBubble
                    assistantContentOverride={
                      completionReveal?.messageId === message.id
                        ? completionRevealChunks
                            .slice(0, completionReveal.revealedSentenceCount)
                            .join("")
                        : undefined
                    }
                    authorName={authorName}
                    choicePending={confirmRoleCreation.isPending}
                    currentUserId={user.id}
                    message={message}
                    onRoleCreationChoice={({
                      actionId,
                      decision,
                      messageId,
                    }) => {
                      if (!roleId) return;
                      confirmRoleCreation.mutate(
                        {
                          actionId,
                          decision,
                          messageId,
                          roleId,
                          workspaceId,
                        },
                        {
                          onSuccess: (result) => {
                            if (result.completed && result.assistantMessage) {
                              history.appendMessagesToCache([
                                result.assistantMessage,
                              ]);
                              setStickToBottom(true);
                              setCompletionReveal({
                                content: result.assistantMessage.content,
                                messageId: result.assistantMessage.id,
                                revealedSentenceCount: 1,
                              });
                            }
                          },
                        }
                      );
                    }}
                    roleId={roleId}
                    showUserAttribution={purpose === "role-creation"}
                    workspaceId={workspaceId}
                  />
                </div>
              );
            })
          )}
          {chat.optimisticUserMessage && (
            <div className="space-y-3">
              {showOptimisticDateDivider && (
                <OrgAgentDateDivider
                  createdAt={chat.optimisticUserMessage.createdAt}
                />
              )}
              <OrgAgentMessageBubble
                authorName={
                  currentUser?.name || currentUser?.email || user.email
                }
                currentUserId={user.id}
                message={chat.optimisticUserMessage}
                roleId={roleId}
                showUserAttribution={purpose === "role-creation"}
                workspaceId={workspaceId}
              />
            </div>
          )}
          <ChatThinkingLogPanel
            active={chat.isStreaming}
            logs={chat.thinkingLogs}
            typographyClassName="text-[13px] leading-[1.65]"
          />
          {chat.assistantStatus === "pending" ? (
            <OrgAgentPendingBubble />
          ) : null}
          <OrgAgentStreamingBubble
            text={chat.streamingText}
            workspaceId={workspaceId}
          />
          {(chat.error || confirmRoleCreation.error) && (
            <div className="rounded-md bg-critical-faded px-3 py-2 text-[12px] text-critical">
              {chat.error || confirmRoleCreation.error?.message}
            </div>
          )}
        </div>
      </div>

      <div
        ref={composerOverlayRef}
        className={cn(
          "pointer-events-none absolute z-20",
          initialRoleCreation
            ? "inset-0 flex items-center justify-center px-4"
            : "inset-x-0 bottom-0 bg-linear-to-t from-bg-basement via-bg-basement/10 to-transparent"
        )}
      >
        <div
          className={cn(
            "pointer-events-auto w-full",
            initialRoleCreation && "-translate-y-[7svh]"
          )}
        >
          {initialRoleCreation ? (
            <p className="mx-auto mb-5 max-w-[760px] px-5 text-center text-xl font-normal leading-7 text-neutral-primary">
              안녕하세요. 새롭게 채용을 원하는 역할에 대해 알려주세요.
              <br />
              JD 링크 혹은 파일로 시작하거나, 편하게 설명해주셔도 좋습니다.
            </p>
          ) : null}
          <OrgAgentComposer
            allowAttachments={purpose === "role-creation"}
            autoFocus={autoFocus}
            compactWidth={initialRoleCreation}
            disabled={!workspaceId}
            isStreaming={chat.isStreaming}
            model={model}
            onModelChange={handleModelChange}
            onSend={({ attachments, mentions, message }) => {
              setStickToBottom(true);
              return chat.sendMessage({
                attachments,
                draftRoleId:
                  initialRoleCreation && typeof crypto !== "undefined"
                    ? crypto.randomUUID()
                    : null,
                mentions,
                message,
                model,
              });
            }}
            roleId={roleId}
            showModelSelector={showModelSelector}
            workspaceId={workspaceId}
          />
        </div>
      </div>
    </section>
  );
}
