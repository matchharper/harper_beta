import {
  ArrowUp,
  CalendarClock,
  Check,
  ChevronUp,
  Info,
  LoaderCircle,
  SquarePen,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button, IconButton } from "@/components/ui/button";
import {
  DEFAULT_ORG_AGENT_MODEL,
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_GROK_MODEL,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import type {
  OrgAgentMention,
  OrgAgentMentionCandidate,
  OrgAgentMessage,
  OrgAgentMessageAction,
} from "@/lib/org/agent/types";
import {
  useOrgAgentChat,
  useOrgAgentMentionCandidates,
  useOrgAgentMessageHistory,
  useSendOrgAgentMeetingRequest,
} from "@/hooks/org/useOrgAgent";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { cn } from "@/lib/utils";

function parseDate(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateKey(createdAt: string) {
  const date = parseDate(createdAt);
  if (!date) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateLabel(createdAt: string) {
  const date = parseDate(createdAt);
  if (!date) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "long",
    weekday: "short",
    year: "numeric",
  }).format(date);
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeDraftWithMentions(
  draft: string,
  mentions: OrgAgentMention[]
) {
  let output = draft;
  const remaining = mentions.filter((mention) =>
    output.includes(`@${mention.displayName}`)
  );
  for (const mention of remaining) {
    const pattern = new RegExp(`@${escapeRegExp(mention.displayName)}\\b`);
    output = output.replace(
      pattern,
      `@[${mention.displayName}](talent:${mention.talentId})`
    );
  }
  return {
    mentions: remaining,
    text: output.trim(),
  };
}

function getMentionSearch(value: string, cursor: number) {
  const prefix = value.slice(0, cursor);
  const atIndex = prefix.lastIndexOf("@");
  if (atIndex < 0) return null;
  const afterAt = prefix.slice(atIndex + 1);
  if (afterAt.includes("\n") || afterAt.includes("  ")) return null;
  return {
    query: afterAt.trim(),
    start: atIndex,
  };
}

function getPreviousMessageDateKey(
  messages: OrgAgentMessage[],
  currentIndex: number
) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const dateKey = getDateKey(messages[index].createdAt);
    if (dateKey) return dateKey;
  }
  return "";
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-full bg-bg-basement px-2.5 py-1 text-[11px] font-light text-neutral-muted">
        {label}
      </span>
    </div>
  );
}

function MentionText({
  content,
  inverse,
}: {
  content: string;
  inverse?: boolean;
}) {
  const regex = /@\[([^\]]+)\]\(talent:([^)]+)\)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }
    nodes.push(
      <span
        key={`${match[2]}-${match.index}`}
        className="inline-flex max-w-full align-baseline"
        title={`talentId: ${match[2]}`}
      >
        <span
          className={cn(
            "mx-0.5 rounded-md px-1.5 py-0.5 font-medium",
            inverse
              ? "bg-neutral-00/15 text-neutral-00"
              : "bg-neutral-1000-a05 text-neutral-primary"
          )}
        >
          @{match[1]}
        </span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return <>{nodes}</>;
}

function MessageActionView({
  action,
  message,
  roleId,
  workspaceId,
}: {
  action: OrgAgentMessageAction;
  message: OrgAgentMessage;
  roleId?: string | null;
  workspaceId: string;
}) {
  const meetingRequest = useSendOrgAgentMeetingRequest();

  if (action.kind === "entity_updated" || action.kind === "request_updated") {
    return (
      <div className="inline-flex items-center gap-1.5 text-[12px] text-positive">
        <Check className="h-3.5 w-3.5" />
        {action.label}
      </div>
    );
  }

  const sent = action.status === "sent" || meetingRequest.isSuccess;
  return (
    <div className="mt-3">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!roleId || sent || meetingRequest.isPending}
        onClick={() => {
          if (!roleId) return;
          meetingRequest.mutate({
            actionId: action.id,
            messageId: message.id,
            reason: action.payload.reason ?? null,
            roleId,
            topic: action.payload.topic,
            workspaceId,
          });
        }}
      >
        {meetingRequest.isPending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : sent ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <CalendarClock className="h-3.5 w-3.5" />
        )}
        {sent ? "요청 보냄" : action.label}
      </Button>
    </div>
  );
}

