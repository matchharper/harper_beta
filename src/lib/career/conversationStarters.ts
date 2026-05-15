import { getCareerConversationStarterCallOpeningText } from "@/lib/career/prompts/conversationStarters";

export type CareerConversationStarterId = "preference_update" | "match_quality";

export type CareerConversationStarterMode = "chat" | "call";

export type CareerConversationStarterAction = {
  id: CareerConversationStarterId;
  label: string;
  shortLabel: string;
  chatMessage: string;
  callOpeningText: string;
};

export const CAREER_CONVERSATION_STARTERS: CareerConversationStarterAction[] = [
  {
    id: "preference_update",
    label: "선호 조건 업데이트하기",
    shortLabel: "선호 조건 업데이트",
    chatMessage: "선호 조건을 업데이트하고 싶어요.",
    callOpeningText:
      getCareerConversationStarterCallOpeningText("preference_update"),
  },
  {
    id: "match_quality",
    label: "더 이야기하고 더 좋은 연결 받기",
    shortLabel: "경험 더 들려주기",
    chatMessage: "제 정보와 경험을 조금 더 자세히 이야기할 수 있어요.",
    callOpeningText:
      getCareerConversationStarterCallOpeningText("match_quality"),
  },
];

const CAREER_CONVERSATION_STARTER_BY_ID = new Map(
  CAREER_CONVERSATION_STARTERS.map((starter) => [starter.id, starter])
);

export function getCareerConversationStarter(
  value: unknown
): CareerConversationStarterAction | null {
  if (typeof value !== "string") return null;
  return (
    CAREER_CONVERSATION_STARTER_BY_ID.get(
      value as CareerConversationStarterId
    ) ?? null
  );
}

export function isCareerConversationStarterId(
  value: unknown
): value is CareerConversationStarterId {
  return Boolean(getCareerConversationStarter(value));
}
