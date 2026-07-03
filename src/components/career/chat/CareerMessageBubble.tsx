import React, { type ReactNode } from "react";
import { useRouter } from "next/router";
import { AudioLines, FileText, Mail, Phone, PhoneOutgoing } from "lucide-react";
import type {
  CareerCallStartRequest,
  CareerMessage,
} from "@/components/career/types";
import RichText from "@/components/ui/rich-text";
import { TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE } from "@/lib/career/opportunityFeedbackNote";
import { stripStandalonePostingLinksFromText } from "@/lib/career/postingLinks";
import {
  compactUrlLabel,
  getHarperOwnedUrlRoute,
  isHarperOwnedUrl,
} from "@/lib/urlDisplay";
import { BareButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  careerTimelineAssistantRichTextClassName,
  careerTimelineFeedbackNoteTextClassName,
  careerTimelineMessageTextClassName,
  careerTimelineMetaTextClassName,
} from "./careerTimelineTypography";
import { formatCareerMessageByKey } from "@/i18n/careerMessage";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";

// User bubble 색상을 바꾸려면 이 클래스를 수정하세요.
export const USER_BUBBLE_CLASS =
  "mt-1 ml-auto max-w-[820px] rounded-[14px] bg-black px-3 py-1.5 text-neutral-00";

export const ASSISTANT_BUBBLE_CLASS =
  "w-fit max-w-[920px] text-neutral-primary";

export const CAREER_MESSAGE_LINK_CLASS =
  "inline-flex max-w-full cursor-pointer items-center align-baseline rounded-md bg-accent-100/80 px-1.5 py-0 text-left text-accent-500 no-underline wrap-break-word transition-colors hover:bg-accent-200/60 hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300/60";

const HIGHLIGHT_PATTERN = /<<([\s\S]+?)>>/g;
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const CALL_ACTION_MARKER = "[[CALL]]";
const CAREER_CHOICE_BUTTONS_START_FRAGMENT = "[[CAREER_CHOICE_BUTTONS";
const CAREER_CHOICE_BUTTONS_PATTERN =
  /\[\[CAREER_CHOICE_BUTTONS\]\]\s*([\s\S]*?)\s*\[\[\/CAREER_CHOICE_BUTTONS\]\]/g;
const INTERNAL_CALL_REQUEST_START_FRAGMENT = "[[INTERNAL_";
const INTERNAL_CALL_REQUEST_PATTERN =
  /\[\[INTERNAL_OPPORTUNITY_CALL_REQUEST:([^\]]+)\]\]/g;

type AssistantChoice = {
  label: string;
  value: string;
};

export type CareerAssistantChoiceSelection = {
  assistantMessageId: string;
  choice: string;
  choiceCount: number;
  choiceIndex: number;
};

type InternalCallRequestMarker = {
  callId: string;
  companyName: string;
  resumePromptNeeded: boolean;
  roleTitle: string;
};

type Props = {
  message: CareerMessage;
  isUser: boolean;
  isAssistantSpeaking?: boolean;
  choiceActionsDisabled?: boolean;
  isCallStartPending?: boolean;
  onSelectAssistantChoice?: (
    selection: CareerAssistantChoiceSelection
  ) => void | Promise<void>;
  onStartCallMode?: (args?: CareerCallStartRequest) => void | Promise<void>;
};

function stripCallActionMarker(content: string) {
  return content.replaceAll(CALL_ACTION_MARKER, "").trim();
}

function normalizeAssistantChoice(value: unknown): AssistantChoice | null {
  if (typeof value === "string") {
    const label = value.trim();
    return label ? { label, value: label } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const choiceValue =
    typeof record.value === "string" ? record.value.trim() : label;

  if (!label || !choiceValue) return null;
  return { label, value: choiceValue };
}

function extractAssistantChoiceBlocks(content: string) {
  const choices: AssistantChoice[] = [];
  const seenValues = new Set<string>();

  let strippedContent = content.replace(
    CAREER_CHOICE_BUTTONS_PATTERN,
    (_match, payload: string) => {
      try {
        const parsed = JSON.parse(payload.trim()) as unknown;
        const rawChoices = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>).choices
            : null;

        if (!Array.isArray(rawChoices)) return "";

        for (const rawChoice of rawChoices) {
          const choice = normalizeAssistantChoice(rawChoice);
          if (!choice || seenValues.has(choice.value)) continue;
          seenValues.add(choice.value);
          choices.push(choice);
          if (choices.length >= 3) break;
        }
      } catch {
        // Hide malformed UI metadata instead of exposing raw markers in chat.
      }

      return "";
    }
  );

  const incompleteBlockStart = strippedContent.indexOf(
    CAREER_CHOICE_BUTTONS_START_FRAGMENT
  );
  if (incompleteBlockStart !== -1) {
    strippedContent = strippedContent.slice(0, incompleteBlockStart);
  }

  strippedContent = strippedContent.trim();

  return {
    choices: choices.length >= 2 ? choices : [],
    content: strippedContent,
  };
}

