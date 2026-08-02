import { useEffect, useRef, type RefObject } from "react";

export const useCareerChatAutoScroll = ({
  conversationId,
  initialScrollPending,
  messageCount,
  scrollRef,
  scrollTick,
}: {
  conversationId: string | null;
  initialScrollPending: boolean;
  messageCount: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTick: number;
}) => {
  const initialScrollConversationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId || initialScrollPending || messageCount === 0) return;
    if (initialScrollConversationRef.current === conversationId) return;

    const element = scrollRef.current;
    if (!element) return;

    element.scrollTo({ top: element.scrollHeight });
    initialScrollConversationRef.current = conversationId;
  }, [conversationId, initialScrollPending, messageCount, scrollRef]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [scrollRef, scrollTick]);
};
