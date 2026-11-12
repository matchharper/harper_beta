import { randomUUID } from "node:crypto";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { CareerBackgroundRun } from "../background/types";
import {
  readFollowInventory,
  type FollowInventory,
  type FollowRole,
} from "./inventory";
import { formatCareerMatchingResult } from "../matching/formatters";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

type PreparationState = {
  status?: string;
  externalRunId?: string;
  internalRunId?: string;
  error?: string | null;
};
export const rolesNeedingEvaluation = (
  inventory: FollowInventory,
  source: FollowRole["source"]
) =>
  inventory.roles
    .filter(
      (role) =>
        role.source === source && !role.evaluation && !role.recommendationId
    )
    .map((role) => role.id);

const dependencies = {
  inventory: readFollowInventory,
  async external(args: {
    admin: TalentAdminClient;
    userId: string;
    conversationId?: string;
    operationId: string;
    roleIds: string[];
    preparationRunId: string;
  }) {
    const { requestExternalMatchingSearch } =
      await import("../matching/externalSearch");
    return requestExternalMatchingSearch(args);
  },
  async internal(args: {
    admin: TalentAdminClient;
    userId: string;
    conversationId?: string;
    operationId: string;
    roleIds: string[];
    preparationRunId: string;
  }) {
    const { requestInternalRoleEvaluation } =
      await import("../matching/internalEvaluation");
    return requestInternalRoleEvaluation(args);
  },
};

/** Child requests are committed before queue publication. Recover their exact
 * idempotency identities even when the transport never returned a receipt. */
async function recoverPreparationChildren(
  admin: TalentAdminClient,
  run: CareerBackgroundRun,
  state: PreparationState
) {
  if (!state.externalRunId) {
    const child = await (admin.from as any)("external_recommendation_runs")
      .select("id")
      .eq("talent_id", run.talent_id)
      .eq("operation_id", `follow-preparation:${run.id}:external`)
      .maybeSingle();
    if (child.error) throw child.error;
    if (child.data) state.externalRunId = child.data.id;
  }
  if (!state.internalRunId) {
    const child = await (admin.from as any)("opportunity_discovery_run")
      .select("id")
      .eq("talent_id", run.talent_id)
      .eq(
        "dedupe_key",
        `career-internal:${run.talent_id}:follow-preparation:${run.id}:internal`
      )
      .maybeSingle();
    if (child.error) throw child.error;
    if (child.data) state.internalRunId = child.data.id;
  }
}

export function shouldPrepareFollowedCompanies(run: CareerBackgroundRun) {
  // Production work starts from exact pending sources. The original agent can
  // read saved company evidence and request missing evaluations when needed.
  return run.trigger_payload.createdBy === "career_dev_controls";
}

/** The scheduler's existing invocation owns this preparation. Child evaluation
 * completion does not create a follow-trigger invocation or send a message. */
export async function prepareFollowedCompanies(
  args: { admin: TalentAdminClient; run: CareerBackgroundRun },
  deps = dependencies
) {
  const { admin, run } = args;
  if (!shouldPrepareFollowedCompanies(run))
    return { ready: true, state: {} as PreparationState };
  let state: PreparationState = run.coverage?.followPreparation ?? {};
  if (state.status === "ready") return { ready: true, state };
  const token = randomUUID();
  const claim = await (admin.rpc as any)("claim_career_follow_preparation", {
    p_run: run.id,
    p_token: token,
  });
  if (claim.error) throw claim.error;
  if (!claim.data) return { ready: false, state };
  // Reload after acquiring the lease: an earlier queue attempt may have saved
  // child receipts between the caller's read and this claim.
  const fresh = await (admin.from as any)("opportunity_discovery_run")
    .select("coverage")
    .eq("id", run.id)
    .single();
  if (fresh.error) throw fresh.error;
  state = { ...fresh.data.coverage?.followPreparation, error: null };
  let waiting = false;
  try {
    await recoverPreparationChildren(admin, run, state);
    if (!state.externalRunId || !state.internalRunId) {
      const inventory = await deps.inventory(admin, run.talent_id);
      const base = {
        admin,
        userId: run.talent_id,
        conversationId: run.conversation_id ?? undefined,
        preparationRunId: run.id,
      };
      const external = rolesNeedingEvaluation(inventory, "external");
      const internal = rolesNeedingEvaluation(inventory, "internal");
      if (!waiting && !state.externalRunId && external.length) {
        const receipt = await deps.external({
          ...base,
          operationId: `follow-preparation:${run.id}:external`,
          roleIds: external,
        });
        state.externalRunId = receipt.runId;
      }
      if (!waiting && !state.internalRunId && internal.length) {
        const receipt = await deps.internal({
          ...base,
          operationId: `follow-preparation:${run.id}:internal`,
          roleIds: internal,
        });
        state.internalRunId = receipt.runId;
      }
    }
  } catch (error) {
    // Completed child receipts survive a later source failure. An unavailable
    // source is incomplete evidence, not a claim of no changes.
    state.error = error instanceof Error ? error.message : String(error);
    waiting = true;
    // An unknown child cannot release the next preparation. If the durable
    // ledger itself is unavailable, let the existing invocation retry.
    await recoverPreparationChildren(admin, run, state);
  }
  for (const [source, id] of [
    ["external", state.externalRunId],
    ["internal", state.internalRunId],
  ] as const) {
    if (!id) continue;
    const child = await (admin.from as any)(
      source === "external"
        ? "external_recommendation_runs"
        : "opportunity_discovery_run"
    )
      .select("status")
      .eq("id", id)
      .eq("talent_id", run.talent_id)
      .single();
    if (child.error) {
      waiting = true; // Unknown child state cannot release another paid preparation.
      state.error = String(child.error.message ?? child.error);
      continue;
    }
    if (["queued", "running", "handed_off"].includes(child.data.status)) waiting = true;
  }
  state.status = waiting ? "waiting" : "ready";
  const saved = await (admin.rpc as any)("save_career_follow_preparation", {
    p_run: run.id,
    p_token: token,
    p_patch: state,
  });
  if (saved.error) throw saved.error;
  return { ready: !!saved.data && !waiting, state };
}

