import { after, NextRequest, NextResponse } from "next/server";
import webpush, { WebPushError } from "web-push";
import { z } from "zod";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DELAY_SECONDS = 30;

const bodySchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  title: z.string(),
  options: z.record(z.unknown()).optional(),
  delaySeconds: z.number().int().min(0).max(MAX_DELAY_SECONDS).default(0),
  urgency: z.enum(["very-low", "low", "normal", "high"]).default("normal"),
  ttlSeconds: z.number().int().min(0).default(60),
  topic: z.string().optional(),
});

const sendPush = async (body: z.infer<typeof bodySchema>) => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID 키가 설정되지 않았습니다.");
  const result = await webpush.sendNotification(
    body.subscription,
    JSON.stringify({ title: body.title, options: body.options ?? {} }),
    {
      vapidDetails: { subject: "https://matchharper.com", publicKey, privateKey },
      TTL: body.ttlSeconds,
      urgency: body.urgency,
      topic: body.topic || undefined,
    }
  );
  return result.statusCode;
};

const describeError = (error: unknown) =>
  error instanceof WebPushError
    ? `${error.statusCode} ${error.body || error.message}`
    : error instanceof Error
      ? error.message
      : String(error);

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCareerDevControls(user.email))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." }, { status: 400 });
  const body = parsed.data;

  if (body.delaySeconds > 0) {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, body.delaySeconds * 1000));
      await sendPush(body).catch((error) =>
        console.error("[dev-web-push] delayed send failed", describeError(error))
      );
    });
    return NextResponse.json({ ok: true, scheduledInSeconds: body.delaySeconds });
  }

  try {
    const statusCode = await sendPush(body);
    return NextResponse.json({ ok: true, statusCode });
  } catch (error) {
    return NextResponse.json({ ok: false, error: describeError(error) }, { status: 502 });
  }
}
