import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_CONFIG_ID, agentCodeVersion, agentConfigChanges, agentConfigEntries, agentConfigId, buildAgentConfigSnapshot,
  canonicalJson, configLabel, hash53, previousConfig, promptVersion, type AgentConfigRules,
} from "./config";
import { normalizeSignalSettings } from "./tuning";
import { DEFAULT_AGENT_SETTINGS, type AgentSettings } from "./types";

const RULES: AgentConfigRules = {
  minFits: 2, maxFits: 3, lookupMinSignalScore: 70, graderDropsPoor: true, searchSplitByAgent: true, searchBudgetShare: 0.5,
  searchBudgetMaxUsd: 2.4, searchMaxPeople: 50, readSearchedPages: false, recentMemoryDays: 30, recentContactDays: 30,
  draftMaxAgeDays: 5, queueDays: 2, followupReserveUsd: 5, followupMaxLateDays: 7, brakeBounceRate: 0.03, brakeComplaints: 2,
};
const PROMPTS = { planner: "aaaa1111", judge: "bbbb2222", mailWriter: "cccc3333" };
const MODELS = { agent: "model-a · low", matcher: "model-a · low/high" };

const settingsWith = (patch: Partial<AgentSettings> = {}, signals: Record<string, unknown> = {}): AgentSettings => ({
  ...DEFAULT_AGENT_SETTINGS,
  ...patch,
  signals: normalizeSignalSettings({ sources: { linkedin: { enabled: true }, hn: { enabled: true } }, ...signals }).settings,
});

const snapshotOf = (settings: AgentSettings, extra: Partial<{ prompts: Record<string, string>; rules: AgentConfigRules }> = {}) =>
  buildAgentConfigSnapshot({ settings, rules: extra.rules ?? RULES, prompts: extra.prompts ?? PROMPTS, models: MODELS });

test("the hash is stable: the same text always gives the same 14 hex characters, a different text another", () => {
  // Pinned: a change here means every stored 설정 묶음 id would stop matching its settings.
  assert.equal(hash53(""), "0bdcb81aee8d83");
  assert.equal(hash53("설정 묶음"), "1175531e452d59");
  assert.equal(promptVersion(["system", "user"]), "a37eca67");
  assert.equal(agentConfigId({ schema: 1, settings: { sources: { linkedin: true } } } as never), "974d6108d569");
  assert.notEqual(hash53("minScore 50"), hash53("minScore 51"));
  assert.equal(promptVersion(["system", "user"]), promptVersion(["system", "user"]));
  assert.notEqual(promptVersion(["system", "user"]), promptVersion(["system", "user."]));
  assert.notEqual(promptVersion(["ab", "c"]), promptVersion(["a", "bc"]));
});