function score(role: FollowRole) {
  const assessment = role.evaluation?.assessment;
  return Number((assessment?.fit ?? assessment)?.mutualFit ?? -1);
}
export function formatFollowRoles(roles: FollowRole[]) {
  const externalRoles = roles.filter(role => role.source === "external");
  return [
    ...roles.map(
      (role) =>
        `Role ${role.id}; ${role.company} / ${role.name}; ${role.source}; posted ${role.postedAt ? formatLlmDateTime(role.postedAt) : "unknown"}; first stored ${formatLlmDateTime(role.createdAt)}${role.recommendationId ? `; already recommended ${role.recommendationId}` : ""}${role.source === "external" && !role.evaluation ? "; not evaluated" : ""}`
    ),
    externalRoles.length ? formatCareerMatchingResult({
      evaluations: externalRoles.flatMap((role) =>
        role.source === "external" && role.evaluation
          ? [
              {
                id: role.evaluation.id,
                role_id: role.id,
                evaluated_at: role.evaluation.evaluatedAt,
                assessment: role.evaluation.assessment,
                stage: role.evaluation.stage,
                role: {
                  name: role.name,
                  company_workspace: { company_name: role.company },
                },
              },
            ]
          : []
      ),
    }) : "",
    ...roles.flatMap((role) =>
      role.source === "external" && typeof role.evaluation?.assessment.proceedToStage2 === "boolean"
        ? [
            `Role ${role.id}: saved first-stage assessment proceedToStage2=${role.evaluation.assessment.proceedToStage2}.`,
          ]
        : []
    ),
    ...roles.flatMap((role) =>
      role.source === "external" && role.evaluation?.runId
        ? [
            `External evaluation runId: ${role.evaluation.runId}; role ${role.id}. Use search_opportunities action=read for detailed run evidence.`,
          ]
        : []
    ),
  ].filter(Boolean).join("\n");
}
export function formatFollowOverview(inventory: FollowInventory) {
  return inventory.companies
    .map((company) => {
      const roles = inventory.roles.filter((role) =>
        role.followIds.includes(company.id)
      );
      // A compact index, not an evaluation limit. Full evidence is paginated by
      // the existing follow_company tool. Internal roles already have recommendations.
      const recent = [...roles]
        .sort((a, b) =>
          (b.postedAt ?? b.createdAt).localeCompare(a.postedAt ?? a.createdAt)
        )
        .slice(0, 5);
      const strongest = [...roles]
        .filter((role) => role.evaluation && !role.recommendationId)
        .sort((a, b) => score(b) - score(a))
        .slice(0, 5);
      const selected = [
        ...new Map(
          [...recent, ...strongest].map((role) => [role.id, role])
        ).values(),
      ];
      return [
        `Follow ${company.id}; revision ${company.revision}; ${company.name}; ${company.scope}; followed ${formatLlmDateTime(company.followedAt)}.`,
        company.instruction
          ? `User's follow instruction: ${company.instruction}`
          : "",
        company.scope === "name"
          ? "Followed by name; no linked directory roles."
          : `${roles.length} external roles and existing internal recommendations. Index contains ${selected.length} roles.`,
        formatFollowRoles(selected),
        `Read this scope with follow_company action=read, companies=[{follow_id: "${company.id}"}].`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
export async function readPreparedFollowContext(
  admin: TalentAdminClient,
  userId: string,
  state: PreparationState = {}
) {
  const inventory = await readFollowInventory(admin, userId);
  const lines = [
    "Followed companies, external opportunities and existing internal recommendations.",
    formatFollowOverview(inventory),
    state.error ? `Followed-company preparation incomplete: ${state.error}` : "",
  ];
  if (state.externalRunId) {
    const result = await (admin.from as any)("external_recommendation_runs")
      .select("status,error").eq("id", state.externalRunId).eq("talent_id", userId).single();
    if (result.error) throw result.error;
    lines.push(`Preparation evaluation ${state.externalRunId}; external; ${result.data.status}${result.data.error ? `; incomplete: ${String(result.data.error)}` : ""}.`);
  }
  return inventory.companies.length || state.error
    ? lines.filter(Boolean).join("\n\n")
    : "No active followed-company scope to prepare.";
}
