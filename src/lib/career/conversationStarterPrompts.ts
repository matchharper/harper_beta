import {
  getCareerConversationStarter,
  type CareerConversationStarterAction,
  getCareerConversationStarterTurnInstruction,
} from "./prompts/conversationStarters";

type CareerConversationStarterPrompt = CareerConversationStarterAction & {
  chatProactiveInstruction: string;
  voiceProactiveInstruction: string;
};

export function getCareerConversationStarterPrompt(
  value: unknown,
  locale?: string | null
): CareerConversationStarterPrompt | null {
  const starter = getCareerConversationStarter(value, locale);
  if (!starter) return null;

  return {
    ...starter,
    chatProactiveInstruction: getCareerConversationStarterTurnInstruction({
      channel: "chat",
      locale,
      starterId: starter.id,
    }),
    voiceProactiveInstruction: getCareerConversationStarterTurnInstruction({
      channel: "voice",
      locale,
      starterId: starter.id,
    }),
  };
}
