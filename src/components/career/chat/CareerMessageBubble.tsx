import React, { type ReactNode } from "react";
import { useRouter } from "next/router";
import { AudioLines, FileText, Mail, Phone } from "lucide-react";
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

// User bubble 색상을 바꾸려면 이 클래스를 수정하세요.
export const USER_BUBBLE_CLASS =
  "mt-1 ml-auto max-w-[820px] rounded-[14px] bg-black px-3 py-1.5 text-neutral-00";

export const ASSISTANT_BUBBLE_CLASS =
  "w-fit max-w-[920px] text-neutral-primary";

const HIGHLIGHT_PATTERN = /<<([\s\S]+?)>>/g;
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const CALL_ACTION_MARKER = "[[CALL]]";
const CALL_ACTION_OPENING_TEXT =
  "좋아요. 최근 업데이트나 요즘 재밌게 하고 계신 일부터 편하게 들려주세요.";
const INTERNAL_CALL_REQUEST_PATTERN =
  /\[\[INTERNAL_OPPORTUNITY_CALL_REQUEST:([^\]]+)\]\]/g;

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
  isCallStartPending?: boolean;
  onStartCallMode?: (args?: CareerCallStartRequest) => void | Promise<void>;
};

function stripCallActionMarker(content: string) {
  return content.replaceAll(CALL_ACTION_MARKER, "").trim();
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
  const strippedContent = content
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
          className="inline cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] text-inherit underline underline-offset-2 transition-opacity hover:opacity-70"
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
        className="underline underline-offset-2 transition-opacity hover:opacity-70"
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
  isCallStartPending = false,
  onStartCallMode,
}: Props) => {
  const router = useRouter();
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
  const displayContent = internalCallRequestExtraction.content;
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
  const typingCursor = message.typing ? (
    <span
      className={[
        "inline-block w-2 animate-pulse align-baseline",
        isUser ? "text-neutral-00" : "text-neutral-primary",
      ].join(" ")}
    >
      ▍
    </span>
  ) : null;

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
                aria-label="이메일"
              />
            ) : (
              <AudioLines
                className={[
                  "h-3.5 w-3.5",
                  isUser ? "text-neutral-00/70" : "text-neutral-soft",
                ].join(" ")}
                aria-label="전화 대화"
              />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {isUser ? (
            <div className="whitespace-pre-wrap wrap-break-word">
              {renderHighlightedContent(displayContent, handleHarperLinkClick)}
              {typingCursor}
            </div>
          ) : (
            <RichText
              content={assistantContent}
              className={careerTimelineAssistantRichTextClassName}
              trailingInlineNode={typingCursor}
              onHarperLinkClick={handleHarperLinkClick}
            />
          )}
          {hasCallAction && (
            <BareButton
              type="button"
              onClick={() =>
                void onStartCallMode?.({
                  openingText: CALL_ACTION_OPENING_TEXT,
                })
              }
              disabled={!onStartCallMode || isCallStartPending}
              className={cn(
                "mt-3 inline-flex h-9 items-center gap-2 rounded-[8px] border border-neutral-1000-a10 bg-bg-floating px-3 font-medium text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-60",
                careerTimelineMetaTextClassName
              )}
            >
              <Phone className="h-4 w-4" />
              {isCallStartPending ? "연결 중..." : "전화하기"}
            </BareButton>
          )}
          {internalCallRequestMarkers.map((marker) => (
            <div
              key={marker.callId}
              className="mt-3 w-fit max-w-full rounded-[8px] border border-neutral-1000-a10 bg-bg-floating px-3 py-3 text-neutral-primary shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-bg-weak text-neutral-muted">
                  <Phone className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-snug">
                    {marker.companyName} - {marker.roleTitle}
                  </div>
                  <div className="mt-1 max-w-[480px] text-[14px] md:text-[13px] leading-relaxed text-neutral-muted">
                    꼭 해야하는 대화는 아니고, 연결 시에 도움이될 정보를 몇가지
                    여쭤보기 위한 통화에요. 진행하지 않으셔도{" "}
                    {marker.companyName}측과의 연결은 제가 계속 진행할게요.
                  </div>
                  {marker.resumePromptNeeded && (
                    <BareButton
                      type="button"
                      onClick={() =>
                        void router.push("/career/profile?profileSection=links")
                      }
                      className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] border border-neutral-1000-a10 bg-bg-weak px-2.5 py-1.5 text-xs text-neutral-primary transition-colors hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      이력서 보강
                    </BareButton>
                  )}
                  <BareButton
                    type="button"
                    onClick={() =>
                      void onStartCallMode?.({
                        internalCallRequestId: marker.callId,
                        openingText: `${marker.companyName} ${marker.roleTitle} 연결 건으로, 회사에 더 잘 전달할 수 있게 짧게 몇 가지를 확인하고 싶어요.`,
                      })
                    }
                    disabled={!onStartCallMode || isCallStartPending}
                    className="mt-2 inline-flex h-9 max-w-full items-center gap-2 rounded-[8px] border border-neutral-1000-a10 bg-primary px-4 md:px-3 text-sm font-medium text-neutral-00 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate">
                      {isCallStartPending ? "연결 중..." : `통화하기`}
                    </span>
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
