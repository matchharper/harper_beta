import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { deliverCareerEmailReceipt } from "@/lib/career/background/delivery";
export const runtime = "nodejs";
export const maxDuration = 120;
const callback = handleCallback(async message => {
  const { deliveryId } = z.object({ deliveryId: z.string().uuid() }).parse(message);
  await deliverCareerEmailReceipt(getTalentSupabaseAdmin(), deliveryId);
}, { visibilityTimeoutSeconds: 180, retry: () => ({ afterSeconds: 60 }) });

export async function POST(request: Request) {
  return callback(request);
}
