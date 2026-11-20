import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  verifyComposioWebhook,
  acceptGmailWebhook,
} from "@/lib/career/emailWriting/webhook";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.COMPOSIO_CAREER_WEBHOOK_SECRET;
  if (!secret)
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  const body = await request.text();
  if (!verifyComposioWebhook(body, request.headers, secret))
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  try {
    await acceptGmailWebhook(getTalentSupabaseAdmin(), JSON.parse(body));
    return Response.json({ received: true });
  } catch (error) {
    // Non-2xx asks Composio to retry. No acknowledgement precedes the durable
    // inbox write; model execution happens through the existing queue.
    console.warn("[career-mail] Webhook admission failed", {
      error: String(error),
    });
    return Response.json({ error: "Event admission failed" }, { status: 503 });
  }
}
