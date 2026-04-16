import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import CareerCallScreen from "./chat/CareerCallScreen";
import CareerComposerSection from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";
import CareerWelcomeScreen from "./chat/CareerWelcomeScreen";

const CareerChatPanel = () => {
  const {
    user,
    inputMode,
    messages,
    showVoiceStartPrompt,
    onboardingBeginPending,
  } = useCareerChatPanelContext();

  const hasStartedChatConversation = messages.some(
    (message) => (message.messageType ?? "chat") === "chat"
  );
  const showInitialWelcome =
    Boolean(user) &&
    inputMode !== "call" &&
    !hasStartedChatConversation &&
    (showVoiceStartPrompt || onboardingBeginPending);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col">
      {inputMode === "call" ? (
        <CareerCallScreen />
      ) : showInitialWelcome ? (
        <CareerWelcomeScreen />
      ) : (
        <>
          <CareerTimelineSection />
          <CareerComposerSection />
        </>
      )}
    </section>
  );
};

export default CareerChatPanel;
