import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  createOpportunityDiscoveryRun,
  fetchOpportunityRunsByIds,
  fetchLatestOpportunityRun,
  getActiveOpportunityRun,
  getOpportunityAdmin,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import type {
  OpportunityDiscoveryAgentVariant,
  OpportunityDiscoveryTrigger,
} from "@/lib/opportunityDiscovery/types";

export const runtime = "nodejs";

const OPPORTUNITY_RUN_BATCH_LIMIT = 50;
const RESERVED_CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT =
  "career_chat_external_search_v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseRunIds = (req: NextRequest) => {
  const values = req.nextUrl.searchParams
    .getAll("ids")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(values));
};

const isTrigger = (value: unknown): value is OpportunityDiscoveryTrigger =>
  value === "conversation_completed" ||
  value === "immediate_opportunity_requested" ||
  value === "periodic_refresh_due";

const isAgentVariant = (
  value: unknown
): value is OpportunityDiscoveryAgentVariant =>
  value === "tool_agent" ||
  value === "new_rule" ||
  value === "new_v2" ||
  value === "new_harper_agent_v2" ||
  value === "scripted" ||
  value === "scripted_human";

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getOpportunityAdmin();
    const requestedRunIds = parseRunIds(req);
    if (req.nextUrl.searchParams.has("ids")) {
      if (requestedRunIds.length > OPPORTUNITY_RUN_BATCH_LIMIT) {
        return NextResponse.json(
          {
            error: `At most ${OPPORTUNITY_RUN_BATCH_LIMIT} run IDs are allowed`,
          },
          { status: 400 }
        );
      }

      const runIds = requestedRunIds.filter((runId) =>
        UUID_PATTERN.test(runId)
      );
      const rows = await fetchOpportunityRunsByIds({
        admin,
        runIds,
        userId: user.id,
      });
      const rowById = new Map(rows.map((row) => [row.id.toLowerCase(), row]));
      const runs = runIds
        .map((runId) => serializeOpportunityRun(rowById.get(runId) ?? null))
        .filter((run) => run !== null);

      return NextResponse.json({ ok: true, runs });
    }

    const run = await fetchLatestOpportunityRun({ admin, userId: user.id });
    return NextResponse.json({ ok: true, run: serializeOpportunityRun(run) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load opportunity run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string;
      agentVariant?: unknown;
      claimForManualProcessing?: unknown;
      forceNew?: unknown;
      trigger?: unknown;
      triggerPayload?: Record<string, unknown>;
    };

    if (!isTrigger(body.trigger)) {
      return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });
    }
    if (
      body.triggerPayload?.runContract ===
      RESERVED_CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT
    ) {
      return NextResponse.json(
        { error: "Reserved opportunity run contract" },
        { status: 400 }
      );
    }

    const admin = getOpportunityAdmin();
    const conversationId = String(body.conversationId ?? "").trim() || null;
    const bodyAgentVariant = isAgentVariant(body.agentVariant)
      ? body.agentVariant
      : null;
    const payloadAgentVariant = isAgentVariant(
      body.triggerPayload?.opportunityAgentVariant
    )
      ? body.triggerPayload.opportunityAgentVariant
      : null;
    const agentVariant = bodyAgentVariant ?? payloadAgentVariant;
    const isLocalDev = process.env.NODE_ENV !== "production";
    const forceNew = body.forceNew === true && isLocalDev;
    const claimForManualProcessing =
      body.claimForManualProcessing === true && isLocalDev;
    const triggerPayload = {
      ...(body.triggerPayload ?? {}),
      ...(agentVariant ? { opportunityAgentVariant: agentVariant } : {}),
    };
    if (conversationId && !forceNew) {
      const activeRun = await getActiveOpportunityRun({
        admin,
        conversationId,
        userId: user.id,
      });
      if (activeRun) {
        return NextResponse.json({
          ok: true,
          run: serializeOpportunityRun(activeRun),
          runId: activeRun.id,
        });
      }
    }

    const run = await createOpportunityDiscoveryRun({
      admin,
      conversationId,
      initialStatus: claimForManualProcessing ? "running" : undefined,
      talentId: user.id,
      trigger: body.trigger,
      triggerPayload,
    });

    console.info("[opportunity-discovery] queued for harper_worker", {
      runId: run.id,
    });

    return NextResponse.json({
      ok: true,
      opportunityDiscoveryQueued: true,
      run: serializeOpportunityRun(run),
      runId: run.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create opportunity run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
