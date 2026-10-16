/** Default schedules are the source of truth; the guide is a view, not a progress event. */
export async function readAutomaticFollowupFeed(
  admin: { from: (table: string) => any },
  workspaceId: string,
  talentId: string,
  roleIds: string[]
) {
  const { data, error } = await admin
    .from("company_talent_followups")
    .select("id,source_kind,source_id,role_id,created_at,idempotency_key")
    .eq("company_workspace_id", workspaceId)
    .eq("talent_id", talentId)
    .in("role_id", roleIds)
    .like("idempotency_key", "initial:%")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return automaticFollowupFeed(data ?? []);
}

type AutomaticSchedule = {
  id: string;
  source_kind: string;
  source_id: string;
  role_id: string;
  created_at: string;
  idempotency_key: string;
};

export function automaticFollowupFeed(rows: AutomaticSchedule[]) {
  const automaticIds = new Set(rows.map((row) => row.id));
  const introGuides = new Map<
    string,
    { id: string; roleId: string; createdAt: string }
  >();
  for (const row of rows) {
    if (row.source_kind === "intro" && !introGuides.has(row.source_id)) {
      introGuides.set(row.source_id, {
        id: `intro-followup-guide:${row.source_id}`,
        roleId: row.role_id,
        createdAt: row.created_at,
      });
    }
  }
  return {
    introGuides: [...introGuides.values()],
    // Historical automatic progress remains available to audit readers, not the user feed.
    showProgress(row: { kind: string; metadata: unknown }) {
      if (row.kind !== "company_followup") return true;
      const meta = row.metadata as Record<string, unknown> | null;
      return (
        meta?.eventType !== "date_anchored" &&
        !(
          meta?.eventType === "scheduled" &&
          automaticIds.has(String(meta.followupId))
        )
      );
    },
  };
}
