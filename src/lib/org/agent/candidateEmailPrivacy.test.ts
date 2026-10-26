import assert from "node:assert/strict";
import test from "node:test";
import { createCandidateEmailPrivacy, projectCandidateEmailPrivacy } from "./candidateEmailPrivacy";
import { serializeOrgAgentToolResult } from "./promptFormat";

const privateEmail = "Candidate+qa@example.invalid";
const companyEmail = "recruiter@example.invalid";

for (const stage of ["pending_connection", "company_intro", "intro_requested"]) {
  test(`${stage}: list, single/batch detail and connection preparation omit candidate email`, () => {
    const candidate = { talentId: "talent", name: privateEmail, email: privateEmail };
    const detail = { candidate, positions: [{ stage, roleId: "role" }],
      profile: { bio: `Contact <mailto:${privateEmail}|email>` },
      requestHistory: [{ candidateEmailBody: `Reply to ${privateEmail}`, candidateEmailSubject: "Hello" }] };
    const cases = [
      ["get_talents", { items: [{ candidate, stage }] }],
      ["read_talent", detail],
      ["read_talent", { items: [detail], requestedCount: 1, returnedCount: 1 }],
      ["prepare_candidate_connection", { candidateEmail: privateEmail, candidateName: privateEmail,
        currentStage: stage, introEmails: [companyEmail], requesterEmail: companyEmail }],
    ] as const;
    for (const [name, value] of cases) {
      const result = serializeOrgAgentToolResult(name, value);
      assert.ok(!result.toLowerCase().includes(privateEmail.toLowerCase()), name);
    }
    assert.equal(detail.candidate.email, privateEmail, "executor/delivery input stays intact");
    assert.equal(detail.profile.bio, `Contact <mailto:${privateEmail}|email>`);
  });
}

test("connected and custom stages retain addresses; a mixed Role read uses the private boundary", () => {
  for (const stage of ["connected", "custom:interview", "final_offer"]) {
    const row = { candidate: { email: privateEmail }, positions: [{ stage }] };
    assert.deepEqual(projectCandidateEmailPrivacy(row), row);
    const mixed = projectCandidateEmailPrivacy({ ...row, positions: [{ stage }, { stage: "pending_connection" }] });
    assert.ok(!JSON.stringify(mixed).includes(privateEmail));
  }
});

test("last input boundary covers history, contacts, errors, arguments and company events", async () => {
  const protect = createCandidateEmailPrivacy(async emails => emails.filter(email => email === privateEmail.toLowerCase()));
  const messages = [
    { role: "user", content: `Company ${companyEmail}; historical address ${privateEmail.toUpperCase()}; 주소는${privateEmail}로 보내세요. candidate_email=${privateEmail}` },
    { role: "tool", content: JSON.stringify({ candidate: { email: privateEmail },
      sender: { email: companyEmail }, recipients: [{ email: privateEmail }],
      error: `Delivery to ${privateEmail} failed`, body: `Contact: ${privateEmail}` }) },
    { role: "assistant", tool_calls: [{ function: { arguments: JSON.stringify({ query: privateEmail }) } }] },
    { role: "user", content: [{ type: "text", text: `company_update ${privateEmail}` }] },
  ];
  const sanitized = JSON.stringify(await protect(messages));
  assert.ok(!sanitized.toLowerCase().includes(privateEmail.toLowerCase()));
  assert.ok(sanitized.includes(companyEmail));
  assert.ok(JSON.stringify(messages).includes(privateEmail), "source records remain unchanged");
});

test("privacy lookup failure aborts model-input preparation", async () => {
  const protect = createCandidateEmailPrivacy(async () => { throw Error("unavailable"); });
  await assert.rejects(protect({ content: privateEmail }), /unavailable/);
});

test("no email makes no privacy query; protected addresses stay blocked within a turn", async () => {
  let calls = 0;
  const protect = createCandidateEmailPrivacy(async emails => { calls++; return calls === 1 ? emails : []; });
  assert.deepEqual(await protect({ content: "Hello" }), { content: "Hello" });
  assert.equal(calls, 0);
  assert.ok(!(await protect(privateEmail)).includes(privateEmail));
  assert.ok(!(await protect(privateEmail)).includes(privateEmail));
  assert.equal(calls, 1);
});
