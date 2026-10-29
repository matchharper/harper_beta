import { randomUUID } from 'node:crypto';
import { resolveOrgWorkspaceLocale } from '@/lib/org/workspaceLocale';
import { fingerprint, type Facts, type PublicationRole, type PublicationCandidate, type Presentation } from './writer';

export type Query = (text: string, params?: any[]) => Promise<Facts[]>;
export type PublicationCommand = {
  workspaceId: string; userId: string; roleId: string; requestId: string;
  sourceMessageId?: number; kind: 'add' | 'replace'; talentIds: string[]; sourceRunId?: string; reason?: string;
};
export type PublicationReceipt = {
  status: 'completed'; runId: string; roleName: string; kind: 'add' | 'replace';
  addedTalentIds: string[]; removedTalentIds: string[]; refreshedTalentIds: string[]; retainedTalentIds: string[];
  requestedTalentIds: string[]; sourceRunId?: string; candidateContact: false;
};
export type Snapshot = {
  role: PublicationRole; version: string; briefSnapshot: Facts; pool: Facts[];
  candidates: PublicationCandidate[]; sourceFingerprint: string;
};
// Same untouched-card predicate as company_requested_repository.UNREVIEWED.
const untouched = `intro.status='ready' AND intro.requested_at IS NULL AND intro.recommendation_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.talent_opportunity_recommendation rec
    WHERE rec.talent_id=intro.talent_id AND rec.role_id=intro.role_id
      AND (rec.feedback IS NOT NULL OR rec.saved_stage IS NOT NULL OR rec.processed_stage IS NOT NULL))
  AND NOT EXISTS(SELECT 1 FROM public.talent_opportunity_tag tag
    WHERE tag.talent_id=intro.talent_id AND tag.opportunity_id=intro.role_id)`;

export async function authorize(query: Query, command: PublicationCommand) {
  const [row] = await query(`SELECT EXISTS(SELECT 1 FROM public.company_user_workspace
    WHERE company_workspace_id=$1::uuid AND company_user_id=$2::uuid AND authority IN ('owner','admin'))
    AND public.company_memory_scope_allowed_v1($1::uuid,$2::uuid,'role',null,$3::uuid) AS allowed`,
  [command.workspaceId, command.userId, command.roleId]);
  if (!row?.allowed) throw new Error('Recommendation publication is not authorized for this Role');
}
export async function completedReceipt(query: Query, command: PublicationCommand): Promise<PublicationReceipt | null> {
  const [row] = await query(`SELECT request_options,result FROM public.company_first_search_runs
    WHERE company_workspace_id=$1::uuid AND contract_version='company_agentic_role_search_v1'
      AND request_options->>'requestId'=$2 ORDER BY created_at DESC LIMIT 1`, [command.workspaceId, command.requestId]);
  if (!row) return null;
  if (row.request_options?.webPublicationCommandHash !== fingerprint(command))
    throw new Error('Publication request identifier already belongs to another command');
  if (!row.result?.publicationReceipt) throw new Error('This publication request has no completed synchronous result');
  return row.result.publicationReceipt;
}
export async function readPool(query: Query, command: PublicationCommand) {
  return query(`SELECT intro.id::text,intro.talent_id::text,intro.revision FROM public.company_intro_candidates intro
    WHERE intro.company_workspace_id=$1::uuid AND intro.role_id=$2::uuid AND (${untouched}) ORDER BY intro.talent_id`,
  [command.workspaceId, command.roleId]);
}
async function readEvaluations(query: Query, command: PublicationCommand, version: string) {
  if (command.sourceRunId) {
    const [source] = await query(`SELECT source_snapshot,result FROM public.company_first_search_runs
      WHERE id=$1::uuid AND company_workspace_id=$2::uuid AND status='succeeded'
        AND (role_id=$3::uuid OR $3::uuid=ANY(requested_role_ids) OR $3::uuid=ANY(scheduled_role_ids))`,
    [command.sourceRunId, command.workspaceId, command.roleId]);
    if (!source || (source.source_snapshot?.roleSearchBrief?.version ?? source.result?.roleSearch?.briefVersion) !== version)
      throw new Error('Source run is unavailable or uses a different Hiring Brief');
    const refs = source.result?.roleSearch?.evidence?.evaluationIds ?? null;
    const rows = await query(`SELECT id::text,talent_id::text,stage,assessment FROM public.company_role_candidate_evaluations
      WHERE company_workspace_id=$1::uuid AND role_id=$2::uuid AND brief_version=$3 AND stage IN (1,2)
        AND (($4::uuid[] IS NOT NULL AND id=ANY($4::uuid[])) OR ($4::uuid[] IS NULL AND run_id=$5::uuid))
      ORDER BY evaluated_at DESC,id DESC`, [command.workspaceId, command.roleId, version, refs, command.sourceRunId]);
    if (refs && (refs.length !== rows.length || rows.some(row => !refs.includes(row.id))))
      throw new Error('Source run evaluation references are incomplete');
    return rows.filter(row => row.stage === 2);
  }
  return query(`SELECT DISTINCT ON(talent_id) id::text,talent_id::text,assessment
    FROM public.company_role_candidate_evaluations current
    WHERE role_id=$1::uuid AND brief_version=$2 AND stage=2 AND talent_id=ANY($3::uuid[])
      AND NOT EXISTS(SELECT 1 FROM public.company_role_candidate_evaluations screen
        WHERE screen.role_id=current.role_id AND screen.talent_id=current.talent_id AND screen.brief_version=current.brief_version
          AND screen.stage=1 AND screen.evaluated_at>current.evaluated_at AND screen.assessment->>'proceedToStage2'='false')
    ORDER BY talent_id,evaluated_at DESC,id DESC`, [command.roleId, version, command.talentIds]);
}
const whitespace = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');
// Worker whitespace normalization, retaining full evidence instead of legacy character caps.
const multiline = (value: unknown) => String(value ?? '').replaceAll('\r\n','\n').replaceAll('\r','\n')
  .split('\n').map(whitespace).filter(Boolean).join('\n');

