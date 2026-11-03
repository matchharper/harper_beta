import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";

// The real lookup over an in-memory stand-in for the three tables it reads.
type Draft = typeof import("./scheduleDraftServer");
let findUnsentWebMeetingDraft: Draft["findUnsentWebMeetingDraft"];
let webMeetingRequestIdempotencyKey: Draft["webMeetingRequestIdempotencyKey"];

before(async () => {
  const mod = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const original = mod._load;
  const mocks: Record<string, unknown> = {
    "@/lib/meetings/availabilityServer": {},
    "@/lib/meetings/meetingCalendarServer": {},
    "@/lib/org/server": { OrgHttpError: class extends Error {} },
    "@/lib/org/teamAccess": {},
    "@/lib/server/candidateAccess": {},
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks
      ? mocks[request]
      : original.call(this, request, parent, isMain);
  };
  try {
    ({ findUnsentWebMeetingDraft, webMeetingRequestIdempotencyKey } =
      await import("./scheduleDraftServer"));
  } finally {
    mod._load = original;
  }
});

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        async maybeSingle() {
          const rows = (tables[table] ?? []).filter((row) =>
            filters.every(([column, value]) => row[column] === value)
          );
          return { data: rows[0] ?? null, error: null };
        },
      };
      return query;
    },
  } as never;
}

const target = {
  recommendationId: "recommendation",
  talentId: "talent",
  webRequestKey: "initial-connection",
  workspaceId: "workspace",
};

function tablesWith(round: Row, queue: Row | null) {
  return {
    meeting_schedules: [
      {
        active_round_id: "round",
        company_workspace_id: "workspace",
        id: "schedule",
        idempotency_key: webMeetingRequestIdempotencyKey(target),
        recommendation_id: "recommendation",
        status: "awaiting_talent",
        talent_id: "talent",
      },
    ],
    meeting_schedule_rounds: [
      { id: "round", schedule_id: "schedule", submitted_at: null, ...round },
    ],
    contact_queue: queue
      ? [
          {
            id: "queue",
            type: "meeting_schedule_candidate_invitation",
            ...queue,
          },
        ]
      : [],
  };
}

test("the web key keeps its existing shape", () => {
  assert.equal(
    webMeetingRequestIdempotencyKey(target),
    "meeting_web_request:workspace:recommendation:initial-connection"
  );
});

test("a link set aside for an intro email that never went out is continued", async () => {
  const draft = await findUnsentWebMeetingDraft({
    ...target,
    admin: fakeAdmin(
      tablesWith(
        { delivery_queue_id: "queue", status: "queued" },
        {
          payload: { heldForIntroEmail: true },
          sent_at: null,
          status: "queued",
        }
      )
    ),
  });
  assert.deepEqual(draft, {
    alreadyExisted: true,
    roundId: "round",
    scheduleId: "schedule",
    status: "awaiting_talent",
  });
});

test("a draft whose link was taken back is continued", async () => {
  const draft = await findUnsentWebMeetingDraft({
    ...target,
    admin: fakeAdmin(
      tablesWith({ delivery_queue_id: null, status: "draft" }, null)
    ),
  });
  assert.equal(draft?.scheduleId, "schedule");
});

test("a link that went out, or a candidate who answered, is not continued", async () => {
  const sent = await findUnsentWebMeetingDraft({
    ...target,
    admin: fakeAdmin(
      tablesWith(
        { delivery_queue_id: "queue", status: "queued" },
        {
          payload: { heldForIntroEmail: true },
          sent_at: "2026-11-01T00:00:00Z",
          status: "sent",
        }
      )
    ),
  });
  const answered = await findUnsentWebMeetingDraft({
    ...target,
    admin: fakeAdmin(
      tablesWith(
        {
          delivery_queue_id: "queue",
          status: "submitted",
          submitted_at: "2026-11-01T00:00:00Z",
        },
        null
      )
    ),
  });
  const sentByItself = await findUnsentWebMeetingDraft({
    ...target,
    admin: fakeAdmin(
      tablesWith(
        { delivery_queue_id: "queue", status: "queued" },
        { payload: {}, sent_at: null, status: "queued" }
      )
    ),
  });
  assert.equal(sent, null);
  assert.equal(answered, null);
  assert.equal(sentByItself, null);
});

test("another candidate's or workspace's draft is never picked up", async () => {
  const tables = tablesWith({ delivery_queue_id: null, status: "draft" }, null);
  const otherTalent = await findUnsentWebMeetingDraft({
    ...target,
    admin: fakeAdmin(tables),
    talentId: "someone-else",
  });
  const none = await findUnsentWebMeetingDraft({
    ...target,
    admin: fakeAdmin({}),
  });
  assert.equal(otherTalent, null);
  assert.equal(none, null);
});
