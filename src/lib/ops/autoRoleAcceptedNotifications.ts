import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Database } from "@/types/database.types";

const BATCH_SIZE = 1000;
const ID_FILTER_CHUNK_SIZE = 80;
const ACCEPTED_STAGE_TAG = "내부:수락";
const CUSTOM_STAGE_TAG_PREFIX = "내부단계:";
const BUILT_IN_STAGE_TAGS = new Set([
  ACCEPTED_STAGE_TAG,
  "내부:아카이브",
  "내부:최종오퍼",
  "내부:보류",
  "내부:연결대기",
  "내부:프로세스중단",
  "내부:거절",
]);

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
type AutoRoleRow = Pick<
  Database["public"]["Tables"]["company_internal_roles"]["Row"],
  "role_id"
>;
type RoleRow = Pick<
  Database["public"]["Tables"]["company_roles"]["Row"],
  "company_workspace_id" | "name" | "role_id"
>;
type WorkspaceRow = Pick<
  Database["public"]["Tables"]["company_workspace"]["Row"],
  "company_name" | "company_workspace_id"
>;
type RecommendationRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  "created_at" | "feedback" | "id" | "role_id" | "saved_stage" | "talent_id"
>;
type TagRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_tag"]["Row"],
  "id" | "opportunity_id" | "tag" | "talent_id" | "updated_at"
>;
type TalentRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  "email" | "headline" | "name" | "user_id"
>;
type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export type AutoRoleAcceptedNotificationTalent = {
  headline: string | null;
  name: string;
  talentId: string;
};

