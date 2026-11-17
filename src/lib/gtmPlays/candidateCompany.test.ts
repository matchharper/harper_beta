import assert from "node:assert/strict";
import test from "node:test";
import { candidateCompanyName, candidateRoleTitle, gtmRoleFactsFromInformation } from "./candidateCompany";

test("a GTM Role is read with its own company; every other Role with its workspace", () => {
  const gtm = gtmRoleFactsFromInformation({ purpose: "gtm_outreach", testOnly: true, gtm: { companyName: "Acme Pay" } });
  assert.equal(candidateCompanyName("Harper 추천", gtm), "Acme Pay");
  assert.equal(candidateRoleTitle("Acme Pay · Backend Engineer", gtm), "Backend Engineer");
  assert.equal(candidateRoleTitle("acme pay · Backend Engineer", gtm), "Backend Engineer");
  assert.equal(candidateRoleTitle("Backend Engineer", gtm), "Backend Engineer");

  const customer = gtmRoleFactsFromInformation({ gtm: { companyName: "Acme Pay" } });
  assert.equal(candidateCompanyName("Customer Inc", customer), "Customer Inc");
  assert.equal(candidateRoleTitle("Acme Pay · Backend Engineer", customer), "Acme Pay · Backend Engineer");

  const empty = gtmRoleFactsFromInformation({ purpose: "gtm_outreach", gtm: { companyName: "  " } });
  assert.equal(candidateCompanyName("Harper 추천", empty), "Harper 추천");
  assert.equal(candidateCompanyName("Workspace", null), "Workspace");
  assert.deepEqual(gtmRoleFactsFromInformation(null), { purpose: null, gtmCompany: null });
});
