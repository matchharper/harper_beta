import assert from "node:assert/strict";
import { upsertDocument } from "@/lib/documents/authoring";
import { listTalentDocumentsForTool, readTalentDocumentForTool } from "@/lib/talentOnboarding/documentTool";
import { withCompactTalentToolModelResult } from "@/lib/talentOnboarding/toolModelResult";
import { withTalentToolAssistantInstruction } from "@/lib/talentOnboarding/tools";
import { careerFormDraftSchema } from "@/lib/career/forms/schema";
import { formatCareerFormForModel } from "@/lib/career/forms/format";
import { applyProfileEdits, formatProfileToolResult } from "@/lib/career/profiles/tools";
import { formatCareerMatchingResult } from "@/lib/career/matching/formatters";
import { formatPromptText } from "@/lib/llm/promptText";

export const fixtureId = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clone = <T>(value: T): T => structuredClone(value);

/** Test-only storage adapter. Production document authoring, source checks,
 * revision checks and text projections execute against these owned rows.
 * This module is never imported by the application runtime.
 */
export function createCareerAutonomyFixture(scenario: any, requestTime: string) {
  const userId = fixtureId(1);
  const rows: Record<string, any[]> = {
    talent_documents: scenario.documents.map((d: any) => ({ id: d.id, talent_id: userId, file_name: d.title,
      kind: "resume", origin_type: "user_upload", revision: 1, extracted_text: d.text, structured_content: null,
      is_deleted: false, is_primary: false, is_public: false, created_at: requestTime, updated_at: requestTime, ...clone(d.row ?? {}) })),
    talent_users: [{ ...scenario.profile, user_id: userId }],
    talent_experiences: scenario.profile.experiences.map((row: any) => ({ ...row, talent_id: userId })),
    talent_educations: [], talent_extras: [], talent_contexts: [],
    talent_messages: [{ id: 1, user_id: userId, content: scenario.message }],
    logs: [],
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
    snapshot: { talentUser: { ...scenario.profile, user_id: userId }, talentExperiences: clone(rows.talent_experiences), talentEducations: [], talentExtras: [] } };
  const profiles = [profile], forms: any[] = [], contextWrites: any[] = [], externalAttempts: any[] = [], mutations: any[] = [];
  const matchings: any[] = scenario.matching ? [{ ...scenario.matching, criteria: { scope: scenario.brief } }] : [];
  const calls: any[] = [];
  const profileText = () => formatProfileToolResult("read_profile", profile);
  const contextText = () => `Search Brief:\n${scenario.brief}\nMemory:\n${scenario.memory}`;
  const referencesText = () => [
    "Saved document index:", ...rows.talent_documents.filter(d => !d.is_deleted).map(d => `Document ${d.id}; ${d.file_name}; revision ${d.revision}; ${d.origin_type}.`),
    ...(scenario.role ? [`Current selected opportunity:\n${formatPromptText(scenario.role)}`] : []),
    ...(matchings.length ? [`Matching index:\n${formatCareerMatchingResult({ matchings, listRevision: "list-1" })}`] : []),
  ].join("\n");
  const projected = (name: string, raw: any) => withTalentToolAssistantInstruction(withCompactTalentToolModelResult(name, raw));
  const execute = async ({ name, input }: { name: string; input: Record<string, any> }) => {
    const call: any = { name, input: clone(input) }; calls.push(call);
    const { _uiStatusMessage, ...args } = input;
    let raw: any;
    try {
      if (name === "web_search") {
        const terms = String(args.query).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
        // A fixed lexical index, not an answer script or a query-intent classifier.
        const results = scenario.pages.map((page: any, index: number) => ({ page, index,
          score: terms.reduce((score, term) => score + Number(`${page.title} ${page.searchTerms} ${page.summary}`.toLowerCase().includes(term)), 0) }))
          .filter((hit: any) => hit.score > 0).sort((a: any, b: any) => b.score - a.score || a.index - b.index)
          .slice(0, args.maxResults ?? 10).map(({ page }: any, index: number) => ({ rank: index + 1, title: page.title, url: page.url, highlights: [page.summary] }));
        raw = { query: args.query, resultCount: results.length, results };
      } else if (name === "open_url") {
        const page = scenario.pages.find((page: any) => page.url.replace(/\/$/, "") === String(args.url).replace(/\/$/, ""));
        raw = page ? { url: page.url, title: page.title, markdown: page.body, truncated: false }
          : { ok: false, error: "No captured source for this URL. Its contents remain unavailable." };
      } else if (name === "upsert_document") {
        raw = await upsertDocument({ admin, userId, userMessageId: 1, requestId: "autonomy-fixture-turn", input: args });
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
      } else if (name === "read_talent_context") raw = { modelOutput: contextText() };
      else if (name === "write_talent_context") {
        contextWrites.push(clone(args)); raw = { ok: true, modelOutput: `Context changes recorded in the isolated fixture:\n${formatPromptText(args)}` };
      } else if (name === "list_matchings" || name === "read_matching") {
        raw = { matchings, ...(args.matchingId ? { matching: matchings.find(m => m.id === args.matchingId) } : {}), listRevision: "list-1", defaultListRevision: "list-1", memberships: [], runs: [], evaluations: [], evaluationCount: 0, remainingEvaluationCount: 0 };
        raw.modelOutput = formatCareerMatchingResult(raw);
      } else if (name === "upsert_matching") {
        assert.equal(args.action, "create"); const matching = { ...args, id: fixtureId(510 + matchings.length), revision: 1 };
        matchings.push(matching); raw = { matching, listRevision: "list-1", modelOutput: formatCareerMatchingResult({ matching, listRevision: "list-1" }) };
      } else if (name === "search_opportunities") {
        raw = { runId: fixtureId(601), source: args.source, status: "completed", roleIds: [], evaluations: [], evaluationCount: 0, remainingEvaluationCount: 0, expiredRoleCount: 0, failures: [] };
        raw.modelOutput = formatCareerMatchingResult(raw);
      } else if (name === "get_role_context") raw = { modelOutput: scenario.role ? formatPromptText(scenario.role) : "No selected role or current role record." };
      else if (name === "read_recommended_opportunities" || name === "get_internal_roles") raw = { modelOutput: "No recorded recommendations or internal roles in this account snapshot. No next page." };
      else if (name === "search_companies") raw = { modelOutput: "No matching canonical company record. No next page." };
      else if (["read_company_connections", "read_talent_activity_events", "list_schedules", "read_talent_schedules"].includes(name)) raw = { modelOutput: "No saved records. No next page." };
      else if (name === "search_connected_gmail") raw = { status: scenario.gmail ? "ok" : "not_connected", emails: [], nextPageToken: null };
      else if (name === "save_job_posting") {
        assert.ok(scenario.role, "No known public posting");
        const page = scenario.pages.find((p: any) => p.url === (args.url ?? args.postingUrl));
        assert.ok(page, "Posting source unavailable");
        mutations.push({ name, args }); raw = { ok: true, roleId: scenario.role.id, title: scenario.role.title, companyName: scenario.role.company, url: page.url };
      } else if (name === "use_browser") {
        const page = scenario.pages.find((p: any) => p.url === args.url);
        raw = { status: "completed", session_id: fixtureId(701), execution_id: fixtureId(702),
          observation: scenario.browser && (!args.url || args.url === scenario.browser.url) ? scenario.browser.observation : page?.body ?? "No captured interactive page for this URL. No application was submitted.", submitted: false };
      } else if (["write_email", "contact_company", "apply_to_internal_role", "update_recommended_opportunity_feedback"].includes(name)) {
        externalAttempts.push({ name, args }); throw new Error("External business actions are disabled in this evaluation. No message, application or introduction was sent.");
      } else throw new Error(`Tool ${name} has no corresponding record/action in this frozen fixture.`);
      const result = projected(name, raw); call.result = clone(result); return result;
    } catch (error) { call.error = error instanceof Error ? error.message : String(error); throw error; }
  };
  return { execute, profileText, contextText, referencesText, calls,
    state: () => clone({ documents: rows.talent_documents, profiles, forms, matchings, contextWrites, externalAttempts, mutations }) };
}
