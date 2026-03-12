import CareerComposerSection from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";

const CareerChatPanel = () => (
  <section className="flex min-h-0 flex-1 flex-col lg:h-full">
    <CareerTimelineSection />
    <CareerComposerSection />
  </section>
);

export default CareerChatPanel;
