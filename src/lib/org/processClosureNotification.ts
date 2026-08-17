export type OrgProcessClosureNotification = {
  deliveredAt: string | null;
  sentChannel: string | null;
  status: "not_sent" | "sent";
  stoppedAt: string | null;
};

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

  return {
    deliveredAt: auditMatchesCurrentStop ? latestAudit.created_at : null,
    sentChannel: auditMatchesCurrentStop
      ? text(auditMetadata.sentChannel) || null
      : null,
    status: auditMatchesCurrentStop ? "sent" : "not_sent",
    stoppedAt: latestStop?.created_at ?? null,
  };
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
