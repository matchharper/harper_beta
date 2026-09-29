import type { OrgAgentChatEmitter } from "./chat";

/** The current, uncommitted message; saved assistant_message events own history. */
export function createOrgAgentTextStream(emit?: OrgAgentChatEmitter) {
  let text = "";
  return {
    append(delta: string) {
      if (!delta) return;
      text += delta;
      emit?.("text_delta", { delta });
    },
    replace(next: string) {
      if (text === next) return;
      text = next;
      emit?.("text_replace", { text });
    },
    committed() {
      // The client clears the live bubble on assistant_message as well.
      text = "";
    },
  };
}
