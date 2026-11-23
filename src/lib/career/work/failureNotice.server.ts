import { notifySlackActivity } from "@/lib/slackActivity";
import type { WorkScope } from "./store";

type CareerTurnFailure = {
  userId: string;
  conversationId: string;
  invocationId: string;
  attempts: number | null;
  error: string;
};

/**
 * A reply that ended after repeated failures. The log keeps the error text
 * (runtime logs are retained for a day), and the team is told because a
 * person is waiting for an answer that did not come.
 */
export async function recordCareerTurnFailure(scope: WorkScope, failure: CareerTurnFailure) {
  const { error } = await scope.admin.from("logs").insert({
    type: "career_turn_failed",
    user_id: failure.userId,
    meta_data: failure,
  });
  if (error) console.error("[career-invocation] failure log not saved", error.message);

  const { data: talent } = await scope.admin.from("talent_users")
    .select("name, email").eq("user_id", failure.userId).maybeSingle();
  await notifySlackActivity({
    action: "Career 답변 실패",
    userId: failure.userId,
    name: talent?.name ?? null,
    email: talent?.email ?? null,
    details: [
      { label: "대화", value: failure.conversationId },
      { label: "invocation", value: failure.invocationId },
      { label: "시도", value: failure.attempts === null ? "" : `${failure.attempts}번 연속 실패` },
      { label: "마지막 오류", value: failure.error.slice(0, 300) },
    ],
  });
}
