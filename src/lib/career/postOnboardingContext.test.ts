import assert from "node:assert/strict";
import test from "node:test";

import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  fetchCareerEntrySource,
  fetchCareerPostOnboardingContext,
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
