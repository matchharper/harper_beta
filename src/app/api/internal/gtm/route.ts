import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  deliverWorkspaceApproval,
  syncWorkspaceMail,
} from "@/lib/contentsEngine/workspaceMail";

export const runtime = "nodejs";
export const maxDuration = 300;

// Forward the verified user's JWT. The database checks the internal account
// again; neither a service-role credential nor an Agent token reaches the UI.
export async function POST(request: NextRequest) {
  try {
    await requireInternalApiUser(request);
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 262144) {
      return NextResponse.json(
        { error: "요청이 너무 큽니다." },
        { status: 413 }
      );
    }
    let body: { action?: unknown; data?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "잘못된 요청입니다." },
        { status: 400 }
      );
    }
    if (
      !body ||
      typeof body.action !== "string" ||
      !body.data ||
      typeof body.data !== "object" ||
      Array.isArray(body.data)
    ) {
      return NextResponse.json(
        { error: "action과 data가 필요합니다." },
        { status: 400 }
      );
    }
    if (body.action === "sync_mail") {
      return NextResponse.json(await syncWorkspaceMail(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: request.headers.get("authorization")! },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    const { data, error } = await client.rpc("gtm_workspace", {
      p_action: body.action,
      p_data: body.data,
    });
    if (error) {
      const status =
        error.code === "40001"
          ? 409
          : error.code === "42501" || error.code === "28000"
            ? 403
            : error.code === "P0002"
              ? 404
              : error.code === "PGRST202"
                ? 503
                : 400;
      return NextResponse.json(
        {
          error:
            error.code === "PGRST202"
              ? "GTM 화면용 DB 설정이 아직 적용되지 않았습니다."
              : error.code === "40001"
                ? "다른 팀원이 수정했습니다. 최신 값을 확인한 뒤 다시 저장하세요."
                : error.message,
        },
        { status }
      );
    }
    let result = data;
    if (
      body.action === "review_outreach" &&
      (body.data as Record<string, unknown>).decision === "approve"
    ) {
      result = await deliverWorkspaceApproval(data, async () => {
        const latest = await client.rpc("gtm_workspace", {
          p_action: "get_record",
          p_data: { source: "review", record_id: data.id },
        });
        if (latest.error) throw new Error(latest.error.message);
        return latest.data.record;
      });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "GTM 요청을 처리하지 못했습니다.");
  }
}