function toInternalCallRequestMarker(
  value: unknown
): InternalCallRequestMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const callId = typeof record.callId === "string" ? record.callId.trim() : "";
  const companyName =
    typeof record.companyName === "string" ? record.companyName.trim() : "";
  const roleTitle =
    typeof record.roleTitle === "string" ? record.roleTitle.trim() : "";
  if (!callId || !companyName || !roleTitle) return null;

  return {
    callId,
    companyName,
    resumePromptNeeded: record.resumePromptNeeded === true,
    roleTitle,
  };
}

function extractInternalCallRequestMarkers(content: string) {
  const markers: InternalCallRequestMarker[] = [];
  let strippedContent = content
    .replace(INTERNAL_CALL_REQUEST_PATTERN, (_match, encoded: string) => {
      try {
        const parsed = JSON.parse(decodeURIComponent(encoded)) as unknown;
        const marker = toInternalCallRequestMarker(parsed);
        if (marker) markers.push(marker);
      } catch {
        // Ignore malformed UI markers and keep the message readable.
      }
      return "";
    })
    .trim();
  const incompleteMarkerStart = strippedContent.indexOf(
    INTERNAL_CALL_REQUEST_START_FRAGMENT
  );
  if (incompleteMarkerStart !== -1) {
    strippedContent = strippedContent.slice(0, incompleteMarkerStart).trim();
  }

  return {
    content: strippedContent,
    markers,
  };
}

