import assert from "node:assert/strict";
import { upsertDocument } from "@/lib/documents/authoring";
import { listTalentDocumentsForTool, readTalentDocumentForTool } from "@/lib/talentOnboarding/documentTool";
import { withCompactTalentToolModelResult } from "@/lib/talentOnboarding/toolModelResult";
import { runGetRoleContext, withTalentToolAssistantInstruction } from "@/lib/talentOnboarding/tools";
import { careerFormDraftSchema } from "@/lib/career/forms/schema";
import { formatCareerFormForModel } from "@/lib/career/forms/format";
import { applyProfileEdits, formatProfileToolResult } from "@/lib/career/profiles/tools";
import { formatCareerMatchingResult } from "@/lib/career/matching/formatters";
import { formatPromptText } from "@/lib/llm/promptText";
import { formatWork } from "@/lib/career/work/store";
import { formatOpenUrlPage } from "@/lib/agentTools/web";
import { createSearchReceiptFixture } from "./careerSearchReceiptFixture";
import {createCareerResourceFixture} from "./careerResourceFixture";
import { TALENT_MEETING_TOOLS } from "@/lib/career/meetings/tools";
import { setupMeetings, meetingAdmin } from "@/lib/career/meetings/testSupport";
import { formatCareerSchedules } from "@/lib/career/schedules/server";
import { formatSavedJobPosting } from "@/lib/career/saveJobPosting";
import { formatRoleContextForModel } from "@/lib/talentOnboarding/roleContextFormat";
import { compileFixtureGmailQuery } from "./careerFixtureMailbox";
import { formatGmailSearchResult, type GmailSearchResult } from "@/lib/integrations/gmail";

import { renderTalentContextPrompt, type TalentContextRow } from "@/lib/talentOnboarding/talentContexts";
import { formatInternalApplicationToolResult } from "@/lib/career/internalApplications/tools";
import { buildTalentProfileContext } from "@/lib/talentOnboarding/profileStore";

export const fixtureId = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clone = <T>(value: T): T => structuredClone(value);

/** Test-only storage adapter. Production document authoring, source checks,
 * revision checks and text projections execute against these owned rows.
 * This module is never imported by the application runtime.
 */
