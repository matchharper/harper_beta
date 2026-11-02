import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { listProfiles, readProfile, readProfileSnapshot, writeProfileSnapshot } from "./store";
import { formatProfileToolResult } from "./tools";

function existingProfileAdmin(code = "PGRST202") {
  const reads: string[] = [], calls: string[] = [];
  const rows: Record<string, unknown> = {
    talent_users: { user_id: "owner", name: "Reader", email: "reader@example.com", phone_number: "+82 10 0000 0000" },
    talent_experiences: [{ id: 17, role: "Engineer", company_name: "Example", description: "Existing work" }],
    talent_educations: [],
    talent_extras: { content: [] },
  };
  const admin = {
    rpc: async (name: string) => {
      calls.push(name);
      return { data: null, error: { code, message: `${name}: unavailable` } };
    },
    from: (table: string) => {
      assert.ok(Object.hasOwn(rows, table), `Unexpected table: ${table}`);
      reads.push(table);
      const result = Promise.resolve({ data: rows[table], error: null });
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          assert.equal(key, table === "talent_users" ? "user_id" : "talent_id");
          assert.equal(value, "owner");
          return query;
        },
        order: () => query,
        maybeSingle: () => result,
        then: result.then.bind(result),
      };
      return query;
    },
  } as unknown as TalentAdminClient;
  return { admin, reads, calls };
}

test("missing profile-version reader permits current owned facts without inventing a version", async () => {
  const { admin, reads } = existingProfileAdmin();
  const result = await readProfile({ admin, userId: "owner" });
  assert.equal(result.snapshot.talentUser?.email, "reader@example.com");
  assert.equal(result.snapshot.talentUser?.phone_number, "+82 10 0000 0000");
  assert.equal(result.snapshot.talentExperiences[0].id, 17);
  assert.ok(!("profileId" in result));
  assert.ok(!("revision" in result));
  assert.equal(reads.length, 4);
  const modelOutput = formatProfileToolResult("read_profile", result);
  assert.match(modelOutput, /Current profile/);
  assert.match(modelOutput, /email: reader@example.com/);
  assert.match(modelOutput, /phone_number: \+82 10 0000 0000/);
  assert.match(modelOutput, /RowID=17; Engineer · Example/);
  assert.doesNotMatch(modelOutput, /profileId=|revision=|"snapshot"|undefined/);
});

test("missing version catalog exposes current-profile availability, not fabricated variants", async () => {
  const { admin } = existingProfileAdmin();
  const result = await listProfiles({ admin, userId: "owner" });
  assert.deepEqual(result.profiles, []);
  const modelOutput = formatProfileToolResult("list_profiles", result);
  assert.match(modelOutput, /current profile is available through read_profile/);
  assert.match(modelOutput, /version history are unavailable/);
  assert.doesNotMatch(modelOutput, /profileId=|revision=/);
});

test("exact version requests do not silently read a different current profile", async () => {
  for (const reference of [{ profileId: "exact" }, { revision: 2 }, { compareRevision: 1 }, { historyCursor: 3 }]) {
    const { admin, reads } = existingProfileAdmin();
    await assert.rejects(readProfile({ admin, userId: "owner", ...reference }), /Profile versions are unavailable/);
    assert.deepEqual(reads, []);
  }
});

test("permission and transport failures remain errors; strict snapshot and write paths do not fall back", async () => {
  for (const code of ["42501", "PGRST301", "503"]) {
    const { admin, reads } = existingProfileAdmin(code);
    await assert.rejects(readProfile({ admin, userId: "owner" }), /unavailable/);
    await assert.rejects(listProfiles({ admin, userId: "owner" }), /unavailable/);
    assert.deepEqual(reads, []);
  }
  const { admin, reads, calls } = existingProfileAdmin();
  await assert.rejects(readProfileSnapshot({ admin, userId: "owner" }), /unavailable/);
  await assert.rejects(writeProfileSnapshot({ admin, userId: "owner", action: "archive", profileId: "exact", expectedRevision: 2, operationId: "request" }), /unavailable/);
  assert.deepEqual(reads, []);
  assert.deepEqual(calls, ["read_talent_profile_v1", "write_talent_profile_v1"]);
});
