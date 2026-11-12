import { NextRequest } from "next/server";
import { z } from "zod";
import { InternalApiError, toInternalApiErrorResponse } from "@/lib/internalApi";
import { isInternalEmail } from "@/lib/internalAccess";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { runCareerRunDebug } from "@/lib/ops/careerRunDebug.server";
import type { CareerRunStreamEvent } from "@/lib/ops/careerRunDebug";

export const runtime = "nodejs";
export const maxDuration = 480;
const input = z.object({ userId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const user = await getFreshRequestUser(req);
    if (!user) throw new InternalApiError(401, "Unauthorized");
    if (!isInternalEmail(user.email)) throw new InternalApiError(403, "Forbidden");
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new InternalApiError(400, "Career 계정을 선택해 주세요.");

    const disconnected = new AbortController();
    const connection = AbortSignal.any([req.signal, disconnected.signal]);
    const signal = AbortSignal.any([connection, AbortSignal.timeout(430_000)]);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: CareerRunStreamEvent) => {
          if (!connection.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          await runCareerRunDebug(parsed.data.userId, signal, send);
        } catch (error) {
          send({ type: "error", message: error instanceof InternalApiError
            ? error.message : "Career run을 시작하지 못했습니다." });
        } finally {
          if (!disconnected.signal.aborted) controller.close();
        }
      },
      cancel() { disconnected.abort(); },
    });
    return new Response(stream, { headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    } });
  } catch (error) {
    return toInternalApiErrorResponse(
      error instanceof InternalApiError ? error : null, "Career run을 시작하지 못했습니다."
    );
  }
}
