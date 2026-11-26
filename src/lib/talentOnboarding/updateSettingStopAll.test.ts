import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

// update_setting stop_all must leave the same settings as pausing all Harper
// contact in account settings: external/public postings off and profile
// sharing off. Turning off only profile sharing left periodic external-posting
// mail running for people who asked Harper to stop all contact.
const stubs: Record<string, unknown> = {
  "server-only": {},
  // Loaded by unrelated Career tools at import time; not used here.
  jsdom: { JSDOM: class {} },
  dotenv: { config: () => ({}) },
};
const nodeModule = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
const originalLoad = nodeModule._load;
nodeModule._load = function (name: string, parent: unknown, main: boolean) {
  return name in stubs ? stubs[name] : originalLoad.call(this, name, parent, main);
};
delete process.env.DATABASE_URL;
delete process.env.CAREER_ROLE_SEARCH_DATABASE_URL;
const toolsPromise = import("./tools");

function admin(existing: Record<string, unknown>) {
  const writes: Array<{ table: string; kind: string; payload: any }> = [];
  let setting: Record<string, unknown> = { user_id: "talent", ...existing };
  return {
    writes,
    get setting() { return setting; },
    async rpc() { return { data: null, error: null }; },
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: () => query,
        in: () => query,
        is: () => query,
        neq: () => query,
        order: () => query,
        limit: () => query,
        upsert(payload: any) {
          writes.push({ table, kind: "upsert", payload });
          if (table === "talent_setting") setting = { ...setting, ...payload };
          return query;
        },
        async insert(payload: any) {
          writes.push({ table, kind: "insert", payload });
          return { data: null, error: null };
        },
        async single() { return query.maybeSingle(); },
        async maybeSingle() {
          return { data: table === "talent_setting" ? setting : null, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

async function updateSetting(db: ReturnType<typeof admin>, action: string) {
  const { getEnabledTalentTools } = await toolsPromise;
  const tool = getEnabledTalentTools("chat").find((entry) => entry.name === "update_setting");
  assert.ok(tool?.execute);
  return tool.execute(
    { action },
    { admin: db, userId: "talent", conversationId: "conversation", userMessageId: 10 } as never,
  ) as Promise<Record<string, any>>;
}

test("stop_all turns off external postings and profile sharing together", async () => {
  const db = admin({ profile_visibility: "exceptional_only", get_external_recommendation: true });
  const result = await updateSetting(db, "stop_all");
  assert.equal(db.setting.get_external_recommendation, false);
  assert.equal(db.setting.profile_visibility, "dont_share");
  assert.deepEqual(result.settings, { getExternalRecommendation: false, profileVisibility: "dont_share" });
  const event = db.writes.find((write) => write.table === "talent_activity_events");
  assert.ok(event);
  assert.ok(event.payload.changed_domains.includes("getExternalRecommendation"));
  assert.ok(event.payload.changed_domains.includes("profileVisibility"));
});

test("stop_all again for someone left with external postings on turns them off", async () => {
  const db = admin({ profile_visibility: "dont_share", get_external_recommendation: true });
  const result = await updateSetting(db, "stop_all");
  assert.equal(db.setting.get_external_recommendation, false);
  assert.equal(result.settings.getExternalRecommendation, false);
});

test("resume still restarts both", async () => {
  const db = admin({ profile_visibility: "dont_share", get_external_recommendation: false });
  const result = await updateSetting(db, "resume");
  assert.deepEqual(result.settings, { getExternalRecommendation: true, profileVisibility: "exceptional_only" });
});