export async function loadSnapshot(query: Query, command: PublicationCommand): Promise<Snapshot> {
  const [row] = await query(`SELECT role.*,internal.request,internal.criteria,behavior.text_context AS behavior_context,
    company.location AS headquarters_location, workspace.locale AS workspace_locale,
    public.company_role_search_brief_version_v1(role.role_id) AS version,
    public.company_role_search_brief_snapshot_v1(role.role_id) AS brief_snapshot
    FROM public.company_roles role JOIN public.company_internal_roles internal USING(role_id)
    JOIN public.company_workspace workspace ON workspace.company_workspace_id=role.company_workspace_id
    LEFT JOIN public.company_db company ON company.id=workspace.company_db_id
    LEFT JOIN public.company_behavior_contexts behavior ON behavior.role_id=role.role_id
    WHERE role.role_id=$1::uuid AND role.company_workspace_id=$2::uuid
      AND lower(btrim(coalesce(role.source_type,'')))='internal' AND lower(btrim(coalesce(role.status,'')))='active'
      AND coalesce(role.is_expired,false)=false AND (role.expires_at IS NULL OR role.expires_at>now())
      AND nullif(btrim(internal.request),'') IS NOT NULL
      AND public.role_matching_slot_type_v1(role.role_id,now()) IN ('free','paid')
      AND coalesce(lower(btrim(role.information->>'testOnly')),'') NOT IN ('true','1','yes','on')`,
  [command.roleId, command.workspaceId]);
  if (!row) throw new Error('Role is unavailable for recommendation publication');
  const criteria = row.criteria ?? [];
  if (!Array.isArray(criteria) || criteria.some((item: Facts) => !item || typeof item.name !== 'string'))
    throw new Error('Role criteria require named criterion objects');
  const salary = whitespace(row.salary_range) || [row.salary_min, row.salary_max].filter(value => value !== null)
    .join(' ~ ') + (row.salary_currency ? ` ${whitespace(row.salary_currency)}` : '') + (row.salary_period ? ` / ${whitespace(row.salary_period)}` : '');
  const role: PublicationRole = {roleId: command.roleId, name: whitespace(row.name), description: row.description ?? '',
    hiringBrief: row.request, companyBehavior: multiline(row.behavior_context),
    salary: row.salary_range || row.salary_min !== null || row.salary_max !== null ? salary : '',
    criteria,
    outputLanguage: resolveOrgWorkspaceLocale(row.workspace_locale, row.headquarters_location) === 'ko' ? '한국어' : 'English'};
  const pool = await readPool(query, command);
  const existing = new Set(pool.map(item => item.talent_id));
  const evaluations = await readEvaluations(query, command, row.version);
  const evaluationByTalent = new Map<string, Facts>();
  for (const item of evaluations) if (!evaluationByTalent.has(item.talent_id)) evaluationByTalent.set(item.talent_id, item);
  const writeIds = command.talentIds.filter(id => command.kind === 'add' ? !existing.has(id) : evaluationByTalent.has(id) || !existing.has(id));
  if (writeIds.some(id => !evaluationByTalent.has(id))) throw new Error('Selected candidate lacks current stage-two evidence');
  const available = writeIds.length ? await query(`SELECT talent.user_id::text AS talent_id FROM public.talent_users talent
    JOIN public.talent_setting setting ON setting.user_id=talent.user_id
    JOIN public.company_workspace workspace ON workspace.company_workspace_id=$1::uuid
    LEFT JOIN public.company_intro_candidates intro ON intro.talent_id=talent.user_id AND intro.role_id=$2::uuid AND (${untouched})
    WHERE talent.user_id=ANY($3::uuid[]) AND talent.deleted_at IS NULL AND setting.is_onboarding_done IS TRUE
      AND setting.profile_visibility='open_to_matches' AND setting.get_internal_recommendation IS NOT FALSE
      AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
        WHERE lower(btrim(blocked.name)) IN (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
      AND NOT EXISTS(SELECT 1 FROM public.talent_opportunity_recommendation rec
        WHERE rec.talent_id=talent.user_id AND rec.role_id=$2::uuid
          AND (rec.feedback IS NOT NULL OR rec.saved_stage IS NOT NULL OR rec.processed_stage IS NOT NULL))
      AND (intro.id IS NOT NULL OR public.company_first_pair_is_available_v1(talent.user_id,$2::uuid)
        OR (EXISTS(SELECT 1 FROM public.company_intro_candidates prior WHERE prior.talent_id=talent.user_id AND prior.role_id=$2::uuid)
          AND NOT EXISTS(SELECT 1 FROM public.company_intro_candidates prior WHERE prior.talent_id=talent.user_id AND prior.role_id=$2::uuid
            AND NOT (prior.status='closed' AND prior.close_reason IS NOT DISTINCT FROM 'reassessed'
              AND prior.requested_at IS NULL AND prior.recommendation_id IS NULL AND prior.talent_decision_at IS NULL))
          AND NOT EXISTS(SELECT 1 FROM public.talent_opportunity_tag tag WHERE tag.talent_id=talent.user_id AND tag.opportunity_id=$2::uuid)))`,
  [command.workspaceId, command.roleId, writeIds]) : [];
  if (new Set(available.map(item => item.talent_id)).size !== writeIds.length)
    throw new Error('Selected candidate is no longer eligible for this recommendation');
  const profiles = writeIds.length ? await query(`SELECT talent.user_id::text AS talent_id,talent.name,talent.headline,talent.bio,talent.location,talent.current_location,
    coalesce((SELECT jsonb_agg(jsonb_build_object('companyName',e.company_name,'role',e.role,'startDate',e.start_date,
      'endDate',e.end_date,'description',e.description) ORDER BY e.start_date DESC NULLS LAST,e.created_at DESC NULLS LAST)
      FROM public.talent_experiences e WHERE e.talent_id=talent.user_id),'[]'::jsonb) AS experiences,
    coalesce((SELECT jsonb_agg(jsonb_build_object('school',e.school,'degree',e.degree,'field',e.field,'startDate',e.start_date,
      'endDate',e.end_date,'description',e.description) ORDER BY e.start_date DESC NULLS LAST,e.created_at DESC NULLS LAST)
      FROM public.talent_educations e WHERE e.talent_id=talent.user_id),'[]'::jsonb) AS educations,
    extras.content AS extras FROM public.talent_users talent LEFT JOIN public.talent_extras extras ON extras.talent_id=talent.user_id
    WHERE talent.user_id=ANY($1::uuid[]) ORDER BY talent.user_id`, [writeIds]) : [];
  const briefs = writeIds.length ? await query(`SELECT talent_id::text,label,content,revision,ref,created_at,updated_at
    FROM public.talent_contexts WHERE talent_id=ANY($1::uuid[]) AND deleted_at IS NULL AND collection='brief' ORDER BY talent_id,ref`, [writeIds]) : [];
  const candidates = writeIds.map(talentId => {
    const source = profiles.find(item => item.talent_id === talentId)!;
    if (!source) throw new Error('Candidate source profile is unavailable');
    const rawExtras = source.extras?.talent_extras ?? source.extras?.talentExtras ?? [];
    const profile = {profile: {name: source.name, headline: source.headline, bio: source.bio ?? '',
      location: String(source.location ?? '').trim() || String(source.current_location ?? '').trim()},
    experiences: source.experiences.map((item: Facts) => ({companyName:item.companyName,role:item.role,startDate:item.startDate,endDate:item.endDate,description:item.description})),
    educations: source.educations.map((item: Facts) => ({school:item.school,degree:item.degree,field:item.field,startDate:item.startDate,endDate:item.endDate,description:item.description})),
    extra: {talentExtras: (Array.isArray(rawExtras) ? rawExtras : []).filter(item => item && typeof item === 'object')
      .map(item => Object.fromEntries(['title','description','date','memo'].map(key => [key, String(item[key] || '')])))}};
    const searchBrief = briefs.filter(item => item.talent_id === talentId).map(({talent_id: _, ...item}) => item);
    const evaluated = evaluationByTalent.get(talentId)!;
    return {talentId, profile, searchBrief, assessment: evaluated.assessment, evaluationId: evaluated.id,
      sourceFingerprint: fingerprint({profile, searchBrief, evaluationId: evaluated.id})};
  });
  return {role, version: row.version, briefSnapshot: row.brief_snapshot, pool, candidates,
    sourceFingerprint: fingerprint({role, version: row.version, candidates})};
}

