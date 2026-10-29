import { createHash } from 'node:crypto';
import { formatLlmDateTime, projectLlmDateTimes } from '@/lib/llm/promptDateTime';
import { formatPromptText } from '@/lib/llm/promptText';
import { canPreviewCompanyCandidate } from '../org/candidatePreview';
import type { User } from '@supabase/supabase-js';
import type { OrgAgentAdminClient } from '../org/agent/data';
import { assertOrgTeamRoleAccess } from '../org/teamAccess';
import { OrgAgentToolInputError } from '../org/agent/toolAvailability';
import { object, nonnegativeInteger, positiveInteger } from '../org/agent/companyMemory';

export type CompanyEvaluationRelationship = {
  hasCompanyHistory: boolean; introStatus: string | null; hasSharedProgress: boolean;
  newPairAvailable: boolean;
};
export type RoleEvaluation = { id: string; talent_id: string; run_id: string | null; discovery_run_id?: string | null; brief_version: string; stage: number; input_contract_version?: string | null; assessment: Record<string, unknown>; evaluated_at: string; currentCompanyRelationship?: CompanyEvaluationRelationship };
export type RoleSearchRead = {
  selection?: {poolVersion:string; currentBriefVersion:string; sourceRunId?:string; evidenceCoverage?:string; recordedCandidateCount?:number;
    page?:{from:number;to:number};
    historicalPool?:{before:Array<Record<string,unknown>>;afterTalentIds:string[]};
    currentPoolCount:number; topCandidates:Array<Record<string,unknown>>; currentPool:Array<Record<string,unknown>>};
  relationship?: string; relationships?: Array<Record<string, unknown>>; inputContractVersion?: string; multipleInputContracts?: boolean;
  roleId: string; briefVersion: string; view: string; run: Record<string, unknown> | null;
  total: number; counts: Record<string, number>; criteria: Record<string, Record<string, number>>;
  stage1DecisionStats?: Record<string, {continue: number; exclude: number; unrecorded: number}>;
  items: RoleEvaluation[]; hasCompanyHistory?: boolean; includeDistributions?: boolean; displayedCriterion?: string; nextOffset: number | null; population?: Record<string, unknown>;
};
type Args = { admin: OrgAgentAdminClient; user: User; workspaceId: string };
const stage1Axes = {workScreen:'업무 적합성',companyPracticalScreen:'회사의 필수 실무 조건',candidatePracticalScreen:'후보자의 비협상 실무 조건'};
const publicAssessment = (value: unknown, stage: number) => {
  const row = object(value);
  // Only stage 3 has company-safe prose. Unknown nested fields are private by default.
  const fields = stage === 1 ? ['proceedToStage2', 'decision'] : stage === 2
    ? ['candidateFit', 'companyFit', 'mutualFit']
    : ['finalFit', 'explanationGeneratedAt', 'explanationRecordedAt', 'tldr', 'harperNote', 'recommendationReason'];
  const result = Object.fromEntries(fields.filter(key => key in row).map(key => [key, row[key]]));
  if (stage === 1) for (const axis of Object.keys(stage1Axes)) {
    if (row[axis] === 'continue' || row[axis] === 'exclude') result[axis] = row[axis];
  }
  if (stage > 1 && Array.isArray(row.criteria)) result.criteria = row.criteria.map(raw => {
    const c = object(raw), keys = ['name', 'criterionDefinition', 'score', 'label', ...(stage === 3 ? ['fitness', 'content'] : [])];
    const publicCriterion = Object.fromEntries(keys.filter(key => key in c).map(key => [key, c[key]]));
    if (Array.isArray(c.distribution)) publicCriterion.distribution = c.distribution.map(rawLevel => {
      const level = object(rawLevel);
      return Object.fromEntries(['value', 'label', 'probability'].filter(key => key in level).map(key => [key, level[key]]));
    });
    return publicCriterion;
  });
  return result;
};

async function readEvaluationRows(args: Args, roleId:string, input:Record<string,unknown>, briefVersion:string, references?:string[]) {
  const rows:RoleEvaluation[]=[];
  const groups=references===undefined?[undefined]:Array.from({length:Math.ceil(references.length/150)},(_,i)=>references.slice(i*150,i*150+150));
  for(const ids of groups)for(let page=0;;page+=1000) {
    let query=(args.admin.from('company_role_candidate_evaluations' as any) as any)
      .select('id,talent_id,run_id,discovery_run_id,brief_version,stage,assessment,evaluated_at,input_contract_version')
      .eq('company_workspace_id',args.workspaceId).eq('role_id',roleId);
    if(briefVersion!=='all')query=query.eq('brief_version',briefVersion);
    if(ids)query=query.in('id',ids);else if(input.runId)query=query.eq('run_id',input.runId);
    if(input.inputContractVersion)query=query.eq('input_contract_version',input.inputContractVersion);
    if(input.talentIds)query=query.in('talent_id',input.talentIds);
    if(input.stage!==undefined&&input.view==='evaluations')query=query.eq('stage',input.stage);
    const {data,error}=await query.order('evaluated_at',{ascending:false}).order('id',{ascending:false}).range(page,page+999);
    if(error)throw error;
    rows.push(...(data??[]).map((row:RoleEvaluation)=>({...row,assessment:publicAssessment(row.assessment,row.stage)})));
    if((data??[]).length<1000)break;
  }
  return rows.sort((a,b)=>b.evaluated_at.localeCompare(a.evaluated_at)||b.id.localeCompare(a.id));
}

function currentEvaluations(rows:RoleEvaluation[]) {
  const latest=new Map<string,RoleEvaluation>();
  for(const row of rows) {
    const key=`${row.talent_id}:${row.stage}:${row.brief_version}:${row.input_contract_version??'unspecified'}`;
    if(!latest.has(key))latest.set(key,row);
  }
  const values=[...latest.values()];
  const exclusions=new Map(values.filter(row=>row.stage===1&&row.assessment.proceedToStage2===false)
    .map(row=>[`${row.talent_id}:${row.brief_version}:${row.input_contract_version??'unspecified'}`,row.evaluated_at]));
  return values.filter(row=>row.stage===1||!exclusions.has(`${row.talent_id}:${row.brief_version}:${row.input_contract_version??'unspecified'}`)
    ||row.evaluated_at>exclusions.get(`${row.talent_id}:${row.brief_version}:${row.input_contract_version??'unspecified'}`)!);
}

function matchingPage(input: Record<string, unknown>, view: unknown) {
  if (input.from === undefined && input.to === undefined)
    return {offset:nonnegativeInteger(input.offset),limit:positiveInteger(input.limit,20,'limit')};
  if (view !== 'selection') throw new OrgAgentToolInputError('matching.from/to are available for selection; use offset/limit for other views.');
  if (input.offset !== undefined || input.limit !== undefined)
    throw new OrgAgentToolInputError('Use matching.from/to or offset/limit, not both.');
  const from=positiveInteger(input.from,1,'matching.from');
  const to=positiveInteger(input.to,from+19,'matching.to');
  if (!Number.isSafeInteger(to) || to<from) throw new OrgAgentToolInputError('matching.to must be a safe integer greater than or equal to matching.from.');
  return {offset:from-1,limit:to-from+1};
}

