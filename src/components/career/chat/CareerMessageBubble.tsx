import React, { type ReactNode } from "react";
import type { CareerMessage } from "@/components/career/types";

// User bubble 색상을 바꾸려면 이 클래스를 수정하세요.
export const USER_BUBBLE_CLASS =
  "ml-auto bg-hblack100/60 px-3 py-2 text-hblack1000";

export const ASSISTANT_BUBBLE_CLASS = "text-hblack700";
const HIGHLIGHT_PATTERN = /<<([\s\S]+?)>>/g;

type Props = {
  message: CareerMessage;
  isUser: boolean;
  isAssistantSpeaking?: boolean;
};

function renderHighlightedContent(content: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(HIGHLIGHT_PATTERN);
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(content)) !== null) {
    const matchIndex = match.index;

    if (lastIndex < matchIndex) {
      nodes.push(content.slice(lastIndex, matchIndex));
    }

    const highlightedText = (match[1] ?? "").trim();
    if (highlightedText) {
      nodes.push(
        <span
          key={`highlight-${matchIndex}`}
          className="box-decoration-clone rounded-md bg-beige900/10 px-1.5 py-0.5 text-beige900"
        >
          {highlightedText}
        </span>
      );
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : content;
}

const CareerMessageBubble = ({
  message,
  isUser,
  isAssistantSpeaking = false,
}: Props) => {
  return (
    <article
      className={[
        "max-w-[96%] rounded-lg text-sm leading-relaxed transition-colors duration-300",
        isUser ? USER_BUBBLE_CLASS : ASSISTANT_BUBBLE_CLASS,
        !isUser && isAssistantSpeaking
          ? "bg-beige900/10 px-2 py-2"
          : "px-2 py-2",
      ].join(" ")}
    >
      <p className="whitespace-pre-wrap break-words">
        {renderHighlightedContent(message.content)}
      </p>
      {message.typing && (
        <span className="inline-block w-2 animate-pulse align-baseline text-beige900">
          ▍
        </span>
      )}
    </article>
  );
};

export default React.memo(CareerMessageBubble);
