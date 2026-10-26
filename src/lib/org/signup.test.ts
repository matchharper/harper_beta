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
      showPlan: true,
      roles: [],
    }),
    ["profile", "company", "slack", "plan", "guide", "done"]
  );
  assert.deepEqual(
    getOrgOnboardingSteps({ showSlack: false, showCompany: false, roles: [] }),
    ["profile", "guide", "done"]
  );
});

test("company research uses structured search output and external sources", async () => {
  const { researchSignupCompany } = await import("./signupServer");
  const queries: unknown[][] = [];
  const exa = {
    search: async (...args: unknown[]) => {
      queries.push(args);
      return {
        results: [],
        output: {
          content: {
            name: "Example",
            description: "Example builds software.",
            linkedinUrl: "https://linkedin.com/in/person",
            mainInvestors: "Publicly named investor",
          },
          grounding: ["name", "description"].map((field) => ({
            field,
            confidence: "high",
            citations: [
              {
                title: "Example on LinkedIn",
                url: "https://www.linkedin.com/company/example",
              },
            ],
          })),
        },
      };
    },
  };
  const result = await researchSignupCompany("example.com", exa as any);
  assert.equal(result?.name, "Example");
  assert.equal(result?.linkedinUrl, "");
  assert.equal(result?.mainInvestors, "Publicly named investor");
  assert.deepEqual(result?.sources, [
    {
      title: "Example on LinkedIn",
      url: "https://www.linkedin.com/company/example",
    },
  ]);
  assert.equal(
    queries[0][0],
    "example.com (site:linkedin.com/company | company)"
  );
  const options = queries[0][1] as any;
  assert.equal(options.includeDomains, undefined);
  assert.equal(options.numResults, 10);
  assert.equal(options.outputSchema.type, "object");
  assert.equal(options.outputSchema.properties.name.type, "string");
  assert.equal(options.contents, undefined);

  const serialized = await researchSignupCompany("example.com", {
    search: async () => ({
      results: [],
      output: {
        content: JSON.stringify({
          name: "Example",
          description: "Example builds software.",
          linkedinUrl: "https://linkedin.com/company/example/",
        }),
        grounding: [],
      },
    }),
  } as any);
  assert.equal(
    serialized?.linkedinUrl,
    "https://www.linkedin.com/company/example"
  );

  for (const content of [undefined, "malformed", null, [], {}]) {
    assert.equal(
      await researchSignupCompany("example.com", {
        search: async () => ({
          results: [],
          output: { content, grounding: [] },
        }),
      } as any),
      null
    );
  }
});