export async function readCompanyRoleSearch(args: Args & { input: Record<string, unknown> }): Promise<RoleSearchRead> {
  const { input } = args;
  if (typeof input.roleId !== 'string' || !input.roleId) throw new OrgAgentToolInputError('matching.roleId is required');
  const roleId = input.roleId;
  await assertOrgTeamRoleAccess({ ...args, roleId });
  const view = input.view ?? 'summary';
  if (!['summary', 'candidates', 'evaluations', 'selection'].includes(String(view))) throw new OrgAgentToolInputError('Unknown matching view');
  const { data: currentVersion, error: versionError } = await (args.admin.rpc as any)('company_role_search_brief_version_v1', { p_role_id: roleId });
  if (versionError) throw versionError;
  let briefVersion = typeof input.briefVersion === 'string' ? input.briefVersion : String(currentVersion);
  if (briefVersion === 'all' && view !== 'evaluations') throw new OrgAgentToolInputError('All versions are available only for evaluation history');
  const {offset,limit} = matchingPage(input,view);
  if (view === 'selection' && (input.briefVersion !== undefined || input.stage !== undefined || input.talentIds !== undefined || input.relationship !== undefined || input.hasCompanyHistory !== undefined || input.criterion !== undefined || input.label !== undefined))
    throw new OrgAgentToolInputError('selection reads the latest or an exact run plus the whole current pool; use other views for filtered history.');
  if(input.relationship!==undefined) {
    if(input.relationship!=='accepted') throw new OrgAgentToolInputError('Unknown matching relationship');
    const {data,error}=await (args.admin.rpc as any)('company_scheduled_accepted_relationships_v1',{p_workspace:args.workspaceId,p_role:roleId});
    if(error) throw error;
    const readable=await readableEvaluationTalents(args,roleId,(data??[]).map((row:any)=>row.talent_id));
    const relationships=(data??[]).filter((row:any)=>readable.has(row.talent_id));
    return {roleId,briefVersion,view:String(view),run:null,relationship:'accepted',
      relationships:relationships.slice(offset,offset+limit).map((row:any)=>({talentId:row.talent_id,
        sourceRecommendationId:row.recommendation_id,acceptedAt:formatLlmDateTime(row.accepted_at),
        introduced:false,companyDecision:null})),total:relationships.length,counts:{acceptedUnintroduced:relationships.length},
      criteria:{},items:[],nextOffset:offset+limit<relationships.length?offset+limit:null};
  }
  if(input.inputContractVersion!==undefined&&typeof input.inputContractVersion!=='string') throw new OrgAgentToolInputError('inputContractVersion must be text');
  let population: Record<string, unknown> | undefined;
  if (!input.runId && briefVersion === String(currentVersion)) {
    const {data,error} = await (args.admin.rpc as any)('company_role_search_inventory_v1',{p_workspace:args.workspaceId,p_role:roleId,p_version:briefVersion});
    if (error) throw error;
    population=object(data);
  }

  let run: Record<string, unknown> | null = null;
  let evidence:Record<string,any>|undefined;
  if (input.runId !== undefined) {
    if (typeof input.runId !== 'string') throw new OrgAgentToolInputError('runId must be an exact run identifier');
    const { data, error } = await (args.admin.from('company_first_search_runs') as any).select('id,status,created_at,finished_at,role_id,requested_role_ids,scheduled_role_ids,contract_version,source_snapshot,request_options,result').eq('company_workspace_id', args.workspaceId).eq('id', input.runId).maybeSingle();
    if (error) throw error;
    if (!data || (data.role_id !== roleId && !(data.requested_role_ids ?? []).includes(roleId) && !(data.scheduled_role_ids ?? []).includes(roleId))) throw new OrgAgentToolInputError('Run not found for this accessible Role');
    if (input.briefVersion === undefined) {
      const recordedVersion = object(data.request_options).briefVersion ?? object(object(data.source_snapshot).roleSearchBrief).version ?? object(object(data.result).roleSearch).briefVersion;
      briefVersion = typeof recordedVersion === 'string' ? recordedVersion : 'unknown';
    }
    const stored = object(object(data.result).roleSearch), options = object(data.request_options);
    evidence=object(stored.evidence);
    const snapshot=object(object(data.source_snapshot).roleSearchBrief);
    const briefSnapshot=Object.fromEntries(['version','roleId','name','description','request','criteria','location','countryCode','workMode','employmentType','seniority','salaryRange','salaryMin','salaryMax','salaryCurrency','salaryPeriod']
      .filter(key=>key in snapshot).map(key=>[key,snapshot[key]]));
    const addedIds = Array.isArray(stored.addedTalentIds) ? stored.addedTalentIds.filter((id): id is string => typeof id === 'string') : [];
    const removedIds = Array.isArray(stored.removedTalentIds) ? stored.removedTalentIds.filter((id): id is string => typeof id === 'string') : [];
    const failures = Array.isArray(stored.failedEvaluations) ? stored.failedEvaluations.map(object)
      .filter(item => typeof item.talentId === 'string' && typeof item.stage === 'number') : [];
    const changeIds = [...new Set([...addedIds, ...removedIds, ...failures.map(item => item.talentId as string)])];
    const readableChanges = changeIds.length ? await readableEvaluationTalents(args, roleId, changeIds) : new Map();
    const visibleFailures = failures.filter(item => readableChanges.has(item.talentId as string));
    run = { id: data.id, status: data.status, createdAt: data.created_at, finishedAt: data.finished_at,
      briefSnapshot:Object.keys(briefSnapshot).length?briefSnapshot:null,
      evidenceCoverage:Array.isArray(evidence.evaluationIds)?'frozen_references':'run_rows_only',
      evidenceCapturedAt:formatLlmDateTime(evidence.capturedAt),
      options: {scope:options.scope,startStage:options.startStage,limit:options.limit,recommendCount:options.recommendCount,reason:options.reason,sourceMessageId:options.sourceMessageId},
      summary: {addedTalentIds: addedIds.filter(id => readableChanges.has(id)), removedTalentIds: removedIds.filter(id => readableChanges.has(id)), hasStageLedger: data.contract_version === 'company_agentic_role_search_v1' || Object.keys(stored).length > 0, added: Array.isArray(stored.addedTalentIds) ? stored.addedTalentIds.length : null, removed: Array.isArray(stored.removedTalentIds) ? stored.removedTalentIds.length : null, retained: Array.isArray(stored.retainedTalentIds) ? stored.retainedTalentIds.length : null, refreshed: Array.isArray(stored.refreshedTalentIds) ? stored.refreshedTalentIds.length : null,
        briefVersionAtCompletion: stored.briefVersionAtCompletion,
        evaluationFailed: object(stored.counts).evaluationFailed,
        failedEvaluationTotal: visibleFailures.length,
        failedEvaluationNextOffset: offset + limit < visibleFailures.length ? offset + limit : null,
        failedEvaluations: visibleFailures.slice(offset, offset + limit)
          .map(item => ({talentId:item.talentId,stage:item.stage})),
        currentStage2Evaluated:object(stored.counts).currentStage2Evaluated ?? null,
        selectionPoolStage2Evaluated:object(stored.counts).selectionPoolStage2Evaluated ?? null,
        comparisonCriteria: view === 'summary' && !input.talentIds && input.hasCompanyHistory === undefined && input.criterion === undefined && input.label === undefined
          ? (Array.isArray(stored.criteriaStats) ? stored.criteriaStats.map(raw => {
              const criterion = object(raw);
              return {name:criterion.name,count:criterion.count,labelCounts:object(criterion.labelCounts),criterionDefinition:criterion.criterionDefinition};
            }) : []) : []} };
  }
  if (input.talentIds !== undefined && (!Array.isArray(input.talentIds) || !input.talentIds.every(id => typeof id === 'string'))) throw new OrgAgentToolInputError('talentIds must contain exact identifiers');
  if (input.stage !== undefined && (typeof input.stage !== 'number' || ![1, 2, 3].includes(input.stage))) throw new OrgAgentToolInputError('Unknown evaluation stage');
  // A talent-specific summary is also an individual disclosure, even without a
  // list. Apply the same sharing boundary before computing its statistics.
  const allowedTargets = Array.isArray(input.talentIds)
    ? await readableEvaluationTalents(args, roleId, input.talentIds as string[]) : null;
  if (input.includeDistributions !== undefined && typeof input.includeDistributions !== 'boolean') throw new OrgAgentToolInputError('includeDistributions must be boolean');
  if (input.hasCompanyHistory !== undefined && typeof input.hasCompanyHistory !== 'boolean') throw new OrgAgentToolInputError('hasCompanyHistory must be boolean');
  // PostgREST defaults to 1,000 rows; statistics must not silently describe only
  // the first page. Page the immutable evidence then choose the newest per stage.
  const references=Array.isArray(evidence?.evaluationIds)?evidence.evaluationIds.filter((id:unknown):id is string=>typeof id==='string'):undefined;
  const sourceRows=await readEvaluationRows(args,roleId,{...input,view},briefVersion,references);
  if(references&&view==='selection'&&new Set(sourceRows.map(row=>row.id)).size!==new Set(references).size)
    throw new OrgAgentToolInputError('Historical evaluation references are incomplete; this run cannot be presented as a complete frozen list.');
  if(references&&view!=='selection'&&(input.stage===undefined||input.stage===3))
    sourceRows.push(...await readEvaluationRows(args,roleId,{...input,view:'evaluations',stage:3},briefVersion));
  const rows=sourceRows.filter(row=>!allowedTargets||allowedTargets.has(row.talent_id));
  // Relationship is a current, company-visible fact, independent of a past score.
  // Apply this reusable population filter before statistics and pagination.
  const relationships = input.hasCompanyHistory !== undefined
    ? await readableEvaluationTalents(args, roleId, [...new Set(rows.map(row => row.talent_id))]) : null;
  const scopedRows = relationships
    ? rows.filter(row => relationships.get(row.talent_id)?.hasCompanyHistory === input.hasCompanyHistory) : rows;
  const current = currentEvaluations(scopedRows);
  const counts: Record<string, number> = { evaluatedTalents: new Set(current.map(row => row.talent_id)).size, stage1: 0, stage1Passed: 0, stage2: 0, stage3: 0 };
  const criteria: Record<string, Record<string, number>> = Object.create(null);
  const stage1DecisionStats = Object.fromEntries(Object.keys(stage1Axes).map(axis => [axis,{continue:0,exclude:0,unrecorded:0}]));
  for (const row of current) {
    counts[`stage${row.stage}`] = (counts[`stage${row.stage}`] ?? 0) + 1;
    if (row.stage === 1 && (row.assessment.proceedToStage2 === true)) counts.stage1Passed++;
    if (row.stage === 1) for (const axis of Object.keys(stage1Axes)) {
      const decision = row.assessment[axis];
      stage1DecisionStats[axis][decision === 'continue' || decision === 'exclude' ? decision : 'unrecorded']++;
    }
    if (row.stage !== 2) continue;
    for (const criterion of Array.isArray(row.assessment.criteria) ? row.assessment.criteria : []) {
      const c = object(criterion), key = String(c.id ?? c.key ?? c.title ?? c.name ?? 'unlabelled');
      const label = String(c.label ?? c.score ?? 'unknown');
      (criteria[key] ??= Object.create(null))[label] = (criteria[key]?.[label] ?? 0) + 1;
    }
  }
  if (view === 'selection') {
    const review = await readSelectionReview(args, roleId, String(currentVersion), current, offset, limit,
      input.runId?{runId:String(input.runId),evidence:evidence??{}}:undefined);
    return {roleId,briefVersion,view:'selection',run,counts,criteria,stage1DecisionStats,
      total:review.total,items:[],nextOffset:review.nextOffset,selection:review.selection};
  }
  let selected = view === 'evaluations' ? scopedRows : current;
  if (input.stage !== undefined) selected = selected.filter(row => row.stage === input.stage);
  if (input.criterion !== undefined || input.label !== undefined) selected = selected.filter(row => (Array.isArray(row.assessment.criteria) ? row.assessment.criteria : []).some(raw => {
    const c = object(raw); return (input.criterion === undefined || String(c.id ?? c.key ?? c.title ?? c.name) === input.criterion) && (input.label === undefined || String(c.label ?? c.score) === String(input.label));
  }));
  if (view === 'candidates') {
    const byTalent = new Map<string, RoleEvaluation>();
    for (const row of selected) {
      const key=`${row.talent_id}:${row.input_contract_version??'unspecified'}`;
      if (!byTalent.has(key) || (row.stage === 2 && byTalent.get(key)!.stage !== 2)) byTalent.set(key, row);
    }
    selected = [...byTalent.values()].sort((a, b) => Number(b.assessment.mutualFit ?? 0) - Number(a.assessment.mutualFit ?? 0) || a.talent_id.localeCompare(b.talent_id));
  }
  const visible = view === 'summary' ? null : relationships
    ?? await readableEvaluationTalents(args, roleId, [...new Set(selected.map(row => row.talent_id))]);
  if (visible) selected = selected.filter(row => visible.has(row.talent_id));
  const pageItems = view === 'summary' ? [] : selected.slice(offset, offset + limit);
  const currentRelationships = await currentRecommendationAvailability(args, roleId, pageItems.map(row => row.talent_id), visible);
  const items = pageItems.map(row => {
    return {...row, assessment:publicAssessment(row.assessment,row.stage),
      currentCompanyRelationship: currentRelationships.get(row.talent_id)!};
  });
  return { multipleInputContracts:new Set(current.map(row=>row.input_contract_version??'unspecified')).size>1, ...(typeof input.inputContractVersion==='string'?{inputContractVersion:input.inputContractVersion}:{}), roleId, briefVersion, view: String(view), run, counts, criteria, stage1DecisionStats, includeDistributions:input.includeDistributions === true, ...(view === 'candidates' && typeof input.criterion === 'string' ? {displayedCriterion: input.criterion} : {}), ...(typeof input.hasCompanyHistory === 'boolean' ? {hasCompanyHistory:input.hasCompanyHistory} : {}), ...(population ? {population} : {}), total: selected.length, items, nextOffset: view !== 'summary' && offset + items.length < selected.length ? offset + items.length : null };
}

