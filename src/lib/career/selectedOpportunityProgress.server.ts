import { formatWorkIndex, listWork, type WorkScope } from "./work/store";

/** Existing durable records, scoped to the selected role; no inferred application state. */
export async function readSelectedOpportunityProgress(scope: WorkScope, roleId: string, knownWorkRevisions?: ReadonlyMap<string, number>) {
  const [recommendation, work] = await Promise.allSettled([
    scope.admin.from("talent_opportunity_recommendation")
      .select("id,saved_stage")
      .eq("talent_id", scope.userId).eq("role_id", roleId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    listWork(scope, undefined, true, roleId),
  ]);
  const lines: string[] = [];
  if (recommendation.status === "rejected" || recommendation.value.error) {
    lines.push("Saved opportunity: unknown (read failed).");
  } else if (recommendation.value.data) {
    const row = recommendation.value.data;
    lines.push(`Saved opportunity ${row.id}: ${row.saved_stage ?? "no stage"}.`);
  } else {
    lines.push("Saved opportunity: none.");
  }
  if (work.status === "rejected") {
    lines.push("Work history: unknown (read failed).");
  } else {
    const { works, nextCursor } = work.value;
    const known = works.filter(work => knownWorkRevisions?.get(work.id) === work.revision);
    const additional = works.filter(work => knownWorkRevisions?.get(work.id) !== work.revision);
    if (!works.length) lines.push("Work history: none.");
    if (known.length) lines.push(`Work in index above: ${known.map(work => work.id).join(", ")}.`);
    lines.push(...additional.map(work => formatWorkIndex(work, false)));
    if (nextCursor) lines.push(`More: manage_work list; target ${roleId}; include_closed true; before ${nextCursor}.`);
  }
  return lines.join("\n");
}
