import { publishedCompensation } from "../companyRoles/publishedCompensation";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { InternalApiError } from "@/lib/internalApi";
import { fetchTalentStructuredProfile } from "@/lib/talentOnboarding/profileStore";
import { fetchAllTalentContexts } from "@/lib/talentOnboarding/talentContexts";
import {
  callJevFit,
  FIT_PROMPT_VERSION,
  JEV_MODEL,
  fitRunInput,
  existingFit,
  type FitOption,
  type FitSearchResult,
  type FitRunResult,
} from "./externalFitPlayground";

const PAGE_SIZE = 20;
const ROLE_SELECT =
  "role_id, name, status, is_expired, expires_at, location_text, work_mode, type, seniority_level, salary_is_predicted, salary_range, salary_min, salary_max, salary_currency, salary_period, description, description_summary, external_jd_url, updated_at, company_workspace!inner(company_name, company_description, homepage_url)" as const;

// Quoted PostgREST literals keep punctuation from becoming filter syntax.
export function searchLiteral(query: string) {
  return JSON.stringify(`%${query.replace(/[\\%_*]/g, "\\$&")}%`);
}

export async function searchFitOptions(
  kind: "roles" | "talents",
  query: string,
  offset: number,
  talentId?: string | null
): Promise<FitSearchResult> {
  const admin = getSupabaseAdmin();
  const pattern = searchLiteral(query);
  if (kind === "talents") {
    let request = admin
      .from("talent_users")
      .select("user_id, name, email, headline")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("user_id");
    if (query)
      request = request.or(
        `name.ilike.${pattern},email.ilike.${pattern},headline.ilike.${pattern}`
      );
    const { data, error } = await request.range(offset, offset + PAGE_SIZE);
    if (error) throw new Error(error.message);
    return {
      items: (data ?? []).slice(0, PAGE_SIZE).map((row) => ({
        id: row.user_id,
        title: row.name || row.email || row.user_id,
        subtitle: [row.email, row.headline].filter(Boolean).join(" · "),
      })),
      hasMore: (data?.length ?? 0) > PAGE_SIZE,
    };
  }
  if (!query) {
    if (!talentId) return { items: [], hasMore: false };
    const items: FitOption[] = [];
    let cursor = offset;
    // Scan in calculation order, retaining pagination even when deleted or
    // test-only roles have been filtered out of the historical fit rows.
    while (true) {
      const fits = await admin
        .from("talent_external_fit")
        .select("role_id, meta, created_at")
        .eq("talent_id", talentId)
        .order("created_at", { ascending: false })
        .order("role_id")
        .range(cursor, cursor + 99);
      if (fits.error) throw new Error(fits.error.message);
      if (!fits.data.length) return { items, hasMore: false, nextOffset: null };
      const roles = await admin
        .from("company_roles")
        .select(
          "role_id, name, status, is_expired, location_text, company_workspace!inner(company_name)"
        )
        .in(
          "role_id",
          fits.data.map((row) => row.role_id)
        )
        .eq("source_type", "external")
        .or("information->>testOnly.is.null,information->>testOnly.neq.true");
      if (roles.error) throw new Error(roles.error.message);
      const byId = new Map(roles.data.map((row) => [row.role_id, row]));
      for (const [index, fit] of fits.data.entries()) {
        const role = byId.get(fit.role_id);
        if (!role) continue;
        if (items.length === PAGE_SIZE)
          return { items, hasMore: true, nextOffset: cursor + index };
        items.push({
          ...roleOption(role),
          existingFit: existingFit(fit.meta, fit.created_at),
        });
      }
      if (fits.data.length < 100)
        return { items, hasMore: false, nextOffset: null };
      cursor += 100;
    }
  }
  // Search the joined company name without a capped intermediate company-ID list.
  // An alias provides a left-joined filter arm for cross-table OR search.
  const { data, error } = await admin
    .from("company_roles")
    .select(
      "role_id, name, status, is_expired, location_text, company_workspace!inner(company_name), matched_company:company_workspace(company_name)"
    )
    .eq("source_type", "external")
    .or("information->>testOnly.is.null,information->>testOnly.neq.true")
    .ilike(
      "matched_company.company_name",
      `%${query.replace(/[\\%_]/g, "\\$&")}%`
    )
    .or(
      `name.ilike.${pattern},location_text.ilike.${pattern},matched_company.not.is.null`
    )
    .order("updated_at", { ascending: false })
    .order("role_id")
    .range(offset, offset + PAGE_SIZE);
  if (error) throw new Error(error.message);
  return {
    items: (data ?? []).slice(0, PAGE_SIZE).map(roleOption),
    hasMore: (data?.length ?? 0) > PAGE_SIZE,
  };
}

function roleOption(row: {
  role_id: string;
  name: string;
  status: string;
  is_expired: boolean;
  location_text: string | null;
  company_workspace: { company_name: string };
}): FitOption {
  return {
    id: row.role_id,
    title: row.name,
    subtitle: [row.company_workspace.company_name, row.location_text]
      .filter(Boolean)
      .join(" · "),
    status: row.is_expired ? "마감" : row.status,
  };
}

