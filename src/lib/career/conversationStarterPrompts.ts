import {
  getCareerConversationStarter,
  type CareerConversationStarterAction,
} from "./conversationStarters";
import { getCareerConversationStarterTurnInstruction } from "./prompts/conversationStarters";

type CareerConversationStarterPrompt = CareerConversationStarterAction & {
  chatProactiveInstruction: string;
  voiceProactiveInstruction: string;
};

export function getCareerConversationStarterPrompt(
  value: unknown
): CareerConversationStarterPrompt | null {
  const starter = getCareerConversationStarter(value);
  if (!starter) return null;

  return {
    ...starter,
    chatProactiveInstruction: getCareerConversationStarterTurnInstruction({
      channel: "chat",
      starterId: starter.id,
    }),
    voiceProactiveInstruction: getCareerConversationStarterTurnInstruction({
      channel: "voice",
      starterId: starter.id,
    }),
  };
}