export function createCareerAutonomyFixture(scenario: any, requestTime: string, carriedDocuments?: any[]) {
  const userId = fixtureId(1);
  let userMessageId = scenario.fixtureMessageId ?? 1;
  if (carriedDocuments) assert.ok(carriedDocuments.every(row => row.talent_id === userId));
  const rows: Record<string, any[]> = {
    talent_documents: carriedDocuments ? clone(carriedDocuments) : scenario.documents.map((d: any) => ({ id: d.id, talent_id: userId, file_name: d.title,
      kind: "resume", origin_type: "user_upload", revision: 1, extracted_text: d.text, structured_content: null,
      is_deleted: false, is_primary: false, is_public: false, created_at: requestTime, updated_at: requestTime, ...clone(d.row ?? {}) })),
    talent_users: [{ ...scenario.profile, user_id: userId }],
    talent_experiences: scenario.profile.experiences.map((row: any) => ({ ...row, talent_id: userId })),
    talent_educations: [], talent_extras: [], talent_contexts: [],
    talent_messages: scenario.backgroundRun ? [] : [{ id: userMessageId, user_id: userId, content: scenario.message }],
    logs: [],
    company_roles: clone(scenario.roleFacts ?? []),
    talent_opportunity_recommendation: [],
  };
  const admin: any = {
    from(table: string) {
      assert.ok(table in rows, `Unconfigured fixture table: ${table}`);
      const predicates: Array<(row: any) => boolean> = [];
      let operation = "read", values: any, start = 0, end = Infinity;
      const execute = () => {
        let found = rows[table].filter(row => predicates.every(predicate => predicate(row)));
        if (operation === "insert") {
          assert.equal(table, "talent_documents");
          assert.equal(values.talent_id, userId);
          if (rows[table].some(row => row.id === values.id)) return { data: null, error: { code: "23505" } };
          const row = { revision: 1, is_deleted: false, is_public: false, is_primary: false, created_at: requestTime, updated_at: requestTime, ...clone(values) };
          rows[table].push(row); found = [row];
        } else if (operation === "update") {
          assert.equal(table, "talent_documents");
          for (const row of found) { assert.equal(row.talent_id, userId); Object.assign(row, clone(values), { revision: row.revision + 1 }); }
        }
        return { data: clone(found.slice(start, end + 1)), error: null };
      };
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { predicates.push(row => String(row[key]) === String(value)); return query; },
        neq: (key: string, value: unknown) => { predicates.push(row => row[key] !== value); return query; },
        in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(row[key])); return query; },
        is: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query; },
        order: () => query, limit: (n: number) => { end = start + n - 1; return query; },
        range: (a: number, b: number) => { start = a; end = b; return query; },
        insert: (value: unknown) => { operation = "insert"; values = value; return query; },
        update: (value: unknown) => { operation = "update"; values = value; return query; },
        maybeSingle: async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; },
        single: async () => { const result = execute(); assert.equal(result.data?.length, 1); return { ...result, data: result.data![0] }; },
        then: (resolve: any, reject: any) => Promise.resolve().then(execute).then(resolve, reject),
      };
      return query;
    },
  };
  const profile: any = { profileId: fixtureId(101), title: "기본 프로필", revision: 1, isDefault: true,
    snapshot: scenario.structuredProfile ? clone(scenario.structuredProfile)
      : { talentUser: { ...scenario.profile, user_id: userId }, talentExperiences: clone(rows.talent_experiences), talentEducations: [], talentExtras: [] } };
  const profiles = [profile], forms: any[] = clone(scenario.forms ?? []), contextWrites: any[] = [], externalAttempts: any[] = [], mutations: any[] = [];
  const works: any[] = clone(scenario.works ?? []);
  const matchings: any[] = scenario.matching ? [{ ...scenario.matching, criteria: { scope: scenario.brief } }] : [];
  const publishedInternal: any[] = [];
  const calls: any[] = [];
  const schedules = clone(scenario.schedules ?? []);
  let meetingDb: ReturnType<typeof setupMeetings> | undefined;
  const meetingRows = new Map<string, any>();
  const openMeetingDb = async () => {
    const db = await setupMeetings();
    await db.query("insert into talent_users(user_id) values ($1)", [userId]);
    if (scenario.backgroundRun?.conversation_id) {
      await db.query("insert into talent_conversations(id, user_id) values ($1, $2)", [scenario.backgroundRun.conversation_id, userId]);
    }
    return db;
  };
  let roleStored = Boolean(scenario.role) && scenario.roleStored !== false;
  const postingRecommendations = new Map<string, string>();
  const recordedPostings = new Map<string, any>();
  const profileText = () => formatProfileToolResult("read_profile", profile);
  let contextRows: TalentContextRow[] = [];
  const promptProfileText = (onboarding: boolean) => scenario.productionProfilePrompt
    ? buildTalentProfileContext({ profile: scenario.accountProfile ?? null, structuredProfile: profile.snapshot, includeResumeText: onboarding, maxResumeChars: 3000 })
    : profileText();
  const contextText = () => scenario.persistContext ? renderTalentContextPrompt({
    allBriefs: contextRows.filter(r => r.collection === "brief" && !r.deleted_at),
    briefs: contextRows.filter(r => r.collection === "brief" && !r.deleted_at),
    memories: contextRows.filter(r => r.collection === "memory" && !r.deleted_at), memorySelection: "all", memoryTruncated: false
  }) : `Search Brief:\n${scenario.brief}\nMemory:\n${scenario.memory}`;
  const receipts = scenario.useSearchReceipts ? createSearchReceiptFixture(userId, fixtureId(2), requestTime, scenario.pages) : undefined;
  const resourceFixture=scenario.resources?createCareerResourceFixture(scenario,()=>profileText()+"\n"+contextText(), scenario.frozenResourceMarket
    ? () => rows.talent_documents.filter(d => !d.is_deleted).map(d => ({ref: {kind:"document" as const, id:d.id, revision:String(d.revision)}, title:d.file_name, body:d.extracted_text ?? "", facts:{}, sourceRefs:[], status:"available" as const})) : undefined, receipts):null;
  const internalRoles = scenario.roles ?? scenario.internalCatalog;
  const privateRoles = new Map<string, any>();
  const actionItems: any[] = [];
  const roleMaterials = new Map<string, any[]>();
  const roleContext = (role: any) => ({ found: true, roleId: role.id,
    role: { name: role.title, sourceType: role.source, status: role.status,
      description: role.description, externalJdUrl: role.url },
    companyDb: { name: role.company },
    recommendation: role.recommendation ?? null });
  const referencesText = () => [
    ...(scenario.pendingInternal ? [`Already selected unpublished Harper-connected proposals: ${scenario.pendingInternal.length}.\n${formatPromptText(scenario.pendingInternal.map((r: any) => ({roleId:r.id,company:r.company,title:r.title,selectedAt:r.selectedAt})))}\nUse read_recommended_opportunities and get_role_context for details; reading does not select more roles.`] : []),
    "Saved document index:", ...rows.talent_documents.filter(d => !d.is_deleted).map(d => `Document ${d.id}; ${d.file_name}; revision ${d.revision}; ${d.origin_type}.`),
    ...(resourceFixture&&!scenario.frozenResourceMarket?["Shared company/public-source collection is available through search_resources. Saved observations were independently collected from public sources; personal evaluations remain private."]:[]),
    ...(scenario.roles ? [`Known opportunity references:\n${formatPromptText(scenario.roles.map((role: any) => ({ roleId: role.id, company: role.company, title: role.title, source: role.source })))}`] : []),
    ...(scenario.works || scenario.roles || scenario.fixtureMessageId ? [`Authenticated current user message ID: ${userMessageId}.`, ...works.map(formatWork), ...forms.map(formatCareerFormForModel)] : []),
    ...(roleStored ? [`Current selected opportunity:\n${formatPromptText(scenario.role)}`] : []),
    ...(matchings.length ? [`Matching index:\n${formatCareerMatchingResult({ matchings, listRevision: "list-1" })}`] : []),
  ].join("\n");
  const projected = (name: string, raw: any) => withTalentToolAssistantInstruction(withCompactTalentToolModelResult(name, raw));
  const execute = async ({ name, input }: { name: string; input: Record<string, any> }): Promise<Record<string, any>> => {
    const call: any = { name, input: clone(input) }; calls.push(call);
    const { _uiStatusMessage, ...args } = input;
    let raw: any;
    try {
      const resourceResult=await resourceFixture?.execute(name,args);
      if (resourceResult) raw = resourceResult;
      else if (scenario.persistContext && name === "manage_action_items") {
        const changes = args.operation === "batch" ? args.changes : [args];
        const items = clone(actionItems);
        for (const change of changes) {
          if (change.operation === "list") continue;
          if (change.operation === "create") items.push({ id: fixtureId(950 + items.length), ...clone(change.item) });
          else {
            const item = items.find(i => i.id === (change.id ?? change.item_id));
            assert.ok(item, "Unknown fixture action item");
            Object.assign(item, change.item ?? { status: change.operation });
          }
        }
        actionItems.splice(0, actionItems.length, ...items);
        raw = { ok: true, items, modelOutput: formatPromptText(items) };
      } else if (name === "manage_action_items" && args.operation === "list") raw={modelOutput:"No pending action items."};
      else if (name === "manage_action_items" && args.operation === "create") {
        mutations.push({name,args});raw={ok:true,id:fixtureId(950+mutations.length),modelOutput:"Action item saved in the isolated fixture."};
      }
      else if (name === "manage_work") {
        let found = works.find(w => w.id === args.work_id);
        if (args.action === "start") {
          found = works.find(w => w.idempotency_key === args.identity);
          if (!found) {
            assert.ok(args.identity && args.instruction);
            found = { id: fixtureId(900 + works.length), user_id: userId, conversation_id: fixtureId(2), kind: "delegated_work", parent_id: null,
              status: "ready", revision: 1, idempotency_key: args.identity, request: { target: args.target, instruction: args.instruction, source_refs: args.source_refs ?? [1] }, result: {}, provider_refs: {}, created_at: requestTime, updated_at: requestTime };
            works.push(found);
          }
        } else if (!["list", "read"].includes(args.action)) {
          assert.ok(found); assert.equal(found.revision, args.expected_revision);
          found.status = ({ update: "ready", wait: "waiting", finish: "completed", cancel: "cancelled" } as any)[args.action];
          found.revision++; found.request.change = args.instruction;
          found.request.source_refs = [...(found.request.source_refs ?? []), ...(args.source_refs ?? [1])];
          found.result = { note: args.note, refs: args.refs };
        }
        raw = { work: found, works, modelOutput: (args.action === "list" ? works : [found]).filter(Boolean).map(formatWork).join("\n\n") };
      } else if (name === "web_search") {
        const terms = String(args.query).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
        // A fixed lexical index, not an answer script or a query-intent classifier.
        const results = scenario.pages.map((page: any, index: number) => ({ page, index,
          score: terms.reduce((score, term) => score + Number(`${page.title} ${page.searchTerms} ${page.summary}`.toLowerCase().includes(term)), 0) }))
          .filter((hit: any) => hit.score > 0).sort((a: any, b: any) => b.score - a.score || a.index - b.index)
          .slice(0, args.maxResults ?? 10).map(({ page }: any, index: number) => ({ rank: index + 1, title: page.title, url: page.url, highlights: [page.summary], ...(page.resourceId ? { resourceRef: { kind: "web_resource", id: page.resourceId, revision: "1" } } : {}) }));
        raw = { query: args.query, resultCount: results.length, results };
        if (receipts && resourceFixture) {
          for (const hit of results) if (hit.resourceRef) hit.resourceRef=resourceFixture.registerSearchHit(hit.resourceRef.id);
          raw.modelOutput = [`Query: ${args.query}; results: ${results.length}`,...results.map((hit:any)=>[`${hit.rank}. ${hit.title}\n${hit.url}`,hit.resourceRef ? `Public source reference: kind=web_resource; id=${hit.resourceRef.id}; revision=${hit.resourceRef.revision}.`:"",...hit.highlights].filter(Boolean).join("\n"))].join("\n\n");
        }
      } else if (name === "open_url") {
        const readPage = (url: string) => {
          const normalize = (value: string) => value.split("#")[0].replace(/\/$/, "");
          const page = scenario.pages.find((page: any) => normalize(page.url) === normalize(url));
          const offset = Number(args.offset ?? 0), max = Math.max(1000, Math.min(40000, Number(args.maxMarkdownChars ?? 20000)));
          return page ? { ok: true, url: page.url, title: page.title, markdown: page.body.slice(offset, offset + max),
            offset, nextOffset: offset + max < page.body.length ? offset + max : null, truncated: offset + max < page.body.length }
            : { ok: false, url, error: "No captured source for this URL. Its contents remain unavailable." };
        };
        if (receipts && resourceFixture) {
          const pages = (Array.isArray(args.url)?args.url:[args.url]).map(url=>{
            const rawPage=readPage(url);
            if (!rawPage.ok) return rawPage;
            const page=scenario.pages.find((p:any)=>p.url===rawPage.url);
            const cached=resourceFixture.storedPage(page.resourceId) && args.maxAgeHours!==0;
            const ref=resourceFixture.registerPageRead(page.resourceId);
            const fields={...rawPage,cached,createdAt:requestTime,resolvedUrl:page.url,sourceFetchedAt:requestTime,
              markdownCharCount:page.body.length,sourceScope:ref?"public":"unclassified_not_shared",
              documentId:ref?Number(ref.id):null,observationId:ref?.revision,
              coverage:cached?"Saved public observation; read time is not proof of live source freshness.":"Frozen source page read for the requested URL."};
            return {...fields,modelOutput:formatOpenUrlPage(fields as any,true)};
          });
          raw=Array.isArray(args.url)?{ok:pages.some(p=>p.ok),pages,modelOutput:pages.map(p=>"modelOutput" in p?p.modelOutput:`URL: ${p.url}\nRead failed: ${p.error}`).join("\n\n")}:pages[0];
        } else raw = Array.isArray(args.url) ? { pages: args.url.map(readPage) } : readPage(String(args.url));
      } else if (name === "upsert_document") {
        raw = await upsertDocument({ admin, userId, userMessageId, requestId: scenario.fixtureMessageId ? `autonomy-fixture-turn-${userMessageId}` : "autonomy-fixture-turn", input: args });
        mutations.push({ name, result: clone(raw) });
      } else if (name === "read_document") {
        raw = await readTalentDocumentForTool({ admin, userId, input: args });
      } else if (name === "list_documents") {
        raw = await listTalentDocumentsForTool({ admin, userId, input: args });
      } else if (name === "suggest_form") {
        if (args.action === "create" || args.action === "update") {
          const prior = forms.find(form => form.formId === args.formId);
          if (args.action === "update") assert.equal(args.expectedRevision, prior?.revision);
          const form = { ...careerFormDraftSchema.parse(args.form), formId: prior?.formId ?? forms.length + 1, revision: (prior?.revision ?? 0) + 1 };
          if (prior) forms.splice(forms.indexOf(prior), 1, form); else forms.push(form);
          raw = { ok: true, formId: form.formId, revision: form.revision, modelOutput: formatCareerFormForModel(form as any) };
        } else if (args.action === "resolve") {
          const found = forms.find(form => form.formId === args.formId);
          assert.ok(found); assert.equal(found.revision, args.revision); found.hidden = true;
          raw = { ok: true, modelOutput: `Form ${found.formId} resolved.` };
        } else {
          const found = args.action === "list" ? forms : forms.filter(form => form.formId === args.formId);
          raw = { ok: true, modelOutput: found.map(form => formatCareerFormForModel(form)).join("\n\n") || "No saved forms." };
        }
      } else if (name === "read_profile" || name === "list_profiles") {
        const current = args.profileId ? profiles.find(p => p.profileId === args.profileId) : profile;
        assert.ok(current, "Unknown owned profile");
        raw = name === "list_profiles" ? { profiles: profiles.map(p => ({ id: p.profileId, title: p.title, current_revision: p.revision, is_default: p.isDefault, updated_at: requestTime })) } : clone(current);
        raw.modelOutput = formatProfileToolResult(name, raw);
      } else if (name === "update_talent_profile") {
        const current = args.profileId ? profiles.find(p => p.profileId === args.profileId) : profile;
        assert.ok(current); if (args.expectedRevision !== undefined) assert.equal(args.expectedRevision, current.revision);
        const next = { ...clone(current), snapshot: applyProfileEdits(current.snapshot, args, `fixture:${calls.length}`), revision: current.revision + 1 };
        if (["create", "copy"].includes(args.action)) { next.profileId = fixtureId(100 + profiles.length + 1); next.isDefault = false; next.revision = 1; profiles.push(next); }
        else Object.assign(current, next);
        mutations.push({ name, args }); raw = { ...next, modelOutput: formatProfileToolResult(name, next) };
      } else if (scenario.persistContext && name === "read_talent_context") {
        const candidates = contextRows.filter(row => !row.deleted_at && (args.refs?.length
          ? args.refs.includes(row.ref) : row.collection === (args.collection ?? "memory")));
        const limit = args.limit ?? candidates.length;
        const shown = candidates.filter(row => !args.cursor || row.id < args.cursor).sort((a,b) => b.id - a.id).slice(0, limit);
        raw = { items: shown, truncated: candidates.length > shown.length, modelOutput: shown.length
          ? shown.map(row => `[${row.ref}] ${row.label ? row.label + ": " : ""}${row.content}`).join("\n") : "No saved context in this collection." };
      } else if (scenario.persistContext && name === "write_talent_context") {
        const next = clone(contextRows);
        for (const change of args.changes) {
          if (change.op === "add") {
            assert.ok(change.collection && change.content);
            const ref = next.length + 1;
            next.push({ ...change, id: ref, ref, revision: 1, key: null, label: change.label ?? null,
              source_refs: [], talent_id: userId, created_at: requestTime, updated_at: requestTime, deleted_at: null });
            continue;
          }
          const row = next.find(item => item.ref === change.ref && !item.deleted_at);
          assert.ok(row, "Unknown or deleted context reference");
          if (change.op === "delete") row.deleted_at = requestTime;
          else { for (const field of ["content", "label", "importance"] as const) if (change[field] !== undefined) (row as any)[field] = change[field]; }
          row.revision += 1;
        }
        contextRows = next;
        contextWrites.push(clone(args)); raw = { ok: true, modelOutput: contextText() };
      } else if (name === "read_talent_context") raw = { modelOutput: contextText() };
      else if (name === "write_talent_context") {
        contextWrites.push(clone(args)); raw = { ok: true, modelOutput: `Context changes recorded in the isolated fixture:\n${formatPromptText(args)}` };
      } else if (name === "list_matchings" || name === "read_matching") {
        raw = { matchings, ...(args.matchingId ? { matching: matchings.find(m => m.id === args.matchingId) } : {}), listRevision: "list-1", defaultListRevision: "list-1", memberships: [], runs: [], evaluations: clone(scenario.externalEvaluations ?? []), evaluationCount: scenario.externalEvaluations?.length ?? 0, remainingEvaluationCount: 0, expiredRoleCount: 0 };
        raw.modelOutput = formatCareerMatchingResult(raw, "ko");
      } else if (name === "upsert_matching") {
        assert.equal(args.action, "create"); const matching = { ...args, id: fixtureId(510 + matchings.length), revision: 1 };
        matchings.push(matching); raw = { matching, listRevision: "list-1", modelOutput: formatCareerMatchingResult({ matching, listRevision: "list-1" }) };
      } else if (name === "search_opportunities") {
        raw = { runId: fixtureId(601), source: args.source, status: "completed", roleIds: [], evaluations: [], evaluationCount: 0, remainingEvaluationCount: 0, expiredRoleCount: 0, failures: [] };
        raw.modelOutput = formatCareerMatchingResult(raw);
      } else if (name === "upsert_opportunities" && scenario.frozenResourceMarket && args.action === "add") {
        const ids: string[] = [];
        for (const item of args.items ?? []) {
          const role = scenario.postingRoles.find((r: any) => r.id === item.roleId);
          assert.ok(role, "Unknown posting role");
          if (!postingRecommendations.has(role.id)) postingRecommendations.set(role.id, fixtureId(801 + postingRecommendations.size));
          ids.push(postingRecommendations.get(role.id)!);
        }
        mutations.push({name, args});
        raw = { action: "add", listRevision: `list-${postingRecommendations.size + 1}`, recommendationIds: ids };
        raw.modelOutput = formatCareerMatchingResult(raw, "ko");
      } else if (name === "upsert_opportunities" && scenario.externalEvaluations) {
        for (const item of args.items ?? []) assert.ok(scenario.externalEvaluations.some((e: any) => e.id === item.evaluationId && e.role_id === item.roleId));
        mutations.push({ name, args }); raw = { action: args.action, listRevision: "list-1", recommendationIds: (args.items ?? []).map((_: any, i: number) => fixtureId(850 + i)) };
        raw.modelOutput = formatCareerMatchingResult(raw, "ko");
      } else if (name === "get_role_context" && scenario.roleFacts) {
        raw = await runGetRoleContext({ admin, userId, roleIds: args.roleIds, jd: args.jd, responseLocale: "ko", activityOffset: args.activityOffset ?? 0 });
      } else if (name === "upsert_opportunities" && scenario.pendingInternal) {
        assert.equal(args.action,"add"); assert.equal(args.expectedRevision,"list-1");
        for (const item of args.items ?? []) {
          assert.ok(scenario.pendingInternal.some((r: any) => r.id === item.roleId), "Not a selected proposal");
          if (!publishedInternal.some(r => r.roleId===item.roleId)) publishedInternal.push(item);
        }
        mutations.push({name,args}); raw={recommendationIds:publishedInternal.map((_r,i)=>fixtureId(850+i)),listRevision:"list-1"};
        raw.modelOutput=formatCareerMatchingResult(raw);
      } else if (name === "get_role_context" && scenario.pendingInternal) raw={modelOutput:formatPromptText(scenario.pendingInternal.filter((r:any)=>(args.roleIds ?? []).includes(r.id)))};
      else if (name === "read_recommended_opportunities" && scenario.pendingInternal) raw={modelOutput:formatPromptText({opportunities:publishedInternal,selectedUnpublishedInternalProposals:{proposals:scenario.pendingInternal.filter((r:any)=>!publishedInternal.some(p=>p.roleId===r.id)).map((r:any)=>({roleId:r.id,company:r.company,title:r.title,selectedAt:r.selectedAt})),nextOffset:null}})};
      else if (name === "get_role_context") raw = { modelOutput: internalRoles ? formatRoleContextForModel(
        (args.roleIds ?? [args.role_id ?? args.roleId]).map((id: string) =>
          [...internalRoles, ...(scenario.postingRoles ?? [])].find((role: any) => role.id === id)).filter(Boolean).map(roleContext)) : roleStored ? formatPromptText(scenario.role) : "No selected role or current role record." };
      else if (name === "get_internal_roles" && scenario.frozenResourceMarket) {
        const terms = (args.keywords ?? []).map((t: string) => t.trim().toLowerCase()).filter(Boolean);
        assert.ok(args.role_id || terms.length, "get_internal_roles requires role_id or keywords for lookup.");
        const found = internalRoles.filter((r: any) => (!args.role_id || args.role_id === r.id)
          && (!terms.length || terms.some((term: string) => (r.title + " " + r.company).toLowerCase().includes(term))));
        raw = { modelOutput: formatRoleContextForModel(found.map(roleContext)) };
      } else if (name === "get_internal_roles") raw = { modelOutput: internalRoles ? formatRoleContextForModel(internalRoles
        .filter((role: any) => !args.role_id || role.id === args.role_id).map(roleContext)) : "No matching public internal roles. No next page." };
      else if (name === "read_recommended_opportunities" && receipts) {
        const companyNames = [args.companyName ?? []].flat().map((value: string) => value.toLocaleLowerCase("ko-KR"));
        const stored = [...privateRoles.values()].map(item => ({...item,
          companyName:item.role?.companyName, title:item.role?.name, roleId:item.role?.roleId, sourceType:"internal", externalJdUrl:internalRoles.find((r:any)=>r.id===item.role?.roleId)?.url}));
        const filtered = [...stored,...recordedPostings.values()].filter(item =>
          (!args.only_internal || item.sourceType === "internal") && (!args.postingUrl || item.externalJdUrl === args.postingUrl)
          && (!companyNames.length || companyNames.some(name => String(item.companyName).toLocaleLowerCase("ko-KR").includes(name))));
        const opportunities = filtered.slice(0, args.limit ?? 10);
        raw = {returnedCount:opportunities.length,totalMatchingCount:filtered.length,opportunities,modelOutput:formatPromptText({returnedCount:opportunities.length,totalMatchingCount:filtered.length,opportunities})};
      }
      else if (name === "read_recommended_opportunities" && scenario.internalCatalog) raw = { modelOutput: formatPromptText([...privateRoles.values()]) };
      else if (name === "read_recommended_opportunities") raw = { modelOutput: scenario.roles ? formatRoleContextForModel(scenario.roles.map(roleContext)) : "No recorded recommendations or internal roles in this account snapshot. No next page." };
      else if (name === "search_companies") raw = { modelOutput: "No matching canonical company record. No next page." };
      else if (name === "read_talent_schedules" || name === "upsert_talent_schedules") {
        meetingDb ??= openMeetingDb();
        raw = await TALENT_MEETING_TOOLS[name].execute!(args, {
          admin: meetingAdmin(await meetingDb), userId, conversationId: scenario.backgroundRun?.conversation_id,
          toolCallId: String(calls.length),
        });
        if (raw.schedule) meetingRows.set(raw.schedule.id, clone(raw.schedule));
      }
      else if (name === "read_schedule" || name === "list_schedules") {
        const selected = name === "read_schedule" ? schedules.filter((s: any) => s.id === args.schedule_id) : schedules;
        if (name === "read_schedule") assert.equal(selected.length, 1, "Unknown owned fixture schedule");
        raw = { modelOutput: formatCareerSchedules(selected) };
      }
      else if (receipts && name === "read_talent_activity_events" && args.scope === "searches") raw = await receipts.read(args);
      else if (["read_company_connections", "read_talent_activity_events", "read_agent_messages"].includes(name)) raw = { modelOutput: "No saved records. No next page." };
      else if (name === "follow_company" && args.action === "read") raw = { modelOutput: "No followed companies. No next page." };
      else if (name === "search_connected_gmail" && scenario.gmailMessages) {
        const matches = compileFixtureGmailQuery(String(args.query ?? ""), requestTime);
        const hits = scenario.gmail ? scenario.gmailMessages.filter((email: GmailSearchResult["emails"][number]) =>
          args.thread_id ? email.threadId === args.thread_id : matches(email)) : [];
        const offset = args.page_token ? Number(args.page_token) : 0;
        assert.ok(Number.isInteger(offset) && offset >= 0, "Unknown fixture Gmail page token");
        const page = args.thread_id ? hits : hits.slice(offset, offset + (args.max_results ?? 5));
        const emails = page.map(({ content, ...metadata }: GmailSearchResult["emails"][number]) => ({
          ...metadata, resourceRef: { kind: "email_message" as const, id: `fixture-account/${metadata.messageId}` },
          ...(args.thread_id || args.include_content ? { content } : {}),
        }));
        const result: GmailSearchResult = { status: scenario.gmail ? "ok" : "connection_required", emails, truncated: offset + page.length < hits.length, nextPageToken: offset + page.length < hits.length ? String(offset + page.length) : null,
          assistantInstruction: scenario.gmail ? "Only the returned messages were retrieved by this search; other inbox contents were not checked." : "No inbox messages were read." };
        raw = { ...result, ...(receipts && scenario.gmail ? {mailboxGeneration: "fixture-account"} : {}), modelOutput: formatGmailSearchResult(result) };
      }
      else if (name === "search_connected_gmail") raw = { status: scenario.gmail ? "ok" : "not_connected", emails: [], nextPageToken: null };
      else if (name === "save_job_posting") {
        const results = (args.postings ?? [args]).map((postingInput: any, index: number) => {
        const page = scenario.pages.find((p: any) => p.url === (postingInput.url ?? postingInput.postingUrl));
        assert.ok(page, "Posting source unavailable");
        const posting = scenario.postingRoles?.find((p: any) => p.url === page.url) ?? scenario.role;
        assert.ok(posting, "No known public posting");
        const mode = postingInput.mode ?? "save";
        const created = mode !== "index" && !postingRecommendations.has(posting.id);
        if (scenario.role?.id === posting.id) roleStored = true;
        if (created) postingRecommendations.set(posting.id, fixtureId(801 + postingRecommendations.size));
        if (receipts && mode !== "index") recordedPostings.set(posting.id, {roleId:posting.id,recommendationId:postingRecommendations.get(posting.id),
          title:postingInput.title ?? posting.title, companyName:postingInput.company_name ?? posting.company ?? "",sourceType:posting.source,
          externalJdUrl:page.url,savedStage:mode==="save"?"saved":recordedPostings.get(posting.id)?.savedStage ?? null});
        const facts = { mode, roleId: posting.id,
          recommendationId: mode === "index" ? null : postingRecommendations.get(posting.id),
          created, savedStage: mode === "save" ? "saved" : null };
        mutations.push({ name, args: postingInput }); return { index, url: page.url, ok: true, ...facts,
          postingRoleIds: [posting.id], postingLink: `[posting](${posting.id})`,
          modelOutput: formatSavedJobPosting(facts) };
        });
        raw = { ok: true, results, postingRoleIds: results.flatMap((r: any) => r.postingRoleIds),
          modelOutput: results.map((r: any) => `Posting ${r.index + 1} — ${r.url}\n${r.modelOutput}`).join("\n\n") };
      } else if (name === "use_browser") {
        const page = scenario.pages.find((p: any) => p.url === args.url);
        raw = { status: "completed", session_id: fixtureId(701), execution_id: fixtureId(702),
          observation: scenario.browser && (!args.url || args.url === scenario.browser.url) ? scenario.browser.observation : page?.body ?? "No captured interactive page for this URL. No application was submitted.", submitted: false };
      } else if (scenario.backgroundRun && ["contact_user", "deliver_career_email"].includes(name)) {
        assert.notEqual(args.action, "read", "Delivery read requires an existing fixture receipt");
        mutations.push({ name, args });
        raw = { status: "sent", modelOutput: "Email delivery confirmed. Delivery receipt fixture-delivery-1." };
      } else if (scenario.internalCatalog && (name === "apply_to_internal_role" || name === "assign_to_role")) {
        const role = internalRoles.find((r: any) => r.id === args.roleId); assert.ok(role, "Unknown internal role");
        if (name === "assign_to_role") {
          const history = roleMaterials.get(role.id) ?? [];
          if (args.action !== "read") {
            assert.ok(args.action === "set" || args.action === "clear");
            assert.equal(args.expectedRevision, history.length, "Stale material assignment");
            const selected = profiles.find(p => p.profileId === args.profileId);
            if (args.action === "set") {
              assert.ok(selected, "Unknown owned profile");
              assert.equal(args.profileRevision, selected.revision);
              for (const ref of args.documents ?? []) {
                assert.ok(rows.talent_documents.some(d => d.id === ref.documentId && d.revision === ref.revision && !d.is_deleted));
              }
            }
            history.push({ id: fixtureId(1400 + calls.length), action: args.action, revision: history.length + 1,
              role_id: role.id, profile_id: selected?.profileId, profile_revision: selected?.revision, documents: args.documents ?? [] });
            roleMaterials.set(role.id, history);
          }
          raw = { current: history.at(-1) ?? null, latestRevision: history.length, history, acceptedMaterials: [] };
          raw.modelOutput = formatInternalApplicationToolResult(name, raw);
        } else {
          if (!privateRoles.has(role.id)) privateRoles.set(role.id, { role: { roleId: role.id, name: role.title, companyName: role.company, description: role.description },
            recommendationId: fixtureId(603 + privateRoles.size), visible: true, introductionRootId: null, postingRoleIds: [role.id], assignedMaterial: null, companyShared: false });
          raw = clone(privateRoles.get(role.id));
        }
      } else if (scenario.privateInternalOpportunity && (
        name === "apply_to_internal_role" || (name === "assign_to_role" && args.action === "read")
      )) {
        const saved = scenario.privateInternalOpportunity;
        if (saved.role.roleId !== args.roleId) throw new Error("Private opportunity is unavailable for this role.");
        raw = name === "apply_to_internal_role" ? clone(saved) : {
          current: null, latestRevision: 0, history: [], acceptedMaterials: [],
        };
      } else if (["write_email", "contact_company", "apply_to_internal_role", "update_recommended_opportunity_feedback"].includes(name)) {
        externalAttempts.push({ name, args }); throw new Error("External business actions are disabled in this evaluation. No message, application or introduction was sent.");
      } else throw new Error(`Tool ${name} has no corresponding record/action in this frozen fixture.`);
      await receipts?.record(name, args, {result:raw}, userMessageId, calls.indexOf(call));
      const result = projected(name, raw); call.result = clone(result); return result;
    } catch (error) { call.error = error instanceof Error ? error.message : String(error); await receipts?.record(name,args,{error},userMessageId,calls.indexOf(call)); throw error; }
  };
  function appendUserMessage(id: number, content: string) {
    assert.ok(!rows.talent_messages.some(row => row.id === id));
    userMessageId = id;
    rows.talent_messages.push({ id, user_id: userId, content });
  }
  return { appendUserMessage, execute, profileText, promptProfileText, contextText, referencesText, latestSearchText: async () => (await receipts?.latest()) ?? "", calls, close: async () => { await receipts?.close(); if (meetingDb) await (await meetingDb).close(); },
    state: () => clone({ documents: rows.talent_documents, profiles, forms, works, matchings, appointments: [...meetingRows.values()], publishedInternal, contextWrites, externalAttempts, mutations,resources:resourceFixture?.state() }) };
}
