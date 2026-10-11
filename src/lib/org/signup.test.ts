import assert from "node:assert/strict";
import test from "node:test";
import {
  companyEmailDomain,
  companyInput,
  normalizedLinkedinUrl,
} from "./signupServer";
import { getOrgOnboardingSteps } from "./onboarding";
const account = (email: string) => ({
  email,
  email_confirmed_at: "2026-10-07T00:00:00Z",
  is_anonymous: false,
});
test("new workspaces require a verified non-personal company email", () => {
  for (const email of [
    "person@gmail.com",
    "person@naver.com",
    "person@outlook.com",
    "person@yahoo.co.uk",
    "person@proton.me",
  ])
    assert.equal(companyEmailDomain(account(email)), null, email);
  assert.equal(
    companyEmailDomain({
      ...account("person@company.com"),
      email_confirmed_at: undefined,
    }),
    null
  );
  assert.equal(
    companyEmailDomain({
      ...account("person@company.com"),
      is_anonymous: true,
    }),
    null
  );
  assert.equal(companyEmailDomain(account("person@localhost")), null);
  assert.equal(companyEmailDomain(account("person@127.0.0.1")), null);
});
test("company identity uses public suffix boundaries and private hosting domains", () => {
  assert.equal(
    companyEmailDomain(account("person@uk.company.co.uk")),
    "company.co.uk"
  );
  assert.equal(
    companyEmailDomain(account("PERSON@DEPT.EXAMPLE.COM")),
    "example.com"
  );
  assert.equal(
    companyEmailDomain(account("person@myteam.github.io")),
    "myteam.github.io"
  );
});
test("company confirmation accepts only a company LinkedIn page", () => {
  assert.equal(
    normalizedLinkedinUrl("linkedin.com/company/example/?trk=abc"),
    "https://www.linkedin.com/company/example"
  );
  for (const url of [
    "https://linkedin.com.evil.com/company/a",
    "https://linkedin.com/in/person",
    "https://user:pass@linkedin.com/company/a",
    "javascript:alert(1)",
    "https://linkedin.com:444/company/a",
  ])
    assert.throws(() => normalizedLinkedinUrl(url));
  assert.throws(() => companyInput({ name: "", description: "Company" }));
  for (const description of [undefined, "", "   "]) {
    assert.equal(
      companyInput({ name: "Company", description }).description,
      ""
    );
  }
  assert.throws(() =>
    companyInput({ name: "Company", description: "a".repeat(8001) })
  );
  assert.equal(
    companyInput({
      name: "Company",
      description: "Example software company",
      linkedinUrl: "",
    }).linkedinUrl,
    ""
  );
});
test("new company onboarding shows plans and no invented role step", () => {
  assert.deepEqual(
    getOrgOnboardingSteps({
      showSlack: true,
      showCompany: true,
      showCompanyDetails: true,
      showPlan: true,
      roles: [],
    }),
    ["profile", "company-details", "company", "slack", "plan", "done"]
  );
  assert.deepEqual(
    getOrgOnboardingSteps({ showSlack: false, showCompany: false, roles: [] }),
    ["profile", "done"]
  );
});

test("company research retains supported fields and ignores unrelated sources and invalid optional links", async () => {
  const { researchSignupCompany } = await import("./signupServer");
  const queries: unknown[][] = [];
  const exa = {
    search: async (...args: unknown[]) => {
      queries.push(args);
      return {
        results: [
          {
            url: "https://unrelated.com",
            summary: JSON.stringify({
              name: "Wrong company",
              description: "Wrong company description",
            }),
          },
          {
            url: "https://example.com/about",
            title: "About Example",
            summary: JSON.stringify({
              name: "Example",
              description: "Example builds software.",
              linkedinUrl: "https://linkedin.com/in/person",
              mainInvestors: "Publicly named investor",
            }),
          },
        ],
      };
    },
  };
  const result = await researchSignupCompany("example.com", exa as any);
  assert.equal(result?.name, "Example");
  assert.equal(result?.linkedinUrl, "");
  assert.equal(result?.mainInvestors, "Publicly named investor");
  assert.deepEqual(result?.sources, [
    { title: "About Example", url: "https://example.com/about" },
  ]);
  assert.deepEqual((queries[0][1] as any).includeDomains, ["example.com"]);
  assert.equal(
    await researchSignupCompany("example.com", {
      search: async () => ({
        results: [{ url: "https://example.com", summary: "malformed" }],
      }),
    } as any),
    null
  );
});
