import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import CareerCallScreen from "./chat/CareerCallScreen";
import CareerComposerSection from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";

const CareerChatPanel = () => {
  const { inputMode } = useCareerChatPanelContext();

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col">
      {inputMode === "call" ? (
        <CareerCallScreen />
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
