import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { enqueueCompanyUpdate } from "@/lib/org/agent/companyUpdate.server";
import { externalContactNoticeFacts, externalSearchNoticeFacts, externalSourcingEnabledFor } from "@/lib/org/agent/externalSourcing";
import { loadExternalSearchResult, loadShownExternalCandidate } from "@/lib/org/agent/externalSourcing.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function record(value: Json | undefined): { [key: string]: Json | undefined } {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Worker -> web: a finished external sourcing run, or an email lookup the company asked for, is
 * handed to the company-side LLM through the ordinary company update queue. The Worker owns
 * retries and backoff; this route is idempotent per row (eventKey) and records the queued job.
 */
export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as { runId?: unknown; contactId?: unknown };
    const contactId = String(body.contactId ?? "").trim().slice(0, 100);
    if (contactId) return NextResponse.json(await deliverContactNotice(contactId));
    const runId = String(body.runId ?? "").trim().slice(0, 100);
    if (!runId) throw new InternalApiError(400, "runId or contactId is required");
    return NextResponse.json(await deliverRunNotice(runId));
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to deliver external sourcing notice");
  }
}

async function deliverRunNotice(runId: string) {
  const admin = getSupabaseAdmin();
  const { data: run, error } = await admin.from("external_sourcing_runs")
    .select("id,company_workspace_id,role_id,trigger,status,result,role:company_roles(name)")
    .eq("id", runId).maybeSingle();
  if (error) throw error;
  if (!run) throw new InternalApiError(404, "External sourcing run not found");
  if (run.trigger === "shadow" || !["succeeded", "skipped", "failed"].includes(run.status)) {
    throw new InternalApiError(409, "Run is not ready for a company notice");
  }
  const result = record(run.result);
  const notice = record(result.companyNotice);
  if (notice.status === "sent" && notice.jobId) return { ok: true, notice };
  // A workspace taken off the list after the run started is not told about a feature it cannot see.
  if (!externalSourcingEnabledFor(run.company_workspace_id)) {
    const skipped = { status: "skipped", reason: "not_enabled", at: new Date().toISOString() };
    const { error: skipError } = await admin.from("external_sourcing_runs")
      .update({ result: { ...result, companyNotice: skipped }, updated_at: new Date().toISOString() }).eq("id", runId);
    if (skipError) throw skipError;
    return { ok: true, notice: skipped };
  }
  const loaded = await loadExternalSearchResult({ admin, workspaceId: run.company_workspace_id, roleId: run.role_id, runId });
  if (!loaded.run) throw new InternalApiError(409, "Run is not visible to the company");
  const { jobId } = await enqueueCompanyUpdate({
    workspaceId: run.company_workspace_id, roleId: run.role_id, eventKey: `external_sourcing:${runId}`,
    purpose: "Share the verified outcome of the external candidate search for this Role in the company's hiring conversation, and propose a concrete next step when it is useful.",
    facts: externalSearchNoticeFacts({ run: loaded.run, roleName: run.role?.name ?? "", candidates: loaded.candidates }),
  });
  const sent = { ...notice, status: "sent", jobId, deliveredAt: new Date().toISOString() };
  const { error: updateError } = await admin.from("external_sourcing_runs")
    .update({ result: { ...result, companyNotice: sent }, updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (updateError) throw updateError;
  return { ok: true, notice: sent };
}

async function deliverContactNotice(contactId: string) {
  const admin = getSupabaseAdmin();
  const { data: contact, error } = await admin.from("external_candidate_contacts")
    .select("id,company_workspace_id,role_id,external_candidate_id,requested_by,status,result,role:company_roles(name)")
    .eq("id", contactId).maybeSingle();
  if (error) throw error;
  if (!contact) throw new InternalApiError(404, "External contact not found");
  if (!contact.requested_by || !["found", "not_found", "failed"].includes(contact.status)) {
    throw new InternalApiError(409, "Lookup is not ready for a company notice");
  }
  const result = record(contact.result);
  const notice = record(result.companyNotice);
  if (notice.status === "sent" && notice.jobId) return { ok: true, notice };
  if (!externalSourcingEnabledFor(contact.company_workspace_id)) {
    const skipped = { status: "skipped", reason: "not_enabled", at: new Date().toISOString() };
    const { error: skipError } = await admin.from("external_candidate_contacts")
      .update({ result: { ...result, companyNotice: skipped }, updated_at: new Date().toISOString() }).eq("id", contactId);
    if (skipError) throw skipError;
    return { ok: true, notice: skipped };
  }
  const candidate = await loadShownExternalCandidate({ admin, workspaceId: contact.company_workspace_id,
    candidateRef: contact.external_candidate_id });
  if (!candidate) throw new InternalApiError(409, "Person is not visible to the company");
  const { jobId } = await enqueueCompanyUpdate({
    workspaceId: contact.company_workspace_id, roleId: contact.role_id, eventKey: `external_contact:${contactId}`,
    purpose: "Share the verified outcome of the email lookup the company asked for, in the company's hiring conversation.",
    facts: externalContactNoticeFacts({ contactId, roleName: contact.role?.name ?? "", candidate }),
  });
  const sent = { ...notice, status: "sent", jobId, deliveredAt: new Date().toISOString() };
  const { error: updateError } = await admin.from("external_candidate_contacts")
    .update({ result: { ...result, companyNotice: sent }, updated_at: new Date().toISOString() })
    .eq("id", contactId);
  if (updateError) throw updateError;
  return { ok: true, notice: sent };
}
