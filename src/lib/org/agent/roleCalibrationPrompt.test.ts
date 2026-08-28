import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCalibrationSystemPrompt,
  parseRoleCalibrationDraft,
  ROLE_CALIBRATION_OPEN_URL_TOOL_DEFINITION,
  ROLE_CALIBRATION_READ_TALENT_TOOL_DEFINITION,
  ROLE_CALIBRATION_JSON_SCHEMA,
} from "@/lib/org/agent/roleCalibrationPrompt";

test("calibration writer turns one reference into concrete bonuses and an evidence explanation", () => {
  const prompt = buildRoleCalibrationSystemPrompt();

  assert.match(prompt, /directly useful when judging future candidate-to-Role fit/);
  assert.match(prompt, /small set of non-exclusive bonuses/);
  assert.match(prompt, /no conclusion, concern, or follow-up about whether the reference person fits the Role/);
  assert.match(prompt, /operational candidate language/);
  assert.match(prompt, /narrowest useful interpretation/);
  assert.match(prompt, /save them as bonuses rather than requirements/);
  assert.match(prompt, /Matchable peer group/);
  assert.match(prompt, /representative, not a whitelist/);
  assert.match(prompt, /Top-tier status explicitly/);
  assert.match(prompt, /Seoul National, KAIST, POSTECH, Yonsei, and Korea University/);
  assert.match(prompt, /Woowa Brothers or AWS anchor/);
  assert.match(prompt, /NAVER, Kakao, LINE, Coupang, Woowa Brothers, Daangn, Toss, Moloco, and Dunamu/);
  assert.match(prompt, /AWS, Google, Microsoft, Meta, and Apple/);
  assert.match(prompt, /rare adjacent experience/);
  assert.match(prompt, /two to four distinct bonuses/);
  assert.match(prompt, /Keep Role eligibility unchanged/);
  assert.match(prompt, /direct future-candidate criteria/);
  assert.match(prompt, /within 700 Korean characters/);
  assert.match(prompt, /Keep source identity, URLs, profile chronology, and calibration rationale in the user reply/);
  assert.match(prompt, /connect each material source fact to the broader school, company, achievement, or adjacent-experience rule/);
  assert.match(prompt, /recognized but not duplicated/);
  assert.match(prompt, /followUpQuestion is normally null/);
  assert.match(prompt, /missing proof that the reference person satisfies this Role is not a calibration question/);
  assert.match(prompt, /Put all currently known relevant URLs in one urls array/);
  assert.match(prompt, /shouldUpdate=false/);
  assert.match(prompt, /userReply/);
  assert.doesNotMatch(prompt, /another model/i);
  assert.doesNotMatch(prompt, /pre-open/i);
  assert.doesNotMatch(prompt, /company-side LLM/i);
  assert.doesNotMatch(prompt, /gpt-5\.6-terra/i);
});

test("calibration result requires a complete user reply", () => {
  const parsed = parseRoleCalibrationDraft({
    followUpQuestion: null,
    hiringBrief: "## 역할 적합성\n- 5년 이상\n\n## 회사 caliber\n- 별도 게이트",
    shouldUpdate: true,
    summary: "caliber 게이트를 분리했습니다.",
    userReply: "회사 인재 수준을 역할 경험과 분리해 반영했어요.",
  });

  assert.equal(parsed.followUpQuestion, null);
  assert.match(parsed.userReply, /분리해 반영/);
  assert.deepEqual(ROLE_CALIBRATION_JSON_SCHEMA.required, [
    "shouldUpdate",
    "hiringBrief",
    "summary",
    "followUpQuestion",
    "userReply",
  ]);
});

test("calibration can safely decline an ambiguous or unreadable update", () => {
  const parsed = parseRoleCalibrationDraft({
    followUpQuestion: "참고할 수 있는 경력 자료를 보내주시겠어요?",
    hiringBrief: null,
    shouldUpdate: false,
    summary: "기준을 바꿀 근거가 아직 부족합니다.",
    userReply:
      "아직 Hiring Brief는 바꾸지 않았어요. 참고할 수 있는 경력 자료를 보내주시겠어요?",
  });

  assert.equal(parsed.shouldUpdate, false);
  assert.equal(parsed.hiringBrief, null);
});

test("calibration read tools batch multiple external and internal references", () => {
  const openParameters = ROLE_CALIBRATION_OPEN_URL_TOOL_DEFINITION.function
    .parameters as any;
  const talentParameters = ROLE_CALIBRATION_READ_TALENT_TOOL_DEFINITION.function
    .parameters as any;

  assert.deepEqual(openParameters.required, ["urls"]);
  assert.equal(openParameters.properties.urls.maxItems, 8);
  assert.deepEqual(talentParameters.required, ["talentIds"]);
  assert.equal(talentParameters.properties.talentIds.maxItems, 5);
});
