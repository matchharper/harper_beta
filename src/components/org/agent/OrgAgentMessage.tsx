import {
  Building2,
  CalendarClock,
  Check,
  FileText,
  LoaderCircle,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { ChatThinkingLogPanel } from "@/components/chat/ChatThinkingLogPanel";
import { ChatMessageAttachmentList } from "@/components/chat/ChatMessageAttachmentList";
import {
  CHAT_ASSISTANT_CONTENT_INHERIT_CLASS,
  ChatAssistantContent,
  ChatAssistantLabel,
  ChatAssistantPending,
  ChatChoiceList,
  ChatDateDivider,
  ChatMessageBubbleFrame,
} from "@/components/chat/ChatTimeline";
import { CardButton, MuteButton } from "@/components/ui/button";
import { useSendOrgAgentMeetingRequest } from "@/hooks/org/useOrgAgent";
import { splitOrgAgentMentionText } from "@/lib/org/agent/mentionText";
import { formatOrgChatMessageTime } from "@/lib/org/agent/messagePresentation";
import { splitOrgAgentCompanyInfoMarker } from "@/lib/org/agent/companyInfoMarker";
import {
  convertSlackMrkdwnToWebMarkdown,
  renderOrgAgentWebLinks,
} from "@/lib/org/agent/navigationMarkdown";
import type {
  OrgAgentMessage,
  OrgAgentMessageAction,
} from "@/lib/org/agent/types";
import { parseHarperSlackChoiceMarkers } from "@/lib/org/slackChoiceButtons";
import { stripSlackSentUsingAttribution } from "@/lib/org/slackMessageText";
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

function OrgAssistantLabel({ fromSlack = false }: { fromSlack?: boolean }) {
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
        {fromSlack ? (
          <Image
            alt="Slack"
            className="size-3 shrink-0"
            height={12}
            src="/images/logos/slack.svg"
            width={12}
          />
        ) : null}
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

function OrgCompanyInfoCard({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <CardButton
      aria-label="역할 설명에 반영한 회사 정보 열기"
      className={cn(
        "w-fit min-w-[min(360px,100%)] rounded-lg border-black/5 items-center gap-3 px-3 pr-6 py-4 mb-2 font-normal hover:bg-neutral-100 hover:border-black/5",
        className
      )}
      onClick={onClick}
    >
      <span className="flex size-10 bg-black/4 shrink-0 items-center justify-center rounded-md text-black/70">
        <Building2 aria-hidden className="size-4.5" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-black font-medium">
          회사 정보
        </span>
        <span className="block text-[13px] leading-4 text-black/50">
          현재 후보자에게 소개되는 회사 정보를 확인해 보세요.
        </span>
      </span>
    </CardButton>
  );
}

function OrgAssistantContent({
  content,
  fromSlack = false,
  onCompanyInfoClick,
  workspaceId,
}: {
  content: string;
  fromSlack?: boolean;
  onCompanyInfoClick?: () => void;
  workspaceId: string;
}) {
  const router = useRouter();
  const visibleContent = fromSlack
    ? parseHarperSlackChoiceMarkers(stripSlackSentUsingAttribution(content))
        .text
    : content;
  const companyInfoSegments = splitOrgAgentCompanyInfoMarker(visibleContent);
  const handleCompanyInfoClick = () => {
    if (onCompanyInfoClick) {
      onCompanyInfoClick();
      return;
    }
    void router.push({
      pathname: "/org/team",
      query: { orgId: workspaceId },
    });
  };

  return (
    <>
      {companyInfoSegments.map((segment, index) => {
        if (segment.kind === "company_info") {
          return (
            <OrgCompanyInfoCard
              className={index > 0 ? "mt-3" : undefined}
              key={`company-info:${index}`}
              onClick={handleCompanyInfoClick}
            />
          );
        }

        const markdown = renderOrgAgentWebLinks({
          markdown: fromSlack
            ? convertSlackMrkdwnToWebMarkdown(segment.text)
            : segment.text,
          workspaceId,
        });
        return (
          <ChatAssistantContent
            className={cn(
              CHAT_ASSISTANT_CONTENT_INHERIT_CLASS,
              index > 0 && "mt-3"
            )}
            content={markdown}
            key={`text:${index}`}
            onHarperLinkClick={(href) => {
              const route = getHarperOwnedUrlRoute(href);
              if (route) void router.push(route);
            }}
          />
        );
      })}
    </>
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
      <MuteButton
        type="button"
        size="sm"
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
      </MuteButton>
    </div>
  );
}

export function OrgAgentMessageBubble({
  assistantContentOverride,
  authorName,
  choicePending,
  currentUserId,
  message,
  onCompanyInfoClick,
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
  onCompanyInfoClick?: () => void;
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
  const fromSlack = message.sourceSurface === "slack";
  const visibleMessageContent = fromSlack
    ? stripSlackSentUsingAttribution(message.content)
    : message.content;
  const isOwnUserMessage =
    isUser &&
    (!showUserAttribution ||
      message.authorUserId === currentUserId ||
      (!message.authorUserId && !fromSlack));
  const messageTime = formatOrgChatMessageTime(message.createdAt);
  const actions = message.metadata.actions ?? [];
  const toolResultActions = actions
    .filter(
      (action) =>
        action.kind === "entity_updated" || action.kind === "request_updated"
    )
    .filter(
      (action, index, items) =>
        items.findIndex(
          (candidate) =>
            candidate.kind === action.kind && candidate.label === action.label
        ) === index
    );
  const followUpActions = actions.filter(
    (action) =>
      action.kind !== "entity_updated" && action.kind !== "request_updated"
  );
  const roleChoices = message.metadata.roleCreation?.choices ?? [];
  const attachments = message.metadata.attachments ?? [];

  return (
    <div className="space-y-0">
      {!isUser && (
        <ChatThinkingLogPanel
          logs={message.thinkingLogs}
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
      {!isUser ? <OrgAssistantLabel fromSlack={fromSlack} /> : null}
      {isUser && showUserAttribution ? (
        <div
          className={cn(
            "mb-1 flex items-center gap-1.5 px-1 text-[11px] leading-4",
            isOwnUserMessage ? "justify-end" : "justify-start"
          )}
        >
          <span className="font-medium text-neutral-muted">
            {authorName || (isOwnUserMessage ? "나" : "워크스페이스 멤버")}
            {fromSlack ? (
              <Image
                alt="Slack"
                className="ml-1 inline-block size-3 align-[-2px]"
                height={12}
                src="/images/logos/slack.svg"
                width={12}
              />
            ) : null}
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
      {isUser && attachments.length > 0 ? (
        <ChatMessageAttachmentList
          align={isOwnUserMessage ? "end" : "start"}
          attachments={attachments}
          className="mb-1"
        />
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
            <MentionText content={visibleMessageContent} />
          </div>
        ) : (
          <OrgAssistantContent
            content={assistantContentOverride ?? message.content}
            fromSlack={fromSlack}
            onCompanyInfoClick={onCompanyInfoClick}
            workspaceId={workspaceId}
          />
        )}
        {!isUser && attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment, index) => (
              <span
                key={`${attachment.name}:${index}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-bg-weak px-2.5 py-1 text-[11px] text-neutral-muted"
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
  onCompanyInfoClick,
  text,
  workspaceId,
}: {
  onCompanyInfoClick?: () => void;
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
        <OrgAssistantContent
          content={text}
          onCompanyInfoClick={onCompanyInfoClick}
          workspaceId={workspaceId}
        />
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
          label="답변 작성 중"
        />
      </ChatMessageBubbleFrame>
    </div>
  );
}
