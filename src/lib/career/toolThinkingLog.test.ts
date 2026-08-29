import assert from "node:assert/strict";
import test from "node:test";
import { getCareerToolStartThinkingLog } from "./toolThinkingLog";

test("shows localized thinking logs for hidden reevaluation evidence", () => {
  assert.equal(
    getCareerToolStartThinkingLog(
      "record_internal_fit_reevaluation_information",
      "ko"
    ),
    "추가로 알려주신 정보를 반영하고 있습니다."
  );
  assert.equal(
    getCareerToolStartThinkingLog(
      "record_internal_fit_reevaluation_information",
      "en"
    ),
    "Saving the additional information you shared."
  );
});

test("shows localized thinking logs for company-request responses", () => {
  assert.equal(
    getCareerToolStartThinkingLog(
      "record_company_request_response",
      "ko"
    ),
    "회사에 전할 답변을 정리하고 있습니다."
  );
  assert.equal(
    getCareerToolStartThinkingLog(
      "record_company_request_response",
      "en"
    ),
    "Preparing your response to share with the company."
  );
});

test("does not invent a thinking log for an unknown tool", () => {
  assert.equal(getCareerToolStartThinkingLog("unknown_tool", "ko"), "");
});
