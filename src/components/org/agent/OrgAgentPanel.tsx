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
import {
  ORG_ROLE_QUICK_ACTION_IDLE_MS,
  ORG_ROLE_QUICK_ACTIONS,
  shouldShowOrgRoleQuickActions,
} from "@/lib/org/roleQuickActions";
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
          <p>
            후보자와 역할을 찾고, 회사 정보와 채용 기준을 확인하거나 바꿀 수
            있어요. 후보자는 이름이나 @로 지정해 주세요.
          </p>
          <p>
            외부 연락과 중요한 상태 변경은 대상과 결과를 설명한 뒤 확인받아요.
          </p>
        </div>
      </div>
    </div>
  );
}

export function OrgAgentChatSurface({
  autoFocus = true,
  className,
  onClose,
  onCompanyInfoClick,
  onRoleCreated,
  purpose = "general",
  readOnly = false,
  roleId,
  header = null,
}: {
  autoFocus?: boolean;
  className?: string;
  onClose?: () => void;
  onCompanyInfoClick?: () => void;
  onRoleCreated?: (roleId: string) => void;
  purpose?: "general" | "role" | "role-creation";
  readOnly?: boolean;
  roleId?: string | null;
  header?: ReactNode;
}) {
  const { bootstrap, currentUser, user, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const mode =
    purpose === "role-creation"
      ? "role_creation"
      : purpose === "role"
        ? "role"
        : "general";
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
  const [quickActionClock, setQuickActionClock] = useState(0);
  const [completionReveal, setCompletionReveal] = useState<{
    content: string;
    messageId: number;
    revealedSentenceCount: number;
  } | null>(null);
  const completionRevealChunks = completionReveal
    ? splitRoleCreationCompletionSentences(completionReveal.content)
    : [];
  const latestUserMessageAt =
    chat.optimisticUserMessage?.createdAt ??
    history.latestUserMessageAt ??
    history.messages.findLast((message) => message.role === "user")
      ?.createdAt ??
    null;
  const showRoleQuickActions = Boolean(
    purpose === "role" &&
    roleId &&
    !readOnly &&
    !history.isLoading &&
    shouldShowOrgRoleQuickActions({
      isStreaming: chat.isStreaming,
      latestUserMessageAt,
      now: quickActionClock,
    })
  );

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

  useEffect(() => {
    const now = Date.now();
    const sentAt = Date.parse(latestUserMessageAt ?? "");
    if (!Number.isFinite(sentAt)) return;
    const delay = sentAt + ORG_ROLE_QUICK_ACTION_IDLE_MS - now;
    const timer = window.setTimeout(
      () => setQuickActionClock(Date.now()),
      Math.max(0, Math.min(delay + 50, ORG_ROLE_QUICK_ACTION_IDLE_MS))
    );
    return () => window.clearTimeout(timer);
  }, [latestUserMessageAt]);

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
              <p className="max-w-[320px] text-center leading-5 text-neutral-muted text-base text-normal">
                역할이나 후보자에 대해 물어보거나 원하시는 사항을 요청해주세요.
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
                    choicePending={readOnly || confirmRoleCreation.isPending}
                    currentUserId={user.id}
                    message={message}
                    onCompanyInfoClick={onCompanyInfoClick}
                    onRoleCreationChoice={
                      readOnly
                        ? undefined
                        : ({ actionId, decision, messageId }) => {
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
                                  if (
                                    result.completed &&
                                    result.assistantMessage
                                  ) {
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
                          }
                    }
                    readOnly={readOnly}
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
                onCompanyInfoClick={onCompanyInfoClick}
                readOnly={readOnly}
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
            onCompanyInfoClick={onCompanyInfoClick}
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
          {showRoleQuickActions ? (
            <div className="mx-auto mb-3 flex w-full max-w-[1120px] flex-wrap gap-2 px-4 pt-2 md:px-5 md:pt-0">
              {ORG_ROLE_QUICK_ACTIONS.map((action) => (
                <MuteButton
                  className="border-white bg-white text-black shadow-sm hover:border-white hover:bg-white/90 active:border-white active:bg-white/80"
                  key={action.id}
                  onClick={() => {
                    setStickToBottom(true);
                    void chat.sendMessage({
                      attachments: [],
                      mentions: [],
                      message: action.message,
                      model,
                    });
                  }}
                  size="sm"
                  type="button"
                  variant="default"
                >
                  {action.label}
                </MuteButton>
              ))}
            </div>
          ) : null}
          <OrgAgentComposer
            allowAttachments
            autoFocus={autoFocus}
            compactWidth={initialRoleCreation}
            disabled={readOnly || !workspaceId}
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
            workspaceId={workspaceId}
          />
        </div>
      </div>
    </section>
  );
}
