import assert from "node:assert/strict";
import test from "node:test";
import { readIntroductionContexts } from "./introductionContext.server";
import { formatIntroductionContext } from "./introductionContext";
import { formatRoleContextForModel } from "@/lib/talentOnboarding/roleContextFormat";
import { renderCompanyReplyEmail } from "@/lib/email/runtime/format";

const row = { id: "root", talent_id: "talent", role_id: "role", recommendation_id: "rec", candidate_name: "김서윤", created_at: "2026-11-04T06:00:00Z" };
test("correspondence carries recorded origin independently of its free-form body", async () => {
  const inputs: any[] = [];
  const contexts = await readIntroductionContexts(async (_sql, params) => {
    inputs.push(params);
    return [
      { ...row, opportunity_type: "internal_recommendation" },
      { ...row, id: "company", opportunity_type: "intro_request", company_intro_id: "intro", requested_at: "2026-11-03T06:00:00Z", candidate_sent_at: "2026-11-03T06:03:00Z" },
      { ...row, id: "unknown", opportunity_type: "intro_request" },
    ];
  }, ["root", "company", "unknown", "root"]);
  assert.deepEqual(inputs, [[["root", "company", "unknown"]]]);
  assert.equal(contexts[0].origin?.kind, "candidate_request");
  assert.equal(contexts[1].origin?.kind, "company_intro");
  assert.equal(contexts[2].origin, null);
  assert.match(formatIntroductionContext(contexts[0]), /후보자의 연결 요청/);
  assert.match(formatIntroductionContext(contexts[1]), /회사에서 먼저 요청한 Intro/);
  assert.match(formatIntroductionContext(contexts[1]), /Company Intro sent to candidate: 2026-11-03 15:03/);
  assert.match(formatIntroductionContext(contexts[2]), /not recorded/);
});

test("an empty authorized page performs no relationship lookup", async () => {
  assert.deepEqual(await readIntroductionContexts(async () => { throw Error("unexpected query"); }, []), []);
});

test("self-initiated opportunity provenance is projected only to the company reader", async () => {
  const query = async () => [
    { ...row, opportunity_type: "internal_recommendation", candidate_initiated_opportunity: true },
    { ...row, id: "recommended", opportunity_type: "internal_recommendation", candidate_initiated_opportunity: false },
  ];
  const company = await readIntroductionContexts(query, ["root", "recommended"], { companyAudience: true });
  const career = await readIntroductionContexts(query, ["root", "recommended"]);
  assert.equal(company[0].candidateInitiatedOpportunity, true);
  assert.equal(company[1].candidateInitiatedOpportunity, undefined);
  assert.ok(career.every(item => !("candidateInitiatedOpportunity" in item)));
  assert.match(formatIntroductionContext(company[0]), /saved after the candidate chose this Role/);
  assert.doesNotMatch(formatIntroductionContext(career[0]), /Opportunity creation:/);
});

test("Career reads opportunity origin before choosing an introduction action", () => {
  const render = (opportunityType: string) => formatRoleContextForModel([{ found: true, roleId: "role", role: { sourceType: "internal" }, recommendation: { opportunityType } }]);
  assert.match(render("intro_request"), /Company-originated Intro proposal/);
  assert.match(render("internal_recommendation"), /discovered or recommended through Harper/);
});

test("company email renders the authored message without an origin label", () => {
  const rendered = renderCompanyReplyEmail("검토 후 연락주세요.", "workspace");
  assert.equal(rendered.text, "검토 후 연락주세요.");
});
