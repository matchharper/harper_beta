import { send } from "@vercel/queue";
export const APPLICATION_BROWSER_TOPIC = "career-application-browser-v1";
export async function enqueueApplicationBrowser(
  userId: string,
  conversationId: string,
  messageId: number,
  revision: number
) {
  return send(
    APPLICATION_BROWSER_TOPIC,
    { userId, conversationId, messageId },
    {
      idempotencyKey: `application-browser:${messageId}:${revision}`,
      retentionSeconds: 86400,
    }
  );
}
