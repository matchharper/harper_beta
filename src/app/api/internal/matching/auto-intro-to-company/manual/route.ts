import { NextRequest } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import type {
  AutoIntroManualDoneEvent,
  AutoIntroManualTraceEvent,
} from "@/lib/ops/autoIntroToCompanyDebugTypes";
import { runManualAutoIntroToCompany } from "@/lib/ops/autoIntroToCompanyLlm";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function requiredId(value: unknown, name: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new InternalApiError(400, `${name} is required`);
  if (normalized.length > 200) {
    throw new InternalApiError(400, `${name} is too long`);
  }
  return normalized;
}

function streamLine(
  event: AutoIntroManualTraceEvent | AutoIntroManualDoneEvent
) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!payload) throw new InternalApiError(400, "Invalid JSON body");

    const workspaceId = requiredId(payload.workspaceId, "workspaceId");
    const roleId = requiredId(payload.roleId, "roleId");
    const talentId = requiredId(payload.talentId, "talentId");
    const encoder = new TextEncoder();
    let streamClosed = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        streamClosed = true;
      },
      start(controller) {
        const send = (
          event: AutoIntroManualTraceEvent | AutoIntroManualDoneEvent
        ) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(streamLine(event)));
          } catch {
            streamClosed = true;
          }
        };

        void (async () => {
          try {
            const result = await runManualAutoIntroToCompany({
              onTrace: send,
              roleId,
              talentId,
              workspaceId,
            });
            send({ ...result, type: "done" });
          } catch (error) {
            console.error("[auto-intro-to-company:manual]", error);
            send({
              message:
                error instanceof Error
                  ? error.message
                  : "수동 Slack 추천 실행에 실패했습니다.",
              type: "error",
            });
          } finally {
            if (!streamClosed) {
              streamClosed = true;
              controller.close();
            }
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "수동 Slack 추천 실행을 시작하지 못했습니다."
    );
  }
}