export type AutoRoleAcceptedNotificationGroup = {
  companyName: string;
  companyWorkspaceId: string;
  roleId: string;
  roleTitle: string;
  talents: AutoRoleAcceptedNotificationTalent[];
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStageTag(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function chunkValues<T>(values: T[], size = ID_FILTER_CHUNK_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const { data, error } = await loadPage(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(error.message || "Failed to load rows");

    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
  }
  return rows;
}

async function fetchAutoRoles(admin: AdminClient) {
  const autoRoleRows = await fetchAllRows<AutoRoleRow>((from, to) =>
    admin
      .from("company_internal_roles")
      .select("role_id")
      .eq("is_auto", true)
      .order("role_id", { ascending: true })
      .range(from, to)
  );
  const autoRoleIds = Array.from(
    new Set(
      autoRoleRows.map((row) => normalizeText(row.role_id)).filter(Boolean)
    )
  );
  const roles: RoleRow[] = [];

  for (const roleIdChunk of chunkValues(autoRoleIds)) {
    const { data, error } = await admin
      .from("company_roles")
      .select("company_workspace_id, name, role_id")
      .in("role_id", roleIdChunk);
    if (error) throw new Error(error.message || "Failed to load auto roles");
    roles.push(...((data ?? []) as RoleRow[]));
  }

  return roles;
}

async function fetchWorkspaces(admin: AdminClient, workspaceIds: string[]) {
  const rows: WorkspaceRow[] = [];
  for (const workspaceIdChunk of chunkValues(workspaceIds)) {
    const { data, error } = await admin
      .from("company_workspace")
      .select("company_name, company_workspace_id")
      .in("company_workspace_id", workspaceIdChunk);
    if (error) {
      throw new Error(error.message || "Failed to load auto role companies");
    }
    rows.push(...((data ?? []) as WorkspaceRow[]));
  }
  return rows;
}

async function fetchRecommendations(admin: AdminClient, roleIds: string[]) {
  const rows: RecommendationRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    rows.push(
      ...(await fetchAllRows<RecommendationRow>((from, to) =>
        admin
          .from("talent_opportunity_recommendation")
          .select("created_at, feedback, id, role_id, saved_stage, talent_id")
          .in("role_id", roleIdChunk)
          .order("created_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(from, to)
      ))
    );
  }
  return rows;
}

function isNewerRecommendation(
  candidate: RecommendationRow,
  current: RecommendationRow
) {
  if (candidate.created_at !== current.created_at) {
    return candidate.created_at > current.created_at;
  }
  return candidate.id > current.id;
}

function getLatestAcceptedRecommendations(rows: RecommendationRow[]) {
  const latestByRoleTalent = new Map<string, RecommendationRow>();
  for (const row of rows) {
    const key = `${row.role_id}:${row.talent_id}`;
    const current = latestByRoleTalent.get(key);
    if (!current || isNewerRecommendation(row, current)) {
      latestByRoleTalent.set(key, row);
    }
  }

  return Array.from(latestByRoleTalent.values()).filter((row) => {
    const feedback = normalizeText(row.feedback).toLowerCase();
    const savedStage = normalizeText(row.saved_stage).toLowerCase();
    return (
      feedback === "like" ||
      feedback === "positive" ||
      savedStage === "accepted"
    );
  });
}

async function fetchStageTags(
  admin: AdminClient,
  recommendations: RecommendationRow[]
) {
  const rows: TagRow[] = [];
  const roleIds = Array.from(
    new Set(recommendations.map((row) => row.role_id).filter(Boolean))
  );
  const talentIds = Array.from(
    new Set(recommendations.map((row) => row.talent_id).filter(Boolean))
  );

  for (const roleIdChunk of chunkValues(roleIds)) {
    for (const talentIdChunk of chunkValues(talentIds)) {
      rows.push(
        ...(await fetchAllRows<TagRow>((from, to) =>
          admin
            .from("talent_opportunity_tag")
            .select("id, opportunity_id, tag, talent_id, updated_at")
            .in("opportunity_id", roleIdChunk)
            .in("talent_id", talentIdChunk)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to)
        ))
      );
    }
  }
  return rows;
}

function isInternalStageTag(value: unknown) {
  const tag = normalizeStageTag(value);
  return (
    BUILT_IN_STAGE_TAGS.has(tag) ||
    tag.startsWith(normalizeStageTag(CUSTOM_STAGE_TAG_PREFIX))
  );
}

function isNewerTag(candidate: TagRow, current: TagRow) {
  if (candidate.updated_at !== current.updated_at) {
    return candidate.updated_at > current.updated_at;
  }
  return candidate.id > current.id;
}

function filterCurrentlyAcceptedRecommendations(
  recommendations: RecommendationRow[],
  tags: TagRow[]
) {
  const latestStageTagByRoleTalent = new Map<string, TagRow>();
  for (const tag of tags) {
    if (!isInternalStageTag(tag.tag)) continue;
    const key = `${tag.opportunity_id}:${tag.talent_id}`;
    const current = latestStageTagByRoleTalent.get(key);
    if (!current || isNewerTag(tag, current)) {
      latestStageTagByRoleTalent.set(key, tag);
    }
  }

  return recommendations.filter((recommendation) => {
    const key = `${recommendation.role_id}:${recommendation.talent_id}`;
    const stageTag = latestStageTagByRoleTalent.get(key);
    return !stageTag || normalizeStageTag(stageTag.tag) === ACCEPTED_STAGE_TAG;
  });
}

async function fetchTalents(admin: AdminClient, talentIds: string[]) {
  const rows: TalentRow[] = [];
  for (const talentIdChunk of chunkValues(talentIds)) {
    const { data, error } = await admin
      .from("talent_users")
      .select("email, headline, name, user_id")
      .in("user_id", talentIdChunk);
    if (error) {
      throw new Error(error.message || "Failed to load accepted talents");
    }
    rows.push(...((data ?? []) as TalentRow[]));
  }
  return rows;
}

export async function buildAutoRoleAcceptedNotificationGroups(): Promise<
  AutoRoleAcceptedNotificationGroup[]
> {
  const admin = getSupabaseAdmin();
  const roles = await fetchAutoRoles(admin);
  if (roles.length === 0) return [];

  const roleIds = roles.map((role) => role.role_id);
  const recommendations = getLatestAcceptedRecommendations(
    await fetchRecommendations(admin, roleIds)
  );
  if (recommendations.length === 0) return [];

  const currentRecommendations = filterCurrentlyAcceptedRecommendations(
    recommendations,
    await fetchStageTags(admin, recommendations)
  );
  if (currentRecommendations.length === 0) return [];

  const workspaceIds = Array.from(
    new Set(roles.map((role) => role.company_workspace_id).filter(Boolean))
  );
  const talentIds = Array.from(
    new Set(currentRecommendations.map((row) => row.talent_id).filter(Boolean))
  );
  const [workspaces, talents] = await Promise.all([
    fetchWorkspaces(admin, workspaceIds),
    fetchTalents(admin, talentIds),
  ]);
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.company_workspace_id, workspace])
  );
  const talentById = new Map(talents.map((talent) => [talent.user_id, talent]));
  const recommendationsByRole = new Map<string, RecommendationRow[]>();
  for (const recommendation of currentRecommendations) {
    const current = recommendationsByRole.get(recommendation.role_id) ?? [];
    current.push(recommendation);
    recommendationsByRole.set(recommendation.role_id, current);
  }

  return roles
    .map((role): AutoRoleAcceptedNotificationGroup | null => {
      const workspace = workspaceById.get(role.company_workspace_id);
      const roleRecommendations = recommendationsByRole.get(role.role_id) ?? [];
      const roleTalents = roleRecommendations
        .map((recommendation) => {
          const talent = talentById.get(recommendation.talent_id);
          if (!talent) return null;
          return {
            headline: normalizeText(talent.headline) || null,
            name:
              normalizeText(talent.name) ||
              normalizeText(talent.email) ||
              "이름 없음",
            talentId: talent.user_id,
          } satisfies AutoRoleAcceptedNotificationTalent;
        })
        .filter(
          (talent): talent is AutoRoleAcceptedNotificationTalent =>
            talent !== null
        )
        .sort((left, right) => left.name.localeCompare(right.name, "ko"));

      if (!workspace || roleTalents.length === 0) return null;
      return {
        companyName: normalizeText(workspace.company_name) || "회사명 없음",
        companyWorkspaceId: role.company_workspace_id,
        roleId: role.role_id,
        roleTitle: normalizeText(role.name) || "Role title 없음",
        talents: roleTalents,
      };
    })
    .filter(
      (group): group is AutoRoleAcceptedNotificationGroup => group !== null
    )
    .sort((left, right) => {
      const companyOrder = left.companyName.localeCompare(
        right.companyName,
        "ko"
      );
      return (
        companyOrder || left.roleTitle.localeCompare(right.roleTitle, "ko")
      );
    });
}

function escapeSlackText(value: unknown) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildOpsMatchingUrl(
  siteUrl: string,
  group: AutoRoleAcceptedNotificationGroup
) {
  const url = new URL("/ops/matching", siteUrl);
  url.searchParams.set("company", group.companyWorkspaceId);
  url.searchParams.set("role", group.roleId);
  url.searchParams.set("tab", "harper_review");
  return url.toString();
}

export function formatAutoRoleAcceptedNotificationSlackMessage(
  groups: AutoRoleAcceptedNotificationGroup[],
  siteUrl: string
) {
  if (groups.length === 0) return null;

  return groups
    .map((group) => {
      const label = `[${escapeSlackText(group.companyName)} - ${escapeSlackText(
        group.roleTitle
      )}]`;
      const title = `<${buildOpsMatchingUrl(siteUrl, group)}|${label}> 판단 대기중 : ${group.talents.length}명`;
      const talents = group.talents.map(
        (talent) =>
          `- ${escapeSlackText(talent.name)} - ${escapeSlackText(
            talent.headline || "headline 없음"
          )}`
      );
      return [title, ...talents].join("\n");
    })
    .join("\n\n");
}
