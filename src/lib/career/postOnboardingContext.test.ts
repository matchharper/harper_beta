import assert from "node:assert/strict";
import test from "node:test";

import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
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
      },
    });
  }
});
