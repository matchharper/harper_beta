import assert from "node:assert/strict";
import test from "node:test";
import {
  VENDOR_MAX_USD, readVendorAnswer, settleVendorLookup, vendorAddressProblem, vendorAsks, vendorProfileUrl, vendorSkip,
  type VendorAskResult,
} from "./vendorEmail";
import type { AgentPerson } from "./types";

const person = {
  name: "Jane Doe", profileUrl: "https://kr.linkedin.com/in/jane-doe-1a2b/", contactUrl: null as string | null,
  currentCompany: "Acme Labs", method: "signal_post" as AgentPerson["method"], source: "linkedin", emailLookup: null as AgentPerson["emailLookup"],
};

test("treg is asked by the LinkedIn profile only, in one form", () => {
  assert.equal(vendorProfileUrl(person), "https://www.linkedin.com/in/jane-doe-1a2b");
  assert.equal(vendorProfileUrl({ profileUrl: "linkedin.com/in/jane?trk=x", contactUrl: null }), "https://www.linkedin.com/in/jane");
  assert.equal(vendorProfileUrl({ profileUrl: "https://janedoe.dev", contactUrl: "https://www.linkedin.com/in/jane-d" }), "https://www.linkedin.com/in/jane-d");
  // LinkedIn's mobile host too; another site whose name ends in linkedin is not LinkedIn.
  assert.equal(vendorProfileUrl({ profileUrl: "https://m.linkedin.com/in/jane-doe", contactUrl: null }), "https://www.linkedin.com/in/jane-doe");
  assert.equal(vendorProfileUrl({ profileUrl: "https://notlinkedin.com/in/jane-doe", contactUrl: null }), null);
  // A post or a company page is not a profile.
  assert.equal(vendorProfileUrl({ profileUrl: "https://www.linkedin.com/posts/jane-doe_activity-1", contactUrl: null }), null);
  assert.equal(vendorProfileUrl({ profileUrl: "https://www.linkedin.com/company/acme", contactUrl: null }), null);
  assert.equal(vendorProfileUrl({ profileUrl: null, contactUrl: null }), null);
});

test("who treg is asked about: the switch on, not people who came with their addresses, once, with a profile", () => {
  assert.equal(vendorSkip(person, true), null);
  assert.equal(vendorSkip(person, false), "off");
  for (const method of ["applicant", "db", "request"] as const) assert.equal(vendorSkip({ ...person, method }, true), "own_addresses_only", method);
  // A company's own applicant list (applicantList.ts) is the applicant file too.
  assert.equal(vendorSkip({ ...person, source: "applicants-acme-labs" }, true), "own_addresses_only");
  const asked = { runId: "r", startedAt: "2026-11-26T00:00:00.000Z", state: "done" as const, vendor: settleVendorLookup(new Date(), []).record };
  assert.equal(vendorSkip({ ...person, emailLookup: asked }, true), "asked");
  assert.equal(vendorSkip({ ...person, profileUrl: "https://janedoe.dev" }, true), "no_profile");
});

test("what is asked: the personal mailbox, then the current company's address only when it could be used", () => {
  assert.deepEqual(vendorAsks(person, true), ["personal", "work"]);
  assert.deepEqual(vendorAsks(person, false), ["personal"]);
  // The layoff search's people: their LinkedIn company may be the one that let them go.
  assert.deepEqual(vendorAsks({ ...person, method: "layoff_company" }, true), ["personal"]);
  assert.deepEqual(vendorAsks({ ...person, currentCompany: " " }, true), ["personal"]);
  // A company named only in Korean can never be tied to a domain: its work address would be paid for and thrown away.
  assert.deepEqual(vendorAsks({ ...person, currentCompany: "쿠팡" }, true), ["personal"]);
  assert.deepEqual(vendorAsks({ ...person, currentCompany: "(주)Acme" }, true), ["personal", "work"]);
  // The personal ceiling leaves out the $0.60 vendor (treg catalog 11/26).
  assert.ok(VENDOR_MAX_USD.personal < 0.6 && VENDOR_MAX_USD.work <= VENDOR_MAX_USD.personal);
});

