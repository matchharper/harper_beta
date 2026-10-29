import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { runInspectionDebug } from "@/lib/ops/applicationFormInspection.server";
import type { InspectionStreamEvent } from "@/lib/ops/applicationFormInspection";
import {
  inspectionHttpsUrl,
  loadInspectionRole,
  runResolvedInspectionDebug,
} from "@/lib/ops/applicationLinkResolution.server";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const id = z
      .string()
      .uuid()
      .safeParse(req.nextUrl.searchParams.get("roleId"));
    if (!id.success)
      return NextResponse.json(
        { error: "외부 공고를 선택해 주세요." },
        { status: 400 }
      );
    return NextResponse.json(await loadInspectionRole(id.data, req.signal), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "공고를 불러오지 못했습니다.");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const parsed = z
      .discriminatedUnion("resolveOfficialLink", [
        z
          .object({
            resolveOfficialLink: z.literal(true),
            roleId: z.string().uuid().optional(),
            url: z.string().trim().url().optional(),
          })
          .strict(),
        z
          .object({
            resolveOfficialLink: z.literal(false).optional(),
            url: z.string().trim().url(),
          })
          .strict(),
      ])
      .refine(
        (value) => value.url || (value.resolveOfficialLink && value.roleId)
      )
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "공고를 선택하거나 직접 조사할 URL을 입력해 주세요." },
        { status: 400 }
      );
    const role =
      parsed.data.resolveOfficialLink && parsed.data.roleId && !parsed.data.url
        ? await loadInspectionRole(parsed.data.roleId, req.signal)
        : null;
    let url = "";
    if (parsed.data.url) {
      try {
        url = inspectionHttpsUrl(parsed.data.url);
      } catch {
        return NextResponse.json(
          { error: "공개 HTTPS 지원 페이지가 필요합니다." },
          { status: 400 }
        );
      }
    }
    const cancelled = new AbortController();
    const signal = AbortSignal.any([
      req.signal,
      cancelled.signal,
      AbortSignal.timeout(750_000),
    ]);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: InspectionStreamEvent) => {
          if (signal.aborted) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          } catch {
            cancelled.abort();
          }
        };
        try {
          if (parsed.data.resolveOfficialLink)
            await runResolvedInspectionDebug(role ?? url, signal, send);
          else await runInspectionDebug(url, signal, send);
        } catch (error) {
          send({
            type: "error",
            message:
              error instanceof Error ? error.message : "지원 폼 조사 실패",
          });
        } finally {
          try {
            controller.close();
          } catch {
            /* Client disconnected. */
          }
        }
      },
      cancel() {
        cancelled.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "지원 폼 조사를 시작하지 못했습니다."
    );
  }
}
