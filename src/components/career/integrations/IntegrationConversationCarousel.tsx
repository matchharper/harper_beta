import {
  ConversationExamples,
  type ConversationExample,
} from "@/components/ui/conversation-examples";
import { useCareerT } from "@/i18n/useCareerT";

export type IntegrationConversationExample = ConversationExample;

export default function IntegrationConversationCarousel({
  examples,
}: {
  examples: readonly IntegrationConversationExample[];
}) {
  const t = useCareerT();
  return (
    <ConversationExamples
      examples={examples}
      navigationLabel={t(
        "career.integrations.carousel.navigation",
        "좌우로 넘겨 대화 예시 보기"
      )}
      getPageLabel={(number) =>
        t("career.integrations.carousel.go_to", "대화 예시 {number} 보기", {
          values: { number },
        })
      }
    />
  );
}
