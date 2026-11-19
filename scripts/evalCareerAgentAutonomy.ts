import { config } from "dotenv";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import Ajv from "ajv";
import { getOpenAIChatPreset } from "@/lib/llm/modelConfig";
import { buildOpenAIResponsesRequest } from "@/lib/llm/responsesChatAdapter";

config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const option = (name: string, fallback: string) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const taskName = option("--task", "career-agent-autonomy");
assert.match(taskName, /^[a-z0-9-]+$/);
const task = `docs/evaluation/${taskName}`;

function jsonFile(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function quoted(text: string) {
  return text.split("\n").map(line => `> ${line}`).join("\n");
}

function reviewEvidence(run: any, scenario: any) {
  const lines: string[] = [];
  const scheduled = scenario.backgroundRun && !["conversation_completed", "gmail_connected"].includes(scenario.backgroundRun.trigger);
  const deliveries = run.calls.filter((call: any) =>
    ["contact_user", "deliver_career_email"].includes(call.name) &&
    !["read", "cancel"].includes(call.input.action));
  if (scheduled || deliveries.length) {
    lines.push("**후보자 연락 · 모의 전송 기록**", "",
      `전송 호출 ${deliveries.length}건. 아래 영수증은 이 평가의 격리된 전송 도구가 반환했다.`, "");
    for (const [index, call] of deliveries.entries()) {
      const input = call.input, result = call.result;
      const channel = call.name === "deliver_career_email" ? "email" : input.channel;
      const status = call.error ? "도구 오류" : result?.status ?? "상태 미확인";
      lines.push(`**${index + 1}. ${channel === "email" ? "이메일" : channel === "chat" ? "채팅" : channel} · ${status}**`, "");
      const recipient = result?.recipientEmail ?? result?.recipient ?? input.to ?? scenario.profile?.name;
      if (recipient) lines.push(`수신 대상 · ${recipient}`, "");
      if (result?.deliveryId) lines.push(`전송 ID · ${result.deliveryId}`, "");
      if (result?.messageId) lines.push(`메시지 ID · ${result.messageId}`, "");
      if (input.subject) lines.push(`**제목** ${input.subject}`, "");
      if (input.body) lines.push(quoted(input.body), "");
      if (call.error || result?.modelOutput) lines.push("**도구 응답**", "", quoted(call.error ?? result.modelOutput), "");
    }
  }
  const mailbox = run.calls.filter((call: any) => call.name === "search_connected_gmail");
  if (mailbox.length) {
    lines.push("**메일 조회와 저장 결과**", "", `메일을 ${mailbox.length}회 조회했다.`, "");
    for (const call of mailbox) {
      const request = call.input.thread_id ? `스레드 ${call.input.thread_id}` : call.input.query;
      const sources = (call.result?.emails ?? []).map((mail: any) =>
        `${mail.messageId}${mail.content ? " (본문)" : ""}`);
      lines.push(`- ${request} → ${call.error || sources.join(", ") || "0건"}`);
    }
    lines.push("");
    for (const row of run.state.appointments ?? []) {
      lines.push(`저장된 일정 · ${row.title} · ${row.confirmed_start_at} · ${row.status}`,
        `메일 근거 · ${row.source_refs?.gmailMessageIds?.join(", ") || "없음"}`, "");
    }
    const writes = new Set(run.calls.filter((call: any) => call.name === "upsert_document" && !call.error)
      .map((call: any) => call.result?.documentId));
    for (const row of run.state.documents.filter((doc: any) => writes.has(doc.id))) {
      lines.push(`저장된 개인 문서 · ${row.file_name} · 수정본 ${row.revision}`, "",
        quoted(row.extracted_text ?? ""), "");
    }
  }
  const cards: string[] = [];
  for (const call of run.calls) {
    if (call.error) continue;
    if (call.name === "save_job_posting") {
      for (const item of call.result?.results ?? []) {
        if (!item.ok || !item.recommendationId) continue;
        const posting = call.input.postings?.[item.index] ?? call.input;
        const page = scenario.pages?.find((source: any) => source.url === item.url);
        const title = [posting.company_name, posting.title].filter(Boolean).join(" · ") || page?.title || "공고";
        cards.push(`**${title}** · ${item.mode === "suggest" ? "추천" : "저장"}`, "",
          `추천 ID · ${item.recommendationId}`, "", `[공고 원문](${item.url})`, "");
        if (page?.body) cards.push("**동결된 공고 원문**", "", quoted(page.body), "");
      }
    } else if (call.name === "upsert_opportunities" && call.input.action === "upsert") {
      for (const item of call.result?.opportunities ?? []) {
        cards.push(`**${item.title}** · 기회 기록 ${item.id} (수정 ${item.revision})`, "");
        if (item.body) cards.push(quoted(item.body), "");
        const source = scenario.resources?.find((r: any) => r.ref.kind === item.primary_ref?.kind && r.ref.id === item.primary_ref?.id);
        if (source?.facts?.url) cards.push(`[기회의 원자료](${source.facts.url})`, "");
        if (item.presentation?.action?.label) cards.push(`버튼 · ${item.presentation.action.label}`, "");
      }
    } else if (call.name === "upsert_opportunities" && call.input.action === "add" && call.result?.recommendationIds?.length) {
      for (const item of call.input.items ?? []) {
        const role = [...(scenario.pendingInternal ?? []), ...(scenario.roles ?? [])].find(source => source.id === item.roleId);
        cards.push(`**${role?.company ?? ""} ${role?.title ?? "포지션"}** · ${item.roleId}`, "");
        if (item.reason) cards.push(quoted(item.reason), "");
        if (role?.url) cards.push(`[공고 원문](${role.url})`, "");
      }
    } else if (call.name === "manage_action_items" && call.input.operation === "create" && call.result?.ok) {
      const item = call.input.item;
      cards.push(`**${item.title}** · 할 일 ${call.result.id}`, "");
      if (item.description) cards.push(quoted(item.description), "");
      if (item.buttonText) cards.push(`버튼 · ${item.buttonText}`, "");
      if (item.action?.type === "send_message" && item.action.text) {
        cards.push("버튼을 누르면 보낼 메시지", "", quoted(item.action.text), "");
      }
    }
  }
  if (cards.length) lines.push("**기회·공고·할 일 카드 기록**", "", ...cards);
  const transcript = [...(scenario.backgroundRun ? [] : run.intermediate), run.reply].filter(Boolean).join("\n\n");
  lines.push(scheduled ? "**백그라운드 모델 답변 · 사용자에게 미전달**" : "**채팅 답변**",
    "", transcript ? quoted(transcript) : "(본문 없음)", "");
  return lines;
}

function renderReview(dataset: string, selected: any[], results: any[], gold: any) {
  const cases = selected.flatMap((first, index) => {
    const next = first.nextConversation;
    return [{ scenario: first, index, phase: 0 },
      ...(next ? [{ scenario: { ...first, ...next }, index, phase: 1 }] : []),
      ...(first.followups ?? []).flatMap((turn: any, n: number) => [
        ...(turn.gmail ? [{ scenario: { ...first, id: turn.id + "_connected", backgroundRun: { trigger: "gmail_connected" } }, index, phase: n + 0.5 }] : []),
        { scenario: { ...first, ...turn, backgroundRun: undefined }, index, phase: n + 1 }])];
  });
  const byId = new Map(cases.map(entry => [entry.scenario.id, entry]));
  const decorated = results.map(run => {
    const entry = byId.get(run.caseId);
    assert.ok(entry, `Result has no selected case: ${run.caseId}`);
    return { ...entry, run };
  });
  decorated.sort((a,b) => a.index - b.index || a.run.iteration - b.run.iteration || a.phase - b.phase);
  const lines = [`# 실행 결과 · ${taskName} ${dataset}`, "",
    "답변과 근거를 읽고 각 기준에 통과·실패·미확인을 기록한다. 실행 오류가 난 턴은 미확인으로 남긴다.", ""];
  for (const { scenario, run } of decorated) {
    const criteria = gold.reviewerOnly?.[run.caseId];
    lines.push(`## ${run.caseId} · ${run.iteration}회차`, "", ...reviewEvidence(run, scenario),
      "**비교 기준**", "", ...(Array.isArray(criteria) ? criteria.map((item: string) => `- ${item}`)
        : [`해당 케이스의 [평가 기준](../../gold-${dataset}.json)을 연다.`]), "",
      `호출한 도구 · ${run.calls.map((call: any) => call.name).join(", ") || "없음"}`,
      `[도구 인자·결과와 저장 상태](./${run.caseId}-${run.iteration}.json)`, "",
      run.error ? `미확인 · 실행 오류 · ${run.error}` : "판정 및 근거 · ", "");
  }
  return lines.join("\n");
}

async function main() {
  const from = option("--review-from", "");
  if (process.argv.includes("--review-from")) assert.match(from, /^[a-zA-Z0-9][\w.-]*$/, "Expected a saved run directory name");
  const archived = from ? jsonFile(`${task}/runs/${from}/manifest.json`) : null;
  const dataset = option("--dataset", archived?.datasetVersion ?? "v1"); assert.match(dataset, /^v\d+$/);
  const fixture = JSON.parse(readFileSync(`${task}/cases-${dataset}.json`, "utf8"));
  if (fixture.marketFrom) {
    assert.match(fixture.marketFrom, /^cases-v\d+\.json$/);
    const market = jsonFile(`${task}/${fixture.marketFrom}`);
    for (const key of ["sharedPages", "postingCatalog", "internalCatalog", "usePublicResourceMarket"]) fixture[key] = market[key];
  }
  if (fixture.useSearchReceipts) {
    // The frozen web index and the portion already stored are different sources.
    fixture.sharedPages.forEach((p:any, index:number) => { p.resourceId = String(1000000 + index); });
  }
  if (fixture.usePublicResourceMarket) {
    const resource = (kind: string, id: string, title: string, body: string, facts: Record<string, unknown>) =>
      ({ ref: { kind, id, revision: "1" }, title, body, facts, sourceRefs: [], status: "available" });
    fixture.sharedResources = [
      ...fixture.sharedPages.map((p: any) => resource("web_resource", p.resourceId, p.title, p.body, { url: p.url, keywords: p.searchTerms })),
      ...fixture.postingCatalog.filter((r: any) => r.source !== "internal").map((r: any) =>
        resource("role", r.id, r.title, r.description, { url: r.url, company: r.company, source: r.source })),
    ];
  }
  for (const scenario of fixture.cases) {
    if (scenario.formResponse) {
      const { formatTalentMessageContentForLlmPrompt } = await import("@/lib/career/opportunityFeedbackNote");
      scenario.message = formatTalentMessageContentForLlmPrompt({
        role: "user", message_type: "career_form_response", content: "", payload: scenario.formResponse,
      }, { currentInput: true });
      assert.ok(scenario.message, "Invalid form response fixture");
      scenario.forms = [scenario.formResponse.formSnapshot];
    }
    scenario.pages ??= fixture.sharedPages ?? [];
    if (fixture.useSearchReceipts) {scenario.useSearchReceipts=true; scenario.initialPublicUrls=fixture.initialPublicUrls;}
    if (fixture.sharedResources) {
      scenario.resources = fixture.sharedResources;
      scenario.frozenResourceMarket = true;
    }
    if (fixture.internalCatalog) scenario.internalCatalog = fixture.internalCatalog;
    if (fixture.postingCatalog) scenario.postingRoles = fixture.postingCatalog;
  }
  const frozen = JSON.parse(readFileSync(`${task}/manifest-${dataset}.json`, "utf8"));
  for (const [name, digest] of Object.entries(frozen.hashes)) assert.equal(hash(readFileSync(`${task}/${name}`)), digest);
  if (archived) {
    assert.equal(archived.datasetVersion, dataset, "Dataset differs from the recorded run");
    assert.deepEqual(archived.fixtureHashes, frozen.hashes, "Recorded cases/gold differ from the frozen dataset");
    const dir = `${task}/runs/${from}`;
    const selected = fixture.cases.filter((c: any) => archived.selected.includes(c.id));
    assert.equal(selected.length, archived.selected.length);
    const results = jsonFile(`${dir}/results.json`);
    const actual = results.map((r: any) => JSON.stringify([r.caseId, r.iteration]));
    const expected = selected.flatMap((c: any) => Array.from({length: archived.repeat}, (_, n) => [
      ...(archived.continuedFrom ? [] : [c.id]), ...(c.nextConversation ? [c.nextConversation.id] : []), ...(archived.firstTurnOnly ? [] : c.followups ?? []).flatMap((turn: any) => [...(turn.gmail ? [turn.id + "_connected"] : []), turn.id]),
    ].map(id => JSON.stringify([id, n + 1]))).flat());
    assert.deepEqual(actual.sort(), expected.sort(), "Run does not contain all selected results");
    const path = `${dir}/review-rendered.md`;
    writeFileSync(path, renderReview(dataset, selected, results, jsonFile(`${task}/gold-${dataset}.json`)), { mode: 0o600 });
    console.log(`Review: ${path}`);
    return;
  }
  const revision = option("--guidance-revision", "");
  const guidance = revision ? await (await import("./evaluation/careerAutonomyGuidance")).loadCareerAutonomyGuidance(revision) : undefined;
  const { createCareerAutonomyFixture } = await import("./evaluation/careerAutonomyFixture");
  const { resolveCareerChatTools } = await import("@/lib/career/llmTools");
  const { resolveCareerTextChatModel, isCareerTextChatModelId } = await import("@/lib/career/textChatModelConfig");
  const { CareerCapabilityRuntime } = await import("@/lib/career/capabilities/runtime");
  const { selectCareerPreloads } = await import("@/lib/career/capabilities/decisions");
  const { runCareerChatAssistant } = await import("@/lib/career/llm");
  const { getScheduledCareerModelOptions, isScheduledCareerRun, CAREER_BACKGROUND_PRELOAD } = await import("@/lib/career/background/scheduledModel");
  const { renderCareerBackgroundInvocation, formatCareerApplicationEvent, GMAIL_CONNECTED_APPLICATION_EVENT } = await import("@/lib/career/background/prompt");
  const requestedModel = option("--model", "");
  if (requestedModel) assert.ok(isCareerTextChatModelId(requestedModel), "Explicit model must be a supported product selection");
  const model = resolveCareerTextChatModel(requestedModel || undefined);
  const scheduledModel = getScheduledCareerModelOptions();
  const originalFetch = globalThis.fetch;
  if (process.argv.includes("--validate-only")) {
    globalThis.fetch = async () => { throw new Error("Fixture validation has no network access"); };
    try {
      for (const scenario of fixture.cases) {
        const sandbox = createCareerAutonomyFixture(scenario, fixture.requestTime);
        if (scenario.useSearchReceipts) {
          const hit=await sandbox.execute({name:"web_search",input:{query:"Fieldguide",maxResults:1}});
          const prior=await sandbox.execute({name:"read_talent_activity_events",input:{scope:"searches",query:"Fieldguide"}});
          assert.ok((await sandbox.latestSearchText()).includes("Fieldguide"));
          assert.equal(prior.searches.length,1);
          const op=await sandbox.execute({name:"read_resources",input:{refs:[{kind:"operation",id:prior.searches[0].id}]}});
          assert.ok(op.items[0].sourceRefs.some((ref:any)=>ref.id===hit.results[0].resourceRef.id));
          const source=await sandbox.execute({name:"open_url",input:{url:hit.results[0].url,maxAgeHours:0}});
          assert.ok(source.ok && source.documentId && source.observationId);
          const page=await sandbox.execute({name:"open_url",input:{url:hit.results[0].url}});
          assert.ok(page.cached && page.modelOutput.includes("saved page"));
        }
        if (scenario.persistContext) {
          // An ordinary reply must see a fact written before it, including the same editable ref.
          await sandbox.execute({ name: "write_talent_context", input: { changes: [{ op: "add", collection: "brief", label: "Location", content: "Busan only" }] } });
          assert.match(sandbox.contextText(), /Busan only/);
          const read = await sandbox.execute({ name: "read_talent_context", input: { collection: "brief" } });
          assert.equal(read.items[0].content, "Busan only");
          await sandbox.execute({ name: "write_talent_context", input: { changes: [{ op: "update", ref: read.items[0].ref, content: "Busan, occasional travel" }] } });
          assert.match(sandbox.contextText(), /occasional travel/);
          await sandbox.execute({ name: "write_talent_context", input: { changes: [{ op: "delete", ref: read.items[0].ref }] } });
          assert.ok(!sandbox.contextText().includes("Busan"));
          const entry = scenario.postOnboardingContext?.entryOpportunity?.verifiedActiveRoleId;
          if (entry) {
            const catalog = await sandbox.execute({ name: "get_internal_roles", input: { role_id: entry } });
            assert.ok(catalog.modelOutput.includes(entry));
            const role = await sandbox.execute({ name: "get_role_context", input: { roleIds: [entry] } });
            assert.ok(role.modelOutput.includes(entry));
            if (scenario.frozenResourceMarket) {
              await assert.rejects(sandbox.execute({ name: "get_internal_roles", input: {} }), /requires role_id or keywords/);
              const profile = await sandbox.execute({ name: "read_profile", input: {} });
              const set = await sandbox.execute({ name: "assign_to_role", input: { roleId: entry, action: "set", expectedRevision: 0,
                profileId: profile.profileId, profileRevision: profile.revision, documents: [] } });
              assert.equal(set.latestRevision, 1);
              const material = await sandbox.execute({ name: "assign_to_role", input: { roleId: entry, action: "read" } });
              assert.equal(material.current.id, set.current.id);
            }
            const saved = await sandbox.execute({ name: "apply_to_internal_role", input: { roleId: entry } });
            assert.equal(saved.role.roleId, entry);
            assert.equal(saved.companyShared, false);
          }
        }
        if (scenario.postingRoles?.length) {
          const result = await sandbox.execute({ name: "save_job_posting", input: { postings: [{url: scenario.postingRoles[0].url, mode: "index"}] } });
          assert.equal(result.results[0].recommendationId, null);
          assert.equal(result.results[0].roleId, scenario.postingRoles[0].id);
          if (scenario.frozenResourceMarket) {
            const added = await sandbox.execute({ name: "upsert_opportunities", input: { action: "add", items: [{ roleId: scenario.postingRoles[0].id }] } });
            assert.equal(added.recommendationIds.length, 1);
            const same = await sandbox.execute({ name: "upsert_opportunities", input: { action: "add", items: [{ roleId: scenario.postingRoles[0].id }] } });
            assert.equal(same.recommendationIds[0], added.recommendationIds[0]);
          }
        }
        await sandbox.execute({ name: "list_documents", input: {} });
        for (const doc of scenario.documents) await sandbox.execute({ name: "read_document", input: { document_id: doc.id } });
        for (const doc of scenario.documents.filter((doc: any) => doc.row?.origin_type === "harper_authored_document")) {
          await sandbox.execute({ name: "upsert_document", input: { action: "update", document_id: doc.id, expected_revision: doc.row.revision, edits: [{ old_text: doc.text, new_text: `${doc.text}\nFixture edit.` }] } });
          await sandbox.execute({ name: "read_document", input: { document_id: doc.id } });
        }
        const created: any = await sandbox.execute({ name: "upsert_document", input: { action: "create", type: "markdown", title: "Fixture storage check", markdown: "Original source text." } });
        await sandbox.execute({ name: "read_document", input: { document_id: created.documentId } });
        if (scenario.nextConversation) {
          const next = createCareerAutonomyFixture({ ...scenario, ...scenario.nextConversation, history: [], documents: [] }, scenario.nextConversation.requestTime, sandbox.state().documents);
          const read = await next.execute({ name: "read_document", input: { document_id: created.documentId } });
          assert.ok(JSON.stringify(read).includes("Original source text."));
          assert.ok(!next.referencesText().includes("Original source text."));
        }
        if (scenario.gmailMessages?.length) {
          const source = scenario.gmailMessages[0];
          const search = await sandbox.execute({ name: "search_connected_gmail", input: { query: source.subject } });
          assert.ok(search.modelOutput.includes(source.snippet));
          assert.ok(!search.modelOutput.includes(source.content));
          const thread = await sandbox.execute({ name: "search_connected_gmail", input: { thread_id: source.threadId } });
          assert.ok(thread.modelOutput.includes(source.content));
          const appointment = await sandbox.execute({ name: "upsert_talent_schedules", input: {
            action: "create", title: "Fixture meeting", starts_at: fixture.requestTime,
            timezone: "Asia/Seoul", source_key: source.messageId,
            source_refs: { gmailMessageIds: [source.messageId], gmailThreadIds: [source.threadId] },
          } });
          const saved = await sandbox.execute({ name: "read_talent_schedules", input: { schedule_id: appointment.schedule.id } });
          assert.equal(saved.schedules[0].source_key, source.messageId);
        }
        const resume: any = await sandbox.execute({ name: "upsert_document", input: { action: "create", type: "resume", title: "Fixture resume check", content: { language: "ko", basics: { name: scenario.profile.name ?? "Fixture" } }, source_document_ids: scenario.documents.map((doc: any) => doc.id) } });
        await sandbox.execute({ name: "read_document", input: { document_id: resume.documentId, format: "structured" } });
        await sandbox.close();
      }
      console.log(`Validated ${fixture.cases.length} frozen cases; production document read/write fixtures passed.`);
      if (guidance) {
        const selected = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false });
        assert.equal(selected.tools.find(tool => tool.function.name === "write_talent_context")!.function.description, guidance.memoryDescription);
        const runtime = new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: selected.tools, adaptPromptBlocks: guidance.adaptPromptBlocks,
          selection: { capabilityIds: [], handbookIds: ["resume", "application", "opportunity_search"], status: "selected", elapsedMs: 0 },
          promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "Fixture profile", talentContextSection: "", currentPreferences: { preferredLocale: "ko" } }) });
        const step = runtime.resolveStep(false);
        assert.equal(step.systemBlocks.find(block => block.key === "career_main")!.text, guidance.mainText);
        const { findCareerHandbook } = await import("@/lib/career/handbooks/registry");
        for (const id of ["resume", "application", "opportunity_search"]) assert.equal(step.systemBlocks.find(block => block.key === `handbook:${id}`)!.text, `## Handbook: ${id}\n${findCareerHandbook(id)!.body}`);
        console.log(`Source replay verified: ${guidance.commit}; main, handbook bodies/catalog and Memory tool description.`);
      }
    } finally { globalThis.fetch = originalFetch; }
    return;
  }
  const repeat = Number(option("--repeat", "2")); assert.ok(Number.isInteger(repeat) && repeat > 0);
  const only = option("--only", "").split(",").filter(Boolean);
  const cases = fixture.cases.filter((c: any) => !only.length || only.includes(c.id)); assert.ok(cases.length);
  for (const id of only) assert.ok(cases.some((item: any) => item.id === id), `Unknown case: ${id}`);
  const firstTurnOnly = process.argv.includes("--first-turn-only");
  const continueFrom = option("--continue-from", "");
  if (continueFrom) {
    assert.match(continueFrom, /^[\w-]+$/);
    const previous = JSON.parse(readFileSync(`${task}/runs/${continueFrom}/manifest.json`, "utf8"));
    assert.match(previous.datasetVersion, /^v\d+$/);
    const original = readFileSync(`${task}/cases-${previous.datasetVersion}.json`);
    assert.equal(hash(original), previous.fixtureHashes[`cases-${previous.datasetVersion}.json`]);
    const earlier = JSON.parse(original.toString());
    assert.deepEqual([earlier.requestTime, earlier.environment], [fixture.requestTime, fixture.environment]);
    for (const scenario of cases) {
      const { nextConversation, ...first } = scenario;
      assert.ok(nextConversation);
      const previousCase = earlier.cases.find((item: any) => item.id === scenario.id);
      assert.ok(previousCase);
      const { nextConversation: _previousFollowUp, ...originalFirst } = previousCase;
      assert.deepEqual(first, originalFirst, "A continuation must reuse the same first input");
    }
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${option("--label", "run")}`;
  const dir = `${task}/runs/${runId}`; mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
  const normalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const scope = new AsyncLocalStorage<{ caseId: string; iteration: number; model: string }>();
  for (const level of ["log", "info", "warn", "error"] as const) console[level] = (...args: any[]) => appendFileSync(`${dir}/runtime.log`, JSON.stringify({ ...scope.getStore(), level, values: args }) + "\n", { mode: 0o600 });
  const requests: any[] = [], blocked: any[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const current = scope.getStore();
    if (!((url.hostname === "api.openai.com" && ["/v1/responses", "/v1/chat/completions", "/v1/decisions"].includes(url.pathname)) ||
      (url.hostname === "api.anthropic.com" && url.pathname === "/v1/messages"))) {
      blocked.push({ ...current, host: url.hostname, path: url.pathname }); throw new Error("Evaluation blocks non-provider network");
    }
    assert.ok(current); const body = JSON.parse(String(init?.body));
    if (url.pathname !== "/v1/decisions") {
      const preset = getOpenAIChatPreset(current.model);
      if (url.pathname === "/v1/responses" && preset) {
        const expected = buildOpenAIResponsesRequest({ model: current.model, reasoningEffort: preset.effort, requestBody: { messages: [] } });
        assert.equal(body.model, expected.model, "Provider model must remain fixed");
        assert.equal(body.service_tier, "service_tier" in expected ? expected.service_tier : undefined, "Service tier must remain fixed");
        assert.equal(body.reasoning?.effort, expected.reasoning.effort, "Reasoning effort must remain fixed");
      } else {
        assert.equal(body.model, current.model, "Model/fallback must remain fixed");
      }
    }
    const index = requests.length + 1, started = Date.now();
    const record: any = { ...current, index, path: url.pathname, model: body.model, requestHash: hash(JSON.stringify(body)) };
    requests.push(record); save(`request-${index}`, body);
    try {
      const response = await originalFetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(150_000)]) });
      const text = await response.clone().text(); record.elapsedMs = Date.now() - started; record.status = response.status;
      try { record.usage = JSON.parse(text).usage; } catch { /* Preserve raw response below. */ }
      save(`response-${index}`, { status: response.status, body: text }); return response;
    } catch (error) { record.error = error instanceof Error ? error.message : String(error); throw error; }
    finally { save("requests", requests); }
  };
  const sourcePaths = ["scripts/evalCareerAgentAutonomy.ts", "scripts/evaluation/careerAutonomyFixture.ts", "src/lib/career/prompts/mainPrompt2.ts", "src/lib/career/prompts/mainPrompts.ts", "src/lib/career/prompts/conversationPlan.ts", "src/lib/career/prompts/conversationSections.ts", "src/lib/career/llmTools.ts", "src/lib/career/llm.ts", "src/lib/talentOnboarding/llm.ts", "src/lib/llm/toolDescriptions.ts", "src/lib/talentOnboarding/tools.ts", "src/lib/documents/authoring.ts", "src/lib/resumes/service.ts", "src/lib/career/textChatModelConfig.ts", ...["capabilities", "handbooks"].flatMap(folder => readdirSync(`src/lib/career/${folder}`).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")).map(name => `src/lib/career/${folder}/${name}`))];
  if (fixture.useSearchReceipts) sourcePaths.push("scripts/evaluation/careerSearchReceiptFixture.ts","scripts/evaluation/careerResourceFixture.ts","src/lib/career/resources/searchHistory.ts","src/lib/career/resources/read.ts","src/lib/career/agentTurnRuntime.server.ts","supabase/migrations/20261116081510_career_search_receipts.sql");
  if (cases.some((scenario: any) => scenario.gmailMessages)) sourcePaths.push("scripts/evaluation/careerFixtureMailbox.ts", "src/lib/career/chatTurn.ts", "src/lib/career/background/server.ts", "src/lib/integrations/gmail.ts", "src/lib/resumes/schema.ts", "src/lib/documents/sources.ts");
  sourcePaths.push("scripts/evaluation/careerAutonomyGuidance.ts", "src/lib/career/prompts/internalOpportunities.ts", "src/lib/career/internalSelections.ts");
  sourcePaths.push("src/lib/career/postOnboardingContext.ts", "src/lib/career/prompts/postOnboardingGuide.ts", "src/lib/career/prompts/types.ts");
  sourcePaths.push(...readdirSync("src/lib/career/handbooks/methods").filter(name => name.endsWith(".ts")).map(name => `src/lib/career/handbooks/methods/${name}`), "src/lib/career/opportunities/store.ts");
  sourcePaths.push("src/lib/career/meetings/tools.ts", "src/lib/career/meetings/server.ts", "src/lib/career/meetings/testSupport.ts", "src/lib/career/schedules/testSupport.ts", "supabase/migrations/20261102081607_career_meeting_schedules.sql", "src/lib/career/background/prompt.ts", "src/lib/career/background/scheduledModel.ts", "src/lib/career/prompts/scheduledWork.ts", "src/lib/email/runtime/prompt.ts");
  sourcePaths.push("src/lib/career/saveJobPosting.ts", "src/lib/career/jobLinkImport.ts", "src/lib/career/jobLinkImportServer.ts", "src/lib/talentOnboarding/documentToolModelResult.ts");
  sourcePaths.push("src/lib/career/forms/server.ts", "src/lib/career/forms/schema.ts", "src/lib/career/forms/format.ts", "src/lib/career/opportunityFeedbackNote.ts");
  if(fixture.cases.some((scenario:any)=>scenario.resources))sourcePaths.push("scripts/evaluation/careerResourceFixture.ts",...readdirSync("src/lib/career/resources").filter(name=>name.endsWith(".ts")&&!name.endsWith(".test.ts")).map(name=>`src/lib/career/resources/${name}`));
  const overlays = option("--source-overlays", "") ? jsonFile(option("--source-overlays", "")) : {};
  const sourceContents = Object.fromEntries(sourcePaths.map(path => [path, readFileSync(overlays[path] ?? path, "utf8")]));
  save("sources", sourceContents);
  if (guidance) save("replayed-guidance", guidance);
  save("manifest", { runId, datasetVersion: dataset, model, scheduledModel, repeat, firstTurnOnly, continuedFrom: continueFrom || undefined, fixtureHashes: frozen.hashes, selected: cases.map((c: any) => c.id),
    guidanceRevision: guidance?.commit, replayedSourceHashes: guidance && Object.fromEntries(Object.entries(guidance.sources).map(([file, body]) => [file, hash(body)])),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceOverlays: overlays, sources: Object.fromEntries(Object.entries(sourceContents).map(([path, contents]) => [path, hash(contents)])),
    sourceDiff: execFileSync("git", ["diff", "--", "src"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }),
    turnTimeoutMs: 360_000, providerTimeoutMs: 150_000, concurrency: 2,
    boundary: "Live production Career LLM and Decisions; actual schemas/runtime; frozen tool source evidence; production document authoring with memory persistence; no real external actions." });
  const jobs = cases.flatMap((scenario: any) => Array.from({ length: repeat }, (_, i) => ({ scenario, iteration: i + 1 })));
  const results: any[] = []; let cursor = 0;
  type ConversationState = {
    previous: NonNullable<Parameters<typeof selectCareerPreloads>[0]["input"]["previous"]>;
    handbooks: Parameters<typeof selectCareerPreloads>[0]["activeHandbooks"];
  };
  const conversationStates = new WeakMap<ReturnType<typeof createCareerAutonomyFixture>, ConversationState>();
  const runCase = async ({ scenario, iteration }: any, carriedDocuments?: any[], activeSandbox?: ReturnType<typeof createCareerAutonomyFixture>) => {
    const event = scenario.backgroundRun;
    const onboardingComplete = event?.trigger === "conversation_completed";
    const continuesChat = onboardingComplete || event?.trigger === "gmail_connected";
    const background = Boolean(event) && !continuesChat;
    const scheduledWork = Boolean(event && isScheduledCareerRun(event));
    const turnModel = scheduledWork ? scheduledModel.assistantModel : model.model;
    return scope.run({ caseId: scenario.id, iteration, model: turnModel }, async () => {
      const requestTime = scenario.requestTime ?? fixture.requestTime;
      const began = Date.now(), sandbox = activeSandbox ?? createCareerAutonomyFixture(scenario, requestTime, carriedDocuments);
      if (scenario.priorContextWrites && !activeSandbox) {
        for (const input of scenario.priorContextWrites) await sandbox.execute({ name: "write_talent_context", input });
      }
      const callOffset = sandbox.calls.length;
      const signal = AbortSignal.timeout(360_000);
      const selected = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, background, responseLocale: "ko", hasActiveGmailIntegration: scenario.gmail });
      const messages = [...(scenario.history ?? []), ...(scenario.backgroundRun ? [] : [{ role: "user" as const, content: scenario.message }])];
      if (event?.trigger === "gmail_connected") {
        messages.push({ role: "user", content: formatCareerApplicationEvent(GMAIL_CONNECTED_APPLICATION_EVENT) });
      }
      const eventContext = event ? renderCareerBackgroundInvocation(event) : "";
      const lastSearchText = await sandbox.latestSearchText();
      const prior = scenario.useSearchReceipts ? conversationStates.get(sandbox) : undefined;
      const activeHandbooks = prior?.handbooks?.filter(book => book.id !== "proactive_career" || background);
      // Foreground requests preload from chat and the previous execution. The current
      // resource index is delivered to the assistant after the selection, as in chatTurn.
      const selectorContext = scenario.useSearchReceipts
        ? (event ? [`Gmail: ${scenario.gmail ? "available" : "not_connected"}.`, eventContext].filter(Boolean).join("\n") : undefined)
        : [`Gmail: ${scenario.gmail ? "available" : "not_connected"}.`, eventContext, sandbox.referencesText()].filter(Boolean).join("\n");
      const preloads = background ? CAREER_BACKGROUND_PRELOAD : await selectCareerPreloads({ eligibleNames: new Set(selected.toolNames), eligibleTools: selected.tools,
        input: { messages, currentContext: selectorContext, previous: prior?.previous }, activeHandbooks, signal });
      const runtime = new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: selected.tools, handbooks: activeHandbooks, selection: preloads, abortSignal: signal, adaptPromptBlocks: guidance?.adaptPromptBlocks,
        promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: scenario.accountProfile ?? null, structuredProfileText: sandbox.promptProfileText(onboardingComplete),
          backgroundInvocation: background, scheduledWork, conversationVersion: scenario.conversationVersion,
          postOnboardingContext: scenario.postOnboardingContext, includePostOnboardingConversationGuide: onboardingComplete || scenario.entryContinuation === true,
          talentContextSection: sandbox.contextText(), runtimeInstruction: [fixture.environment, sandbox.referencesText(), lastSearchText, eventContext].filter(Boolean).join("\n\n"), gmailCapability: scenario.gmail ? "available" : "not_connected",
          currentPreferences: { preferredLocale: "ko", talentSettingStatus: "active", profileVisibility: "private" }, requestTime: new Date(requestTime), timeZone: "Asia/Seoul" }) });
      const first = runtime.resolveStep(false), intermediate: string[] = [];
      const ajv = new Ajv({ strict: false, allowUnionTypes: true, validateFormats: false });
      const validators = new Map(selected.tools.map(tool => [tool.function.name, ajv.compile(tool.function.parameters)]));
      let reply = "", error: string | undefined;
      try {
        reply = await runCareerChatAssistant({ primaryModel: scope.getStore()!.model, openAIResponsesReasoningEffort: model.openAIResponsesReasoningEffort,
          anthropicEffort: scheduledWork ? scheduledModel.assistantAnthropicEffort : undefined,
          responseLocale: "ko", messages, tools: first.tools, systemBlocks: first.systemBlocks, toolRuntime: runtime, stopAfterToolNames: selected.stopAfterToolNames,
          abortSignal: signal, usageLabel: `eval/career-agent-autonomy/${scenario.id}`,
          onAssistantMessage: text => { intermediate.push(text); },
          executeTool: async call => { const validate = validators.get(call.name); assert.ok(validate); if (!validate(call.input)) throw new Error(ajv.errorsText(validate.errors)); return sandbox.execute(call); } });
      } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
      const completed = runtime.completedRecord();
      if (scenario.useSearchReceipts && !error) {
        conversationStates.set(sandbox, {
          previous: {offeredCapabilities: completed.offered, toolResults: completed.toolResults, handbooks: completed.handbooks},
          handbooks: runtime.handbooks.afterDeliveredReply(),
        });
      }
      const result = { caseId: scenario.id, iteration, elapsedMs: Date.now() - began, preloads, intermediateVisible: !event, intermediate, reply, error,
        calls: sandbox.calls.slice(callOffset), state: sandbox.state(), runtime: completed };
      if (!activeSandbox) await sandbox.close();
      save(`${scenario.id}-${iteration}`, result); results.push(result); save("results", results);
      normalConsole.log(JSON.stringify({ caseId: scenario.id, iteration, elapsedMs: result.elapsedMs, tools: result.calls.map(c => c.name), error }));
      return result;
    });
  };
  normalConsole.log(`Run directory: ${dir}`);
  try { await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      if (job.scenario.followups?.length) {
        const scenario = structuredClone(job.scenario);
        const { followups, ...initial } = scenario;
        const sandbox = createCareerAutonomyFixture(initial, fixture.requestTime);
        const history: { role: "user" | "assistant"; content: string }[] = [...(initial.history ?? [])];
        try {
          let latest = await runCase({ scenario: initial, iteration: job.iteration }, undefined, sandbox);
          for (const [index, turn] of (firstTurnOnly ? [] : followups).entries()) {
            if (latest.error) break;
            for (const content of [...(latest.intermediateVisible ? latest.intermediate : []), latest.reply].filter(Boolean)) history.push({ role: "assistant", content });
            if (turn.gmail !== undefined) { initial.gmail = turn.gmail; initial.gmailMessages = turn.gmailMessages; }
            if (turn.gmail) {
              const connection = { ...initial, id: turn.id + "_connected", history,
                backgroundRun: { ...initial.backgroundRun, trigger: "gmail_connected", trigger_payload: {} } };
              latest = await runCase({ scenario: connection, iteration: job.iteration }, undefined, sandbox);
              for (const content of [...(latest.intermediateVisible ? latest.intermediate : []), latest.reply].filter(Boolean)) history.push({ role: "assistant", content });
              if (latest.error) break;
            }
            sandbox.appendUserMessage(index + 2, turn.message);
            const entry = initial.postOnboardingContext?.entryOpportunity;
            const postOnboardingContext = entry ? { entryOpportunity: { ...entry, postingDetails: null } } : undefined;
            const next = { ...initial, id: turn.id, backgroundRun: undefined, message: turn.message, history, postOnboardingContext };
            latest = await runCase({ scenario: next, iteration: job.iteration }, undefined, sandbox);
            history.push({ role: "user", content: turn.message });
          }
        } finally { await sandbox.close(); }
        continue;
      }
      const first = continueFrom
        ? JSON.parse(readFileSync(`${task}/runs/${continueFrom}/${job.scenario.id}-${job.iteration}.json`, "utf8"))
        : await runCase(job);
      if (job.scenario.nextConversation) {
        assert.equal(first.caseId, job.scenario.id);
        assert.equal(first.iteration, job.iteration);
        if (continueFrom) save(`continued-documents-${job.scenario.id}-${job.iteration}`, { sha256: hash(JSON.stringify(first.state.documents)) });
        const scenario = { ...job.scenario, ...job.scenario.nextConversation, history: [], documents: [], nextConversation: undefined };
        await runCase({ scenario, iteration: job.iteration }, first.state.documents);
      }
    }
  })); }
  finally { globalThis.fetch = originalFetch; Object.assign(console, normalConsole); save("requests", requests); save("blocked-network", blocked); }
  if (process.argv.includes("--review")) {
    // Only after the last provider call. Each referenced JSON also contains the exact tool results and final fixture state.
    const gold = jsonFile(`${task}/gold-${dataset}.json`);
    writeFileSync(`${dir}/review.md`, renderReview(dataset, cases, results, gold), { mode: 0o600 });
    normalConsole.log(`Review: ${dir}/review.md`);
  }
  normalConsole.log(`Saved ${results.length} results: ${dir}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