function renderTextWithLinks(
  content: string,
  keyPrefix: string,
  onHarperLinkClick: (href: string) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(content)) !== null) {
    const matchIndex = match.index;
    const href = match[0] ?? "";
    if (lastIndex < matchIndex) {
      nodes.push(content.slice(lastIndex, matchIndex));
    }
    if (isHarperOwnedUrl(href)) {
      nodes.push(
        <BareButton
          key={`${keyPrefix}-internal-link-${matchIndex}`}
          type="button"
          onClick={() => onHarperLinkClick(href)}
          title={href}
          className={cn(
            "border-0 font-[inherit] text-accent-500 underline decoration-dotted underline-offset-2 hover:text-accent-500/90"
          )}
        >
          {compactUrlLabel(href)}
        </BareButton>
      );
      lastIndex = matchIndex + href.length;
      continue;
    }
    nodes.push(
      <a
        key={`${keyPrefix}-link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        title={href}
        className="text-accent-500 underline decoration-dotted underline-offset-2 hover:text-accent-500/90"
      >
        {compactUrlLabel(href)}
      </a>
    );
    lastIndex = matchIndex + href.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [content];
}

function renderHighlightedContent(
  content: string,
  onHarperLinkClick: (href: string) => void
): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(HIGHLIGHT_PATTERN);
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(content)) !== null) {
    const matchIndex = match.index;

    if (lastIndex < matchIndex) {
      nodes.push(
        <React.Fragment key={`text-${matchIndex}`}>
          {renderTextWithLinks(
            content.slice(lastIndex, matchIndex),
            `text-${matchIndex}`,
            onHarperLinkClick
          )}
        </React.Fragment>
      );
    }

    const highlightedText = (match[1] ?? "").trim();
    if (highlightedText) {
      nodes.push(
        <span
          key={`highlight-${matchIndex}`}
          className="box-decoration-clone bg-bg-weak px-1.5 py-0.5 text-neutral-primary"
        >
          {highlightedText}
        </span>
      );
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    nodes.push(
      <React.Fragment key={`text-tail-${lastIndex}`}>
        {renderTextWithLinks(
          content.slice(lastIndex),
          `text-tail-${lastIndex}`,
          onHarperLinkClick
        )}
      </React.Fragment>
    );
  }

  return nodes.length > 0
    ? nodes
    : renderTextWithLinks(content, "full", onHarperLinkClick);
}

const CareerMessageBubble = ({
  message,
  isUser,
  isAssistantSpeaking = false,
  choiceActionsDisabled = false,
  isCallStartPending = false,
  onSelectAssistantChoice,
  onStartCallMode,
}: Props) => {
  const t = useCareerT();
  const callActionOpeningText = t(
    "career.chat.career_message_bubble.0jnmgxp",
    "좋아요. 최근 업데이트나 요즘 재밌게 하고 계신 일부터 편하게 들려주세요."
  );

  const router = useRouter();
  const { m } = useMessages();
  const handleHarperLinkClick = React.useCallback(
    (href: string) => {
      const route = getHarperOwnedUrlRoute(href);
      if (!route) return;
      void router.push(route);
    },
    [router]
  );
  const isCallTranscript = message.messageType === "call_transcript";
  const isMailMessage = message.messageType === "mail";
  const hasCallAction = !isUser && message.content.includes(CALL_ACTION_MARKER);
  const isOpportunityFeedbackNote =
    isUser &&
    message.messageType === TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE;
  // const isCallWrapup = message.messageType === "call_wrapup";
  const callActionStrippedContent = hasCallAction
    ? stripCallActionMarker(message.content)
    : message.content;
  const internalCallRequestExtraction = !isUser
    ? extractInternalCallRequestMarkers(callActionStrippedContent)
    : { content: callActionStrippedContent, markers: [] };
  const choiceBlockExtraction = !isUser
    ? extractAssistantChoiceBlocks(internalCallRequestExtraction.content)
    : { content: internalCallRequestExtraction.content, choices: [] };
  const displayContent = choiceBlockExtraction.content;
  const assistantChoices = choiceBlockExtraction.choices;
  const internalCallRequestMarkers = internalCallRequestExtraction.markers;
  const assistantContent =
    !isUser && (message.opportunityPreview?.length ?? 0) > 0
      ? stripStandalonePostingLinksFromText(displayContent)
      : displayContent;
  const articleClassName = isOpportunityFeedbackNote
    ? cn(
        "ml-auto max-w-[820px] px-1 py-0 text-right text-neutral-soft",
        careerTimelineFeedbackNoteTextClassName
      )
    : cn(
        "max-w-[92%] transition-colors duration-300",
        careerTimelineMessageTextClassName,
        isUser ? USER_BUBBLE_CLASS : ASSISTANT_BUBBLE_CLASS,
        !isUser && isAssistantSpeaking && "ring-1 ring-neutral-1000-a05"
      );
  return (
    <article className={articleClassName}>
      <div className="flex items-start gap-2">
        {(isCallTranscript || isMailMessage) && (
          <span
            className={[
              "flex shrink-0 items-center justify-center",
              isUser ? "h-6" : "h-7",
            ].join(" ")}
          >
            {isMailMessage ? (
              <Mail
                className={[
                  "h-3.5 w-3.5",
                  isUser ? "text-neutral-00/70" : "text-neutral-soft",
                ].join(" ")}
                aria-label={t("career.onboarding.onboarding.17sy1or", "이메일")}
              />
            ) : (
              <AudioLines
                className={[
                  "h-3.5 w-3.5",
                  isUser ? "text-neutral-00/70" : "text-neutral-soft",
                ].join(" ")}
                aria-label={t(
                  "career.chat.career_message_bubble.0ovvmd7",
                  "전화 대화"
                )}
              />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {isUser ? (
            <div className="whitespace-pre-wrap wrap-break-word">
              {renderHighlightedContent(displayContent, handleHarperLinkClick)}
            </div>
          ) : (
            <RichText
              content={assistantContent}
              className={careerTimelineAssistantRichTextClassName}
              linkClassName={CAREER_MESSAGE_LINK_CLASS}
              onHarperLinkClick={handleHarperLinkClick}
              renderEmailLinksAsText
            />
          )}
          {!isUser && assistantChoices.length > 0 && (
            <div className="mt-3 flex max-w-[520px] min-w-[320px] w-full flex-col gap-2">
              {assistantChoices.map((choice, index) => (
                <BareButton
                  key={`${message.id}-choice-${index}-${choice.value}`}
                  type="button"
                  onClick={() =>
                    void onSelectAssistantChoice?.({
                      assistantMessageId: String(message.id),
                      choice: choice.value,
                      choiceCount: assistantChoices.length,
                      choiceIndex: index,
                    })
                  }
                  disabled={choiceActionsDisabled || !onSelectAssistantChoice}
                  className={cn(
                    "flex cursor-pointer min-h-11 w-full items-center justify-start rounded-md border border-neutral-1000-a10 bg-bg-floating px-2.5 py-2 text-left text-base font-medium leading-5 text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-55",
                    careerTimelineMetaTextClassName
                  )}
                >
                  <span className="wrap-break-word min-w-0">
                    {choice.label}
                  </span>
                </BareButton>
              ))}
            </div>
          )}
          {hasCallAction && (
            <BareButton
              type="button"
              onClick={() =>
                void onStartCallMode?.({
                  openingText: callActionOpeningText,
                })
              }
              disabled={!onStartCallMode || isCallStartPending}
              className={cn(
                "mt-3 inline-flex h-9 items-center gap-2 rounded-[8px] border border-neutral-1000-a10 bg-bg-floating px-3 font-medium text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-60",
                careerTimelineMetaTextClassName
              )}
            >
              <Phone className="h-4 w-4" />
              {isCallStartPending
                ? t("career.call.career_call_card.1vn8y3k", "연결 중...")
                : t("career.chat.career_message_bubble.0o5swvp", "전화하기")}
            </BareButton>
          )}
          {internalCallRequestMarkers.map((marker) => (
            <div
              key={marker.callId}
              className="mt-3 w-[94%] max-w-[400px] rounded-md border border-neutral-200 bg-bg-floating px-2 py-2 text-neutral-primary"
            >
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="min-h-28 py-2 px-3 bg-neutral-100 rounded-md flex flex-col items-center justify-center">
                  <div className="text-sm font-medium leading-snug pb-4 pt-2">
                    Call for {'"'}
                    {marker.companyName} - {marker.roleTitle}
                    {'"'}
                  </div>
                  <div
                    className="mt-1 text-[14px] md:text-[13px] text-center leading-5 text-neutral-muted"
                    dangerouslySetInnerHTML={{
                      __html: t(
                        "career.chat.career_message_bubble.optional_call_notice",
                        "꼭 해야하는 대화는 아니고, 연결 시에 도움이될 정보를 몇가지 여쭤보기 위한 통화에요. 진행하지 않으셔도 {companyName} 측과의 연결은 제가 계속 진행할게요.",
                        {
                          values: {
                            companyName: marker.companyName,
                          },
                        }
                      ),
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-1 w-full">
                  {marker.resumePromptNeeded && (
                    <BareButton
                      type="button"
                      onClick={() =>
                        void router.push("/career/profile?profileSection=links")
                      }
                      className="h-9 w-full text-center inline-flex items-center gap-1.5 rounded-[8px] border border-neutral-1000-a10 bg-bg-weak px-2.5 py-1.5 text-xs text-neutral-primary transition-colors hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {t(
                        "career.chat.career_message_bubble.1tqt1ip",
                        "이력서 보강"
                      )}
                    </BareButton>
                  )}
                  <BareButton
                    type="button"
                    onClick={() =>
                      void onStartCallMode?.({
                        internalCallRequestId: marker.callId,
                        openingText: formatCareerMessageByKey(
                          m,
                          "career.internal_opportunity.call_opening",
                          "",
                          {
                            companyName: marker.companyName,
                            roleTitle: marker.roleTitle,
                          }
                        ),
                      })
                    }
                    disabled={!onStartCallMode || isCallStartPending}
                    className="h-9 w-full text-center inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-neutral-1000-a10 bg-primary px-2.5 py-1.5 text-sm text-neutral-00 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <PhoneOutgoing strokeWidth={1.9} size={14} />
                    {isCallStartPending
                      ? t("career.call.career_call_card.1vn8y3k", "연결 중...")
                      : t(
                          "career.chat.career_message_bubble.0whsa78",
                          "통화하기"
                        )}
                  </BareButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
};

export default React.memo(CareerMessageBubble);