/** Same card identity/revision representation used by the publication executor. */
export function recommendationPoolVersion(rows: Array<{id:string;talent_id:string;revision:number}>) {
  return createHash('sha256').update(rows.map(row=>`${row.id}:${row.talent_id}:${row.revision}`).sort().join('\n')).digest('hex');
}

async function readSelectionReview(args: Args, roleId:string, briefVersion:string, current:RoleEvaluation[], offset:number, limit:number,
  history?:{runId:string;evidence:Record<string,any>}) {
  const ready:Array<Record<string,any>>=[];
  for(let page=0;;page+=1000) {
    const {data,error}=await (args.admin.from('company_intro_candidates') as any)
      .select('id,talent_id,revision,requested_at,recommendation_id,presentation').eq('company_workspace_id',args.workspaceId)
      .eq('role_id',roleId).eq('status','ready').order('id').range(page,page+999);
    if(error) throw error;
    ready.push(...(data??[]).filter((row:any)=>row.requested_at===null && row.recommendation_id===null));
    if((data??[]).length<1000)break;
  }
  const protectedIds=new Set<string>();
  for(let offset=0;offset<ready.length;offset+=250) {
    const ids=ready.slice(offset,offset+250).map(row=>row.talent_id);
    const [rec,tags]=await Promise.all([
      args.admin.from('talent_opportunity_recommendation').select('talent_id,feedback,saved_stage,processed_stage').eq('role_id',roleId).in('talent_id',ids),
      args.admin.from('talent_opportunity_tag').select('talent_id').eq('opportunity_id',roleId).in('talent_id',ids),
    ]);
    for(const result of [rec,tags])if(result.error)throw result.error;
    for(const row of rec.data??[])if(row.feedback!==null || row.saved_stage!==null || row.processed_stage!==null)protectedIds.add(row.talent_id);
    for(const row of tags.data??[])protectedIds.add(row.talent_id);
  }
  const pool=ready.filter(row=>!protectedIds.has(row.talent_id)), poolIds=new Set(pool.map(row=>row.talent_id));
  // Only one current input projection per person is selected. Its version remains explicit.
  const byTalent=new Map<string,RoleEvaluation>();
  for(const row of current)if(!byTalent.has(row.talent_id) || row.stage===2 && byTalent.get(row.talent_id)!.stage!==2)byTalent.set(row.talent_id,row);
  const frozenRank=history&&Array.isArray(history.evidence.rankedEvaluationIds)?history.evidence.rankedEvaluationIds as string[]:null;
  const byEvaluation=new Map(current.map(row=>[row.id,row]));
  const ranked=frozenRank?frozenRank.flatMap(id=>byEvaluation.has(id)?[byEvaluation.get(id)!]:[]):[...byTalent.values()].filter(row=>row.stage===2 && (history||!poolIds.has(row.talent_id)))
    .sort((a,b)=>Number(b.assessment.mutualFit)-Number(a.assessment.mutualFit)||a.talent_id.localeCompare(b.talent_id));
  const before=history&&Array.isArray(history.evidence.poolBefore)?history.evidence.poolBefore.map(object):[];
  const after=history&&Array.isArray(history.evidence.poolAfterTalentIds)?history.evidence.poolAfterTalentIds.filter((id:unknown):id is string=>typeof id==='string'):[];
  const historicalIds=before.flatMap(row=>typeof row.talentId==='string'?[row.talentId]:[]);
  const visible=await readableEvaluationTalents(args,roleId,[...new Set([...ranked.map(row=>row.talent_id),...poolIds,...historicalIds,...after])]);
  const availability=await currentRecommendationAvailability(args,roleId,[...visible.keys()],visible);
  // Historical membership/rank is immutable; current eligibility is a separate fact.
  const eligible=ranked.filter(row=>history?visible.has(row.talent_id):availability.get(row.talent_id)?.newPairAvailable);
  const top=eligible.slice(offset,offset+limit), visiblePool=pool.filter(row=>visible.has(row.talent_id));
  const visibleBefore=before.filter(row=>visible.has(String(row.talentId)));
  const ids=[...new Set([...top.map(row=>row.talent_id),...visiblePool.map(row=>row.talent_id),...visibleBefore.map(row=>String(row.talentId))])];
  const latestRows=history?currentEvaluations(await readEvaluationRows(args,roleId,{talentIds:ids},briefVersion)):current;
  const latestByTalent=new Map<string,RoleEvaluation>();
  for(const row of latestRows)if(!latestByTalent.has(row.talent_id)||row.stage===2&&latestByTalent.get(row.talent_id)!.stage!==2)latestByTalent.set(row.talent_id,row);
  const profiles=new Map<string,Record<string,unknown>>();
  const readCareerRows=async(table:string,fields:string,batch:string[])=>{
    const rows:any[]=[];
    for(let page=0;;page+=1000) {
      const {data,error}=await (args.admin.from(table as any) as any).select(fields)
        .in('talent_id',batch).order('talent_id').order('start_date',{ascending:false,nullsFirst:false})
        .order('id').range(page,page+999);
      if(error)throw error;
      rows.push(...(data??[]));
      if((data??[]).length<1000)return rows;
    }
  };
  for(let start=0;start<ids.length;start+=100) {
    const batch=ids.slice(start,start+100);
    const [talents,experiences,educations]=await Promise.all([
      (args.admin.from('talent_users') as any).select('user_id,name,headline,location,created_at').in('user_id',batch),
      readCareerRows('talent_experiences','talent_id,company_name,role,start_date,end_date',batch),
      readCareerRows('talent_educations','talent_id,school,degree,field,start_date,end_date',batch),
    ]);
    if(talents.error)throw talents.error;
    for(const talent of talents.data??[])profiles.set(talent.user_id,{
      name:talent.name,headline:talent.headline,location:talent.location,joinedAt:formatLlmDateTime(talent.created_at),
      recentExperience:projectLlmDateTimes(experiences.filter((row:any)=>row.talent_id===talent.user_id).slice(0,5).map(({talent_id,...row}:any)=>row)),
      recentEducation:projectLlmDateTimes(educations.filter((row:any)=>row.talent_id===talent.user_id).slice(0,3).map(({talent_id,...row}:any)=>row)),
    });
  }
  const evaluation=(row:RoleEvaluation|undefined)=>row?{id:row.id,runId:row.run_id,discoveryRunId:row.discovery_run_id??null,stage:row.stage,briefVersion:row.brief_version,inputContractVersion:row.input_contract_version,
    evaluatedAt:formatLlmDateTime(row.evaluated_at),assessment:publicAssessment(row.assessment,row.stage)}:null;
  const projection=(talentId:string,row:RoleEvaluation|undefined,card?:Record<string,any>)=>({
    talentId,...profiles.get(talentId),currentCompanyRelationship:availability.get(talentId),
    evaluation:evaluation(row),
    ...(history?{currentEvaluation:evaluation(latestByTalent.get(talentId)),inCurrentPool:poolIds.has(talentId)}:{}),
    ...(card?{alreadyRecommended:true,presentationBriefVersion:card.presentation?.briefVersion??null,
      previousCriteria:(card.presentation?.criteriaEvaluations??[]).map((c:any)=>({name:c.name,score:c.score,label:c.label??c.fitness})),
      canRetain:true,canRefresh:row?.stage===2 && visible.get(talentId)?.canShareNewProfile}:{}),
  });
  return {total:eligible.length,nextOffset:offset+top.length<eligible.length?offset+top.length:null,
    selection:{poolVersion:recommendationPoolVersion(pool as any),currentBriefVersion:briefVersion,currentPoolCount:pool.length,page:{from:offset+1,to:offset+limit},
      ...(history?{sourceRunId:history.runId,evidenceCoverage:frozenRank?'frozen_references':'run_rows_only',
        recordedCandidateCount:frozenRank?.length,
        ...(frozenRank?{historicalPool:{before:visibleBefore.map(card=>projection(String(card.talentId),byTalent.get(String(card.talentId)))),afterTalentIds:after.filter((id:string)=>visible.has(id))}}:{})}:{}),
      topCandidates:top.map(row=>({...projection(row.talent_id,row),...(frozenRank?{historicalRank:frozenRank.indexOf(row.id)+1}:{})})),
      currentPool:visiblePool.map(card=>({...projection(card.talent_id,latestByTalent.get(card.talent_id),card),
        ...(history?{historicalEvaluation:evaluation(byTalent.get(card.talent_id))}:{})}))}};
}
async function readableEvaluationTalents(args: Args, roleId: string, ids: string[]) {
  const visible = new Map<string, {hasCompanyHistory:boolean; introStatus:string|null; hasSharedProgress:boolean; canShareNewProfile:boolean; onlyRetiredByReassessment:boolean}>();
  const { data: workspace, error } = await args.admin.from('company_workspace').select('company_name,published_name').eq('company_workspace_id', args.workspaceId).single();
  if (error) throw error;
  for (let offset = 0; offset < ids.length; offset += 250) {
    const batch = ids.slice(offset, offset + 250);
    const [talents, settings, progress, intros] = await Promise.all([
      args.admin.from('talent_users').select('user_id,deleted_at').in('user_id', batch),
      args.admin.from('talent_setting').select('user_id,is_onboarding_done,profile_visibility,get_internal_recommendation,blocked_companies').in('user_id', batch),
      args.admin.from('talent_progress').select('talent_id').eq('role_id', roleId).eq('open_to_company', true).in('talent_id', batch),
      args.admin.from('company_intro_candidates').select('talent_id,status,updated_at,close_reason,requested_at,recommendation_id,talent_decision_at').eq('company_workspace_id', args.workspaceId).eq('role_id', roleId).in('talent_id', batch),
    ]);
    for (const result of [talents, settings, progress, intros]) if (result.error) throw result.error;
    const byId = new Map((settings.data ?? []).map(row => [row.user_id, row]));
    const sharedProgress = new Set((progress.data ?? []).map(row => row.talent_id));
    const introByTalent = new Map<string, {status:string;updated_at:string}>();
    for (const intro of intros.data ?? []) {
      if (intro.close_reason === 'route_replaced') continue;
      const prior = introByTalent.get(intro.talent_id);
      if (!prior || intro.updated_at > prior.updated_at) introByTalent.set(intro.talent_id, intro);
    }
    const names = [workspace.company_name, workspace.published_name];
    const normalizedNames = new Set(names.map(name => name?.trim().toLowerCase()).filter(Boolean));
    for (const talent of talents.data ?? []) {
      const setting = byId.get(talent.user_id) ?? null;
      const blocked = setting?.blocked_companies?.some(name => normalizedNames.has(name.trim().toLowerCase()));
      if (talent.deleted_at !== null || blocked) continue;
      const hasSharedProgress = sharedProgress.has(talent.user_id);
      const introStatus = introByTalent.get(talent.user_id)?.status ?? null;
      const hasCompanyHistory = hasSharedProgress || introStatus !== null;
      const canShareNewProfile = canPreviewCompanyCandidate({deletedAt:talent.deleted_at,setting,companyNames:names});
      const history = (intros.data ?? []).filter(intro => intro.talent_id === talent.user_id);
      const onlyRetiredByReassessment = history.length > 0 && history.every(intro =>
        intro.status === 'closed' && intro.close_reason === 'reassessed' && intro.requested_at === null
        && intro.recommendation_id === null && intro.talent_decision_at === null);
      if (hasCompanyHistory || canShareNewProfile) visible.set(talent.user_id, {hasCompanyHistory,introStatus,hasSharedProgress,canShareNewProfile,onlyRetiredByReassessment});
    }
  }
  return visible;
}
async function currentRecommendationAvailability(args: Args, roleId: string, ids: string[], visible: Awaited<ReturnType<typeof readableEvaluationTalents>> | null) {
  const result = new Map<string, CompanyEvaluationRelationship>();
  const uniqueIds = [...new Set(ids)];
  // Bound query concurrency, not the number of people the agent may read.
  for (let offset = 0; offset < uniqueIds.length; offset += 64) {
    const batch = uniqueIds.slice(offset, offset + 64);
    const [recommendations, tags] = await Promise.all([
      args.admin.from('talent_opportunity_recommendation')
        .select('talent_id,feedback,saved_stage,processed_stage').eq('role_id',roleId).in('talent_id',batch),
      args.admin.from('talent_opportunity_tag').select('talent_id').eq('opportunity_id',roleId).in('talent_id',batch),
    ]);
    for (const response of [recommendations, tags]) if (response.error) throw response.error;
    const protectedIds = new Set((recommendations.data ?? []).filter(row => row.feedback !== null || row.saved_stage !== null || row.processed_stage !== null).map(row => row.talent_id));
    const taggedIds = new Set((tags.data ?? []).map(row => row.talent_id));
    await Promise.all(batch.map(async talentId => {
      const relation = visible!.get(talentId)!;
      let available = false;
      if (relation.canShareNewProfile && relation.onlyRetiredByReassessment && !protectedIds.has(talentId) && !taggedIds.has(talentId)) {
        available = true;
      } else if (relation.canShareNewProfile && relation.introStatus === null && !protectedIds.has(talentId)) {
        const {data, error} = await (args.admin.rpc as any)('company_first_pair_is_available_v1', {p_talent_id:talentId,p_role_id:roleId});
        if (error) throw error;
        available = data === true;
      }
      result.set(talentId, {hasCompanyHistory:relation.hasCompanyHistory,introStatus:relation.introStatus,
        hasSharedProgress:relation.hasSharedProgress,newPairAvailable:available});
    }));
  }
  return result;
}
// Source text must not create or close machine sections used by the compactor.
const escapePromptText = (text: string) => text.replaceAll('<', '‹').replaceAll('>', '›');
function displayedCriteria(row: RoleEvaluation, criterion?: string) {
  return (Array.isArray(row.assessment.criteria) ? row.assessment.criteria.map(object) : []).filter(c =>
    criterion === undefined || String(c.id ?? c.key ?? c.title ?? c.name) === criterion);
}
function formatEvaluation(row: RoleEvaluation, includeDistributions: boolean, criterion?: string) {
  const assessment = row.assessment;
  const criteria = displayedCriteria(row, criterion);
  const scores = ['candidateFit','companyFit','mutualFit','finalFit'].filter(key => assessment[key] !== undefined).map(key => `${key} ${assessment[key]}`).join(' · ');
  const details = [
    ...['tldr','harperNote','recommendationReason'].filter(key => typeof assessment[key] === 'string').map(key => `${key}: ${assessment[key]}`),
    ...criteria.flatMap(c => [c.content ? `${c.name}: ${c.content}` : '', includeDistributions && Array.isArray(c.distribution) ? `분포: ${c.distribution.map(raw => { const d = object(raw); return `${d.label ?? d.value} ${Number(d.probability).toFixed(3)}`; }).join(', ')}` : ''].filter(Boolean)),
  ];
  const facts = [
    `${row.talent_id} · 평가 ${row.id} · Brief ${row.brief_version} · 입력 ${row.input_contract_version??"과거 기록 미지정"} · ${row.run_id ? `회사 검색 실행 ${row.run_id}` : row.discovery_run_id ? `후보자 탐색 실행 ${row.discovery_run_id}` : '실행 출처 미기록'} · ${formatLlmDateTime(row.evaluated_at)} · ${row.stage}차`,
    ...(row.stage === 1 ? [`1차: ${assessment.proceedToStage2 === true ? '통과' : assessment.proceedToStage2 === false ? '제외' : '미기록'}`, ...Object.entries(stage1Axes).filter(([axis]) => assessment[axis] === 'continue' || assessment[axis] === 'exclude').map(([axis,label]) => `${label}: ${assessment[axis] === 'exclude' ? '제외 판단' : '통과 판단'}`)] : []),
    scores,
    ...(row.currentCompanyRelationship ? [`현재 회사 관계: 기존 기록 ${row.currentCompanyRelationship.hasCompanyHistory ? '있음' : '없음'} · 추천 ${row.currentCompanyRelationship.introStatus ?? '없음'} · 공개 진행 ${row.currentCompanyRelationship.hasSharedProgress ? '있음' : '없음'} · 새 pair ${row.currentCompanyRelationship.newPairAvailable ? '가능' : '불가'}`] : []),
    ...criteria.map(c => `기준 ${c.name}: 점수 ${c.score ?? '미기록'} · 라벨 ${c.label ?? c.fitness ?? '미기록'}`),
  ].filter(Boolean).map(escapePromptText);
  return [...facts, ...(details.length ? ['<evaluation_explanations>', ...details.map(escapePromptText), '</evaluation_explanations>'] : [])].join('\n');
}
export function formatCompanyRoleSearch(value: RoleSearchRead) {
  if(value.selection) {
    const definitions=new Map<string,{ref:string;briefVersion:string;name:string;definition:unknown}>();
    const criteria=(items:unknown,version:string)=> (Array.isArray(items)?items:[]).map(raw=>{
      const c=object(raw),key=JSON.stringify([version,c.name]);
      if(!definitions.has(key))definitions.set(key,{ref:`criteria${definitions.size+1}`,briefVersion:version,name:String(c.name),definition:c.criterionDefinition});
      else if(c.criterionDefinition)definitions.get(key)!.definition=c.criterionDefinition;
      return `${definitions.get(key)!.ref}: ${c.label??c.fitness??'미기록'}`;
    });
    const assessment=(evaluation:Record<string,any>|null|undefined)=>{
      if(!evaluation)return null;
      const a=object(evaluation.assessment);
      return {
        ...Object.fromEntries(['candidateFit','companyFit','mutualFit','finalFit','proceedToStage2','decision',...Object.keys(stage1Axes)].filter(key=>key in a).map(key=>[key,a[key]])),
        criteria:criteria(a.criteria,evaluation.briefVersion),
      };
    };
    const period=(row:Record<string,any>)=>`${row.start_date??''} - ${row.end_date??''}`;
    const relationship=(row:Record<string,any>)=>{
      const r=row.currentCompanyRelationship;
      return r?`회사에 공개된 이력 ${r.hasCompanyHistory?'있음':'없음'}; Intro 상태 ${r.introStatus??'없음'}; 공유된 진행 이력 ${r.hasSharedProgress?'있음':'없음'}; 현재 신규 추천 ${r.newPairAvailable?'가능':'불가'}`:undefined;
    };
    const historical=Boolean(value.selection.sourceRunId);
    const compact=(raw:Record<string,any>)=>{
      const row=projectLlmDateTimes(raw) as Record<string,any>;
      return {
        talentId:row.talentId,
        info:['name','headline','location'].filter(key=>row[key]).map(key=>`${key}: ${row[key]}`).join(', '),
        joinedAt:row.joinedAt,
        recentExperience:(row.recentExperience??[]).map((r:Record<string,any>)=>`${r.role??''} at ${r.company_name??''} : ${period(r)}`),
        recentEducation:(row.recentEducation??[]).map((r:Record<string,any>)=>`${[r.degree,r.field].filter(Boolean).join(' - ')} at ${r.school??''} : ${period(r)}`),
        assessment:assessment(row.evaluation),
        ...(row.evaluation?.stage&&row.evaluation.stage!==2?{assessmentStage:row.evaluation.stage}:{}),
        ...(row.evaluation&&row.evaluation.briefVersion!==value.briefVersion?{assessmentBriefVersion:row.evaluation.briefVersion}:{}),
        ...(historical?{historicalRank:row.historicalRank,inCurrentPool:row.inCurrentPool,
          currentRelationship:relationship(row),
          ...(!row.alreadyRecommended?{currentAssessment:assessment(row.currentEvaluation)}:{}),
          ...(row.historicalEvaluation?{historicalAssessment:assessment(row.historicalEvaluation)}:{})}:{}),
        ...(row.alreadyRecommended?{
          recommendation:`현재 미결정 추천. 기존 카드 유지 가능; 현재 평가로 설명 갱신 ${row.canRefresh?'가능':'불가'}`,
          presentationBriefVersion:row.presentationBriefVersion,
          previousCriteria:criteria(row.previousCriteria,row.presentationBriefVersion),
        }:{}),
      };
    };
    const top=value.selection.topCandidates.map(compact),pool=value.selection.currentPool.map(compact);
    const historicalPool=value.selection.historicalPool?{...value.selection.historicalPool,before:value.selection.historicalPool.before.map(compact)}:null;
    return [
      `Role ${value.roleId} · 조회 기준 Brief ${value.briefVersion} · 현재 Brief ${value.selection.currentBriefVersion}`,
      '기준 정의 (criteria 번호는 이 응답 안의 참조):',
      ...[...definitions.values()].map(c=>`${c.ref}: ${c.name}${c.definition?` — ${c.definition}`:''}${c.briefVersion!==value.briefVersion?` (Brief ${c.briefVersion??'미기록'})`:''}`),
      ...(historical?[`과거 실행 ${value.selection.sourceRunId} · ${formatLlmDateTime(value.run?.finishedAt)} · 기록 범위 ${value.selection.evidenceCoverage}`,
        `당시 기준 원문:\n${formatPromptText(value.run?.briefSnapshot??null)}`,
        value.selection.evidenceCoverage==='frozen_references'?'당시 평가 참조와 추천 가능 순위를 보존한 목록이다. 이후 새 점수·추천 상태로 과거 순위를 바꾸지 않는다. 현재 열람 권한은 다시 확인한다.':'이전 실행에 직접 저장된 평가만 확인된다. 당시 재사용 평가·추천 가능 목록·추천 풀 전체는 기록되지 않아 복원 완료로 간주할 수 없다.',
        '과거 상위 후보의 assessment는 당시 점수, currentAssessment는 현재 Brief 점수다. 현재 추천 풀의 assessment는 현재 점수이고 historicalAssessment가 당시 점수다. 프로필과 관계는 현재 조회 사실이다.',
        ...(historicalPool?[`당시 기존 후보:\n${historicalPool.before.map(row=>JSON.stringify(row)).join('\n')}`,`당시 선정 후 후보 ID: ${historicalPool.afterTalentIds.join(', ')}`]:[])]:[]),
      `${historical?'당시 기록 범위':'현재 기준'} 평가 통계: 후보 ${value.counts.evaluatedTalents??0}명; 1차 ${value.counts.stage1??0}명 중 통과 ${value.counts.stage1Passed??0}명; 2차 ${value.counts.stage2??0}명; 추천 설명 ${value.counts.stage3??0}명.`,
      ...Object.entries(value.criteria).map(([name,labels])=>`기준별 분포 ${name}: ${Object.entries(labels).map(([label,count])=>`${label} ${count}명`).join(', ')}`),
      `${historical?'과거 목록에서 현재 열람 가능한':'신규 추천 가능'} 후보 ${value.total}명 중 ${top.length}명. 현재 미결정 추천 ${value.selection.currentPoolCount}명은 별도다.`,
      ...(value.selection.page?[`조회 범위 from=${value.selection.page.from}, to=${value.selection.page.to} (현재 열람 가능한 상위 후보 목록에서 1부터 시작, 양끝 포함).`]:[]),
      'companyFit=회사 요구와의 적합성, candidateFit=후보 관점의 적합성, mutualFit=양측을 종합한 평가. 점수는 0/25/50/75/100의 확률가중평균이며 합격선·채용 확률이 아니다. 라벨은 가장 확률이 큰 분류다. uncertain은 정보 부족이며 불충족 확정이 아니다. conflict는 해당 기준과 충돌한다는 평가다. 점수는 후보의 실제 관심·동의를 뜻하지 않는다.',
      'previousCriteria는 이전 소개 당시 라벨이다. assessment와 구분한다. 기존 미결정 카드는 유지할 수 있다. 설명 갱신 불가인 카드는 새 기준 설명을 작성하지 않는다. 기준별 수치·평가 원문은 matching.view=evaluations와 talentIds로 조회한다.',
      `상위 후보:\n${top.map(row=>JSON.stringify(row)).join('\n')}`,`현재 미결정 추천:\n${pool.map(row=>JSON.stringify(row)).join('\n')}`,
      ...(historical?[`발행은 kind=add로 새 ID만 추가하거나 kind=replace로 전체 미결정 목록을 교체한다. 버전은 서버가 관리한다. sourceRunId=${value.selection.sourceRunId}는 과거 실행과 현재 Brief가 같을 때만 해당 점수를 재사용한다. 다른 Brief의 과거 점수는 현재 기준 충족으로 취급하지 않는다.`]:[]),
      value.nextOffset===null?'후보 추가 페이지 없음.':`matching.view=selection${historical?`, runId=${value.selection.sourceRunId}`:''}, from=${value.nextOffset+1}, to=${Math.min(value.total,value.nextOffset+(value.selection.page?value.selection.page.to-value.selection.page.from+1:20))}로 다음 후보 조회. 현재 풀은 매 페이지에 전원 포함된다.`,
    ].map(escapePromptText).join('\n');
  }
  if(value.relationship==='accepted') return [
    `Role ${value.roleId} · 현재 수락 후 미소개 관계 ${value.total}건. 회사의 수락이나 실제 소개 완료를 뜻하지 않는다.`,
    ...(value.relationships??[]).map(row=>`후보 ${row.talentId} · 원본 추천 ${row.sourceRecommendationId} · 수락 ${row.acceptedAt} · 아직 소개하지 않음`),
    value.nextOffset===null?'추가 페이지 없음.':`matching.relationship=accepted, offset=${value.nextOffset}로 계속 조회.`,
  ].map(escapePromptText).join('\n');
  const criterionDefinitions = new Map<string, string>();
  for (const row of value.items) for (const raw of displayedCriteria(row, value.displayedCriterion)) {
    const criterion = object(raw);
    if (typeof criterion.criterionDefinition === 'string') {
      const definition = `Brief ${row.brief_version} · 기준 ${criterion.name}: ${criterion.criterionDefinition}`;
      criterionDefinitions.set(definition, escapePromptText(definition));
    }
  }
  const options = object(value.run?.options), summary = object(value.run?.summary);
  const comparisonCriteria = Array.isArray(summary.comparisonCriteria) ? summary.comparisonCriteria.map(object) : [];
  const allVersions = value.briefVersion === 'all';
  const evaluationUnit = allVersions || value.multipleInputContracts ? '건' : '명';
  const facts = [
    ...(value.run?[`실행 당시 기준 원문:\n${formatPromptText(value.run.briefSnapshot??null)}\n기록 범위 ${value.run.evidenceCoverage}`]:[]),
    `입력 계약: ${value.inputContractVersion??'여러 계약의 이력'}. 이력 수는 현재 입력과 정확히 일치해 재사용할 수 있는 수가 아니다. Worker가 원본 입력을 대조한다. 서로 다른 입력 계약은 합쳐서 현재 평가로 취급하지 않는다.`,
    `Role ${value.roleId} · Brief ${value.briefVersion} · ${value.run ? `실행 ${value.run.id} (${value.run.status})` : allVersions ? '전체 버전 이력; 아래 집계는 후보·버전·단계별 최신 평가 기준' : '같은 버전의 전체 실행 누적; 후보별 최신 평가 기준'}`,
    ...(summary.briefVersionAtCompletion && summary.briefVersionAtCompletion !== value.briefVersion
      ? [`실행 중 Brief 변경: 평가는 시작 당시 Brief ${value.briefVersion} 기준으로 저장됨. 완료 시점 Brief ${summary.briefVersionAtCompletion}로 다시 평가한 결과는 아님.`] : []),
    ...(value.hasCompanyHistory !== undefined ? [`통계·목록 모집단 필터: 현재 이 회사에 공개된 이력이 ${value.hasCompanyHistory ? '있는' : '없는'} 후보. 과거 점수와 현재 회사 기록은 별개다.`] : []),
    allVersions
      ? `이 조회의 중복 없는 후보 ${value.counts.evaluatedTalents}명; 버전별 1차 평가 ${value.counts.stage1}건 중 통과 ${value.counts.stage1Passed}건; 2차 평가 ${value.counts.stage2}건; 추천 설명 ${value.counts.stage3}건. 같은 후보가 여러 버전의 평가에 포함될 수 있으며 각 이력의 버전·시각을 함께 확인한다.`
      : `이 조회에 저장된 평가 이력 기준: 후보 ${value.counts.evaluatedTalents}명; 1차 ${value.counts.stage1}${evaluationUnit} 중 통과 ${value.counts.stage1Passed}${evaluationUnit}; 2차 ${value.counts.stage2}${evaluationUnit}; 추천 설명 작성 ${value.counts.stage3}${evaluationUnit}. 평가 수는 추천·연락·수락 수가 아님.`,
    ...(value.multipleInputContracts ? ['같은 후보의 서로 다른 입력 계약 평가를 각각 표시했다. 단계별 건수를 후보 인원으로 합산하지 않는다. matching.inputContractVersion으로 특정 계약을 조회할 수 있다.'] : []),
    ...(value.run && summary.hasStageLedger === false ? ['이 실행에는 새 단계별 평가 기록이 없어 당시 실제 1차·2차 인원은 알 수 없음. 표시된 0건은 기록 없음이며 실제 평가 0명을 뜻하지 않음.'] : []),
    ...(value.counts.stage1 && value.stage1DecisionStats ? [
      `1차 세부 판단 분포 · 각 축 분모 ${value.counts.stage1}${evaluationUnit}. 여러 축에서 함께 제외될 수 있어 축별 제외 수를 더한 값은 제외 후보 수가 아니다. 미기록은 과거 평가에 해당 축이 저장되지 않았다는 뜻이다.`,
      ...Object.entries(stage1Axes).map(([axis,label]) => { const counts = value.stage1DecisionStats![axis]; return counts ? `${label}: 통과 ${counts.continue}, 제외 ${counts.exclude}, 미기록 ${counts.unrecorded}.` : `${label}: 미기록.`; }),
    ] : []),
    ...(typeof summary.evaluationFailed === 'number' ? [
      `이 실행의 평가 미완료 ${summary.evaluationFailed}건. 성공한 개별 평가 이력은 보존되어 있으며, 실패는 부적합 판정이 아님.`,
      ...(Array.isArray(summary.failedEvaluations) ? summary.failedEvaluations.map(object)
        .map(item => `조회 가능한 미완료 평가: 후보 ${item.talentId}, ${item.stage}차.`) : []),
      ...(typeof summary.failedEvaluationNextOffset === 'number' ? [`조회 가능한 미완료 대상 전체 ${summary.failedEvaluationTotal}건 중 일부를 표시했다. 다음 미완료 대상 조회: matching=${JSON.stringify({roleId:value.roleId,runId:value.run?.id,view:'summary',offset:summary.failedEvaluationNextOffset})}.`] : []),
    ] : []),
    ...(value.population && !value.inputContractVersion ? [`현재 공유 가능한 전체 모집단 ${value.population.shareable}명; 이 Brief에서 2차까지 평가하지 않았고 1차 제외도 아닌 후보 ${value.population.unassessed}명, 그중 직전 완료 검색에 기록된 데이터 기준시각 이후 신규 가입 ${value.population.newUnassessed}명. 신규 가입의 비교 기준: ${value.population.newMembersSince ? formatLlmDateTime(value.population.newMembersSince) : '과거 기록에 시각 미포함'} (완료 실행 ${value.population.newMembersSinceRunId ?? '미기록'}). 검색이 완료되면 이 비교 기준시각도 달라질 수 있다. 검색 retrieval 전의 수이며 직무 적합 인원은 아님.`] : []),
    ...(options.sourceMessageId !== undefined ? [`이 실행을 요청한 대화 message_id: ${options.sourceMessageId}; 요청 등록 ${formatLlmDateTime(value.run?.createdAt)}, 종료 ${value.run?.finishedAt ? formatLlmDateTime(value.run.finishedAt) : '미기록'}.`] : []),
    ...(comparisonCriteria.length ? [
      `실행 완료 시 같은 Brief 전체 2차 기록 ${summary.currentStage2Evaluated ?? '미측정'}명; 이번 검색 범위의 2차 기록 ${summary.selectionPoolStage2Evaluated ?? '별도 미측정'}명. 아래 분포에는 이전 평가를 재사용한 후보도 포함되며 새 2차 호출 수와 다르다. 이 수는 현재 공유·기존 결정 조건을 적용하기 전이며 실제 신규 추천 가능 인원과 다르다.`,
      ...comparisonCriteria.map(criterion => `이번 비교 기준 ${criterion.name} · 분모 ${criterion.count}명: ${Object.entries(object(criterion.labelCounts)).map(([label,count]) => `${label} ${count}명`).join(', ')}. 원래 기준: ${criterion.criterionDefinition ?? '미기록'}`),
    ] : Object.entries(value.criteria).map(([key, labels]) => `기준 ${key}: ${Object.entries(labels).map(([label, count]) => `${label} ${count}${allVersions ? '건' : '명'}`).join(', ')}`)),
    ...(value.run ? [`이 실행에서 새로 추가된 후보 ID: ${Array.isArray(summary.addedTalentIds) && summary.addedTalentIds.length ? summary.addedTalentIds.join(', ') : '조회 가능한 기록 없음'}.`, `이 실행에서 제외된 후보 ID: ${Array.isArray(summary.removedTalentIds) && summary.removedTalentIds.length ? summary.removedTalentIds.join(', ') : '조회 가능한 기록 없음'}.`, `이 실행의 요청: 범위 ${options.scope ?? '미기록'}, ${options.startStage ?? '미기록'}차부터, 평가 예산 ${options.limit ?? '미기록'}명, 추천 요청 ${options.recommendCount ?? '미기록'}명; 이유 ${options.reason ?? '미기록'}.`, `실행 결과: 추가 ${summary.added ?? '미측정'}명, 제외 ${summary.removed ?? '미측정'}명, 유지 ${summary.retained ?? '미측정'}명; 기존 후보 설명 갱신 ${summary.refreshed ?? '미측정'}명.`] : []),
  ].map(escapePromptText);
  return [
    ...facts,
    ...(value.view === 'evaluations' ? ['아래 목록은 평가 행 이력이다. 같은 후보가 단계·버전·실행별로 여러 행에 나타날 수 있다. 중복 없는 후보 목록은 view=candidates로 조회한다.'] : []),
    '새 pair 가능 여부는 후보의 공유·중복·기존 결정 조건에 대한 현재 사실이다. Role의 활성 상태·접근 권한, 적합성 판단, 새 추천 완료는 별도이며 기존 추천 재검토·설명 갱신 가능 여부와도 다르다.',
    ...(value.displayedCriterion ? [`이 후보 목록은 요청한 기준 ${escapePromptText(value.displayedCriterion)}의 점수·근거와 전체 fit만 표시한다. 다른 기준까지 필요하면 matching.view=evaluations와 talentIds로 같은 평가를 조회한다. 현재 회사 관계는 평가 당시 상태와 별개이며 상세 상태는 read_talent로 조회한다.`] : []),
    '기준 라벨은 평가 분포다. limited/conflict 등의 합계가 실제 제외 인원이나 기록된 제외 사유를 뜻하지 않는다.',
    ...(criterionDefinitions.size ? ['<evaluation_explanations>', ...criterionDefinitions.values(), '</evaluation_explanations>'] : []),
    ...value.items.map(row => formatEvaluation(row,value.includeDistributions === true,value.displayedCriterion)),
    ...(value.items.some(item => item.stage === 2 || item.stage === 3) ? ['점수는 0–100 범위이며 conflict/limited/uncertain/good/excellent에 대응하는 0/25/50/75/100의 확률가중평균이다. 라벨은 가장 확률이 큰 분류라서 평균 점수 순서와 다를 수 있다. 점수는 채용 확률이나 합격선이 아니다.'] : []),
    ...(value.items.length && !value.includeDistributions ? ['점수·라벨을 표시했다. 세부 확률분포가 필요하면 matching.includeDistributions=true로 같은 범위를 조회한다.'] : []),
    '목록은 현재 공유 자격 또는 기존 회사 공유 이력이 있는 후보만 표시한다. 집계에는 당시 평가가 포함된다. Decisions의 당시 판단은 점수·분류만 저장된다. 이유 원문은 없으며 현재 공개 근거로 설명한 해석을 당시 판단 원문으로 주장하지 않는다. 후보 프로필은 read_talent 또는 후보 배지로 조회한다.',
    value.nextOffset === null ? (typeof summary.failedEvaluationNextOffset === 'number' ? `성공한 평가 이력 ${value.total}건. 평가 이력의 추가 페이지 없음; 미완료 대상은 위의 다음 조회로 계속 확인.` : `이 조회 범위 ${value.total}건. 추가 페이지 없음.`) : `이 조회 범위 ${value.total}건; matching.offset=${value.nextOffset}로 계속 조회.`,
  ].join('\n');
}
