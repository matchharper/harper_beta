import assert from "node:assert/strict";
import test from "node:test";
import { SIGNAL_SOURCES } from "./signals";
import {
  defaultSignalTuning, exploreBudgetUsd, fnv1a32, normalizeSignalSettings, normalizeSignalSourceSettings,
  normalizeSignalTuning, signalTuningChanges, signalTuningVersion,
} from "./tuning";

test("one default 찾는 기준 for every place", () => {
  assert.deepEqual(defaultSignalTuning(), {
    lookFor: "", keepRule: "", minScore: 60, maxAgeDays: 14, maxRounds: 2, resultsPerSearch: 10, layoffSearch: true,
  });
  assert.deepEqual(defaultSignalTuning("velog"), defaultSignalTuning("linkedin"));
  assert.deepEqual(defaultSignalTuning("explore"), defaultSignalTuning());
});

test("numbers are clamped, texts cleaned and cut, with a message for each change", () => {
  const { tuning, issues } = normalizeSignalTuning({
    minScore: "150", maxAgeDays: 0, budgetUsd: "0.123", maxRounds: "abc", resultsPerSearch: 7.6, layoffSearch: "off",
    lookFor: `  <b>backend</b>   ${"x".repeat(900)}`, keepRule: null, unknown: 1,
  }, "linkedin");
  assert.equal(tuning.minScore, 100);
  assert.equal(tuning.maxAgeDays, 1);
  assert.equal("budgetUsd" in tuning, false);
  assert.equal(tuning.maxRounds, 2);
  assert.equal(tuning.resultsPerSearch, 8);
  assert.equal(tuning.layoffSearch, false);
  assert.equal(tuning.lookFor.length, 800);
  assert.ok(tuning.lookFor.startsWith("‹b›backend‹/b› x"));
  assert.equal(tuning.keepRule, "");
  assert.deepEqual(issues.map((issue) => issue.field).sort(), ["lookFor", "maxAgeDays", "maxRounds", "minScore"]);
  assert.match(issues.find((issue) => issue.field === "minScore")!.message, /0~100 사이만 돼요 \(150 → 100\)/);
  assert.deepEqual(normalizeSignalTuning(undefined, "x").issues, []);
  assert.equal(normalizeSignalTuning({ layoffSearch: "maybe" }, "linkedin").issues[0].field, "layoffSearch");
});

test("the version: short, stable, changes only when the effective tuning does", () => {
  assert.equal(fnv1a32(""), "811c9dc5");
  assert.equal(fnv1a32("a"), "e40c292c");
  assert.equal(fnv1a32("foobar"), "bf9cf968");
  const base = signalTuningVersion("linkedin", {});
  assert.match(base, /^[0-9a-f]{8}$/);
  assert.equal(signalTuningVersion("linkedin", null), base);
  assert.equal(signalTuningVersion("linkedin", defaultSignalTuning("linkedin")), base);
  // Key order, whitespace-only edits and values that clamp to the same do not change it.
  assert.equal(
    signalTuningVersion("linkedin", { lookFor: "백엔드  개발자 ", minScore: 70 }),
    signalTuningVersion("linkedin", { minScore: "70", lookFor: "  백엔드 개발자" } as never),
  );
  assert.equal(signalTuningVersion("linkedin", { minScore: 140 }), signalTuningVersion("linkedin", { minScore: 100 }));
  // Any real change, or another source, does.
  assert.notEqual(signalTuningVersion("linkedin", { lookFor: "백엔드" }), base);
  assert.notEqual(signalTuningVersion("linkedin", { minScore: 61 }), base);
  assert.notEqual(signalTuningVersion("linkedin", { layoffSearch: false }), base);
  assert.notEqual(signalTuningVersion("threads", {}), signalTuningVersion("x", {}));
});

test("what changed between two tunings", () => {
  assert.deepEqual(signalTuningChanges("x", { minScore: 60 }, { minScore: 70, keepRule: "신입 제외" }).map((item) => [item.field, item.label, item.before, item.after]), [
    ["keepRule", "남길 기준", "", "신입 제외"],
    ["minScore", "최소 점수", 60, 70],
  ]);
  assert.deepEqual(signalTuningChanges("x", {}, defaultSignalTuning("x")), []);
});

test("place settings: the default list always (productive places on), earlier ids, added domains", () => {
  const { settings, issues } = normalizeSignalSourceSettings({
    opentowork: { enabled: false, minScore: 70 },
    threads: { enabled: "maybe" },
    recruiter: { enabled: true },
    "https://www.someone.dev/": { enabled: true },
    explore: { enabled: true },
  });
  assert.deepEqual(Object.keys(settings), [...SIGNAL_SOURCES, "someone.dev"]);
  assert.deepEqual(settings.linkedin, { enabled: false });
  assert.equal(settings.threads.enabled, false); // not a yes/no: its default (off)
  assert.equal(settings.hn.enabled, true); // Hacker News is on by default (its API is free)
  assert.equal(settings.okky.enabled, false);
  assert.equal(settings["someone.dev"].enabled, true);
  assert.deepEqual(issues.map((issue) => [issue.source, issue.field]), [["threads", "enabled"]]);
  // Nothing saved: the places that found people (and Hacker News) are on, the rest listed but off.
  const fresh = normalizeSignalSourceSettings({}).settings;
  assert.deepEqual(Object.keys(fresh).filter((id) => fresh[id].enabled).sort(), ["brunch", "hn", "linkedin", "velog"]);
  // The source's own id wins over an earlier one.
  assert.equal(normalizeSignalSourceSettings({ linkedin: { enabled: true }, opentowork: { enabled: false } }).settings.linkedin.enabled, true);
});

test("settings as a whole: open-web share, the one 찾는 기준, blocked domains", () => {
  const { settings, issues } = normalizeSignalSettings({
    sources: {}, exploreShare: "1.5", tuning: { lookFor: "백엔드" }, blockedDomains: ["https://spam.com/x", "spam.com", "bad"],
  });
  assert.equal(settings.exploreShare, 1);
  assert.equal(settings.tuning.lookFor, "백엔드");
  // An earlier save's open-web tuning is read as the one 찾는 기준.
  assert.equal(normalizeSignalSettings({ explore: { lookFor: "개인 사이트" } }).settings.tuning.lookFor, "개인 사이트");
  assert.deepEqual(settings.blockedDomains, ["spam.com"]);
  assert.deepEqual(issues.map((issue) => issue.field), ["exploreShare"]);
  assert.equal(normalizeSignalSettings({}).settings.exploreShare, 0.4);
  assert.equal(exploreBudgetUsd(2, 0.2), 0.4);
  assert.equal(exploreBudgetUsd(2, 0), 0);
  assert.equal(exploreBudgetUsd(2, Number.NaN), 0.8);
});
