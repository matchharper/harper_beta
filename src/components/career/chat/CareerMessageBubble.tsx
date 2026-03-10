import type { CareerMessage } from "@/components/career/types";

// User bubble 색상을 바꾸려면 이 클래스를 수정하세요.
export const USER_BUBBLE_CLASS =
  "ml-auto bg-hblack100/60 px-3 py-2 text-hblack1000";

export const ASSISTANT_BUBBLE_CLASS = "text-hblack700";

type Props = {
  message: CareerMessage;
  isUser: boolean;
};

const CareerMessageBubble = ({ message, isUser }: Props) => {
  return (
    <article
      className={[
        "max-w-[96%] rounded-lg text-sm leading-relaxed",
        isUser ? USER_BUBBLE_CLASS : ASSISTANT_BUBBLE_CLASS,
      ].join(" ")}
    >
      <p className="whitespace-pre-line">{message.content}</p>
      {message.typing && (
        <span className="inline-block w-2 animate-pulse align-baseline text-xprimary">
          ▍
        </span>
      )}
    </article>
  );
};

export default CareerMessageBubble;
