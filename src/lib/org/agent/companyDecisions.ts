import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { companyAgentIsCorrespondence } from "@/lib/agentContacts/companyScope";
import type { User } from "@supabase/supabase-js";
import { assertOrgTeamRoleAccess, visibleOrgRoleIds } from "../teamAccess";
import { nonnegativeInteger, positiveInteger, textId } from "./companyMemory";
import { OrgAgentToolInputError } from "./toolAvailability";
import type { OrgAgentAdminClient } from "./data";

/**
 * Harper's one read path to what the company decided and why: every recorded
 * decision (company_decision_events), any channel, reason text or tags only.
 * "view" is not a decision. A run that can contact a candidate gets only the
 * fact of each decision about a candidate (date, Role, candidate, action); its
 * reasons are not even selected. A withdrawn candidate's record stays the
 * company's and is marked as withdrawn; rows erased before that rule stay blank.
 */
const READABLE_ACTIONS = ["pass", "request_intro", "save", "unsave", "stage_change", "stop", "rate", "note", "accept", "reject", "mute", "unmute", "cancel"];
const PAGE_CHARS = 12_000;
const DETAIL_KEYS = ["stage", "rating", "reasons", "answer", "note", "reasonsSkipped", "kind", "title", "contentKey"];

export type CompanyDecisionRow = {
  ref: number; roleId: string; roleName: string | null; subjectKind: string; subjectId: string | null;
  candidate: string | null; action: string; channel: string | null; reasonText: string | null; reasonTags: string[];
  detail: Record<string, unknown>; withdrawn: boolean; createdAt: string;
};
export type CompanyDecisionRead = { items: CompanyDecisionRow[]; total: number; nextOffset: number | null; factsOnly: boolean };

function rowChars(row: CompanyDecisionRow) { return (row.reasonText?.length ?? 0) + JSON.stringify(row.detail).length + 300; }

export async function readCompanyDecisions(args: {
  admin: OrgAgentAdminClient; user: User; workspaceId: string; input?: Record<string, unknown>;
}): Promise<CompanyDecisionRead> {
  const input = args.input ?? {};
  const factsOnly = companyAgentIsCorrespondence(args.admin);
  const offset = nonnegativeInteger(input.offset);
  const limit = Math.min(positiveInteger(input.limit, 20, "limit"), 50);
  const roleId = textId(input.roleId), subjectId = textId(input.subjectId);
  if (input.action !== undefined && !READABLE_ACTIONS.includes(String(input.action))) throw new OrgAgentToolInputError(`action must be one of: ${READABLE_ACTIONS.join(", ")}`);
  let roleIds: string[] | null;
  if (roleId) {
    await assertOrgTeamRoleAccess({ ...args, roleId });
    roleIds = [roleId];
  } else roleIds = await visibleOrgRoleIds(args);
  if (roleIds && !roleIds.length) return { items: [], total: 0, nextOffset: null, factsOnly };

  let query = (args.admin.from("company_decision_events" as any) as any)
    .select(`id,role_id,subject_kind,subject_id,action,${factsOnly ? "" : "detail,reason_text,reason_tags,channel,"}created_at,role:company_roles(name)`, { count: "exact" })
    .eq("company_workspace_id", args.workspaceId).neq("action", "view");
  if (factsOnly) query = query.in("subject_kind", ["member_candidate", "external_candidate"]);
  if (roleIds) query = query.in("role_id", roleIds);
  if (subjectId) query = query.eq("subject_id", subjectId);
  if (input.action !== undefined) query = query.eq("action", input.action);
  const { data, error, count } = await query.order("id", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data ?? []) as any[];

  const ids = (kind: string) => [...new Set(rows.filter((r) => r.subject_kind === kind && r.subject_id).map((r) => String(r.subject_id)))];
  const memberIds = ids("member_candidate"), externalIds = ids("external_candidate");
  const [members, externals] = await Promise.all([
    memberIds.length ? (args.admin.from("talent_users" as any) as any).select("user_id,headline,deleted_at").in("user_id", memberIds) : { data: [], error: null },
    externalIds.length ? (args.admin.from("external_candidates" as any) as any).select("id,name").eq("company_workspace_id", args.workspaceId).in("id", externalIds) : { data: [], error: null },
  ]);
  if (members.error) throw members.error;
  if (externals.error) throw externals.error;
  const member = new Map(((members.data ?? []) as any[]).map((row) => [String(row.user_id), row]));
  const external = new Map(((externals.data ?? []) as any[]).map((row) => [String(row.id), row]));

  const items: CompanyDecisionRow[] = [];
  let chars = 0;
  for (const row of rows) {
    const detail = (row.detail ?? {}) as Record<string, unknown>;
    const person = row.subject_kind === "member_candidate" ? member.get(String(row.subject_id)) : undefined;
    const withdrawn = Boolean(person?.deleted_at);
    const item: CompanyDecisionRow = {
      ref: Number(row.id), roleId: row.role_id, roleName: row.role?.name ?? null, subjectKind: row.subject_kind,
      subjectId: row.subject_id ?? null,
      candidate: factsOnly || withdrawn ? null : row.subject_kind === "external_candidate" ? external.get(String(row.subject_id))?.name ?? null : person?.headline ?? null,
      action: row.action, channel: row.channel ?? null, reasonText: row.reason_text ?? null,
      reasonTags: Array.isArray(row.reason_tags) ? row.reason_tags.map(String) : [],
      detail: Object.fromEntries(DETAIL_KEYS.filter((key) => detail[key] !== undefined && detail[key] !== null).map((key) => [key, detail[key]])),
      withdrawn, createdAt: row.created_at,
    };
    if (items.length && chars + rowChars(item) > PAGE_CHARS) break;
    chars += rowChars(item);
    items.push(item);
  }
  const total = count ?? offset + items.length;
  const next = offset + items.length;
  return { items, total, nextOffset: next < total ? next : null, factsOnly };
}

