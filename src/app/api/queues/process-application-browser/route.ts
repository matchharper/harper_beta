import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { runApplicationBrowser } from "@/lib/career/simulation/applicationBrowserServer";
import { sessionOperation } from "@/lib/career/simulation/sessionStore";
export const maxDuration = 300;
export const runtime = "nodejs";
const schema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.number().int().positive(),
});
const queueCallback = handleCallback(async (raw: unknown) => {
  const { messageId, ...ids } = schema.parse(raw);
  const store = { ...ids, admin: getTalentSupabaseAdmin() };
  await runApplicationBrowser(store, messageId);
  const latest = await sessionOperation({
    ...store,
    operation: "read",
    messageId,
  });
  if (
    latest?.state.status === "active" &&
    latest.state.browser &&
    (["queued", "running"].includes(latest.state.browser.status) ||
      (latest.state.browser.result && !latest.state.browser.resultMessageId))
  )
    throw new Error(
      "Application browser is still running; reconnect this session"
    );
});

export async function POST(request: Request) {
  return queueCallback(request);
}
