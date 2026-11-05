import type { Query } from "./database";
import { INPUT_CONTRACT, canonicalJson, type Row } from "./evidence";

// SQL and projection order mirror company_requested_repository.load_role_context.
export async function loadRoleContext(
  query: Query,
  workspaceId: string,
  roleId: string,
  directTalentId?: string
) {
  const [row] = await query(
    `SELECT role.role_id::text,role.company_workspace_id::text,
    role.name,role.description,role.location_text,role.country_code,role.work_mode,role.type,
    role.seniority_level,role.salary_range,role.salary_min,role.salary_max,
    role.salary_currency,role.salary_period,internal.request,internal.criteria,
    internal.team_id::text,workspace.company_name,
    coalesce(workspace.company_description,workspace.brief,workspace.pitch,'') AS company_description,
    public.company_role_search_brief_version_v1(role.role_id) AS version,
    public.company_role_search_brief_snapshot_v1(role.role_id) AS brief_snapshot
    FROM public.company_roles role JOIN public.company_internal_roles internal USING(role_id)
    JOIN public.company_workspace workspace ON workspace.company_workspace_id=role.company_workspace_id
    WHERE role.role_id=$1::uuid AND role.company_workspace_id=$2::uuid
      AND lower(btrim(coalesce(role.source_type,'')))='internal'
      AND (($3::uuid IS NOT NULL AND public.career_internal_role_is_readable_v1($3::uuid,role.role_id))
        OR ($3::uuid IS NULL AND lower(btrim(coalesce(role.status,'')))='active'
          AND public.role_matching_slot_type_v1(role.role_id,now()) IN ('free','paid')))
      AND coalesce(role.is_expired,false)=false AND (role.expires_at IS NULL OR role.expires_at>now())
      AND nullif(btrim(internal.request),'') IS NOT NULL
      AND ($3::uuid IS NOT NULL OR coalesce(lower(btrim(role.information->>'testOnly')),'') NOT IN ('true','1','yes','on'))`,
    [roleId, workspaceId, directTalentId ?? null]
  );
  if (!row) throw new Error("role is unavailable in this workspace");
  return {
    workspaceId,
    roleId,
    directTalentId,
    version: row.version,
    briefSnapshot: row.brief_snapshot,
    role: Object.fromEntries(
      Object.entries(row).filter(
        ([k]) =>
          ![
            "version",
            "team_id",
            "company_workspace_id",
            "brief_snapshot",
          ].includes(k)
      )
    ),
    // Company Memory is the company's private context; Career-side scoring does
    // not read it. The field stays (empty) so the Worker input contract is unchanged.
    companyMemory: [],
  };
}
export const profileEligible = `(setting.is_onboarding_done IS TRUE
  OR EXISTS(SELECT 1 FROM public.talent_experiences matching_experience WHERE matching_experience.talent_id=t.user_id)
  OR EXISTS(SELECT 1 FROM public.talent_educations matching_education WHERE matching_education.talent_id=t.user_id))`;

export type FrozenInput = {
  context: Awaited<ReturnType<typeof loadRoleContext>>;
  source: Row;
};
/** An input frozen before company Memory left Career-side scoring still carries
 * it. Scoring it would send that text to the LLM and then fail assertInput (the
 * current input has none) on every resume, so its Role is read again instead. */
export function carriesCompanyMemory(input: FrozenInput) {
  return [input.context.companyMemory, input.source.companyMemory].some(
    (value) => Array.isArray(value) && value.length > 0
  );
}
/** career_requested._profile + frozen full Brief + existing Behavior snapshot.
 * Deliberate difference: the user chose stored Behavior, without ensure/refresh. */
