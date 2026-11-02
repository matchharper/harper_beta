import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { acceptCareerBackgroundRun } from "@/lib/career/background/server";
import {
  CAREER_BACKGROUND_TOOL_LOG,
  type CareerBackgroundToolLog,
  type CareerBackgroundLogPage,
} from "@/lib/career/background/toolTrace";

export const runtime = "nodejs";
export const maxDuration = 480;

const inputSchema = z.object({
  conversationId: z.string().uuid(),
  requestId: z.string().uuid(),
});

async function authenticate(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getTalentSupabaseAdmin();
  const { data: auth, error } = await admin.auth.getUser(token);
  if (error || !auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCareerDevControls(auth.user.email))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { admin, user: auth.user };
}

export async function GET(req: NextRequest) {
  try {
    const access = await authenticate(req);
    if (access instanceof NextResponse) return access;
    const { admin, user } = access;
    const parsed = z
      .object({
        runId: z.string().uuid(),
        after: z.coerce.number().int().nonnegative().safe(),
      })
      .safeParse({
        runId: req.nextUrl.searchParams.get("runId"),
        after: req.nextUrl.searchParams.get("after") ?? 0,
      });
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid run or cursor" },
        { status: 400 }
      );
    const { runId, after } = parsed.data;
    const { data: run, error } = await admin
      .from("opportunity_discovery_run")
      .select("id,status,error_message,coverage")
      .eq("id", runId)
      .eq("talent_id", user.id)
      .eq("trigger_payload->>createdBy", "career_dev_controls")
      .maybeSingle();
    if (error) throw error;
    if (!run)
      return NextResponse.json({ error: "Run unavailable" }, { status: 404 });
    // Cursor pagination avoids the database response row limit; no total log cap.
    const pageSize = 100;
    const result = await admin
      .from("logs")
      .select("id,meta_data")
      .eq("user_id", user.id)
      .eq("type", CAREER_BACKGROUND_TOOL_LOG)
      .eq("meta_data->>runId", runId)
      .gt("id", after)
      .order("id")
      .limit(pageSize + 1);
    if (result.error) throw result.error;
    const logs = (result.data ?? []).slice(0, pageSize).map((row) => ({
      ...(row.meta_data as Omit<CareerBackgroundToolLog, "id">),
      id: row.id,
    }));
    const coverage = run.coverage as Record<string, unknown> | null;
    return NextResponse.json(
      {
        run: {
          id: run.id,
          status: run.status,
          error: run.error_message,
          outcome:
            typeof coverage?.agentOutcome === "string"
              ? coverage.agentOutcome
              : null,
        },
        logs,
        nextCursor: logs.at(-1)?.id ?? after,
        hasMore: (result.data?.length ?? 0) > pageSize,
      } satisfies CareerBackgroundLogPage,
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[dev-career-agent] Log read failed", error);
    return NextResponse.json(
      { error: "실행 로그를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // This can send real email. Verify Auth instead of the local JWT fallback.
    const access = await authenticate(req);
    if (access instanceof NextResponse) return access;
    const { admin, user } = access;

    const parsed = inputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "대화와 실행 요청을 확인해 주세요." },
        { status: 400 }
      );
    const { conversationId, requestId } = parsed.data;
    const owner = await admin
      .from("talent_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (owner.error) throw owner.error;
    if (!owner.data)
      return NextResponse.json(
        { error: "Conversation unavailable" },
        { status: 404 }
      );

    // Enter at the Worker's handoff boundary. The shared queue owns the model
    // loop, continuations and delivery, including local Next development jobs.
    // Repeating an HTTP request preserves the run and its email outbox.
    const runs = () => admin.from("opportunity_discovery_run");
    const now = new Date().toISOString();
    const inserted = await runs().upsert(
      {
        id: requestId,
        talent_id: user.id,
        conversation_id: conversationId,
        trigger: "immediate_opportunity_requested",
        run_mode: "immediate",
        status: "running",
        lease_token: requestId,
        lease_heartbeat_at: now,
        started_at: now,
        target_recommendation_count: 0,
        dedupe_key: `dev_career_agent:${user.id}:${requestId}`,
        trigger_payload: {
          runContract: "career_agent_v1",
          createdBy: "career_dev_controls",
          contactScope: "delegated_work",
          locksConversationInput: false,
          purpose:
            "A manual Career check was requested from this candidate's Dev Controls.",
        },
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (inserted.error) throw inserted.error;
    const stored = await runs()
      .select("id,lease_token")
      .eq("id", requestId)
      .eq("talent_id", user.id)
      .eq("conversation_id", conversationId)
      .eq("trigger_payload->>createdBy", "career_dev_controls")
      .maybeSingle();
    if (stored.error) throw stored.error;
    if (!stored.data)
      return NextResponse.json({ error: "Run unavailable" }, { status: 404 });
    const receipt = await acceptCareerBackgroundRun({
      admin,
      discoveryRunId: stored.data.id,
      leaseToken: stored.data.lease_token ?? requestId,
    });
    return NextResponse.json(
      { runId: receipt.discoveryRunId, status: receipt.status },
      { status: 202 }
    );
  } catch (error) {
    console.error("[dev-career-agent] Invocation failed", error);
    return NextResponse.json(
      { error: "Career agent 실행을 접수하지 못했습니다. 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