export async function lockPublication(query: Query, command: PublicationCommand, snapshot: Snapshot) {
  // The source lock order is shared with Worker and profile/Brief mutations.
  const currentPool = await readPool(query, command);
  const ids = [...new Set([...command.talentIds, ...snapshot.pool.map(row => row.talent_id), ...currentPool.map(row => row.talent_id)])].sort();
  for (const id of ids) await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`matching-source-talent:${id}`]);
  await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`matching-source-role:${command.roleId}`]);
  await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`company-memory-source:${command.workspaceId}`]);
  for (const id of ids) {
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`talent-role-recommendation-change:${id}`]);
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`company_talent_route:${command.workspaceId}:${id}`]);
  }
  await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`company_matching_enqueue:${command.workspaceId}`]);
}

export async function persistPublication(query: Query, command: PublicationCommand, before: Snapshot,
  presentations: Map<string, Presentation>): Promise<PublicationReceipt> {
  await lockPublication(query, command, before);
  await authorize(query, command);
  const duplicate = await completedReceipt(query, command);
  if (duplicate) return duplicate;
  const current = await loadSnapshot(query, command);
  if (current.sourceFingerprint !== before.sourceFingerprint)
    throw new Error('Candidate evidence or Hiring Brief changed during writing; read current evidence before publishing');
  if (command.kind === 'replace' && fingerprint(before.pool) !== fingerprint(current.pool))
    throw new Error('Recommendation list changed during writing; read the list before replacing it');
  await query(`SELECT intro.id FROM public.company_intro_candidates intro WHERE intro.company_workspace_id=$1::uuid
    AND intro.role_id=$2::uuid AND (${untouched}) FOR UPDATE OF intro`, [command.workspaceId, command.roleId]);
  const previous = new Map(current.pool.map(row => [row.talent_id, row]));
  const removed = command.kind === 'replace' ? current.pool.filter(row => !command.talentIds.includes(row.talent_id)).map(row => row.talent_id) : [];
  const runId = randomUUID();
  const receipt: PublicationReceipt = {status: 'completed', runId, roleName: current.role.name, kind: command.kind,
    addedTalentIds: current.candidates.filter(item => !previous.has(item.talentId)).map(item => item.talentId),
    refreshedTalentIds: current.candidates.filter(item => previous.has(item.talentId)).map(item => item.talentId),
    removedTalentIds: removed, retainedTalentIds: current.pool.filter(item => !removed.includes(item.talent_id)).map(item => item.talent_id),
    requestedTalentIds: command.talentIds, ...(command.sourceRunId ? {sourceRunId: command.sourceRunId} : {}), candidateContact: false};
  const selectedCount = command.kind === 'add' ? current.candidates.length : command.talentIds.length;
  const result = {selectionMode:'company_first_only', deliveryStatus:'completed',
    companyNotice: {status:'not_required', reason:'synchronous_tool_result'}, publicationReceipt: receipt,
    counts: {retrieved:command.talentIds.length, scored:0, companyFirst:current.candidates.length, selected:selectedCount},
    roleSearch: {roleId:command.roleId, briefVersion:current.version, scope:'evaluated', startStage:2,
      selectionMethod:'company_agent_selected_ids', publicationKind:command.kind, sourceRunId:command.sourceRunId ?? null,
      addedTalentIds:receipt.addedTalentIds, refreshedTalentIds:receipt.refreshedTalentIds,
      removedTalentIds:removed, retainedTalentIds:receipt.retainedTalentIds,
      selectedEvaluationIds:current.candidates.map(item => item.evaluationId),
      counts:{stage1Evaluated:0,stage2Evaluated:0,stage3Written:current.candidates.length,selected:selectedCount},
      evidence:{capturedAt:new Date().toISOString(),evaluationIds:current.candidates.map(item=>item.evaluationId),
        rankedEvaluationIds:current.candidates.filter(item=>!previous.has(item.talentId)).map(item=>item.evaluationId),
        poolBefore:current.pool.map(item=>({candidateId:item.id,talentId:item.talent_id,revision:item.revision})),
        poolAfterTalentIds:[...new Set([...receipt.retainedTalentIds,...receipt.addedTalentIds])].sort()}}};
  await query(`INSERT INTO public.company_first_search_runs(id,company_workspace_id,role_id,scheduled_slot,trigger_reason,contract_version,
    status,requested_role_ids,request_options,source_snapshot,result,model_manifest,source_cutoff,started_at,selection_committed_at,finished_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,clock_timestamp(),'company_requested','company_agentic_role_search_v1','succeeded',ARRAY[$3::uuid],
      $4::text::jsonb,$5::text::jsonb,$6::text::jsonb,$7::text::jsonb,now(),now(),now(),now())`,
  [runId,command.workspaceId,command.roleId,JSON.stringify({roleId:command.roleId,scope:'evaluated',startStage:2,
    talentIds:command.talentIds,publication:{kind:command.kind,sourceRunId:command.sourceRunId},sourceMessageId:command.sourceMessageId,
    reason:command.reason,requestId:command.requestId,briefVersion:current.version,webPublicationCommandHash:fingerprint(command)}),
  JSON.stringify({roleSearchBrief:{...current.briefSnapshot,version:current.version}}), JSON.stringify(result),
  JSON.stringify({writer:'web',presentations:current.candidates.map(item=>({talentId:item.talentId,...presentations.get(item.talentId)!.usage}))})]);
  if (removed.length) await query(`UPDATE public.company_intro_candidates SET status='closed',close_reason='reassessed',revision=revision+1,updated_at=now()
    WHERE company_workspace_id=$1::uuid AND role_id=$2::uuid AND talent_id=ANY($3::uuid[]) AND status='ready'`, [command.workspaceId,command.roleId,removed]);
  for (const candidate of current.candidates) {
    const written = presentations.get(candidate.talentId);
    if (!written) throw new Error('Candidate presentation is incomplete');
    const reviewId = randomUUID();
    const candidateId = previous.get(candidate.talentId)?.id ?? reviewId;
    const presentation = {version:'company_first_presentation_v2', briefVersion:current.version,
      name:candidate.profile.profile.name,headline:candidate.profile.profile.headline,summary:written.tldr,tldr:written.tldr,
      harperNote:written.harperNote,harper_note:written.harperNote,finalFit:written.finalFit,
      criteriaEvaluations:written.criteriaEvaluations,
      roleName:current.role.name,alsoSuitableRoleIds:[],alsoSuitableRoles:[]};
    if (previous.has(candidate.talentId)) await query(`UPDATE public.company_intro_candidates SET presentation=$2::text::jsonb,selection_reason=$3,
      selection_run_id=$4::uuid,role_fingerprint=$5,talent_fingerprint=$6,revision=revision+1,updated_at=now() WHERE id=$1::uuid`,
    [candidateId,JSON.stringify(presentation),written.tldr,runId,current.version,candidate.sourceFingerprint]);
    else await query(`INSERT INTO public.company_intro_candidates(id,company_workspace_id,role_id,talent_id,selection_run_id,
      selection_reason,presentation,role_fingerprint,talent_fingerprint,status) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::text::jsonb,$8,$9,'ready')`,
    [candidateId,command.workspaceId,command.roleId,candidate.talentId,runId,written.tldr,JSON.stringify(presentation),current.version,candidate.sourceFingerprint]);
    await query(`INSERT INTO public.company_role_candidate_evaluations(company_workspace_id,role_id,talent_id,run_id,brief_version,stage,input_fingerprint,assessment)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,3,$6,$7::text::jsonb)`,
    [command.workspaceId,command.roleId,candidate.talentId,runId,current.version,written.fingerprint,JSON.stringify({tldr:written.tldr,
      harperNote:written.harperNote,finalFit:written.finalFit,criteria:written.criteriaEvaluations,
      explanationRecordedAt:new Date().toISOString()})]);
    await query(`INSERT INTO public.talent_opportunity_matching_review(id,run_id,talent_id,opportunity_id,decision,reason,
      criteria_evaluations,input_fingerprint,introduction,presentation_fingerprint,tldr,harper_note,final_fit)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'company_first',$5,$6::text::jsonb,$7,$8,$9,$8,$10,null)`,
    [reviewId,runId,candidate.talentId,command.roleId,command.reason ?? '',JSON.stringify(written.criteriaEvaluations),
      candidate.sourceFingerprint,written.tldr,written.fingerprint,written.harperNote]);
  }
  return receipt;
}