function subjectText(row: CompanyDecisionRow) {
  const label = row.withdrawn ? "탈퇴한 후보" : row.candidate;
  if (row.subjectKind === "member_candidate") return `talent:${row.subjectId}${label ? ` (${label})` : ""}`;
  if (row.subjectKind === "external_candidate") return `외부 후보 ${row.subjectId}${label ? ` (${label})` : ""}`;
  return `${row.subjectKind}${row.subjectId ? ` ${row.subjectId}` : ""}`;
}

export function formatCompanyDecisions(value: CompanyDecisionRead) {
  return [
    `회사 결정 기록 ${value.total}건; 이번 조회 ${value.items.length}건 (최신순). ${value.factsOnly
      ? "이 실행은 후보자 쪽에 연락할 수 있어 결정이 있었다는 사실만 보임. 이유·태그·메모는 이 실행에서 볼 수 없으니 추측하지 않음."
      : "회사의 판단 근거이며 규칙이 아님. 이 기록의 존재나 내용을 후보자 쪽에 전하지 않음."}`,
    ...value.items.map((row) => {
      const role = `role=${row.roleId}${row.roleName ? ` (${row.roleName})` : ""}`;
      if (value.factsOnly) return `${formatLlmDateTime(row.createdAt)} · ${role} · ${row.action} · ${subjectText(row)}`;
      const detail = Object.keys(row.detail).length ? ` · ${JSON.stringify(row.detail)}` : "";
      const tags = row.reasonTags.length ? ` · tags=${row.reasonTags.join(",")}` : "";
      const reason = row.reasonText ? `\n이유: ${row.reasonText}` : "";
      return `#${row.ref} · ${formatLlmDateTime(row.createdAt)} · ${role} · ${row.action} · ${row.channel} · ${subjectText(row)}${tags}${detail}${reason}`;
    }),
    value.nextOffset === null ? "마지막 페이지." : `다음: get_more_data kinds=[decisions], decisions.offset=${value.nextOffset}.`,
  ].join("\n").replaceAll("<", "‹").replaceAll(">", "›");
}