export async function runExternalFitPlayground(
  input: unknown
): Promise<FitRunResult> {
  const parsed = fitRunInput.safeParse(input);
  if (!parsed.success)
    throw new InternalApiError(
      400,
      "후보자 1명과 외부 역할 1–10개를 선택하세요."
    );
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey)
    throw new InternalApiError(
      503,
      "서버에 OPENROUTER_API_KEY가 설정되지 않았습니다."
    );
  const { talentId } = parsed.data;
  const roleIds = [...new Set(parsed.data.roleIds)];
  const began = performance.now();
  const startedAt = new Date().toISOString();
  const admin = getSupabaseAdmin();
  const [user, profile, brief, behavior, settings, roles, fits] =
    await Promise.all([
      admin
        .from("talent_users")
        .select("user_id, name, email, headline")
        .eq("user_id", talentId)
        .is("deleted_at", null)
        .maybeSingle(),
      fetchTalentStructuredProfile({ admin, userId: talentId }),
      fetchAllTalentContexts({ admin, userId: talentId, collection: "brief" }),
      admin
        .from("talent_behavior_contexts")
        .select(
          "context_text, context_version, updated_at, last_consumed_change_id"
        )
        .eq("talent_id", talentId)
        .maybeSingle(),
      admin
        .from("talent_setting")
        .select("engagement_types, blocked_companies")
        .eq("user_id", talentId)
        .maybeSingle(),
      admin
        .from("company_roles")
        .select(ROLE_SELECT)
        .in("role_id", roleIds)
        .eq("source_type", "external")
        .or("information->>testOnly.is.null,information->>testOnly.neq.true"),
      admin
        .from("talent_external_fit")
        .select("role_id, meta, created_at")
        .eq("talent_id", talentId)
        .in("role_id", roleIds),
    ]);
  for (const response of [user, behavior, settings, roles, fits])
    if (response.error) throw new Error(response.error.message);
  if (!user.data) throw new InternalApiError(404, "후보자를 찾을 수 없습니다.");
  if (roles.data?.length !== roleIds.length)
    throw new InternalApiError(
      400,
      "선택한 역할 일부를 찾을 수 없거나 테스트 대상이 아닙니다. 외부 역할을 다시 선택하세요."
    );
  const changes = await admin
    .from("talent_behavior_context_changes")
    .select("id", { count: "exact", head: true })
    .eq("talent_id", talentId)
    .gt("id", behavior.data?.last_consumed_change_id ?? 0);
  if (changes.error) throw new Error(changes.error.message);
  const warnings: string[] = [];
  if (!behavior.data?.context_text)
    warnings.push(
      "저장된 Behavior Context가 없어 Profile과 Search Brief로 평가했습니다."
    );
  if (changes.count)
    warnings.push(
      `Behavior Context에 아직 반영되지 않은 변경 ${changes.count}건이 있습니다. 저장된 버전을 그대로 사용했습니다.`
    );
  if (!brief.length)
    warnings.push(
      "Search Brief가 비어 있습니다. 관심 가능성 판단의 근거가 부족할 수 있습니다."
    );
  const context = {
    profile: {
      headline: profile.talentUser?.headline,
      bio: profile.talentUser?.bio,
      location: profile.talentUser?.location,
      current_location: profile.talentUser?.current_location,
      experiences: profile.talentExperiences.map(
        ({
          role,
          description,
          employment_type,
          start_date,
          end_date,
          months,
          company_name,
          company_location,
          memo,
        }) => ({
          role,
          description,
          employment_type,
          start_date,
          end_date,
          months,
          company_name,
          company_location,
          memo,
        })
      ),
      educations: profile.talentEducations.map(
        ({
          school,
          degree,
          description,
          field,
          start_date,
          end_date,
          memo,
        }) => ({
          school,
          degree,
          description,
          field,
          start_date,
          end_date,
          memo,
        })
      ),
      extras: profile.talentExtras,
    },
    search_brief: brief.map(({ ref, label, content }) => ({
      ref,
      label,
      content,
    })),
    behavior_context: behavior.data?.context_text || null,
    matching_preferences: settings.data,
  };
  const byId = new Map(roles.data.map((row) => [row.role_id, row]));
  const fitById = new Map(
    (fits.data ?? []).map((row) => [
      row.role_id,
      existingFit(row.meta, row.created_at),
    ])
  );
  const results: FitRunResult["results"] = new Array(roleIds.length);
  let next = 0;
  // Four bounded consumers; one request per pair, no semantic retries or writes.
  await Promise.all(
    Array.from({ length: Math.min(4, roleIds.length) }, async () => {
      while (next < roleIds.length) {
        const index = next++;
        const role = byId.get(roleIds[index])!;
        const state = {
          current_date: startedAt.slice(0, 10),
          user_context: context,
          candidate_context: { roles: [publishedCompensation(role)] },
          run_context: {
            evaluation_goal:
              "Read-only, manually selected candidate × role fit test; no recommendation delivery.",
          },
        };
        results[index] = {
          role: { ...roleOption(role), existingFit: fitById.get(role.role_id) },
          state,
          ...(await callJevFit(state, apiKey)),
        };
      }
    })
  );
  return {
    model: JEV_MODEL,
    promptVersion: FIT_PROMPT_VERSION,
    startedAt,
    elapsedMs: Math.round(performance.now() - began),
    context,
    talent: {
      id: user.data.user_id,
      title: user.data.name || user.data.email || talentId,
      subtitle: user.data.headline || "",
    },
    contextInfo: {
      briefCount: brief.length,
      behaviorVersion: behavior.data?.context_version ?? null,
      behaviorUpdatedAt: behavior.data?.updated_at ?? null,
      pendingBehaviorChanges: changes.count ?? 0,
      warnings,
    },
    results,
  };
}
