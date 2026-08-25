import assert from "node:assert/strict";
import test from "node:test";
import { PROJECT_ROOT } from "./translationCommon.mjs";
import {
  applyCareerSyncPlan,
  buildCareerSyncPlan,
  createManualTranslationRequest,
  validateManualTranslationRequest,
} from "./translationSyncCore.mjs";

function call({ key, koSource, line = 1, nodeStart = 1 }) {
  return {
    filePath: `${PROJECT_ROOT}/src/components/career/TestPanel.tsx`,
    key,
    koSource,
    location: `src/components/career/TestPanel.tsx:${line}`,
    nodeStart,
  };
}

function dbRow(key, locale, value) {
  return { key, locale, value };
}

function directlyTranslate(plan, englishByKey) {
  const request = createManualTranslationRequest(plan);
  request.translationMethod = "codex_direct";
  for (const [key, en] of Object.entries(englishByKey)) {
    request.translations[key].en = en;
  }
  return request;
}

test("changed Korean source requires direct English and only that key is pushed", () => {
  const calls = [call({ key: "career.profile.save", koSource: "프로필 저장" })];
  const localKo = {
    "career.profile.save": "저장하기",
    "career.profile.title": "프로필",
  };
  const localEn = {
    "career.profile.save": "Save",
    "career.profile.title": "Old profile title",
  };
  const dbRows = [
    dbRow("career.profile.save", "ko", "저장하기"),
    dbRow("career.profile.save", "en", "Save"),
    dbRow("career.profile.title", "ko", "프로필"),
    dbRow("career.profile.title", "en", "Profile"),
  ];
  const plan = buildCareerSyncPlan({ calls, dbRows, localEn, localKo });

  assert.deepEqual(
    plan.codeChanges.map(({ key, reason }) => ({ key, reason })),
    [
      {
        key: "career.profile.save",
        reason: "korean_source_changed",
      },
    ]
  );

  const result = applyCareerSyncPlan({
    dbRows,
    localEn,
    localKo,
    plan,
    request: directlyTranslate(plan, {
      "career.profile.save": "Save profile",
    }),
  });

  assert.equal(result.nextKo["career.profile.save"], "프로필 저장");
  assert.equal(result.nextEn["career.profile.save"], "Save profile");
  assert.equal(result.nextEn["career.profile.title"], "Profile");
  assert.deepEqual(
    result.dbUpserts.map(({ key, locale, value }) => ({ key, locale, value })),
    [
      { key: "career.profile.save", locale: "ko", value: "프로필 저장" },
      { key: "career.profile.save", locale: "en", value: "Save profile" },
    ]
  );
});

test('t("new") gets a stable key and requires a direct translation', () => {
  const calls = [call({ key: "new", koSource: "이력서 보강하기" })];
  const plan = buildCareerSyncPlan({
    calls,
    dbRows: [],
    localEn: {},
    localKo: {},
  });

  assert.equal(plan.codeChanges.length, 1);
  assert.equal(plan.codeChanges[0].reason, "new_key");
  assert.match(plan.codeChanges[0].key, /^career\.common\.test_panel\./);
  assert.equal(plan.keyRewrites.size, 1);

  const key = plan.codeChanges[0].key;
  const request = directlyTranslate(plan, { [key]: "Improve your resume" });
  const result = applyCareerSyncPlan({
    dbRows: [],
    localEn: {},
    localKo: {},
    plan,
    request,
  });

  assert.equal(result.nextKo[key], "이력서 보강하기");
  assert.equal(result.nextEn[key], "Improve your resume");
  assert.equal(result.dbUpserts.length, 2);
});

test("DB-only differences update local files and produce no DB upserts", () => {
  const calls = [call({ key: "career.profile.title", koSource: "프로필" })];
  const localKo = { "career.profile.title": "프로필" };
  const localEn = {
    "career.profile.title": "Old profile title",
    "career.local.only": "Keep me",
  };
  const dbRows = [
    dbRow("career.profile.title", "ko", "프로필"),
    dbRow("career.profile.title", "en", "Profile"),
  ];
  const plan = buildCareerSyncPlan({ calls, dbRows, localEn, localKo });
  const result = applyCareerSyncPlan({
    dbRows,
    localEn,
    localKo,
    plan,
    request: null,
  });

  assert.equal(plan.codeChanges.length, 0);
  assert.equal(result.nextEn["career.profile.title"], "Profile");
  assert.equal(result.nextEn["career.local.only"], "Keep me");
  assert.deepEqual(result.dbUpserts, []);
});

test("manual translation validation rejects automatic or incomplete claims", () => {
  const calls = [
    call({
      key: "career.common.count",
      koSource: "총 {count}개를 찾았습니다.",
    }),
  ];
  const plan = buildCareerSyncPlan({
    calls,
    dbRows: [],
    localEn: { "career.common.count": "Found items." },
    localKo: { "career.common.count": "항목을 찾았습니다." },
  });
  const request = createManualTranslationRequest(plan);

  assert.throws(
    () => validateManualTranslationRequest(plan, request),
    /translationMethod/
  );

  request.translationMethod = "codex_direct";
  request.translations["career.common.count"].en = "Found the items.";
  assert.throws(
    () => validateManualTranslationRequest(plan, request),
    /Placeholder mismatch/
  );

  request.translations["career.common.count"].en = "Found {count} items.";
  assert.deepEqual(validateManualTranslationRequest(plan, request), {
    "career.common.count": "Found {count} items.",
  });
});

test("conflicting Korean sources for one key stop the plan", () => {
  const calls = [
    call({ key: "career.profile.save", koSource: "저장", nodeStart: 1 }),
    call({
      key: "career.profile.save",
      koSource: "프로필 저장",
      line: 2,
      nodeStart: 2,
    }),
  ];

  assert.throws(
    () =>
      buildCareerSyncPlan({
        calls,
        dbRows: [],
        localEn: {},
        localKo: {},
      }),
    /Conflicting t\(\) Korean sources/
  );
});