test("canonical JSON: keys sorted at every level, undefined left out, arrays kept in order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, 1], c: undefined, b: null } }), '{"a":{"b":null,"d":[3,1]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

test("the same settings give the same 설정 묶음, whatever the order they were saved in or the switch and version", () => {
  const a = snapshotOf(settingsWith({ sendWeekdays: [5, 1, 3, 2, 4], senderName: " Ashly " }, { blockedDomains: ["b.example", "a.example"] }));
  const b = snapshotOf({
    ...settingsWith({ sendWeekdays: [1, 2, 3, 4, 5], senderName: "Ashly", enabled: true, version: 9, updatedAt: "2026-11-18T00:00:00.000Z" },
      { blockedDomains: ["a.example", "b.example"] }),
  });
  assert.deepEqual(a, b);
  assert.equal(agentConfigId(a), agentConfigId(b));
  assert.match(agentConfigId(a), AGENT_CONFIG_ID);
  assert.deepEqual(a.settings.sendWeekdays, [1, 2, 3, 4, 5]);
  assert.deepEqual(a.settings.blockedDomains, ["a.example", "b.example"]);
  assert.equal("enabled" in a.settings, false);
  // Stored and read back (jsonb), it is still the same 설정 묶음.
  assert.equal(agentConfigId(JSON.parse(JSON.stringify(a))), agentConfigId(a));
});

test("anything that changes what the agent does gives a new id: a setting, the 찾는 기준, a rule, an instruction", () => {
  const base = agentConfigId(snapshotOf(settingsWith()));
  const ids = [
    snapshotOf(settingsWith({ dailyMailCap: 31 })),
    snapshotOf(settingsWith({}, { sources: { linkedin: { enabled: true }, hn: { enabled: false } } })),
    snapshotOf(settingsWith({}, { tuning: { minScore: 60 } })),
    snapshotOf(settingsWith({}, { blockedDomains: ["spam.example"] })),
    snapshotOf(settingsWith(), { rules: { ...RULES, minFits: 3 } }),
    snapshotOf(settingsWith(), { prompts: { ...PROMPTS, judge: "bbbb2223" } }),
    snapshotOf(settingsWith({}, { vendorLookup: false })),
    snapshotOf(settingsWith({}, { workAddresses: false })),
    snapshotOf(settingsWith(), { rules: { ...RULES, vendorDailyMax: 10 } }),
  ].map(agentConfigId);
  assert.equal(new Set([base, ...ids]).size, ids.length + 1);
});

test("treg's daily max reads 제한 없음 when there is none (11/26), a number of people when there is one", () => {
  const withMax = (vendorDailyMax: number | null | undefined) => snapshotOf(settingsWith(), { rules: { ...RULES, vendorDailyMax } });
  const value = (vendorDailyMax: number | null | undefined) =>
    agentConfigEntries(withMax(vendorDailyMax)).find((entry) => entry.key === "rules.vendorDailyMax")?.value;
  assert.equal(value(null), "제한 없음");
  assert.equal(value(5), "5명");
  // 설정 묶음 from before 11/26 have no such rule.
  assert.equal(value(undefined), "—");
  assert.notEqual(agentConfigId(withMax(null)), agentConfigId(withMax(5)));
});

test("what it contained, in words and in the screen's order", () => {
  const entries = agentConfigEntries(snapshotOf(settingsWith({ dailyCostUsd: 100 }, { blockedDomains: ["spam.example"] })), {
    source: (id) => (id === "linkedin" ? "링크드인" : id), weekdays: (days) => (days.length === 5 ? "평일" : days.join(",")),
  });
  const value = (key: string) => entries.find((entry) => entry.key === key)?.value;
  assert.deepEqual([...new Set(entries.map((entry) => entry.group))], ["sources", "search", "sending", "rules", "prompts", "models"]);
  assert.equal(value("sources.on"), "hn, 링크드인");
  assert.match(value("sources.off") ?? "", /^brunch, careerly, /);
  // No budget share: the agent splits each day's search budget (budget.ts); its rule is listed instead.
  assert.equal(entries.some((entry) => entry.key === "settings.exploreShare"), false);
  assert.equal(value("rules.searchSplitByAgent"), "켜짐");
  assert.equal(value("settings.blockedDomains"), "spam.example");
  assert.equal(value("search.minScore"), "50점");
  assert.equal(value("search.lookFor"), "없음");
  assert.equal(value("settings.sendHours"), "평일 9~21시");
  assert.equal(value("settings.dailyCostUsd"), "$100.00");
  assert.equal(value("rules.minFits"), "2곳");
  assert.equal(value("rules.graderDropsPoor"), "켜짐");
  // The two address switches (11/26): on by default; a 설정 묶음 from before has neither ("—").
  assert.equal(value("settings.vendorLookup"), "켜짐");
  assert.equal(value("settings.workAddresses"), "켜짐");
  const before = snapshotOf(settingsWith());
  const { vendorLookup: _vendor, workAddresses: _work, ...olderSettings } = before.settings;
  assert.equal(agentConfigEntries({ ...before, settings: olderSettings }).find((entry) => entry.key === "settings.vendorLookup")?.value, "—");
  assert.equal(value("prompts.judge"), "#bbbb22");
  // Instructions it does not have are not listed (a 설정 묶음 from before an instruction was kept).
  assert.equal(entries.some((entry) => entry.key === "prompts.grader"), false);
  // A 설정 묶음 from before 11/18's split still shows the open-web share it ran with.
  const old = snapshotOf(settingsWith());
  const oldEntries = agentConfigEntries({ ...old, settings: { ...old.settings, exploreShare: 0.4 } as typeof old.settings });
  assert.equal(oldEntries.find((entry) => entry.key === "settings.exploreShare")?.value, "40%");
});

test("what changed from the previous 설정 묶음, one line each", () => {
  const before = snapshotOf(settingsWith({}, { blockedDomains: ["a.example", "b.example"] }));
  const after = snapshotOf(settingsWith({}, { blockedDomains: ["b.example", "c.example"], tuning: { minScore: 60, lookFor: "백엔드 개발자" } }),
    { prompts: { ...PROMPTS, judge: "dddd4444" } });
  const changes = agentConfigChanges(before, after);
  assert.deepEqual(changes.map((change) => change.text), [
    "막을 도메인: 더함 c.example · 뺌 a.example",
    "찾을 사람: 없음 → 백엔드 개발자",
    "최소 점수: 50점 → 60점",
    "구직 판단 지침: 바뀜 (#bbbb22 → #dddd44)",
  ]);
  assert.deepEqual(agentConfigChanges(null, after), []);
  assert.deepEqual(agentConfigChanges(after, after), []);
  // A place turned on, another added: the two lists say what moved.
  const moved = agentConfigChanges(before, {
    ...before, settings: { ...before.settings, sources: { ...before.settings.sources, velog: true, hn: false, "jobs.example": true } },
  });
  assert.deepEqual(moved.map((change) => change.text), ["켜진 곳: 더함 jobs.example, velog · 뺌 hn", "꺼진 곳: 더함 hn · 뺌 velog"]);
});

test("the previous one is the latest first used before it; the label is the Korea-time day it started", () => {
  const configs = [
    { id: "aaaaaaaaaaaa", firstUsedAt: "2026-11-16T01:00:00.000Z" },
    { id: "cccccccccccc", firstUsedAt: "2026-11-18T01:00:00.000Z" },
    { id: "bbbbbbbbbbbb", firstUsedAt: "2026-11-17T15:30:00.000Z" },
  ];
  assert.equal(previousConfig(configs, "cccccccccccc")?.id, "bbbbbbbbbbbb");
  assert.equal(previousConfig(configs, "bbbbbbbbbbbb")?.id, "aaaaaaaaaaaa");
  assert.equal(previousConfig(configs, "aaaaaaaaaaaa"), null);
  assert.equal(previousConfig(configs, "dddddddddddd"), null);
  // 15:30 UTC on the 17th is the 18th in Korea.
  assert.equal(configLabel(configs[2]), "설정 묶음 #bbbbb (11/18부터)");
});

test("the code version: the deployed commit, else the deployment, else local", () => {
  assert.equal(agentCodeVersion({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123", VERCEL_DEPLOYMENT_ID: "dpl_1" }), "0123456789ab");
  assert.equal(agentCodeVersion({ VERCEL_DEPLOYMENT_ID: "dpl_1" }), "dpl_1");
  assert.equal(agentCodeVersion({ VERCEL_GIT_COMMIT_SHA: " " }), "local");
  assert.equal(agentCodeVersion({}), "local");
});
