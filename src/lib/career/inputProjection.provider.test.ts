import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { formatCareerMatchingResult } from "./matching/formatters";
import { formatProfileToolResult } from "./profiles/tools";
import { formatCareerSchedules } from "./schedules/server";
import { renderCareerBackgroundInvocation } from "./background/prompt";
import { formatCareerCoachingSnapshot } from "./prompts/cases/coachingPrompts";
import { buildScoringInput } from "../externalRecommendationsV2/scoringInput";
import { formatRoleContextForModel } from "../talentOnboarding/roleContextFormat";
import { withTalentToolAssistantInstruction } from "../talentOnboarding/tools";
import { formatToolResultText } from "../llm/promptText";

const time = "2026-10-29T18:05:06.789Z";
const criteria = [{ name: "Backend", criterionDefinition: "Own production systems", label: "excellent", distribution: [{ probability: 0.9 }] }];
const matching = {
  runId: "run-1", source: "internal", status: "partial", evaluationCursor: "cursor-exact",
  evaluations: [1, 2].map(id => ({ id: `evaluation-${id}`, role_id: "role-1", stage: 2, evaluated_at: time,
    assessment: { candidateFit: 71.26, companyFit: 83.78, mutualFit: 77.99, criteria: structuredClone(criteria), raw: "PRIVATE_DB_SENTINEL" } })),
  failures: [{ roleId: "role-2", error: "source unavailable" }],
};
const targets = { companyFollowupIds: ["followup-1"], role: { roleId: "role-1", observedAt: time }, documents: [{ documentId: "doc-1", revision: 4 }], exactRevision: time };
const schedule: any = { id: "schedule-1", revision: 3, status: "active", title: "Review", instruction: `User's original text ${time}`,
  next_run_at: time, recurrence: null, timezone: "Asia/Seoul", target_refs: targets };

test("matching projection preserves assessments, different criteria versions, failures and page boundaries", () => {
  const text = formatCareerMatchingResult(matching);
  assert.equal(text.split("Own production systems").length - 1, 1);
  for (const fact of ["criteria1: excellent", "candidateFit: 71", "evaluation-2", "cursor-exact", "role-2: source unavailable", "2026-10-30 03:05"]) assert.ok(text.includes(fact), fact);
  assert.doesNotMatch(text, /distribution|probability|PRIVATE_DB_SENTINEL|\[object Object\]/);
  const changed = structuredClone(matching);
  changed.evaluations[1].assessment.criteria[0].criterionDefinition = "Changed criterion";
  assert.match(formatCareerMatchingResult(changed), /Criteria set 2; role role-1/);
  const stageOne = formatCareerMatchingResult({ evaluations: [{ id: "screen", role_id: "role-1", stage: 1, assessment: { decision: "exclude", workScreen: "continue", candidatePracticalScreen: "exclude" } }] });
  assert.match(stageOne, /candidatePracticalScreen: exclude/);
  assert.match(stageOne, /no numeric scores/);
});

test("schedule read and background context preserve nested targets, source prose and exact revision", () => {
  const text = formatCareerSchedules([schedule]);
  const background = renderCareerBackgroundInvocation({ id: "run", trigger: "schedule", created_at: time,
    trigger_payload: { sourceEvents: [{ sourceKind: "schedule", sourceId: "schedule-1", revision: 3, targetRefs: targets }] } } as any);
  for (const output of [text, background]) {
    for (const fact of ["role.roleId: role-1", "role.observedAt: 2026-10-30 03:05", "documents[1].documentId: doc-1", `exactRevision: ${time}`, "companyFollowupIds: followup-1"]) assert.ok(output.includes(fact), fact);
    assert.doesNotMatch(output, /\[object Object\]|read the associated target|read_schedule for full target context/);
  }
  assert.ok(text.includes(`User's original text ${time}`));
});

