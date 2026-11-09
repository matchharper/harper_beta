import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import { BillingActionNotice } from "@/components/org/billing/BillingActionNotice";
import {
  Building2,
  CalendarClock,
  Check,
  Copy,
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
import {
  orgTalentReferenceHref,
  readOrgTalentReferenceHref,
  remarkOrgTalentReferences,
  splitOrgTalentReferences,
} from "@/lib/org/agent/talentReference";
import { OrgTalentReferenceBadge } from "./OrgTalentReferenceBadge";
import {
  formatOrgChatMessageTime,
  formatOrgMessageHoverTime,
} from "@/lib/org/agent/messagePresentation";
import type { OrgAgentQueuedMessage } from "@/lib/org/agent/chatQueue";
import { useToastStore } from "@/store/useToastStore";
import { formatChatDateDividerLabel } from "@/lib/chat/dateDivider";
import { splitOrgAgentCompanyInfoMarker } from "@/lib/org/agent/companyInfoMarker";
import {
  convertSlackMrkdwnToWebMarkdown,
  renderOrgAgentWebLinks,
} from "@/lib/org/agent/navigationMarkdown";
import {
  hasOrgAgentToolWork,
  localizeOrgAgentThinkingLogs,
  orgAgentLiveStatusLabel,
} from "@/lib/org/agent/thinkingLogs";
import type {
  OrgAgentMessage,
  OrgAgentMessageAction,
} from "@/lib/org/agent/types";
import { parseHarperSlackChoiceMarkers } from "@/lib/org/slackChoiceButtons";
import { stripSlackSentUsingAttribution } from "@/lib/org/slackMessageText";
import { cn } from "@/lib/utils";
import { getHarperOwnedUrlRoute } from "@/lib/urlDisplay";

export function OrgAgentDateDivider({ createdAt }: { createdAt: string }) {
  const { locale, c } = useOrgLocale();
  const label = formatChatDateDividerLabel(createdAt, locale);
  return (
    <ChatDateDivider
      ariaLabel={c("대화 날짜 {p0}", "Conversation date {p0}", { p0: label })}
      label={label}
    />
  );
}

function OrgMessageLayout({
  children,
  fromSlack = false,
  isUser = false,
}: {
  children: ReactNode;
  fromSlack?: boolean;
  isUser?: boolean;
}) {
  const { c } = useOrgLocale();
  if (isUser) return <>{children}</>;

  return (
    <div className="mt-2 grid grid-cols-[28px_minmax(0,680px)] items-start gap-x-3">
      <Image
        alt={c("Harper", "Harper")}
        className="rounded-full"
        height={28}
        src="/images/squareface.png"
        width={28}
      />
      <div className="min-w-0">
        <ChatAssistantLabel className="mb-1 flex items-center gap-1.5 text-[12px] text-neutral-700 leading-5 font-normal">
          {c("Harper", "Harper")}
          {fromSlack ? (
            <Image
              alt={c("Slack", "Slack")}
              className="size-2.5 shrink-0"
              height={12}
              src="/images/logos/slack.svg"
              width={12}
            />
          ) : null}
        </ChatAssistantLabel>
        {children}
      </div>
    </div>
  );
}

function useTalentReferenceNavigation(workspaceId: string) {
  const router = useRouter();
  return (href: string) => {
    const reference = readOrgTalentReferenceHref(href, workspaceId);
    if (
      reference &&
      ["/org/home", "/org/inbox", "/org/jobs", "/org/role"].includes(
        router.pathname
      ) &&
      router.query.orgId === workspaceId
    ) {
      const query = {
        ...router.query,
        talentId: reference.talentId,
        detailRoleId: reference.roleId ?? undefined,
        recommendationId: reference.recommendationId ?? undefined,
        detailWorkspaceId: workspaceId,
      };
      void router.push({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      });
      return;
    }
    const route = getHarperOwnedUrlRoute(href);
    if (route) void router.push(route);
  };
}

function MentionText({
  content,
  workspaceId,
  roleId,
}: {
  content: string;
  workspaceId: string;
  roleId?: string | null;
}) {
  const openTalent = useTalentReferenceNavigation(workspaceId);
  return (
    <>
      {splitOrgTalentReferences(content).map((segment, index) =>
        segment.reference ? (
          <OrgTalentReferenceBadge
            key={`${segment.reference.talentId}:${index}`}
            className="border-bg-floating/30 text-on-inverse hover:bg-bg-floating/10 focus-visible:ring-white/40"
            talentId={segment.reference.talentId}
            label={segment.reference.label}
            href={orgTalentReferenceHref({
              talentId: segment.reference.talentId,
              workspaceId,
              roleId,
            })}
            onClick={() =>
              openTalent(
                orgTalentReferenceHref({
                  talentId: segment.reference!.talentId,
                  workspaceId,
                  roleId,
                })
              )
            }
          />
        ) : (
          <span key={`text:${index}`}>{segment.text}</span>
        )
      )}
    </>
  );
}

/** What a copy puts on the clipboard: names instead of candidate links, no company-info card marker. */
export function orgMessageCopyText(message: Pick<OrgAgentMessage, "role">, content: string) {
  if (message.role === "user") {
    return splitOrgTalentReferences(content)
      .map((segment) =>
        segment.reference ? (segment.reference.label ?? segment.text) : segment.text
      )
      .join("")
      .trim();
  }
  return splitOrgAgentCompanyInfoMarker(content)
    .flatMap((segment) => (segment.kind === "text" ? [segment.text] : []))
    .join("\n\n")
    .trim();
}

/** Desktop hover: the message's time and a copy button, like the candidate chat. */
function OrgMessageActions({
  align,
  copyText,
  createdAt,
}: {
  align: "end" | "start";
  copyText: string;
  createdAt: string;
}) {
  const { locale, c } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );
  const time = formatOrgMessageHoverTime(createdAt, locale);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({
        message: c("메시지를 복사하지 못했어요.", "Couldn't copy the message."),
        variant: "error",
      });
    }
  };
  return (
    <div
      data-org-message-actions=""
      className={cn(
        "pointer-events-none hidden min-h-7 w-fit items-center opacity-0 transition-opacity duration-150 motion-reduce:transition-none md:flex",
        "group-hover/org-message:pointer-events-auto group-hover/org-message:opacity-100 group-focus-within/org-message:pointer-events-auto group-focus-within/org-message:opacity-100",
        align === "end" ? "ml-auto" : undefined
      )}
    >
      {time ? (
        <time
          className={cn(
            "whitespace-nowrap text-xs tabular-nums text-neutral-soft",
            align === "end" ? "order-first mr-2" : "order-last ml-2"
          )}
          dateTime={createdAt}
        >
          {time}
        </time>
      ) : null}
      <MuteButton
        aria-label={c("메시지 복사", "Copy message")}
        onClick={() => void copy()}
        size="sm"
        title={c("복사", "Copy")}
        type="button"
        variant="transparent"
      >
        {/* Slide Blur Swap, as in the candidate chat (src/styles/Design.md). */}
        <span
          aria-hidden="true"
          className="relative inline-flex size-3.5 shrink-0 items-center justify-center"
        >
          <Copy
            className={cn(
              "absolute size-3.5 transition-[translate,opacity,filter] duration-500 ease-in-out motion-reduce:transition-none",
              copied
                ? "translate-x-1.5 opacity-0 blur-[3px]"
                : "translate-x-0 opacity-100 blur-[0px]"
            )}
          />
          <Check
            className={cn(
              "absolute size-3.5 transition-[translate,opacity,filter] duration-500 ease-in-out motion-reduce:transition-none",
              copied
                ? "translate-x-0 opacity-100 blur-[0px]"
                : "-translate-x-1.5 opacity-0 blur-[3px]"
            )}
          />
        </span>
      </MuteButton>
      <span role="status" className="sr-only">
        {copied ? c("메시지를 복사했어요.", "Message copied.") : ""}
      </span>
    </div>
  );
}

