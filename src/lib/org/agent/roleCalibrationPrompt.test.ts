import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCalibrationSystemPrompt,
  parseRoleCalibrationDraft,
  ROLE_CALIBRATION_OPEN_URL_TOOL_DEFINITION,
  ROLE_CALIBRATION_READ_TALENT_TOOL_DEFINITION,
  ROLE_CALIBRATION_JSON_SCHEMA,
} from "@/lib/org/agent/roleCalibrationPrompt";

test("calibration writer separates role fit from company caliber without biography cloning", () => {
  const prompt = buildRoleCalibrationSystemPrompt();

  assert.match(prompt, /independent gates/);
  assert.match(prompt, /still fall below this bar/);
  assert.match(prompt, /Top-tier schools or programs/);
  assert.match(prompt, /Do not erase a supported Top-tier school/);
  assert.match(prompt, /ONE PERSON: treat the person as a tentative anchor/);
  assert.match(prompt, /grow by no more than 500 Korean characters/);
  assert.match(prompt, /without explaining why beyond a short confirmation/);
  assert.match(prompt, /do not create new accepted-equivalent categories/);
  assert.match(prompt, /correct update is usually just a compact reference bullet/);
  assert.match(prompt, /THREE OR MORE PEOPLE/);
  assert.match(prompt, /under 300 Korean characters/);
  assert.match(prompt, /With two or more references, the complete brief should normally be about 1,500-3,000/);
  assert.match(prompt, /Remove runtime or provenance noise/);
  assert.match(prompt, /LinkedIn page, GitHub profile/);
  assert.match(prompt, /call open_url with all immediately known relevant URLs/);
  assert.match(prompt, /source format never determines the intent/);
  assert.match(prompt, /shouldUpdate=false/);
  assert.match(prompt, /userReply/);
});

test("calibration result requires a complete Terra-authored user reply", () => {
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
