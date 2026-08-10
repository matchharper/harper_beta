import { CalendarClock, Check, FileText, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { ChatThinkingLogPanel } from "@/components/chat/ChatThinkingLogPanel";
import {
  CHAT_ASSISTANT_CONTENT_INHERIT_CLASS,
  ChatAssistantContent,
  ChatAssistantLabel,
  ChatAssistantPending,
  ChatChoiceList,
  ChatDateDivider,
  ChatMessageBubbleFrame,
} from "@/components/chat/ChatTimeline";
import { Button } from "@/components/ui/button";
import { useSendOrgAgentMeetingRequest } from "@/hooks/org/useOrgAgent";
import { splitOrgAgentMentionText } from "@/lib/org/agent/mentionText";
import { formatOrgChatMessageTime } from "@/lib/org/agent/messagePresentation";
import { renderOrgAgentWebLinks } from "@/lib/org/agent/navigationMarkdown";
import type {
  OrgAgentMessage,
  OrgAgentMessageAction,
} from "@/lib/org/agent/types";
import { cn } from "@/lib/utils";
import { getHarperOwnedUrlRoute } from "@/lib/urlDisplay";

function parseDate(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
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

export function OrgAgentDateDivider({ createdAt }: { createdAt: string }) {
  const label = formatDateLabel(createdAt);
  return (
    <ChatDateDivider
      ariaLabel={`대화 날짜 ${label}`}
      className="text-[13px] leading-[1.55]"
      label={label}
    />
  );
}

function OrgAssistantLabel() {
  return (
    <ChatAssistantLabel>
      <div className="mt-2 mb-1 flex items-center gap-1.5 text-[12px] text-neutral-800 font-light">
        <Image
          alt="Harper"
          className="rounded-full"
          height={18}
          src="/images/squareface.png"
          width={18}
        />
        Harper
      </div>
    </ChatAssistantLabel>
  );
}

function MentionText({ content }: { content: string }) {
  return (
    <>
      {splitOrgAgentMentionText(content).map((segment, index) =>
        segment.kind === "mention" ? (
          <span
            key={`${segment.talentId}:${index}`}
            className="font-medium text-link"
          >
            {segment.text}
          </span>
        ) : (
          <span key={`text:${index}`}>{segment.text}</span>
        )
      )}
    </>
  );
}

function OrgAssistantContent({
  content,
  workspaceId,
}: {
  content: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const markdown = renderOrgAgentWebLinks({ markdown: content, workspaceId });

  return (
    <ChatAssistantContent
      className={CHAT_ASSISTANT_CONTENT_INHERIT_CLASS}
      content={markdown}
      onHarperLinkClick={(href) => {
        const route = getHarperOwnedUrlRoute(href);
        if (route) void router.push(route);
      }}
    />
  );
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

export function OrgAgentMessageBubble({
  assistantContentOverride,
  authorName,
  choicePending,
  currentUserId,
  message,
  onRoleCreationChoice,
  roleId,
  showUserAttribution = false,
  workspaceId,
}: {
  assistantContentOverride?: string;
  authorName?: string | null;
  choicePending?: boolean;
  currentUserId?: string | null;
  message: OrgAgentMessage;
  onRoleCreationChoice?: (args: {
    actionId: string;
    decision: "no" | "yes";
    messageId: number;
  }) => void;
  roleId?: string | null;
  showUserAttribution?: boolean;
  workspaceId: string;
}) {
  const isUser = message.role === "user";
  const isOwnUserMessage =
    isUser &&
    (!showUserAttribution ||
      !message.authorUserId ||
      message.authorUserId === currentUserId);
  const messageTime = formatOrgChatMessageTime(message.createdAt);
  const actions = message.metadata.actions ?? [];
  const toolResultActions = actions.filter(
    (action) =>
      action.kind === "entity_updated" || action.kind === "request_updated"
  );
  const followUpActions = actions.filter(
    (action) =>
      action.kind !== "entity_updated" && action.kind !== "request_updated"
  );
  const roleChoices = message.metadata.roleCreation?.choices ?? [];

  return (
    <div className="space-y-0">
      {!isUser && (
        <ChatThinkingLogPanel
          logs={message.thinkingLogs.map((log) => log.label)}
          typographyClassName="text-[13px] leading-[1.65]"
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
      {!isUser ? <OrgAssistantLabel /> : null}
      {isUser && showUserAttribution ? (
        <div
          className={cn(
            "mb-1 flex items-center gap-1.5 px-1 text-[11px] leading-4",
            isOwnUserMessage ? "justify-end" : "justify-start"
          )}
        >
          <span className="font-medium text-neutral-muted">
            {authorName || (isOwnUserMessage ? "나" : "워크스페이스 멤버")}
          </span>
          {messageTime ? (
            <time
              className="font-normal tabular-nums text-neutral-soft"
              dateTime={message.createdAt}
            >
              {messageTime}
            </time>
          ) : null}
        </div>
      ) : null}
      <ChatMessageBubbleFrame
        className={cn(
          "mb-2",
          showUserAttribution &&
            isOwnUserMessage &&
            "border border-neutral-800",
          showUserAttribution &&
            isUser &&
            !isOwnUserMessage &&
            "max-w-[min(820px,92%)] rounded-[14px] border border-neutral-1000-a10 bg-bg-floating px-3 py-1.5 text-neutral-primary",
          message.status === "failed" &&
            "border border-critical/20 bg-critical-faded"
        )}
        isUser={isOwnUserMessage}
        typographyClassName="text-[15px] leading-[1.72] md:text-[14px] md:leading-[1.8]"
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">
            <MentionText content={message.content} />
          </div>
        ) : (
          <OrgAssistantContent
            content={assistantContentOverride ?? message.content}
            workspaceId={workspaceId}
          />
        )}
        {(message.metadata.attachments ?? []).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(message.metadata.attachments ?? []).map((attachment, index) => (
              <span
                key={`${attachment.name}:${index}`}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]",
                  isOwnUserMessage
                    ? "bg-neutral-00/15 text-neutral-00"
                    : "bg-bg-weak text-neutral-muted"
                )}
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{attachment.name}</span>
              </span>
            ))}
          </div>
        ) : null}
        {roleChoices.length > 0 ? (
          <ChatChoiceList
            choices={roleChoices.map((choice) => ({
              label: choice.label,
              value: choice.value,
            }))}
            disabled={
              choicePending ||
              roleChoices.every((choice) => choice.status !== "pending")
            }
            keyPrefix={`role-confirmation-${message.id}`}
            onSelect={(choice) => {
              const source = roleChoices.find(
                (item) =>
                  item.value === choice.value && item.status === "pending"
              );
              if (!source || !onRoleCreationChoice) return;
              onRoleCreationChoice({
                actionId: source.actionId,
                decision: source.value,
                messageId: message.id,
              });
            }}
            typographyClassName="text-[13px] leading-[1.55]"
          />
        ) : null}
        {followUpActions.map((action) => (
          <MessageActionView
            key={action.id}
            action={action}
            message={message}
            roleId={roleId}
            workspaceId={workspaceId}
          />
        ))}
      </ChatMessageBubbleFrame>
    </div>
  );
}

export function OrgAgentStreamingBubble({
  text,
  workspaceId,
}: {
  text: string;
  workspaceId: string;
}) {
  if (!text) return null;
  return (
    <div className="flex flex-col gap-2">
      <OrgAssistantLabel />
      <ChatMessageBubbleFrame
        isUser={false}
        typographyClassName="text-[15px] leading-[1.72] md:text-[14px] md:leading-[1.8]"
      >
        <OrgAssistantContent content={text} workspaceId={workspaceId} />
      </ChatMessageBubbleFrame>
    </div>
  );
}

export function OrgAgentPendingBubble() {
  return (
    <div className="flex flex-col gap-2">
      <OrgAssistantLabel />
      <ChatMessageBubbleFrame
        isUser={false}
        typographyClassName="text-[15px] leading-[1.72] md:text-[14px] md:leading-[1.8]"
      >
        <ChatAssistantPending
          className="text-[13px] leading-[1.55]"
          label="작성 중..."
        />
      </ChatMessageBubbleFrame>
    </div>
  );
}
