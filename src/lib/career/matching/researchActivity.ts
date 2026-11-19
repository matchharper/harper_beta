import { executeSql } from "@/lib/externalRecommendationsV2/retrieval";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import { sqlLiteral } from "@/lib/sqlLiteral";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

type ResearchOperation = {
  id: string;
  createdAt: string;
  kind: "resource_search" | "resource_research" | "resource_evaluation";
  status: string;
  source: string | null;
  returned: number | null;
  completed: number | null;
  failed: number | null;
};

export async function readMatchingResearchActivity(args: {
  admin: TalentAdminClient;
  userId: string;
  matchingId: string;
  before?: string;
  limit?: number;
}) {
  const limit = args.limit ?? 30;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("Matching history page size must be a positive integer.");
  const cursor = args.before ? sqlLiteral(args.before) + "::uuid" : null;
  type PageRow = {
    cursorAvailable: boolean;
    operation: ResearchOperation | null;
  };
  const rows = await executeSql<PageRow>(
    args.admin,
    `
    with owned as (
      select m.id, m.talent_id from public.talent_matchings m
      join public.talent_users u on u.user_id = m.talent_id and u.deleted_at is null
      where m.id = ${sqlLiteral(args.matchingId)}::uuid and m.talent_id = ${sqlLiteral(args.userId)}::uuid
    ), tagged as not materialized (
      select o.* from public.talent_external_operations o join owned m
        on o.user_id = m.talent_id and o.request->>'matchingId' = m.id::text
      where o.kind in ('resource_search','resource_research','resource_evaluation')
        and public.career_resource_available_v1(o.user_id, jsonb_build_object('kind','operation','id',o.id))
        and (o.request->>'mailboxGeneration' is null or exists (
          select 1 from public.talent_integrations g where g.talent_id = o.user_id and g.provider = 'gmail'
          and g.status = 'active' and g.career_mail_sync->>'generation' = o.request->>'mailboxGeneration'
        ))
    )${cursor ? `, anchor as (select created_at,id from tagged where id = ${cursor})` : ""}
    select ${cursor ? "exists(select 1 from anchor)" : "true"} as "cursorAvailable", to_jsonb(page) as operation
    from owned left join lateral (
      select id, created_at as "createdAt", kind, status, request->>'source' as source,
        result->'count' as returned, result->'completed' as completed, result->'failed' as failed
      from tagged ${cursor ? "where (created_at,id) < (select created_at,id from anchor)" : ""}
      order by created_at desc,id desc limit ${limit + 1}
    ) page on true order by page."createdAt" desc,page.id desc
  `,
    limit + 1
  );
  if (!rows.length) throw new Error("Matching is unavailable.");
  if (!rows[0].cursorAvailable)
    throw new Error("Matching research history cursor is unavailable.");
  const operations = rows
    .slice(0, limit)
    .flatMap((row) => (row.operation ? [row.operation] : []));
  const nextBefore = rows.length > limit ? operations[limit - 1].id : null;
  const modelOutput = [
    `Saved research for matching ${args.matchingId} (${PROMPT_TIME_ZONE}, newest first).`,
    ...operations.map((op) =>
      [
        formatLlmDateTime(op.createdAt),
        op.source ?? op.kind,
        op.status,
        op.returned != null ? `${op.returned} returned` : "",
        op.completed != null ? `${op.completed} completed` : "",
        op.failed != null ? `${op.failed} failed` : "",
        `operation ${op.id}`,
      ]
        .filter(Boolean)
        .join(" · ")
    ),
    operations.length ? "" : "No linked research on this page.",
    nextBefore ? `Older research: read_matching with section=history, historyCursor=${nextBefore}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { matchingId: args.matchingId, operations, nextBefore, modelOutput };
}
