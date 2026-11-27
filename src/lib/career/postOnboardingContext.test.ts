import assert from "node:assert/strict";
import test from "node:test";

import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  fetchCareerEntrySource,
  fetchCareerPostOnboardingContext,
  parseOfficialJobSignupLandingSlug,
  parseOfficialJobSignupSourceSlug,
} from "./postOnboardingContext";

type FakeTableResult = {
  list?: unknown[] | null;
  single?: unknown | null;
};

type FakeCall = {
  args: unknown[];
  operation: string;
  table: string;
};

function createFakeAdmin(results: Record<string, FakeTableResult>) {
  const calls: FakeCall[] = [];

  class FakeQuery {
    constructor(private readonly table: string) {}

    private record(operation: string, args: unknown[]) {
      calls.push({ args, operation, table: this.table });
      return this;
    }

    select(...args: unknown[]) {
      return this.record("select", args);
    }

    eq(...args: unknown[]) {
      return this.record("eq", args);
    }

    not(...args: unknown[]) {
      return this.record("not", args);
    }

    lte(...args: unknown[]) {
      return this.record("lte", args);
    }

    in(...args: unknown[]) {
      return this.record("in", args);
    }

    order(...args: unknown[]) {
      return this.record("order", args);
    }

    limit(...args: unknown[]) {
      return this.record("limit", args);
    }

    maybeSingle() {
      return Promise.resolve({
        data: results[this.table]?.single ?? null,
        error: null,
      });
    }

    then(
      onFulfilled: (value: { data: unknown[] | null; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) {
      return Promise.resolve({
        data: results[this.table]?.list ?? null,
        error: null,
      }).then(onFulfilled, onRejected);
    }
  }

  const admin = {
    from(table: string) {
      calls.push({ args: [], operation: "from", table });
      return new FakeQuery(table);
    },
  } as unknown as TalentAdminClient;

  return { admin, calls };
}

test("reads the stable slug from a conversation-bound official-jobs source", () => {
  assert.equal(
    parseOfficialJobSignupSourceSlug(
      "official_jobs_onboarding:acme-product-engineer"
    ),
    "acme-product-engineer"
  );
});

test("does not infer a slug from unrelated or legacy source text", () => {
  assert.equal(
    parseOfficialJobSignupSourceSlug("official_jobs_onboarding"),
    null
  );
  assert.equal(parseOfficialJobSignupSourceSlug("job_apply_click:acme"), null);
  assert.equal(parseOfficialJobSignupSourceSlug(null), null);
});

test("loads the current conversation source and verifies its active exact role", async () => {
  const { admin, calls } = createFakeAdmin({
    talent_activity_events: {
      list: [
        {
          conversation_id: "conversation-1",
          created_at: "2026-09-06T01:00:00.000Z",
          event_type: "official_jobs_signup_intent",
          source: "official_jobs_onboarding:acme-product-engineer",
        },
      ],
    },
    official_jobs: {
      single: {
        company_name: "Acme",
        role_id: "role-123",
        role_title: "Product Engineer",
      },
    },
    company_roles: {
      single: {
        expires_at: null,
        information: {},
        is_expired: false,
        source_type: "internal",
        status: "active",
      },
    },
  });

  const context = await fetchCareerPostOnboardingContext({
    admin,
    conversationId: "conversation-1",
    userId: "talent-1",
  });

  assert.deepEqual(context, {
    entryOpportunity: {
      companyName: "Acme",
      roleTitle: "Product Engineer",
      verifiedActiveRoleId: "role-123",
      hasLinkedRole: true,
    },
  });
  assert.ok(
    calls.some(
      (call) =>
        call.table === "talent_activity_events" &&
        call.operation === "eq" &&
        call.args[0] === "conversation_id" &&
        call.args[1] === "conversation-1"
    )
  );
  assert.equal(
    calls.some((call) => call.table === "official_job_events"),
    false
  );
});

test("uses an apply click only to recover a missing slug on an existing intent", async () => {
  const { admin } = createFakeAdmin({
    talent_activity_events: {
      list: [
        {
          conversation_id: "conversation-1",
          created_at: "2026-09-06T01:00:00.000Z",
          event_type: "official_jobs_signup_intent",
          source: "official_jobs_onboarding",
        },
      ],
    },
    official_job_events: {
      single: {
        job_slug: "legacy-product-engineer",
        metadata: {
          companyName: "Legacy Co",
          roleTitle: "Product Engineer",
        },
      },
    },
    official_jobs: { single: null },
  });

  const context = await fetchCareerPostOnboardingContext({
    admin,
    conversationId: "conversation-1",
    userId: "talent-1",
  });

  assert.deepEqual(context, {
    entryOpportunity: {
      companyName: "Legacy Co",
      roleTitle: "Product Engineer",
      verifiedActiveRoleId: null,
    },
  });
});

test("does not attach an unrelated apply click without a conversation intent", async () => {
  const { admin, calls } = createFakeAdmin({
    talent_activity_events: { list: [] },
    official_job_events: {
      single: {
        job_slug: "unrelated-role",
      },
    },
  });

  const context = await fetchCareerPostOnboardingContext({
    admin,
    conversationId: "conversation-1",
    userId: "talent-1",
  });

  assert.equal(context, null);
  assert.equal(
    calls.some((call) => call.table === "official_job_events"),
    false
  );
});

test("does not expose an external or test-only mapping as an exact internal role", async () => {
  for (const role of [
    {
      expires_at: null,
      information: {},
      is_expired: false,
      source_type: "external",
      status: "active",
    },
    {
      expires_at: null,
      information: { testOnly: true },
      is_expired: false,
      source_type: "internal",
      status: "active",
    },
  ]) {
    const { admin } = createFakeAdmin({
      talent_activity_events: {
        list: [
          {
            conversation_id: "conversation-1",
            created_at: "2026-09-06T01:00:00.000Z",
            event_type: "official_jobs_signup_intent",
            source: "official_jobs_onboarding:acme-product-engineer",
          },
        ],
      },
      official_jobs: {
        single: {
          company_name: "Acme",
          role_id: "role-123",
          role_title: "Product Engineer",
        },
      },
      company_roles: { single: role },
    });

    const context = await fetchCareerPostOnboardingContext({
      admin,
      conversationId: "conversation-1",
      userId: "talent-1",
    });

    assert.deepEqual(context, {
      entryOpportunity: {
        companyName: "Acme",
        roleTitle: "Product Engineer",
        verifiedActiveRoleId: null,
        hasLinkedRole: true,
      },
    });
  }
});

test("entry continuation receives public source text once; later turns retain only its link", async () => {
  const { admin, calls } = createFakeAdmin({
    talent_activity_events: { list: [{ conversation_id: "conversation-1", created_at: "2026-11-15T01:00:00Z", event_type: "official_jobs_signup_intent", source: "official_jobs_onboarding:cedar", summary: "Entered from CedarWorks." }] },
    official_jobs: { single: { company_name: "CedarWorks", role_title: "Backend Engineer", role_id: null,
      is_published: true, short_description: "Hands-on backend ownership", role_description_markdown: "PostgreSQL reliability. Apply with an existing resume and one incident example.",
      location: "Korea remote", compensation: "KRW 110–140m", updated_at: "2026-11-14T01:00:00Z" } },
  });
  const args = { admin, conversationId: "conversation-1", userId: "talent-1" };
  const { intentSummary, opportunityContext: first } = await fetchCareerEntrySource({ ...args, includePostingDetails: true });
  assert.equal(intentSummary, "Entered from CedarWorks.");
  assert.equal(calls.filter(call => call.table === "talent_activity_events" && call.operation === "from").length, 1);
  calls.length = 0;
  const later = await fetchCareerPostOnboardingContext(args);
  assert.doesNotMatch(String(calls.find(call => call.table === "official_jobs" && call.operation === "select")?.args), /role_description_markdown/);
  assert.equal(first?.entryOpportunity?.postingPath, "/jobs/cedar");
  assert.match(first?.entryOpportunity?.postingDetails ?? "", /PostgreSQL reliability/);
  assert.equal(later?.entryOpportunity?.postingDetails, undefined);
  assert.equal(later?.entryOpportunity?.postingPath, "/jobs/cedar");
  const { buildCareerPostOnboardingContextSection } = await import("./prompts/postOnboardingGuide");
  const text = buildCareerPostOnboardingContextSection({ context: first, factsOnly: true });
  assert.match(text, /Public posting source text/);
  assert.match(text, /2026-11-14/);
  assert.doesNotMatch(text, /T01:00:00Z/);
});

test("unpublished details never enter the model source text", async () => {
  const { admin } = createFakeAdmin({
    talent_activity_events: { list: [{ conversation_id: "conversation-1", created_at: "2026-11-15T01:00:00Z", event_type: "official_jobs_signup_intent", source: "official_jobs_onboarding:cedar" }] },
    official_jobs: { single: { company_name: "CedarWorks", role_title: "Backend Engineer", is_published: false, role_description_markdown: "Unpublished draft requirements" } },
  });
  const context = await fetchCareerPostOnboardingContext({ admin, conversationId: "conversation-1", userId: "talent-1", includePostingDetails: true });
  assert.equal(context?.entryOpportunity?.postingDetails, undefined);
  assert.equal(context?.entryOpportunity?.postingPath, undefined);
});

test("a posting without role_id becomes a request to find opportunities like it", async () => {
  const { admin } = createFakeAdmin({
    talent_activity_events: { list: [{ conversation_id: "conversation-1", created_at: "2026-11-18T01:00:00Z", event_type: "official_jobs_signup_intent", source: "official_jobs_onboarding:cedar" }] },
    official_jobs: { single: { company_name: "CedarWorks", role_title: "Backend Engineer", role_id: null, is_published: true, updated_at: "2026-11-14T01:00:00Z" } },
  });
  const context = await fetchCareerPostOnboardingContext({ admin, conversationId: "conversation-1", userId: "talent-1" });
  assert.equal(context?.entryOpportunity?.hasLinkedRole, false);
  const { buildCareerPostOnboardingContextSection } = await import("./prompts/postOnboardingGuide");
  for (const text of [
    buildCareerPostOnboardingContextSection({ context, factsOnly: true }),
    buildCareerPostOnboardingContextSection({ context, toolNames: ["get_internal_roles", "search_opportunities"] }),
  ]) {
    assert.match(text, /No Harper Role is behind this posting. The candidate wants Harper to find opportunities like it/);
    assert.doesNotMatch(text, /search_opportunities|do not broaden|cannot introduce/);
  }
});

test("an ended linked Role keeps the exact-posting guidance", async () => {
  const { buildCareerPostOnboardingContextSection } = await import("./prompts/postOnboardingGuide");
  const text = buildCareerPostOnboardingContextSection({
    context: { entryOpportunity: { companyName: "Acme", roleTitle: "Product Engineer", verifiedActiveRoleId: null, hasLinkedRole: true } },
    toolNames: ["get_internal_roles"],
  });
  assert.doesNotMatch(text, /find opportunities like it/);
  assert.match(text, /get_internal_roles/);
});

test("a linked Role whose posting hides the company is named by its real company in the conversation", async () => {
  const { admin } = createFakeAdmin({
    talent_activity_events: { list: [{ conversation_id: "conversation-1", created_at: "2026-11-18T01:00:00Z", event_type: "official_jobs_signup_intent", source: "official_jobs_onboarding:gpu-cloud-fde" }] },
    official_jobs: { single: { company_name: "$17M-Funded GPU Cloud Startup", role_id: "role-123", role_title: "Forward Deployed Engineer" } },
    company_roles: { single: { expires_at: null, information: {}, is_expired: false, source_type: "internal", status: "active",
      company: { company_name: "VESSL AI" } } },
  });
  const context = await fetchCareerPostOnboardingContext({ admin, conversationId: "conversation-1", userId: "talent-1" });
  assert.equal(context?.entryOpportunity?.companyName, "VESSL AI");
  assert.equal(context?.entryOpportunity?.verifiedActiveRoleId, "role-123");
  const { buildCareerPostOnboardingContextSection } = await import("./prompts/postOnboardingGuide");
  const text = buildCareerPostOnboardingContextSection({ context, factsOnly: true });
  assert.match(text, /Company: "?VESSL AI/);
  assert.doesNotMatch(text, /GPU Cloud Startup/);
});

test("a sign-up that left the form unfinished starts from the posting in its landing path", async () => {
  const { admin, calls } = createFakeAdmin({
    talent_activity_events: { list: [] },
    talent_messages: { list: [] },
    talent_setting: { single: { is_onboarding_done: false } },
    logs: { single: { created_at: "2026-11-19T21:02:00Z", meta_data: { landingPath: "/career?source=official_jobs&job=Software+Engineer%2C+AI+Agents&job_slug=blockit-ai-agents&job_role_id=role-123" } } },
    official_jobs: { single: { company_name: "Blockit", role_id: "role-123", role_title: "Software Engineer, AI Agents", is_published: true, updated_at: "2026-11-14T01:00:00Z" } },
    company_roles: { single: { expires_at: null, information: {}, is_expired: false, source_type: "internal", status: "active", company: { company_name: "Blockit" } } },
  });
  const source = await fetchCareerEntrySource({ admin, conversationId: "conversation-1", userId: "talent-1" });
  assert.equal(source.opportunityContext?.entryOpportunity?.roleTitle, "Software Engineer, AI Agents");
  assert.equal(source.opportunityContext?.entryOpportunity?.verifiedActiveRoleId, "role-123");
  // Not an entry record: nothing reads it as what the candidate agreed to.
  assert.equal(source.intentSummary, null);
  assert.ok(calls.some((call) => call.table === "official_jobs" && call.operation === "eq" && call.args[1] === "blockit-ai-agents"));
});

test("the landing path is not read once the form was submitted or onboarding is done", async () => {
  const landing = { single: { created_at: "2026-11-19T21:02:00Z", meta_data: { landingPath: "/career?source=official_jobs&job_slug=blockit-ai-agents" } } };
  for (const state of [
    { talent_messages: { list: [{ id: 1 }] }, talent_setting: { single: { is_onboarding_done: false } } },
    { talent_messages: { list: [] }, talent_setting: { single: { is_onboarding_done: true } } },
  ]) {
    const { admin, calls } = createFakeAdmin({ talent_activity_events: { list: [] }, logs: landing, ...state });
    const context = await fetchCareerPostOnboardingContext({ admin, conversationId: "conversation-1", userId: "talent-1" });
    assert.equal(context, null);
    assert.equal(calls.some((call) => call.table === "official_jobs"), false);
  }
});

test("only a /jobs landing path names an entry posting", () => {
  assert.equal(parseOfficialJobSignupLandingSlug("/career?source=official_jobs&job_slug=acme-pm"), "acme-pm");
  assert.equal(parseOfficialJobSignupLandingSlug("/career?gtm=1&job_slug=acme-pm"), null);
  assert.equal(parseOfficialJobSignupLandingSlug("/career"), null);
  assert.equal(parseOfficialJobSignupLandingSlug(null), null);
});

const preparedRole = (over: Record<string, unknown>) => ({
  name: "Software Engineer, Agent", status: "active", is_expired: false, expires_at: null, source_type: "internal",
  location_text: "Seoul", information: {}, company: { company_name: "Company A" }, ...over,
});

test("a posting with no Harper Role brings the roles prepared for it that are still open", async () => {
  const { admin } = createFakeAdmin({
    talent_activity_events: { list: [{ conversation_id: "conversation-1", created_at: "2026-11-27T01:00:00Z", event_type: "official_jobs_signup_intent", source: "official_jobs_onboarding:ai-agents-seoul" }] },
    official_jobs: {
      single: { id: "job-1", company_name: "High-Growth AI Startups", role_title: "Software Engineer, AI Agents", role_id: null, is_published: true, updated_at: "2026-11-20T01:00:00Z" },
    },
    official_job_prepared_roles: {
      list: [
        { role_id: "11111111-1111-4111-8111-111111111111", kind: "harper", rank: 0, reason: "같은 에이전트 엔지니어 자리예요", prepared_at: "2026-11-26T18:00:00Z", role: preparedRole({}) },
        { role_id: "22222222-2222-4222-8222-222222222222", kind: "harper", rank: 1, reason: "closed since", prepared_at: "2026-11-26T18:00:00Z", role: preparedRole({ status: "ended", company: { company_name: "Company B" } }) },
        { role_id: "33333333-3333-4333-8333-333333333333", kind: "public", rank: 0, reason: null, prepared_at: "2026-11-26T18:00:00Z", role: preparedRole({ source_type: "external", name: "AI Engineer", company: { company_name: "Company C" } }) },
        { role_id: "44444444-4444-4444-8444-444444444444", kind: "public", rank: 1, reason: null, prepared_at: "2026-11-26T18:00:00Z", role: preparedRole({ source_type: "external", is_expired: true, company: { company_name: "Company D" } }) },
      ],
    },
  });
  const context = await fetchCareerPostOnboardingContext({ admin, conversationId: "conversation-1", userId: "talent-1" });
  const prepared = context?.entryOpportunity?.preparedForPosting;
  assert.deepEqual(prepared?.harperRoles, [{
    roleId: "11111111-1111-4111-8111-111111111111", companyName: "Company A", roleTitle: "Software Engineer, Agent",
    reason: "같은 에이전트 엔지니어 자리예요",
  }]);
  assert.deepEqual(prepared?.publicPostings.map((posting) => posting.companyName), ["Company C"]);

  const { buildCareerPostOnboardingContextSection } = await import("./prompts/postOnboardingGuide");
  const facts = buildCareerPostOnboardingContextSection({ context, factsOnly: true, includePrepared: true });
  assert.match(facts, /No Harper Role is behind this posting/);
  assert.match(facts, /Prepared for this posting on .* \(chosen for the posting, not for this candidate/);
  assert.match(facts, /Company: "Company A"; Role: "Software Engineer, Agent"; roleId: "11111111-1111-4111-8111-111111111111"; close because: "같은 에이전트 엔지니어 자리예요"/);
  assert.match(facts, /Company: "Company C"; Role: "AI Engineer"; Location: "Seoul"; roleId: "33333333-3333-4333-8333-333333333333"$/m);
  assert.doesNotMatch(facts, /Company B|Company D/);

  const withTools = buildCareerPostOnboardingContextSection({ context, includePrepared: true, toolNames: ["apply_to_internal_role"] });
  assert.match(withTools, /call apply_to_internal_role with its roleId/);
  // Later turns no longer carry the list.
  assert.doesNotMatch(buildCareerPostOnboardingContextSection({ context, factsOnly: true }), /Prepared for this posting/);
});

test("a posting with a Harper Role never reads prepared roles", async () => {
  const { admin, calls } = createFakeAdmin({
    talent_activity_events: { list: [{ conversation_id: "conversation-1", created_at: "2026-11-27T01:00:00Z", event_type: "official_jobs_signup_intent", source: "official_jobs_onboarding:acme" }] },
    official_jobs: { single: { id: "job-2", company_name: "Acme", role_title: "Product Engineer", role_id: "role-123", is_published: true } },
    company_roles: { single: { source_type: "internal", status: "active", is_expired: false, expires_at: null, information: {}, company: { company_name: "Acme" } } },
  });
  const context = await fetchCareerPostOnboardingContext({ admin, conversationId: "conversation-1", userId: "talent-1" });
  assert.equal(context?.entryOpportunity?.verifiedActiveRoleId, "role-123");
  assert.equal(context?.entryOpportunity?.preparedForPosting, undefined);
  assert.equal(calls.some((call) => call.table === "official_job_prepared_roles"), false);
});

test("Harper's first-contact guide starts a posting with no Harper Role from the roles prepared for it", async () => {
  const { buildCareerPostOnboardingConversationGuide } = await import("./prompts/postOnboardingGuide");
  const guide = buildCareerPostOnboardingConversationGuide({ channel: "chat" });
  assert.match(guide, /A posting with no Harper Role behind it may come with roles Harper prepared for that posting/);
  assert.match(guide, /New searches and other recommendations wait for their answer/);
  assert.doesNotMatch(guide, /Searching and recommending wait for their answer/);
});
