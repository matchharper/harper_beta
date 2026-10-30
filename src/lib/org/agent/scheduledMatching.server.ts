import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { assertOrgRoleAccess, assertOrgWorkspacePermission } from "../server";
import { buildOrgAgentPromptContext } from "./context";
import { runScheduledMatchingLoop } from "./scheduledMatching";
import { executeOrgAgentTool } from "./toolExecution";
import { ORG_AGENT_SOL_MODEL } from "./modelConfig";
import type { OrgAgentConversationRow } from "./store";
import { currentScheduledSelection, scheduledRecommendationOptions, type ScheduledSelectionInput } from "./scheduledSelection";
import { commitCompanyMessages } from "./companyMessaging";
import { prepareRoleStartBriefForSearch } from "../roleStart/service";

export { scheduledSearchOptions } from "./scheduledMatchingOptions";
import { scheduledSearchOptions } from "./scheduledMatchingOptions";

export async function resumeCompletedScheduledMatching(admin: any = getSupabaseAdmin()) {
  // Resume each completed child through its durable continuation receipt.
  const {data,error}=await admin.from("company_first_search_runs").select("id")
    .eq("contract_version","scheduled_agentic_role_search_v1").in("status",["succeeded","skipped","failed"])
    .is("result->scheduledContinuation->>jobId",null).order("created_at").limit(20);
  if(error) throw error;
  let count=0;
  for(const row of data??[]) {
    const receipt=await admin.rpc("resume_scheduled_matching_v1",{p_run:row.id});
    if(receipt.error) throw receipt.error;
    if(receipt.data) count++;
  }
  return count;
}

