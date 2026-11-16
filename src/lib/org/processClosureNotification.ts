import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

export type OrgProcessClosureNotification = {
  deliveredAt: string | null;
  sentChannel: string | null;
  /** withheld: the company chose no separate closing note and none was delivered. */
  status: "not_sent" | "sent" | "withheld";
  stoppedAt: string | null;
};

export function isOrgProcessClosureNoticeUnresolved(args: {
  currentStageChangedAt?: string | null;
  deliveredAt?: string | null;
  savedStage?: string | null;
}) {
  if (text(args.savedStage).toLowerCase() !== "closed") return false;
  const deliveredAt = Date.parse(text(args.deliveredAt));
  if (!Number.isFinite(deliveredAt)) return false;
  const currentStageChangedAt = Date.parse(text(args.currentStageChangedAt));
  return (
    !Number.isFinite(currentStageChangedAt) ||
    currentStageChangedAt < deliveredAt
  );
}

type ProgressRow = {
  created_at: string;
  kind: string;
  metadata: unknown;
  role_id: string;
  text?: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isProcessStoppedEvent(row: ProgressRow) {
  const metadata = record(row.metadata);
  return (
    text(metadata.stage) === "process_stopped" ||
    text(metadata.tag) === "내부:프로세스중단" ||
    /프로세스\s*중단|진행을\s*중단/.test(text(row.text))
  );
}

export function resolveOrgProcessClosureNotification(args: {
  auditRows: ProgressRow[];
  stopRows: ProgressRow[];
}): OrgProcessClosureNotification {
  const latestStop = [...args.stopRows]
    .filter(isProcessStoppedEvent)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  const latestAudit = [...args.auditRows].sort((left, right) =>
    right.created_at.localeCompare(left.created_at)
  )[0];
  const auditMatchesCurrentStop = Boolean(
    latestAudit &&
    (!latestStop || latestAudit.created_at >= latestStop.created_at)
  );
  const auditMetadata = record(latestAudit?.metadata);
  const withheld = record(latestStop?.metadata).notifyCandidateOnClosure === false;

  return {
    deliveredAt: auditMatchesCurrentStop ? latestAudit.created_at : null,
    sentChannel: auditMatchesCurrentStop
      ? text(auditMetadata.sentChannel) || null
      : null,
    status: auditMatchesCurrentStop ? "sent" : withheld ? "withheld" : "not_sent",
    stoppedAt: latestStop?.created_at ?? null,
  };
}

/** The pair's closure, only while the company's latest stage change ended the process. */
export function resolveOrgCurrentProcessClosure(
  rows: ProgressRow[]
): OrgProcessClosureNotification | null {
  const stageChanges = rows
    .filter((row) => row.kind === "org_stage_change")
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  if (!stageChanges[0] || !isProcessStoppedEvent(stageChanges[0])) return null;
  return resolveOrgProcessClosureNotification({
    auditRows: rows.filter((row) => row.kind === "internal_process_stopped_notified"),
    stopRows: stageChanges,
  });
}

type Query = (sql: string, params?: unknown[]) => Promise<any[]>;

/** Current closures for already-authorized candidate/Role pairs, keyed `${talentId}:${roleId}`. */
export async function readOrgCurrentProcessClosures(
  query: Query,
  pairs: Array<{ talentId: string; roleId: string }>
) {
  const keys = new Set(pairs.map((pair) => `${pair.talentId}:${pair.roleId}`));
  const result = new Map<string, OrgProcessClosureNotification>();
  if (keys.size === 0) return result;
  const rows = await query(
    `SELECT talent_id::text, role_id::text, to_json(created_at)#>>'{}' AS created_at, kind, metadata, text
    FROM public.talent_progress
    WHERE talent_id=ANY($1::uuid[]) AND role_id=ANY($2::uuid[])
      AND kind IN ('org_stage_change','internal_process_stopped_notified')
    ORDER BY created_at DESC LIMIT 500`,
    [
      [...new Set(pairs.map((pair) => pair.talentId))],
      [...new Set(pairs.map((pair) => pair.roleId))],
    ]
  );
  for (const key of keys) {
    const closure = resolveOrgCurrentProcessClosure(
      rows.filter((row) => `${row.talent_id}:${row.role_id}` === key)
    );
    if (closure) result.set(key, closure);
  }
  return result;
}

/** Company-audience fact for agent correspondence. The candidate side never reads it. */
export function formatOrgProcessClosureForCompanyAgent(args: {
  candidateName: string | null;
  closure: OrgProcessClosureNotification;
  roleId: string;
}) {
  const { closure } = args;
  const note =
    closure.status === "withheld"
      ? "the company chose not to have Harper send the candidate a separate closing note; the candidate's screen shows only the closed status"
      : closure.status === "sent"
        ? `delivered to the candidate ${formatLlmDateTime(closure.deliveredAt)}${closure.sentChannel ? ` (${closure.sentChannel})` : ""}`
        : "the company allowed it; not delivered yet";
  return `Company hiring decision: ${args.candidateName ?? "this candidate"} for Role ${args.roleId} — the company ended the process ${formatLlmDateTime(closure.stoppedAt)}. Separate closing note to the candidate: ${note}.`;
}

export async function fetchOrgProcessClosureNotifications(args: {
  admin: any;
  roleIds: string[];
  talentId: string;
}) {
  const roleIds = Array.from(new Set(args.roleIds.map(text).filter(Boolean)));
  const result = new Map<string, OrgProcessClosureNotification>();
  if (roleIds.length === 0) return result;

  const [auditResult, stopResult] = await Promise.all([
    args.admin
      .from("talent_progress")
      .select("created_at, kind, metadata, role_id, text")
      .eq("talent_id", args.talentId)
      .in("role_id", roleIds)
      .eq("kind", "internal_process_stopped_notified")
      .order("created_at", { ascending: false })
      .limit(200),
    args.admin
      .from("talent_progress")
      .select("created_at, kind, metadata, role_id, text")
      .eq("talent_id", args.talentId)
      .in("role_id", roleIds)
      .eq("kind", "org_stage_change")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (auditResult.error) throw auditResult.error;
  if (stopResult.error) throw stopResult.error;

  const audits = (auditResult.data ?? []) as ProgressRow[];
  const stops = (stopResult.data ?? []) as ProgressRow[];
  for (const roleId of roleIds) {
    result.set(
      roleId,
      resolveOrgProcessClosureNotification({
        auditRows: audits.filter((row) => row.role_id === roleId),
        stopRows: stops.filter((row) => row.role_id === roleId),
      })
    );
  }
  return result;
}
