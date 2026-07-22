import { NextRequest, NextResponse } from "next/server";
import { getLlmErrorMessage } from "@/lib/llm/llm";
import { runOrgAgentChat } from "@/lib/org/agent/chat";
import type { OrgAgentChatBody } from "@/lib/org/agent/types";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

export const maxDuration = 180;

function getVisibleErrorMessage(error: unknown) {
  const detail = getLlmErrorMessage(error);
  if (process.env.NODE_ENV !== "production" && detail) return detail;
  return "Failed to run recruiter agent";
}

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const detail = getLlmErrorMessage(error);
  console.error("[org/agent/chat]", detail || error);
  return NextResponse.json(
    { error: getVisibleErrorMessage(error) },
    { status: 500 }
  );
}

const wantsSseStream = (req: NextRequest) =>
  (req.headers.get("accept") ?? "").includes("text/event-stream");

const createSseHeaders = () => ({
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream; charset=utf-8",
  "X-Accel-Buffering": "no",
});

const createSseMessage = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as OrgAgentChatBody;
    const args = {
      mentions: Array.isArray(body.mentions) ? body.mentions : [],
      message: body.message ?? "",
      model: body.model ?? null,
      roleId: body.roleId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    };

    if (!wantsSseStream(req)) {
      const payload = await runOrgAgentChat(args);
      return NextResponse.json({ ok: true, ...payload });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(createSseMessage(event, data)));
        };

        try {
          await runOrgAgentChat({ ...args, emit });
          emit("done", { ok: true });
        } catch (error) {
          const detail = getLlmErrorMessage(error);
          const message = getVisibleErrorMessage(error);
          console.error("[org/agent/chat:stream]", detail || error);
          emit("error", { error: message });
          emit("done", { ok: false });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: createSseHeaders() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
