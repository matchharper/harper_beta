import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { getRequestUser } from "@/lib/supabaseServer";
import { runBrowserUseDev } from "@/lib/career/browserUseDev.server";
import { resolveCareerRequestBrowserServiceTier } from "@/lib/career/browserServiceTier.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCareerDevControls(user.email))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ task: z.string().trim().min(1) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "실행할 명령을 입력해 주세요." }, { status: 400 });

  const cancelled = new AbortController();
  // Leave time within the route's execution budget to cancel and close the browser.
  const signal = AbortSignal.any([req.signal, cancelled.signal, AbortSignal.timeout(240_000)]);
  let completion: Promise<void>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      completion = runBrowserUseDev(parsed.data.task, signal, (event) => {
        if (req.signal.aborted || cancelled.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          cancelled.abort();
        }
      }, resolveCareerRequestBrowserServiceTier(req, user)).finally(() => {
        try { controller.close(); } catch { /* Client disconnected. */ }
      });
    },
    cancel() { cancelled.abort(); },
  });
  // Keep remote cleanup alive even when the modal closes the response stream.
  after(() => completion);
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