test("actual provider receives dedicated readable projections, not raw tool objects", async () => {
  const originalFetch = globalThis.fetch;
  const externalMatching = {
    runId: "external-run", source: "external", status: "partial", evaluationCursor: "external-cursor",
    roleIds: ["external-role", "failed-role"], error: "Evaluation interrupted",
    runs: [{ id: "external-run", status: "partial", created_at: time, candidate_role_ids: ["external-role", "failed-role"], evaluation_ids: ["external-evaluation"],
      error: "Evaluation interrupted", request: { profileId: "evaluation-profile", profileRevision: 4 },
      input_snapshot: { behavior_version: 14, search_brief: [{ label: "Location", content: "Korea" }], matching_scope: "Local roles" } }],
    evaluationCount: 2, remainingEvaluationCount: 1, failures: [{ roleId: "failed-role", error: "Role evaluation unavailable" }],
    evaluations: [{ id: "external-evaluation", role_id: "external-role", evaluated_at: time,
      assessment: { fit: { mutualFit: 67.75, candidateInterest: 33.99, companyInterest: 88.29,
        roleFit: 74.25, constraintPass: 96.09, evidence: "partial" } } }],
  };
  const originalAssessments = structuredClone([matching, externalMatching]);
  const profileText = formatProfileToolResult("read_profile", { profileId: "profile-1", revision: 2, title: "Tailored",
    sections: ["experience", "education"], snapshot: { talentUser: { name: "Synthetic", email: "not-selected@example.invalid" },
      talentExperiences: [{ id: 5, role: "Engineer", company_name: "Example", start_date: "2020-01", end_date: time, description: `Original statement ${time}` },
        { id: 7, role: "Researcher", company_name: "Another", start_date: "2024-01", end_date: null, memo: "User said they left this role last month." }],
      talentEducations: [{ id: 6, degree: "BS", field: "Computer Science", school: "Example University", start_date: "2016", end_date: "2020" }], talentExtras: [] } });
  assert.ok(profileText.includes("start: 2020-01 · end: 2026-10-30 03:05"));
  assert.ok(profileText.includes("Computer Science"));
  assert.ok(profileText.includes(`Original statement ${time}`));
  assert.ok(profileText.includes("start: 2024-01 · end: not recorded; current employment/enrollment unconfirmed"));
  assert.ok(profileText.includes("User said they left this role last month."));
  assert.ok(profileText.includes("Other sections were not read"));
  assert.ok(!profileText.includes("not-selected@example.invalid"));
  const coaching = formatCareerCoachingSnapshot({ messageId: 8, revision: 2, status: "active", topic: "Next role", agenda: ["Compare scope"], channel: "chat", plannedMinutes: 20, suggestedMinutes: null } as any);
  const roleText = formatRoleContextForModel([{ found: true, roleId: "external-role", role: { name: "Engineer", postedAt: time },
    companyDb: { employeeCountRange: { start: 11, end: 50 } }, recommendation: { recommendedAt: time, fitReasons: [], tradeoffs: [], preferenceFit: {} } }]);
  const outputs = { read_matching: formatCareerMatchingResult(matching), search_opportunities: formatCareerMatchingResult(externalMatching),
    get_role_context: roleText, read_recommended_opportunities: formatToolResultText(withTalentToolAssistantInstruction({ returnedCount: 0, totalMatchingCount: 0, opportunities: [] })),
    read_profile: profileText, read_schedule: formatCareerSchedules([schedule]) };
  const tools = Object.keys(outputs).map(name => ({ type: "function" as const, function: { name, description: name, parameters: { type: "object", properties: {} } } }));
  let activeTools = tools.slice(0, 3);
  let calls = 0;
  let rendered = "";
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://evaluation.invalid/")) return Response.json([]);
      assert.ok(String(url).startsWith("https://api.openai.com/"));
      const request = JSON.parse(String(init?.body));
      calls++;
      if (calls % 2 === 0) {
        const results = (request.input ?? []).filter((item: any) => item.type === "function_call_output");
        assert.equal(results.length, activeTools.length);
        assert.ok(results.every((item: any) => typeof item.output === "string"));
        rendered += results.map((item: any) => item.output).join("\n\n") + "\n\n";
      }
      return Response.json({ id: `r${calls}`, model: "gpt-6-luna", status: "completed", output: calls % 2 === 1
        ? activeTools.map((tool, index) => ({ type: "function_call", call_id: `call-${calls}-${index}`, name: tool.function.name, arguments: "{}" }))
        : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Checked." }] }], usage: { input_tokens: 1, output_tokens: 1 } });
    };
    const { runCareerChatAssistant } = await import("./llm");
    // Stay within the runtime's per-turn tool budget while checking every projection.
    for (const batch of [tools.slice(0, 3), tools.slice(3)]) {
      activeTools = batch;
      const response = await runCareerChatAssistant({ primaryModel: "gpt-6-luna", openAIResponsesReasoningEffort: "high", messages: [], systemBlocks: [{ text: coaching }], tools: batch,
        executeTool: async ({ name }: { name: string }) => ({ raw: "PRIVATE_DB_SENTINEL", modelOutput: outputs[name as keyof typeof outputs] }) });
      assert.equal(response, "Checked.");
    }
    assert.equal(calls, 4);
    for (const output of Object.values(outputs)) assert.ok(rendered.includes(output));
    for (const score of ["candidateFit: 71.2", "companyFit: 83.7", "mutualFit: 77.9",
      "mutualFit: 67.7", "candidateInterest: 33.9", "companyInterest: 88.2", "roleFit: 74.2", "constraintPass: 96"])
      assert.ok(rendered.includes(score), score);
    assert.doesNotMatch(rendered, /(?:mutualFit|candidateInterest|companyInterest|roleFit|constraintPass|candidateFit|companyFit): \d+\.\d{2,}/);
    assert.ok(rendered.includes("external-cursor"));
    assert.equal(rendered.split("Run external-run").length - 1, 1);
    assert.equal(rendered.split("Evaluation interrupted").length - 1, 1);
    for (const fact of ["status partial", "evaluated 1/2", "profile evaluation-profile, revision 4", "Location: Korea", "Local roles",
      "1 remaining after this page", "Incomplete role failed-role: Role evaluation unavailable", "Company size: 11–50 team members",
      "Posted: 2026-10-30 03:05", "Recommended: 2026-10-30 03:05", "returnedCount: 0"])
      assert.ok(rendered.includes(fact), fact);
    assert.doesNotMatch(rendered, /Behavior version|introduction acceptance|Fit reasons:|Tradeoffs:|Preference fit:|assistantInstruction:/);
    assert.doesNotMatch(rendered, /PRIVATE_DB_SENTINEL|\[object Object\]|"assessment"|"target_refs"/);
    assert.deepEqual([matching, externalMatching], originalAssessments);
    if (process.env.CAREER_INPUT_AUDIT_OUTPUT) await writeFile(process.env.CAREER_INPUT_AUDIT_OUTPUT, `${coaching}\n\n${rendered}\n\n${buildScoringInput({ profile: { name: "Synthetic", experiences: [{ role: "Engineer", company_name: "Example", start_date: "2020", end_date: time }] }, search_brief: [{ label: "Location", content: "Remote" }] }, [])}`, { mode: 0o600 });
  } finally { globalThis.fetch = originalFetch; }
});