export async function loadInputs(
  query: Query,
  talentId: string,
  payload: Row
): Promise<{ sources: FrozenInput[]; unavailableRoleIds: string[]; failures: Array<{ roleId: string; error: string }> }> {
  const direct = typeof payload.requestedOpportunityId === "string";
  if (direct) {
    const [card] = await query(`SELECT id FROM public.talent_opportunity_recommendation WHERE id=$1::uuid
      AND talent_id=$2::uuid AND role_id=ANY($3::uuid[])`, [payload.requestedOpportunityId, talentId, payload.roleIds]);
    if (!card) throw new Error("Requested opportunity unavailable");
  }
  const [behavior] = await query(
    `SELECT context_text,context_version FROM public.talent_behavior_contexts WHERE talent_id=$1::uuid`,
    [talentId]
  );
  // A newly registered user can choose a role before any derived Behavior
  // Context exists. Evaluate that explicit request from the available original
  // profile/Brief; do not invent a summary or block private discovery on it.
  if (!direct && (!behavior?.context_text || !behavior.context_version))
    throw new Error("Current Behavior Context unavailable");
  const [selected] = await query(
    `SELECT public.read_talent_profile_v1($1::uuid,$2::uuid,$3::bigint) AS profile`,
    [talentId, payload.profileId, payload.profileRevision]
  );
  const profile = selected?.profile;
  if (!profile) throw new Error("Profile revision unavailable");
  const [eligible] = await query(
    `SELECT t.user_id FROM public.talent_users t JOIN public.talent_setting setting ON setting.user_id=t.user_id
    WHERE t.user_id=$1::uuid AND t.deleted_at IS NULL AND ($2::boolean OR (${profileEligible}
      AND coalesce(setting.profile_visibility,'')<>'dont_share' AND coalesce(setting.get_internal_recommendation,true)))`,
    [talentId, direct]
  );
  if (!eligible) throw new Error("Profile unavailable for internal evaluation");
  const roles = await query(
    `SELECT role.role_id::text,role.company_workspace_id::text
    FROM public.company_roles role JOIN public.company_workspace company USING(company_workspace_id)
    WHERE role.role_id=ANY($1::uuid[]) AND role.source_type='internal'
      AND (($3::boolean AND public.career_internal_role_is_readable_v1($2::uuid,role.role_id)) OR (NOT $3::boolean AND role.status='active'
      AND NOT coalesce(role.is_expired,false) AND (role.expires_at IS NULL OR role.expires_at>now())
      AND coalesce(lower(btrim(role.information->>'testOnly')),'') NOT IN ('true','1','yes','on')
      AND public.role_matching_slot_type_v1(role.role_id,now()) IN ('free','paid')
      AND NOT EXISTS(SELECT 1 FROM public.talent_setting setting,unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
        WHERE setting.user_id=$2::uuid AND lower(btrim(blocked.name)) IN (lower(btrim(company.company_name)),lower(btrim(coalesce(company.published_name,'')))))))
    ORDER BY role.role_id`,
    [payload.roleIds, talentId, direct]
  );
  const briefs = await query(
    `SELECT talent_id::text,label,content,revision,ref,created_at,updated_at
    FROM public.talent_contexts WHERE talent_id=$1::uuid AND deleted_at IS NULL AND collection='brief' ORDER BY talent_id,ref`,
    [talentId]
  );
  const searchBrief = briefs.map(({ talent_id: _owner, ...row }) => row);
  const user = profile.snapshot.talentUser ?? {};
  const sources: FrozenInput[] = [];
  const failures: Array<{ roleId: string; error: string }> = [];
  for (const row of roles) {
    let context: FrozenInput["context"];
    try {
      context = await loadRoleContext(query, row.company_workspace_id, row.role_id, direct ? talentId : undefined);
    } catch (error) {
      failures.push({ roleId: row.role_id, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    sources.push({
      context,
      source: {
        talentId,
        profile: {
          profile: Object.fromEntries(
            ["name", "headline", "bio", "location", "current_location"].map(
              (k) => [k, user[k] ?? null]
            )
          ),
          experiences: profile.snapshot.talentExperiences ?? [],
          educations: profile.snapshot.talentEducations ?? [],
          extra: profile.snapshot.talentExtras ?? [],
        },
        searchBrief,
        behaviorContext: behavior?.context_text ?? null,
        behaviorContextVersion: behavior?.context_version == null ? null : Number(behavior.context_version),
        inputContractVersion: INPUT_CONTRACT,
        role: context.role,
        companyMemory: context.companyMemory,
        sourceProfileId: profile.profileId,
        sourceProfileRevision: profile.revision,
        evidenceScope: "candidate_private_context",
      },
    });
  }
  return {
    sources,
    failures,
    unavailableRoleIds: (payload.roleIds as string[]).filter(
      (id) => !sources.some((s) => s.context.roleId === id)
    ),
  };
}
export async function assertInput(query: Query, input: FrozenInput) {
  const { context, source } = input;
  const current = await loadRoleContext(
    query,
    context.workspaceId,
    context.roleId,
    context.directTalentId
  );
  const [owned] = await query(
    `SELECT 1 FROM public.talent_profiles p JOIN public.talent_profile_revisions v ON v.profile_id=p.id
    JOIN public.talent_users t ON t.user_id=p.talent_id JOIN public.talent_setting setting ON setting.user_id=t.user_id
    WHERE p.id=$1::uuid AND p.talent_id=$2::uuid AND v.revision=$3::bigint
      AND t.deleted_at IS NULL AND ($5::boolean OR (${profileEligible}
      AND coalesce(setting.profile_visibility,'')<>'dont_share' AND coalesce(setting.get_internal_recommendation,true)
      AND NOT EXISTS(SELECT 1 FROM public.company_workspace company,unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
        WHERE company.company_workspace_id=$4::uuid AND lower(btrim(blocked.name)) IN (lower(btrim(company.company_name)),lower(btrim(coalesce(company.published_name,'')))))))`,
    [
      source.sourceProfileId,
      source.talentId,
      source.sourceProfileRevision,
      context.workspaceId,
      Boolean(context.directTalentId),
    ]
  );
  if (
    !owned ||
    current.version !== context.version ||
    canonicalJson(current.role) !== canonicalJson(source.role) ||
    canonicalJson(current.companyMemory) !== canonicalJson(source.companyMemory)
  )
    throw new Error("Evaluation role evidence changed or profile unavailable");
}
