import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { dispatchInternalHiringNotification } from "@/lib/org/internalHiringNotificationDispatch";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  return dispatchInternalHiringNotification(request, getSupabaseAdmin);
}
