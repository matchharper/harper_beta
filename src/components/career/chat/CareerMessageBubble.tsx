import React, { type ReactNode } from "react";
import { AudioLines } from "lucide-react";
import type { CareerMessage } from "@/components/career/types";
import CareerRichText from "@/components/career/ui/CareerRichText";

// User bubble 색상을 바꾸려면 이 클래스를 수정하세요.
export const USER_BUBBLE_CLASS =
  "ml-auto max-w-[820px] rounded-[8px] bg-beige900 px-4 py-2 text-beige100";

export const ASSISTANT_BUBBLE_CLASS = "max-w-[920px] py-1 text-beige900/80";
const ASSISTANT_RICH_TEXT_CLASS =
  "text-[14px] leading-7 [&_blockquote]:text-[14px] [&_blockquote]:leading-7 [&_li]:leading-7 [&_ol]:text-[14px] [&_ol]:leading-7 [&_p]:text-[14px] [&_p]:leading-7 [&_pre]:text-[12px] [&_pre]:leading-5 [&_table]:text-[13px] [&_td]:text-[13px] [&_th]:text-[13px] [&_ul]:text-[14px] [&_ul]:leading-7";

const HIGHLIGHT_PATTERN = /<<([\s\S]+?)>>/g;
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

type Props = {
  message: CareerMessage;
  isUser: boolean;
  isAssistantSpeaking?: boolean;
};

function renderTextWithLinks(content: string, keyPrefix: string): ReactNode[] {
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
    nodes.push(
      <a
        key={`${keyPrefix}-link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 transition-opacity hover:opacity-70"
      >
        {href}
      </a>
    );
    lastIndex = matchIndex + href.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [content];
}

function renderHighlightedContent(content: string): ReactNode {
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
            `text-${matchIndex}`
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
          `text-tail-${lastIndex}`
        )}
      </React.Fragment>
    );
  }

  return nodes.length > 0 ? nodes : renderTextWithLinks(content, "full");
}

const CareerMessageBubble = ({
  message,
  isUser,
  isAssistantSpeaking = false,
}: Props) => {
  const isCallTranscript = message.messageType === "call_transcript";
  // const isCallWrapup = message.messageType === "call_wrapup";

  return (
    <article
      className={[
        "max-w-[92%] text-[14px] leading-6 transition-colors duration-300",
        isUser ? USER_BUBBLE_CLASS : ASSISTANT_BUBBLE_CLASS,
        !isUser && isAssistantSpeaking ? "bg-white/20" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        {isCallTranscript && (
          <AudioLines
            className={[
              "mt-[7px] h-3.5 w-3.5 shrink-0",
              isUser ? "text-beige100/70" : "text-beige900/45",
            ].join(" ")}
            aria-label="전화 대화"
          />
        )}
        <div className="min-w-0 flex-1">
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">
              {renderHighlightedContent(message.content)}
            </div>
          ) : (
            <CareerRichText
              content={message.content}
              className={ASSISTANT_RICH_TEXT_CLASS}
            />
          )}
        </div>
      </div>
      {message.typing && (
        <span className="inline-block w-2 animate-pulse align-baseline text-beige900">
          ▍
        </span>
      )}
    </article>
  );
};

export default React.memo(CareerMessageBubble);