export async function runCompanyScheduledMatching(args:{user:User;conversation:OrgAgentConversationRow;
  anchorMessageId:number;jobId:string;actionContext:Record<string,unknown>;responseLocale?:"ko"|"en"|"auto"}) {
  const admin:any=getSupabaseAdmin(), workspaceId=args.conversation.company_workspace_id;
  const roleId=String(args.conversation.role_id??"");
  if(!roleId||roleId!==String(args.actionContext.roleId)) throw new Error("Scheduled Role mismatch");
  await assertOrgWorkspacePermission({admin,user:args.user,workspaceId,permission:"manage_candidates"});
  await assertOrgRoleAccess({admin,user:args.user,workspaceId,roleId});
  const rootJobId=String(args.actionContext.rootJobId??args.jobId);
  const {data:runs,error:runsError}=await admin.from("company_first_search_runs")
    .select("id,status,request_options,result,source_snapshot,error_code,error_message")
    .eq("company_workspace_id",workspaceId).eq("role_id",roleId).eq("request_options->>rootJobId",rootJobId).order("created_at");
  if(runsError) throw runsError;
  // A retry after child enqueue recovers its receipt rather than regenerating a
  // new model call ID for the same turn. Terminal children own the next turn.
  if((runs??[]).some((run:any)=>run.request_options.parentJobId===args.jobId))
    return {outcome:"completed_silent" as const,progressMessageId:null,terminalMessageId:null};
  // The first company-side completion already receives candidate facts. Preparing
  // them is read/evaluation work, not a hidden recruiting decision.
  if (!(runs??[]).length) {
    await prepareRoleStartBriefForSearch(roleId);
    const prepared=await admin.rpc("enqueue_scheduled_matching_search_v1",{p_parent:args.jobId,
      p_call_id:"prepare-initial-candidates",p_options:{roleId,scope:"unassessed",startStage:1,limit:5000,
        recommendCount:20,recommendCounts:{companyFirst:10,talentFirst:20}}});
    if(prepared.error) throw prepared.error;
    return {outcome:"completed_silent" as const,progressMessageId:null,terminalMessageId:null};
  }
  const context=await buildOrgAgentPromptContext({admin,user:args.user,conversation:args.conversation,
    beforeMessageId:args.anchorMessageId,currentUserMessageId:args.anchorMessageId,includeSharedConversation:true,
    readAudience:"company_safe",scopeKey:`scheduled:${roleId}`});
  const role=context.roles.find(row=>row.roleId===roleId);
  if(!role) throw new Error("Scheduled Role not accessible");
  const {data:version,error:versionError}=await admin.rpc("company_role_search_brief_version_v1",{p_role_id:roleId});
  if(versionError) throw versionError;
  const {data:inventory,error:inventoryError}=await admin.rpc("company_role_search_inventory_v1",{p_workspace:workspaceId,p_role:roleId,p_version:version});
  if(inventoryError) throw inventoryError;
  const {data:accepted,error:acceptedError}=await admin.rpc("company_scheduled_accepted_inventory_v1",{p_workspace:workspaceId,p_role:roleId,
    p_activation_run:args.actionContext.activationRunId ?? null});
  if(acceptedError) throw acceptedError;
  const {data:channels,error:channelsError}=await admin.from("company_slack_channels").select("id,slack_channel_id")
    .eq("company_workspace_id",workspaceId).eq("is_enabled",true);
  if(channelsError) throw channelsError;
  const receipts=[];
  for(const run of runs??[]) {
    const {data:outbox,error}=await admin.from("company_first_slack_outbox").select("id,status,role_ids")
      .eq("run_id",run.id);
    if(error) throw error;
    const {data:selections,error:selectionError}=await admin.from("talent_opportunity_matching_review")
      .select("discovery_run_id,recommendation_id,closed_at").eq("run_id",run.id).in("decision",["candidate_first","both"]);
    if(selectionError) throw selectionError;
    const discoveryIds=(selections??[]).map((row:any)=>row.discovery_run_id).filter(Boolean);
    const jobStates:Record<string,number>={},deliveryStates:Record<string,number>={};
    if(discoveryIds.length) {
      const jobs=await admin.from("opportunity_discovery_run").select("status").in("id",discoveryIds);
      if(jobs.error) throw jobs.error;
      for(const row of jobs.data??[]) jobStates[row.status]=(jobStates[row.status]??0)+1;
      const deliveries=await admin.from("talent_opportunity_delivery").select("channel,status").in("discovery_run_id",discoveryIds);
      if(deliveries.error) throw deliveries.error;
      for(const row of deliveries.data??[]) {
        const key=`${row.channel}:${row.status}`;
        deliveryStates[key]=(deliveryStates[key]??0)+1;
      }
    }
    receipts.push({runId:run.id,status:run.status,
      options:{scope:run.request_options.scope,startStage:run.request_options.startStage,
        recommendCounts:run.request_options.recommendCounts,selectionSourceRunId:run.request_options.selectionSourceRunId},
      counts:run.result?.counts,coverage:run.result?.roleSearch?.counts,
      deliveryReceipts:(outbox??[]).map((row:any)=>({outboxId:row.id,status:row.status})),
      candidateDelivery:{selected:(selections??[]).length,
        recommendationRecorded:(selections??[]).filter((row:any)=>row.recommendation_id).length,
        closedSelections:(selections??[]).filter((row:any)=>row.closed_at).length,
        jobStates,deliveryStates,
        note:"Selection, stored recommendation and actual channel delivery are distinct facts. Counts contain no private candidate identities."},
      briefVersion:run.request_options.briefVersion,
      error:run.error_message ?? run.result?.roleSearch?.error});
  }
  const completedRunId=String(args.actionContext.completedRunId??"");
  const completed=(runs??[]).find((run:any)=>run.id===completedRunId);
  // Only this completion's prepared input is actionable. Old aliases never leak
  // into a later selection; publication completions carry receipts instead.
  const preparedInput:ScheduledSelectionInput|undefined=completed?.status==="succeeded"
    && !completed.request_options.selectionSourceRunId ? completed.result?.selectionInput : undefined;
  const selectionInput=currentScheduledSelection(preparedInput,roleId,version);
  const result=await runScheduledMatchingLoop({admin,user:args.user,conversation:args.conversation,context,
    actorId:args.user.id,actorLabel:"Harper scheduled matching service",currentUserMessageId:args.anchorMessageId,
    model:ORG_AGENT_SOL_MODEL,responseLocale:args.responseLocale??"auto",source:"slack",readAudience:"company_safe",
    scopeKey:`scheduled:${roleId}`,slackThreadId:null,mentions:[],signal:AbortSignal.timeout(240000)},
    {roleId,scheduledSlot:String(args.actionContext.scheduledSlot),rootJobId,currentRoutes:accepted.currentRoutes??[],
      currentBriefVersion:version,
      ...(preparedInput && !selectionInput ? {selectionUnavailableReason:
        `Prepared candidates belong to an earlier Hiring Brief (${preparedInput.briefVersion}). No candidates from that version are supplied for selection.`} : {}),
      currentRole:{name:role.name,hiringBrief:role.request,criteria:role.criteria,description:role.description,
        location:role.locationText,workMode:role.workMode,salaryRange:role.salaryRange},
      inventory:{recordedAllContractsInventory:inventory,...accepted,
        inputContractVersion:"worker_behavior_v1",compatibleStage2:null,compatibleUnassessed:null,
        compatibilityNote:"Exact current input fingerprints are verified by Worker; other-contract inventory is not reusable coverage."},completedRuns:receipts,selectionInput},
    {executeTool:async tool=>{
      if(tool.name!=="request_matching_search" && tool.name!=="recommend_talents") {
        // Optional reads accept the same short refs, but are never preconditions.
        const aliases=new Map((selectionInput?.candidates??[]).map(row=>[row.ref,row.talentId]));
        const resolve=(value:unknown,key=""):unknown=>Array.isArray(value) ? value.map(item=>resolve(item,key))
          : value && typeof value==="object" ? Object.fromEntries(Object.entries(value).map(([name,item])=>[name,resolve(item,name)]))
          : typeof value==="string" && /^(talentId|talentIds|talent_id|talent_ids)$/.test(key) ? aliases.get(value)??value : value;
        return executeOrgAgentTool({...tool,input:resolve(tool.input) as typeof tool.input});
      }
      if(tool.name==="recommend_talents" && !selectionInput) throw new Error("No current scheduled selection input");
      const options=tool.name==="recommend_talents"
        ? scheduledRecommendationOptions(tool.input,selectionInput!,completedRunId)
        : scheduledSearchOptions(tool.input,roleId);
      if (tool.name === "request_matching_search") await prepareRoleStartBriefForSearch(roleId);
      const {data,error}=await admin.rpc("enqueue_scheduled_matching_search_v1",{p_parent:args.jobId,p_call_id:tool.callId,p_options:options});
      if(error) throw error;
      return {...data,options,complete:false,deliveryConfirmed:false};
    }});
  if(!result.reply.trim()) return {outcome:"completed_silent" as const,progressMessageId:null,terminalMessageId:null};
  // Absence of a Slack destination does not prevent candidate-side evaluation.
  // The optional company reply needs a current, role-enabled destination.
  const {data:optOut,error:optError}=await admin.from("company_role_notification_channels").select("channel_id").eq("role_id",roleId);
  if(optError) throw optError;
  const channel=(channels??[]).find((row:any)=>!(optOut??[]).some((out:any)=>out.channel_id===row.id));
  if(!channel) return {outcome:"completed_silent" as const,progressMessageId:null,terminalMessageId:null};
  const batch=await commitCompanyMessages({admin,audience:{channelDbId:channel.id,channelId:channel.slack_channel_id,jobId:args.jobId},
    actorId:args.user.id,workspaceId,conversationId:args.conversation.id,sourceMessageId:args.anchorMessageId,
    model:result.model,messages:[{ref:"reply",text:result.reply}]});
  return {outcome:"completed_message" as const,progressMessageId:null,terminalMessageId:batch.messageIds[0],batchId:batch.batchId};
}
