import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Module from "node:module";
import { before, test } from "node:test";

type Reader = typeof import("./talentPendingMeeting.server");
let reader: Reader;

before(async () => {
  const mod = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const original = mod._load;
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request === "server-only"
      ? {}
      : original.call(this, request, parent, isMain);
  };
  try {
    reader = await import("./talentPendingMeeting.server");
  } finally {
    mod._load = original;
  }
});

const token = "a".repeat(32);
const future = new Date(Date.now() + 86_400_000).toISOString();

/** Every query on a table returns its rows; filters are not applied. */
function admin(queueStatus: string) {
  const tables: Record<string, unknown[]> = {
    career_email_messages: [],
    contact_queue: [
      {
        id: "queue",
        payload: {
          body: `https://example.invalid/meeting/${token}`,
          heldForIntroEmail: true,
        },
        status: queueStatus,
      },
    ],
    meeting_schedule_rounds: [
      {
        delivery_queue_id: "queue",
        id: "round",
        invitation_expires_at: future,
        invitation_snapshot: { companyName: "Company", roleName: "Role" },
        public_token_hash: createHash("sha256").update(token).digest("hex"),
        schedule_id: "schedule",
        status: "queued",
        submitted_at: null,
      },
    ],
    meeting_schedules: [
      {
        active_round_id: "round",
        id: "schedule",
        role_id: "role",
        title: "Interview",
        updated_at: future,
      },
    ],
  };
  return {
    from(name: string) {
      const result = { data: tables[name] ?? [], error: null };
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              return (resolve: (value: unknown) => void) => resolve(result);
            }
            if (prop === "maybeSingle") {
              return async () => ({ data: result.data[0] ?? null, error: null });
            }
            return () => builder;
          },
        }
      );
      return builder;
    },
  } as never;
}

test("a link held for an unsent intro email stays out of the candidate's app", async () => {
  const pending = await reader.fetchPendingTalentMeetingSchedules({
    admin: admin("queued"),
    limit: 5,
    talentId: "talent",
  });
  assert.deepEqual(pending, []);
  const path = await reader.resolveTalentPendingMeetingPath({
    admin: admin("queued"),
    scheduleId: "schedule",
    talentId: "talent",
  });
  assert.equal(path, null);
});

test("once the intro email carried it, the link shows", async () => {
  const pending = await reader.fetchPendingTalentMeetingSchedules({
    admin: admin("sent"),
    limit: 5,
    talentId: "talent",
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].invitationPath, `/meeting/${token}`);
  const path = await reader.resolveTalentPendingMeetingPath({
    admin: admin("sent"),
    scheduleId: "schedule",
    talentId: "talent",
  });
  assert.equal(path, `/meeting/${token}`);
});
