import { canUseCareerDevControls } from "@/lib/internalAccess";
import { CAREER_TEXT_CHAT_MODEL_HEADER, resolveCareerTextChatModelForRequest } from "./textChatModelConfig";

/** Client selection is accepted only for an authenticated dev-controls account. */
export function resolveCareerRequestTextChatModel(
  request: Pick<Request, "headers">,
  user: { email?: string | null },
  bodyModel?: unknown,
) {
  return resolveCareerTextChatModelForRequest(
    bodyModel ?? request.headers.get(CAREER_TEXT_CHAT_MODEL_HEADER),
    canUseCareerDevControls(user.email),
  );
}