function MessageBubble({
  message,
  roleId,
  workspaceId,
}: {
  message: OrgAgentMessage;
  roleId?: string | null;
  workspaceId: string;
}) {
  const isUser = message.role === "user";
  const actions = message.metadata.actions ?? [];
  const toolResultActions = actions.filter(
    (action) =>
      action.kind === "entity_updated" || action.kind === "request_updated"
  );
  const followUpActions = actions.filter(
    (action) =>
      action.kind !== "entity_updated" && action.kind !== "request_updated"
  );

  return (
    <div className="space-y-0">
      {!isUser && (
        <ThinkingPanel
          logs={message.thinkingLogs}
          showResponseCompletion={
            (message.metadata.toolResults?.length ?? 0) > 0
          }
        />
      )}
      {!isUser &&
        toolResultActions.map((action) => (
          <MessageActionView
            key={action.id}
            action={action}
            message={message}
            roleId={roleId}
            workspaceId={workspaceId}
          />
        ))}
      <div
        className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}
      >
        <div
          className={cn(
            "leading-[23px] font-normal mb-2",
            isUser
              ? "max-w-[82%] rounded-lg bg-neutral-200 px-3 py-1.5 text-neutral-1000"
              : "max-w-[98%] text-neutral-primary py-1",
            message.status === "failed" &&
              "border-critical/20 bg-critical-faded"
          )}
        >
          <div className="whitespace-pre-wrap break-words">
            <MentionText content={message.content} inverse={isUser} />
          </div>
          {followUpActions.map((action) => (
            <MessageActionView
              key={action.id}
              action={action}
              message={message}
              roleId={roleId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MentionMenu({
  candidates,
  highlightedIndex,
  isLoading,
  onSelect,
}: {
  candidates: OrgAgentMentionCandidate[];
  highlightedIndex: number;
  isLoading: boolean;
  onSelect: (candidate: OrgAgentMentionCandidate) => void;
}) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-lg border border-neutral-1000-a10 bg-bg-floating shadow-xl">
      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-neutral-muted">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          후보자 불러오는 중
        </div>
      ) : candidates.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-neutral-muted">
          이 역할 pipeline에서 찾지 못했습니다.
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto py-1">
          {candidates.map((candidate, index) => (
            <button
              key={`${candidate.talentId}:${candidate.recommendationId}`}
              type="button"
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition",
                index === highlightedIndex
                  ? "bg-bg-weak text-neutral-primary"
                  : "text-neutral-primary hover:bg-bg-weak"
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(candidate);
              }}
            >
              <span className="text-[13px] font-medium">{candidate.label}</span>
              <span className="line-clamp-1 text-[11px] text-neutral-muted">
                {candidate.subtitle}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelSelector({
  model,
  onChange,
  visible,
}: {
  model: OrgAgentModelId;
  onChange: (model: OrgAgentModelId) => void;
  visible: boolean;
}) {
  const options: Array<{ id: OrgAgentModelId; label: string }> = [
    { id: ORG_AGENT_CLAUDE_MODEL, label: "Claude" },
    { id: ORG_AGENT_GROK_MODEL, label: "Grok" },
  ];

  if (!visible) return null;
  return (
    <div className="flex items-center rounded-md border border-neutral-1000-a05 bg-bg-default p-0.5">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            "rounded px-2 py-1 text-[11px] transition",
            model === item.id
              ? "bg-neutral-1000 text-neutral-00"
              : "text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary"
          )}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Composer({
  disabled,
  isStreaming,
  model,
  onModelChange,
  onSend,
  showModelSelector,
  workspaceId,
}: {
  disabled?: boolean;
  isStreaming: boolean;
  model: OrgAgentModelId;
  onModelChange: (model: OrgAgentModelId) => void;
  onSend: (args: { mentions: OrgAgentMention[]; message: string }) => void;
  showModelSelector: boolean;
  workspaceId: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSpaceAtRef = useRef<number>(0);
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<OrgAgentMention[]>([]);
  const [mentionSearch, setMentionSearch] = useState<{
    query: string;
    start: number;
  } | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const mentionQuery = mentionSearch?.query ?? "";
  const mentionCandidates = useOrgAgentMentionCandidates({
    enabled: Boolean(mentionSearch && workspaceId),
    query: mentionQuery,
    workspaceId,
  });

  const candidates = mentionCandidates.data ?? [];

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";

    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const paddingHeight =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom);
    const borderHeight =
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * 4 + paddingHeight + borderHeight;
    const contentHeight = textarea.scrollHeight + borderHeight;

    textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

  const updateMentionSearch = useCallback((value: string) => {
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const search = getMentionSearch(value, cursor);
    setMentionSearch(search);
    setHighlightedIndex(0);
  }, []);

  const handleChange = (value: string) => {
    setDraft(value);
    updateMentionSearch(value);
  };

  const handleSelectMention = (candidate: OrgAgentMentionCandidate) => {
    if (!mentionSearch) return;
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? draft.length;
    const before = draft.slice(0, mentionSearch.start);
    const after = draft.slice(cursor);
    const insertion = `@${candidate.label}`;
    const nextDraft = `${before}${insertion}${after}`;
    setDraft(nextDraft);
    setMentions((current) => [
      ...current.filter((mention) => mention.talentId !== candidate.talentId),
      {
        displayName: candidate.label,
        recommendationId: candidate.recommendationId,
        roleId: candidate.roleId,
        talentId: candidate.talentId,
      },
    ]);
    setMentionSearch(null);
    requestAnimationFrame(() => {
      textarea?.focus();
      const nextCursor = before.length + insertion.length;
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = event.nativeEvent.isComposing;

    if (mentionSearch) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionSearch(null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((index) =>
          candidates.length ? (index + 1) % candidates.length : 0
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((index) =>
          candidates.length
            ? (index - 1 + candidates.length) % candidates.length
            : 0
        );
        return;
      }
      if (
        event.key === "Enter" &&
        !isComposing &&
        candidates[highlightedIndex]
      ) {
        event.preventDefault();
        handleSelectMention(candidates[highlightedIndex]);
        return;
      }
      if (event.key === " ") {
        const now = event.timeStamp;
        if (lastSpaceAtRef.current > 0 && now - lastSpaceAtRef.current < 650) {
          setMentionSearch(null);
        }
        lastSpaceAtRef.current = now;
      }
    }

    if (event.key === "Enter" && !event.shiftKey && !isComposing) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const serialized = serializeDraftWithMentions(draft, mentions);
    if (!serialized.text || disabled || isStreaming) return;
    onSend({ mentions: serialized.mentions, message: serialized.text });
    setDraft("");
    setMentions([]);
    setMentionSearch(null);
  };

  return (
    <form
      className="absolute bottom-0 left- w-full bg-linear-to-b to-50% from-bg-floating/0 to-bg-floating px-2 pb-2"
      onSubmit={handleSubmit}
    >
      <div className="relative flex items-end">
        {mentionSearch && (
          <MentionMenu
            candidates={candidates}
            highlightedIndex={highlightedIndex}
            isLoading={mentionCandidates.isLoading}
            onSelect={handleSelectMention}
          />
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          autoFocus
          disabled={disabled || isStreaming}
          className="w-full resize-none overflow-y-hidden rounded-3xl border border-black/5 bg-bg-default px-3.5 py-[13px] pr-12 text-[13px] font-normal leading-5 text-neutral-primary shadow-[0_0_24px_4px_rgb(0_0_0_/_0.05)] outline-none transition placeholder:text-neutral-placeholder focus:border-black/10 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="원하는 조건 혹은 요구사항을 알려주세요."
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <IconButton
          type="submit"
          aria-label="메시지 보내기"
          variant="secondary"
          className="absolute bg-primary text-white bottom-[8px] right-[8px] h-8 w-8 rounded-2xl hover:bg-primary/80"
          disabled={disabled || isStreaming || !draft.trim()}
          icon={<ArrowUp className="h-4 w-4" />}
        />
      </div>
      {showModelSelector && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <ModelSelector
            model={model}
            onChange={onModelChange}
            visible={showModelSelector}
          />
        </div>
      )}
    </form>
  );
}

function StreamingBubble({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex max-w-[82%] py-2 leading-5 text-neutral-primary">
      <div className="whitespace-pre-wrap break-words">{text}</div>
    </div>
  );
}

function ThinkingPanel({
  logs,
  showResponseCompletion = true,
}: {
  logs: Array<{ label: string; status?: string }>;
  showResponseCompletion?: boolean;
}) {
  if (logs.length === 0) return null;
  const latest = logs[logs.length - 1];
  if (latest.label.includes("응답 생성 완료") && !showResponseCompletion) {
    return null;
  }
  const label = latest.label.includes("응답 생성 완료")
    ? "응답 생성 완료"
    : latest.label.includes("응답 생성 중")
      ? "응답 생성 중"
      : latest.label;
  return (
    <div className="flex items-center gap-2 px-0 py-0.5 text-[12px] text-neutral-muted">
      {latest.status === "running" ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : latest.status === "error" ? (
        <X className="h-3.5 w-3.5" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}

export function OrgAgentPanel() {
  const { currentUserEmail, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const [open, setOpen] = useState(false);
  const history = useOrgAgentMessageHistory({
    enabled: Boolean(open && workspaceId),
    workspaceId,
  });
  const chat = useOrgAgentChat({
    appendMessagesToCache: history.appendMessagesToCache,
    workspaceId,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [model, setModel] = useState<OrgAgentModelId>(DEFAULT_ORG_AGENT_MODEL);

  const handleModelChange = (nextModel: OrgAgentModelId) => {
    setModel(nextModel);
  };

  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [
    history.messages.length,
    chat.optimisticUserMessage?.id,
    chat.streamingText,
    chat.thinkingLogs.length,
    open,
  ]);

  const showModelSelector =
    currentUserEmail?.toLowerCase().endsWith("@matchharper.com") ||
    process.env.NEXT_PUBLIC_ORG_AGENT_MODEL_SELECTOR_ENABLED === "true";
  const lastHistoryMessage = history.messages.at(-1);
  const showOptimisticDateDivider = Boolean(
    chat.optimisticUserMessage &&
    getDateKey(chat.optimisticUserMessage.createdAt) !==
      getDateKey(lastHistoryMessage?.createdAt ?? "")
  );

  const iconBtn =
    "flex h-7 w-7 items-center justify-center rounded-[10px] text-neutral-primary transition hover:bg-bg-weak";

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-40 flex justify-end sm:bottom-5 sm:left-auto sm:right-5">
      {open ? (
        <aside className="pointer-events-auto flex h-[calc(100vh-96px)] max-h-[760px] w-[calc(100vw-32px)] max-w-[520px] overflow-hidden rounded-4xl border border-black/5 bg-bg-default shadow-xl shadow-gray-200">
          <div className="flex min-w-0 flex-1 flex-col relative">
            <header className="absolute top-0 left-0 w-full flex items-center justify-between gap-3 px-2.5 pt-2.5 pb-6 bg-linear-to-b from-70% from-bg-floating to-bg-floating/0">
              <div className="flex items-center gap-2 text-[13px] py-0.5 font-normal text-black truncate pl-1">
                Harper{" "}
                <span className="text-primary">@ {workspace.companyName}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <div className="group relative">
                  <button
                    type="button"
                    aria-describedby="org-agent-info-tooltip"
                    aria-label="채팅 안내"
                    className={iconBtn}
                  >
                    <Info className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                  <div
                    id="org-agent-info-tooltip"
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-[300px] max-w-[calc(100vw-64px)] translate-y-1 rounded-lg border border-neutral-1000-a10 bg-neutral-1000 px-3.5 py-3 text-[12px] leading-4 text-neutral-00 opacity-0 shadow-xl transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
                  >
                    <div className="absolute -top-1.5 right-2.5 h-3 w-3 rotate-45 border-l border-t border-neutral-1000-a10 bg-neutral-1000" />
                    <div className="relative space-y-2">
                      <p>회사 전체 채용 정보를 읽고 다루는 채팅입니다.</p>
                      <p>
                        포지션이나 후보자를 이름으로 말하면 Harper가 대상을
                        찾습니다. 여러 포지션이 모호하게 겹치면 먼저 확인합니다.
                      </p>
                      <p>
                        @로 특정 후보자를 지정해 해당 후보자 연결의 좋은 점과
                        아쉬운 점을 설명할 수 있습니다.
                      </p>
                      <p>
                        수락, 거절, 단계 이동은 후보자 프로필에서 직접 처리해야
                        합니다.
                      </p>
                      <p>
                        회사·포지션 정보와 채용 기준 변경도 요청할 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="채팅 닫기"
                  className={iconBtn}
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto bg-bg-default px-4 pb-24 pt-12 text-[14px] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10"
              onScroll={(event) => {
                const node = event.currentTarget;
                if (
                  node.scrollTop < 80 &&
                  history.hasOlderMessages &&
                  !history.loadingOlderMessages
                ) {
                  void history.loadOlderMessages();
                }
              }}
            >
              {history.hasOlderMessages && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={history.loadingOlderMessages}
                    onClick={() => void history.loadOlderMessages()}
                  >
                    {history.loadingOlderMessages ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5" />
                    )}
                    이전 대화
                  </Button>
                </div>
              )}

              {history.isLoading ? (
                <div className="flex items-center justify-center py-12 text-neutral-muted">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  대화 불러오는 중
                </div>
              ) : history.messages.length === 0 &&
                !chat.optimisticUserMessage ? (
                <div className="flex min-h-[260px] items-center justify-center px-8">
                  <p className="max-w-[320px] text-center leading-5 text-neutral-muted">
                    후보자나 포지션을 찾아보거나, 회사·채용 정보를
                    <br />
                    확인하고 변경할 내용을 알려주세요.
                  </p>
                </div>
              ) : (
                history.messages.map((message, index) => {
                  const dateKey = getDateKey(message.createdAt);
                  const previousDateKey = getPreviousMessageDateKey(
                    history.messages,
                    index
                  );
                  return (
                    <div key={message.id} className="space-y-3">
                      {dateKey && dateKey !== previousDateKey && (
                        <DateDivider
                          label={formatDateLabel(message.createdAt)}
                        />
                      )}
                      <MessageBubble
                        message={message}
                        workspaceId={workspaceId}
                      />
                    </div>
                  );
                })
              )}
              {chat.optimisticUserMessage && (
                <div className="space-y-3">
                  {showOptimisticDateDivider && (
                    <DateDivider
                      label={formatDateLabel(
                        chat.optimisticUserMessage.createdAt
                      )}
                    />
                  )}
                  <MessageBubble
                    message={chat.optimisticUserMessage}
                    workspaceId={workspaceId}
                  />
                </div>
              )}
              <ThinkingPanel logs={chat.thinkingLogs} />
              <StreamingBubble text={chat.streamingText} />
              {chat.error && (
                <div className="rounded-md bg-critical-faded px-3 py-2 text-[12px] text-critical">
                  {chat.error}
                </div>
              )}
            </div>

            <Composer
              disabled={!workspaceId}
              isStreaming={chat.isStreaming}
              model={model}
              onModelChange={handleModelChange}
              onSend={({ mentions, message }) => {
                void chat.sendMessage({ mentions, message, model });
              }}
              showModelSelector={showModelSelector}
              workspaceId={workspaceId}
            />
          </div>
        </aside>
      ) : (
        <div className="pointer-events-auto flex flex-col items-end gap-3">
          <button
            type="button"
            aria-label="채팅 열기"
            className="group flex h-15 w-15 items-center justify-center rounded-full bg-primary text-neutral-00 shadow-sm ring-2 ring-neutral-00/10 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
            onClick={() => setOpen(true)}
          >
            <SquarePen className="h-6 w-6" strokeWidth={1.6} />
          </button>
        </div>
      )}
    </div>
  );
}
