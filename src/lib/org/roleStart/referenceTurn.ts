import "server-only";

import { hasRoleStartBrief, isRoleStartEnded, loadRoleStartSession } from "./session";

/**
 * Reference people in either chat (the role creation chat and the registered
 * Role's agent): on a role start Role the chat records nobody and points to
 * the web 참고 인물 box.
 * A Role without a role start Brief is not handled here and keeps the
 * existing calibration.
 */

export async function isReferenceRole(roleId: string) {
  const session = await loadRoleStartSession(roleId, { forView: true });
  if (!session || isRoleStartEnded(session.phase)) return false;
  return ["drafting", "questions", "review"].includes(session.phase) || (await hasRoleStartBrief(roleId));
}

/** Reference people come only from the web 참고 인물 box; the chat never records one. */
export const REFERENCE_BOX_ONLY =
  "참고 인물은 웹의 역할 화면에서 '참고 인물' 칸에 링크나 프로필로 넣어 주세요. 채팅으로는 기록하지 않아요.";

/** The fixed reply for a role start Role; null for any other Role (the caller calibrates as before). */
export async function referenceBoxOnlyTurn(roleId: string) {
  if (!(await isReferenceRole(roleId))) return null;
  return { status: "not_available" as const, userReply: REFERENCE_BOX_ONLY };
}