test("treg's answer: the address only from a 200, its mailbox check unless still running, what it cost", () => {
  const body = (email: string | null, verification: Record<string, unknown> | null) => ({
    output: { email }, raw: {}, _treg: { served_by: "vendor-a", charged_micro: 40_000, ...(verification ? { verification } : {}) },
  });
  assert.deepEqual(readVendorAnswer(200, body("Jane.Doe@Gmail.com", { verdict: "Valid", cost_micro: 2_000 }), { costMicro: "42000", servedBy: "vendor-a" }), {
    email: "jane.doe@gmail.com", verdict: "valid", servedBy: "vendor-a", costUsd: 0.042,
  });
  // No header: the body's charge and the check's.
  assert.equal(readVendorAnswer(200, body("jane.doe@gmail.com", { verdict: "valid", cost_micro: 2_000 })).costUsd, 0.042);
  // A call treg did not bill (cost 0) costs nothing. A replay (the same Idempotency-Key) is handed back at cost 0 but
  // counts the first call's charge, which the run has not logged yet (it logs once the person is written).
  assert.equal(readVendorAnswer(200, body("jane.doe@gmail.com", { verdict: "valid" }), { costMicro: "0" }).costUsd, 0);
  assert.equal(readVendorAnswer(200, body("jane.doe@gmail.com", { verdict: "valid" }), { costMicro: "0", originalCostMicro: "42000", replayed: true }).costUsd, 0.042);
  assert.equal(readVendorAnswer(200, body("jane.doe@gmail.com", { verdict: "valid" }), { costMicro: "0", replayed: true }).costUsd, 0.04);
  assert.equal(readVendorAnswer(200, body("jane.doe@gmail.com", { pending: true, verdict: "valid" })).verdict, null);
  assert.equal(readVendorAnswer(200, body("jane.doe@gmail.com", null)).verdict, null);
  assert.equal(readVendorAnswer(200, body(null, { verdict: "valid" })).email, null);
  assert.equal(readVendorAnswer(200, body("not an address", { verdict: "valid" })).email, null);
  // 202 (a vendor still working) and anything else: no address. A 202 may still be billed: what it holds counts.
  assert.equal(readVendorAnswer(202, body("jane.doe@gmail.com", { verdict: "valid" })).email, null);
  assert.equal(readVendorAnswer(202, { _treg: { outcome: "pending", reserved_micro: 300_000, charged_micro: null } }, { costMicro: "0" }).costUsd, 0.3);
  assert.equal(readVendorAnswer(404, null).email, null);
  assert.equal(readVendorAnswer(200, "garbage").costUsd, 0);
});

test("an address treg gives is used only when its mailbox takes mail, it holds their name and the address rule allows it", () => {
  const answer = (email: string | null, verdict: string | null = "valid") => ({ email, verdict });
  assert.equal(vendorAddressProblem(answer("jane.doe@gmail.com"), person, true), null);
  assert.equal(vendorAddressProblem(answer(null), person, true), "not_found");
  for (const verdict of ["invalid", "accept_all", "unknown", null]) {
    assert.equal(vendorAddressProblem(answer("jane.doe@gmail.com", verdict), person, true), "not_verified", String(verdict));
  }
  // No piece of their name of 4 letters or more: maybe not theirs (no page to check it on).
  assert.equal(vendorAddressProblem(answer("jd1987@gmail.com"), person, true), "no_name");
  assert.equal(vendorAddressProblem(answer("doe@gmail.com"), person, true), "no_name");
  // Their current company's address, only with 회사 주소 쓰기 on; another company's or a team's address never.
  assert.equal(vendorAddressProblem(answer("jane.doe@acmelabs.com"), person, true), null);
  assert.equal(vendorAddressProblem(answer("jane.doe@acmelabs.com"), person, false), "not_mailable");
  assert.equal(vendorAddressProblem(answer("jane.doe@oldjob.example"), person, true), "not_mailable");
  assert.equal(vendorAddressProblem(answer("jane.doe@acmelabs.com"), { ...person, method: "layoff_company" }, true), "not_mailable");
  // A name the agent knows only in Korean: the one their handle spells counts.
  assert.equal(vendorAddressProblem(answer("haneul.kim@gmail.com"), { ...person, name: "김하늘", profileUrl: "https://www.linkedin.com/in/haneul-kim-1a2b" }, true), null);
});

test("the person's treg record and timeline line", () => {
  const at = new Date("2026-11-26T07:00:00.000Z");
  const ask = (patch: Partial<VendorAskResult>): VendorAskResult => ({
    ask: "personal", verdict: "valid", servedBy: "vendor-a", costUsd: 0.04, reason: null, ...patch,
  });
  const used = settleVendorLookup(at, [ask({})]);
  assert.deepEqual(used.record, { at: "2026-11-26T07:00:00.000Z", asks: [ask({})], used: true, kind: "personal", costUsd: 0.04 });
  assert.equal(used.note, "treg로 개인 메일을 찾았어요 · vendor-a · $0.040");
  const work = settleVendorLookup(at, [ask({ reason: "not_found", verdict: null, servedBy: null, costUsd: 0 }), ask({ ask: "work", costUsd: 0.01 })]);
  assert.equal(work.record.kind, "work");
  assert.equal(work.note, "treg로 지금 회사 메일을 찾았어요 · vendor-a · $0.010");
  assert.equal(work.record.costUsd, 0.01);
  const none = settleVendorLookup(at, [
    ask({ reason: "not_verified", verdict: "accept_all" }), ask({ ask: "work", reason: "not_mailable", verdict: "valid", costUsd: 0.01 }),
  ]);
  assert.equal(none.record.used, false);
  assert.equal(none.note, "개인 메일: treg가 준 주소가 메일함 확인을 통과하지 못했어요 (확인 결과 accept_all) / 지금 회사 메일: treg가 준 주소가 보낼 수 없는 주소예요 (지금 회사가 아닌 회사 주소, 공용 주소) (확인 결과 valid) · $0.050");
  const refused = settleVendorLookup(at, [ask({ reason: "failed", verdict: null, servedBy: null, costUsd: 0, httpStatus: 402 })]);
  assert.equal(refused.note, "treg가 답하지 않았어요 (402)");
  assert.equal(settleVendorLookup(at, [ask({ reason: "not_found", verdict: null, costUsd: 0 })]).note, "treg도 주소를 못 찾았어요");
});
