import React, { type ReactNode } from "react";
import { useRouter } from "next/router";
import { AudioLines, Phone } from "lucide-react";
import type { CareerMessage } from "@/components/career/types";
import CareerRichText from "@/components/career/ui/CareerRichText";
import { TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE } from "@/lib/career/opportunityFeedbackNote";
import { stripStandalonePostingLinksFromText } from "@/lib/career/postingLinks";
import {
  compactUrlLabel,
  getHarperOwnedUrlRoute,
  isHarperOwnedUrl,
} from "@/lib/urlDisplay";

// User bubble 색상을 바꾸려면 이 클래스를 수정하세요.
export const USER_BUBBLE_CLASS =
  "mt-1 ml-auto max-w-[820px] rounded-[14px] bg-beige900 px-3 py-1.5 text-beige100";

export const ASSISTANT_BUBBLE_CLASS = "w-fit max-w-[920px] text-beige900";

const ASSISTANT_RICH_TEXT_CLASS =
  "text-[13px] leading-6 md:text-[14px] md:leading-7 [&_blockquote]:text-[13px] [&_blockquote]:leading-6 [&_li]:leading-6 [&_ol]:text-[13px] [&_ol]:leading-6 [&_p]:text-[13px] [&_p]:leading-6 [&_pre]:text-[12px] [&_pre]:leading-5 [&_table]:text-[12px] [&_td]:text-[12px] [&_th]:text-[12px] [&_ul]:text-[13px] [&_ul]:leading-6 md:[&_blockquote]:text-[14px] md:[&_blockquote]:leading-7 md:[&_li]:leading-7 md:[&_ol]:text-[14px] md:[&_ol]:leading-7 md:[&_p]:text-[14px] md:[&_p]:leading-7 md:[&_table]:text-[13px] md:[&_td]:text-[13px] md:[&_th]:text-[13px] md:[&_ul]:text-[14px] md:[&_ul]:leading-7";

const HIGHLIGHT_PATTERN = /<<([\s\S]+?)>>/g;
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const CALL_ACTION_MARKER = "[[CALL]]";
const CALL_ACTION_OPENING_TEXT =
  "좋아요. 최근 업데이트나 요즘 재밌게 하고 계신 일부터 편하게 들려주세요.";

type Props = {
  message: CareerMessage;
  isUser: boolean;
  isAssistantSpeaking?: boolean;
  isCallStartPending?: boolean;
  onStartCallMode?: (openingText?: string) => void | Promise<void>;
};

function stripCallActionMarker(content: string) {
  return content.replaceAll(CALL_ACTION_MARKER, "").trim();
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
        <button
          key={`${keyPrefix}-internal-link-${matchIndex}`}
          type="button"
          onClick={() => onHarperLinkClick(href)}
          title={href}
          className="inline cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] text-inherit underline underline-offset-2 transition-opacity hover:opacity-70"
        >
          {compactUrlLabel(href)}
        </button>
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
          className="box-decoration-clone bg-beige900/10 px-1.5 py-0.5 text-beige900"
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
  const hasCallAction = !isUser && message.content.includes(CALL_ACTION_MARKER);
  const isOpportunityFeedbackNote =
    isUser &&
    message.messageType === TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE;
  // const isCallWrapup = message.messageType === "call_wrapup";
  const displayContent = hasCallAction
    ? stripCallActionMarker(message.content)
    : message.content;
  const assistantContent =
    !isUser && (message.opportunityPreview?.length ?? 0) > 0
      ? stripStandalonePostingLinksFromText(displayContent)
      : displayContent;
  const articleClassName = isOpportunityFeedbackNote
    ? "ml-auto max-w-[820px] px-1 py-0 text-right text-[11px] leading-4 text-beige900/45"
    : [
        "max-w-[92%] text-[13px] leading-5 transition-colors duration-300 md:text-[14px] md:leading-6",
        isUser ? USER_BUBBLE_CLASS : ASSISTANT_BUBBLE_CLASS,
        !isUser && isAssistantSpeaking ? "ring-1 ring-beige900/10" : "",
      ].join(" ");
  const typingCursor = message.typing ? (
    <span
      className={[
        "inline-block w-2 animate-pulse align-baseline",
        isUser ? "text-beige100" : "text-beige900",
      ].join(" ")}
    >
      ▍
    </span>
  ) : null;

  return (
    <article className={articleClassName}>
      <div className="flex items-start gap-2">
        {isCallTranscript && (
          <span
            className={[
              "flex shrink-0 items-center justify-center",
              isUser ? "h-6" : "h-7",
            ].join(" ")}
          >
            <AudioLines
              className={[
                "h-3.5 w-3.5",
                isUser ? "text-beige100/70" : "text-beige900/45",
              ].join(" ")}
              aria-label="전화 대화"
            />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {isUser ? (
            <div className="whitespace-pre-wrap wrap-break-word">
              {renderHighlightedContent(displayContent, handleHarperLinkClick)}
              {typingCursor}
            </div>
          ) : (
            <CareerRichText
              content={assistantContent}
              className={ASSISTANT_RICH_TEXT_CLASS}
              trailingInlineNode={typingCursor}
              onHarperLinkClick={handleHarperLinkClick}
            />
          )}
          {hasCallAction && (
            <button
              type="button"
              onClick={() => void onStartCallMode?.(CALL_ACTION_OPENING_TEXT)}
              disabled={!onStartCallMode || isCallStartPending}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-[8px] border border-beige900/15 bg-white/70 px-3 text-[13px] font-medium text-beige900 transition-colors hover:border-beige900/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Phone className="h-4 w-4" />
              {isCallStartPending ? "연결 중..." : "전화하기"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default React.memo(CareerMessageBubble);
