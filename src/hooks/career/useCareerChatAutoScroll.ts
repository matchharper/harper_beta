import { useEffect, useRef, type RefObject } from "react";

export const useCareerChatAutoScroll = ({
  conversationId,
  initialScrollPending,
  messageCount,
  scrollRef,
  scrollTick,
  preserveReadingPosition = false,
}: {
  conversationId: string | null;
  initialScrollPending: boolean;
  messageCount: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTick: number;
  preserveReadingPosition?: boolean;
}) => {
  const nearBottom = useRef(true);
  useEffect(() => {
    const element=scrollRef.current;
    if (!element) return;
    nearBottom.current=true;
    const measure=()=>{nearBottom.current=element.scrollHeight-element.scrollTop-element.clientHeight<96;};
    element.addEventListener("scroll",measure,{passive:true});
    return ()=>element.removeEventListener("scroll",measure);
  },[scrollRef,conversationId]);
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
    if (preserveReadingPosition && !nearBottom.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [scrollRef, scrollTick, preserveReadingPosition]);
};
