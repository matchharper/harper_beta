import { NextRequest } from "next/server";
import { z } from "zod";
import { InternalApiError, toInternalApiErrorResponse } from "@/lib/internalApi";
import { isInternalEmail } from "@/lib/internalAccess";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { runCareerRunDebug } from "@/lib/ops/careerRunDebug.server";
import { careerRunModels, findCareerRunModel, type CareerRunModelSelection, type CareerRunStreamEvent } from "@/lib/ops/careerRunDebug";

export const runtime = "nodejs";
export const maxDuration = 480;
const modelIds = careerRunModels.map(model => model.id) as [CareerRunModelSelection["model"], ...CareerRunModelSelection["model"][]];
const input = z.object({
  userId: z.string().uuid(),
  model: z.enum(modelIds).optional(),
  effort: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getFreshRequestUser(req);
    if (!user) throw new InternalApiError(401, "Unauthorized");
    if (!isInternalEmail(user.email)) throw new InternalApiError(403, "Forbidden");
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new InternalApiError(400, "Career 계정을 선택해 주세요.");
    const { userId, model, effort = "default" } = parsed.data;
    const efforts: readonly string[] = model ? findCareerRunModel(model)?.efforts ?? [] : [];
    if (model && effort !== "default" && !efforts.includes(effort))
      throw new InternalApiError(400, `${model}는 reasoning effort ${effort}를 지원하지 않습니다.`);
    const selection = model ? { model, effort } as CareerRunModelSelection : undefined;

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
          await runCareerRunDebug(userId, signal, send, selection);
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
