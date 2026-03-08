import { useEffect, useRef } from "react";
import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import CareerComposerSection from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";

const CareerChatPanel = () => {
  const { inputMode, messages } = useCareerChatPanelContext();

  const spokenAssistantIdsRef = useRef<Set<string>>(new Set());
  const previousInputModeRef = useRef(inputMode);

  useEffect(() => {
    if (previousInputModeRef.current !== inputMode) {
      if (inputMode === "voice") {
        const existingAssistantIds = messages
          .filter((message) => message.role === "assistant")
          .map((message) => String(message.id));
        spokenAssistantIdsRef.current = new Set(existingAssistantIds);
      } else if (
        previousInputModeRef.current === "voice" &&
        typeof window !== "undefined"
      ) {
        window.speechSynthesis?.cancel();
      }
      previousInputModeRef.current = inputMode;
    }
  }, [inputMode, messages]);

  useEffect(() => {
    if (inputMode !== "voice") return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const latestAssistantMessage = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          !message.typing &&
          Boolean(message.content.trim()) &&
          (message.messageType ?? "chat") === "chat"
      );

    if (!latestAssistantMessage) return;

    const messageId = String(latestAssistantMessage.id);
    if (spokenAssistantIdsRef.current.has(messageId)) return;
    spokenAssistantIdsRef.current.add(messageId);

    const utterance = new SpeechSynthesisUtterance(
      latestAssistantMessage.content
    );
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [inputMode, messages]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      window.speechSynthesis?.cancel();
    };
  }, []);

  return (
    <section className="flex min-h-[760px] flex-col lg:col-span-7 lg:h-[calc(100vh-80px)]">
      <CareerTimelineSection />
      <CareerComposerSection />
    </section>
  );
};

export default CareerChatPanel;