function OrgCompanyInfoCard({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  const { c } = useOrgLocale();
  return (
    <CardButton
      aria-label={c(
        "역할 설명에 반영한 회사 정보 열기",
        "Open company info used in the role description"
      )}
      className={cn(
        "w-fit min-w-[min(360px,100%)]  border-stroke-subtle items-center gap-3 px-3 pr-6 py-4 mb-2 font-normal hover:bg-neutral-100 hover:border-stroke-subtle",
        className
      )}
      onClick={onClick}
    >
      <span className="flex size-10 bg-surface-tint shrink-0 items-center justify-center rounded-md text-neutral-primary/70">
        <Building2 aria-hidden className="size-4.5" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-neutral-primary font-medium">
          {c("회사 정보", "Company info")}
        </span>
        <span className="block text-[13px] leading-4 text-neutral-primary/50">
          {c(
            "현재 후보자에게 소개되는 회사 정보를 확인해 보세요.",
            "Review the company info currently shown to the candidate."
          )}
        </span>
      </span>
    </CardButton>
  );
}

function OrgAssistantContent({
  content,
  fromSlack = false,
  onCompanyInfoClick,
  roleId,
  workspaceId,
}: {
  content: string;
  fromSlack?: boolean;
  onCompanyInfoClick?: () => void;
  roleId?: string | null;
  workspaceId: string;
}) {
  const router = useRouter();
  const openTalent = useTalentReferenceNavigation(workspaceId);
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
          roleId,
        });
        return (
          <ChatAssistantContent
            className={cn(
              CHAT_ASSISTANT_CONTENT_INHERIT_CLASS,
              index > 0 && "mt-3"
            )}
            content={markdown}
            additionalRemarkPlugins={[
              [remarkOrgTalentReferences, { workspaceId, roleId }],
            ]}
            renderLink={({ href, text }) => {
              const reference = readOrgTalentReferenceHref(href, workspaceId);
              if (!reference) return undefined;
              return (
                <OrgTalentReferenceBadge
                  talentId={reference.talentId}
                  label={text}
                  href={href}
                  onClick={() => openTalent(href)}
                />
              );
            }}
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
  readOnly = false,
  roleId,
  workspaceId,
}: {
  action: OrgAgentMessageAction;
  message: OrgAgentMessage;
  readOnly?: boolean;
  roleId?: string | null;
  workspaceId: string;
}) {
  const { locale, c } = useOrgLocale();
  const meetingRequest = useSendOrgAgentMeetingRequest();

  if (action.kind === "entity_updated" || action.kind === "request_updated") {
    return (
      <div className="inline-flex items-center gap-1.5 text-[12px] text-positive">
        <Check className="h-3.5 w-3.5" />
        {locale === "en" ? c("처리 완료", "Action complete") : action.label}
      </div>
    );
  }

  const sent = action.status === "sent" || meetingRequest.isSuccess;
  return (
    <div className="mt-3">
      <MuteButton
        type="button"
        size="sm"
        disabled={readOnly || !roleId || sent || meetingRequest.isPending}
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
        {sent ? c("요청 보냄", "Request sent") : action.label}
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
  onRoleStartChoice,
  readOnly = false,
  roleId,
  showUserAttribution = false,
  turnStartedAt,
  workActive = false,
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
  onRoleStartChoice?: (args: {
    questionId: string;
    chipId: string | null;
  }) => void;
  readOnly?: boolean;
  roleId?: string | null;
  showUserAttribution?: boolean;
  turnStartedAt?: string;
  workActive?: boolean;
  workspaceId: string;
}) {
  const { locale, c } = useOrgLocale();
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
  const startQuestion = message.metadata.roleStartQuestion;
  const briefReady = message.metadata.roleStartBriefReady;
  const attachments = message.metadata.attachments ?? [];
  // Saved messages only: a message still being sent has no time or final text yet.
  const showActions = message.id > 0 && message.status !== "pending";
  const copyText = showActions
    ? orgMessageCopyText(
        message,
        isUser
          ? visibleMessageContent
          : fromSlack
            ? parseHarperSlackChoiceMarkers(
                stripSlackSentUsingAttribution(message.content)
              ).text
            : (assistantContentOverride ?? message.content)
      )
    : "";

  return (
    <div className="group/org-message space-y-0">
      {!isUser && (
        <ChatThinkingLogPanel
          active={workActive}
          completedAt={message.createdAt}
          hasToolWork={hasOrgAgentToolWork(message.thinkingLogs)}
          liveLine
          logs={localizeOrgAgentThinkingLogs(message.thinkingLogs, locale)}
          startedAt={turnStartedAt}
          statusLabel={orgAgentLiveStatusLabel(c, workActive, message.thinkingLogs.length)}
        />
      )}
      {!isUser &&
        toolResultActions.map((action) => (
          <MessageActionView
            key={action.id}
            action={action}
            message={message}
            readOnly={readOnly}
            roleId={roleId}
            workspaceId={workspaceId}
          />
        ))}
      <OrgMessageLayout fromSlack={fromSlack} isUser={isUser}>
        {isUser && showUserAttribution ? (
          <div
            className={cn(
              "mb-1 flex items-center gap-1.5 px-1 text-[11px] leading-4",
              isOwnUserMessage ? "justify-end" : "justify-start"
            )}
          >
            <span className="font-medium text-neutral-muted">
              {authorName ||
                (isOwnUserMessage
                  ? c("나", "Me")
                  : c("워크스페이스 멤버", "Workspace member"))}
              {fromSlack ? (
                <Image
                  alt={c("Slack", "Slack")}
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
          animateEntrance={isOwnUserMessage && message.id < 0}
          className={cn(
            "mb-2",
            showActions && copyText && "md:mb-0",
            isUser ? "max-w-[min(680px,92%)]" : "max-w-[min(680px,100%)]",
            showUserAttribution &&
              isOwnUserMessage &&
              "border border-neutral-800",
            showUserAttribution &&
              isUser &&
              !isOwnUserMessage &&
              "rounded-lg border border-neutral-1000-a10 bg-bg-floating px-3 py-1.5 text-neutral-primary",
            message.status === "failed" &&
              "border border-critical/20 bg-critical-faded"
          )}
          isUser={isOwnUserMessage}
          typographyClassName={
            isUser
              ? "text-sm leading-[1.72] md:leading-[1.75]"
              : "text-[15px] leading-[1.72] md:text-[15.5px] md:leading-[1.75]"
          }
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">
              <MentionText
                content={visibleMessageContent}
                workspaceId={workspaceId}
                roleId={roleId}
              />
            </div>
          ) : (
            <OrgAssistantContent
              content={assistantContentOverride ?? message.content}
              fromSlack={fromSlack}
              onCompanyInfoClick={onCompanyInfoClick}
              roleId={roleId}
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
                readOnly ||
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
          {startQuestion ? (
            <ChatChoiceList
              choices={[
                ...startQuestion.chips.map((chip) => ({
                  label: chip.label,
                  value: chip.id,
                })),
                { label: c("건너뛰기", "Skip"), value: "__skip" },
              ]}
              disabled={
                readOnly ||
                choicePending ||
                startQuestion.status !== "pending" ||
                !onRoleStartChoice
              }
              hint={
                startQuestion.status === "pending"
                  ? c(
                      "고르거나 아래에 직접 답해 주세요.",
                      "Pick one or answer below in your own words."
                    )
                  : undefined
              }
              keyPrefix={`role-start-${message.id}`}
              onSelect={(choice) =>
                onRoleStartChoice?.({
                  questionId: startQuestion.questionId,
                  chipId: choice.value === "__skip" ? null : choice.value,
                })
              }
              typographyClassName="text-[13px] leading-[1.55]"
            />
          ) : null}
          {briefReady ? (
            <div className="mt-3">
              <MuteButton asChild variant="dark">
                <Link href={briefReady.href}>
                  {ct(c, COMPANY_TERMS.brief.reviewButton)}
                </Link>
              </MuteButton>
            </div>
          ) : null}
          {followUpActions.map((action) => (
            <MessageActionView
              key={action.id}
              action={action}
              message={message}
              readOnly={readOnly}
              roleId={roleId}
              workspaceId={workspaceId}
            />
          ))}
        </ChatMessageBubbleFrame>
        {showActions && copyText ? (
          <OrgMessageActions
            align={isOwnUserMessage ? "end" : "start"}
            copyText={copyText}
            createdAt={message.createdAt}
          />
        ) : null}
        {!isUser && <BillingActionNotice metadata={message.metadata} />}
      </OrgMessageLayout>
    </div>
  );
}

export function OrgAgentStreamingBubble({
  onCompanyInfoClick,
  roleId,
  text,
  workspaceId,
}: {
  onCompanyInfoClick?: () => void;
  roleId?: string | null;
  text: string;
  workspaceId: string;
}) {
  if (!text) return null;
  return (
    <OrgMessageLayout>
      <ChatMessageBubbleFrame
        className="max-w-[min(680px,100%)]"
        isUser={false}
        typographyClassName="text-[15px] leading-[1.72] md:text-[14px] md:leading-[1.8]"
      >
        <OrgAssistantContent
          content={text}
          onCompanyInfoClick={onCompanyInfoClick}
          roleId={roleId}
          workspaceId={workspaceId}
        />
      </ChatMessageBubbleFrame>
    </OrgMessageLayout>
  );
}

export function OrgAgentPendingBubble() {
  const { c } = useOrgLocale();
  return (
    <OrgMessageLayout>
      <ChatMessageBubbleFrame
        className="max-w-[min(680px,100%)]"
        isUser={false}
        typographyClassName="text-[15px] leading-[1.72] md:text-[14px] md:leading-[1.8]"
      >
        <ChatAssistantPending
          className="text-[13px] leading-[1.55]"
          label={c("답변 작성 중", "Composing reply")}
        />
      </ChatMessageBubbleFrame>
    </OrgMessageLayout>
  );
}

/**
 * A message sent while Harper was still answering. It goes out when that reply
 * ends; until then it can be taken back into the input.
 */
export function OrgAgentQueuedBubble({
  item,
  onTakeBack,
  roleId,
  workspaceId,
}: {
  item: OrgAgentQueuedMessage;
  onTakeBack: () => void;
  roleId?: string | null;
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  return (
    <div className="flex flex-col" data-org-queued-message="">
      {item.attachments.length > 0 ? (
        <ChatMessageAttachmentList
          align="end"
          attachments={item.attachments}
          className="mb-1 opacity-60"
        />
      ) : null}
      <ChatMessageBubbleFrame
        className="mb-1 max-w-[min(680px,92%)] opacity-60 md:mb-1"
        isUser
        typographyClassName="text-sm leading-[1.72] md:leading-[1.75]"
      >
        <div className="whitespace-pre-wrap break-words">
          <MentionText
            content={item.message}
            roleId={roleId}
            workspaceId={workspaceId}
          />
        </div>
      </ChatMessageBubbleFrame>
      <div className="mb-2 ml-auto flex items-center gap-1 text-[12px] leading-4 text-neutral-soft">
        <span>{c("답이 끝나면 보내요", "Sends when this reply ends")}</span>
        <MuteButton
          className="h-6 px-1.5 text-[12px] text-neutral-muted"
          onClick={onTakeBack}
          size="sm"
          type="button"
          variant="transparent"
        >
          {c("되돌리기", "Take back")}
        </MuteButton>
      </div>
    </div>
  );
}
