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
    getCareerToolStartThinkingLog("contact_company", "ko"),
    "회사에 전할 답변을 정리하고 있습니다."
  );
  assert.equal(
    getCareerToolStartThinkingLog("contact_company", "en"),
    "Preparing your response to share with the company."
  );
});

test("does not invent a thinking log for an unknown tool", () => {
  assert.equal(getCareerToolStartThinkingLog("unknown_tool", "ko"), "");
});

test("names the site a link opens and the words a web search uses", () => {
  assert.equal(
    getCareerToolStartThinkingLog("open_url", "ko", {
      url: "https://www.wanted.co.kr/wd/391399",
    }),
    "wanted.co.kr 읽는 중"
  );
  assert.equal(
    getCareerToolStartThinkingLog("open_url", "en", {
      url: "https://www.wanted.co.kr/wd/391399",
    }),
    "Reading wanted.co.kr"
  );
  assert.equal(
    getCareerToolStartThinkingLog("web_search", "ko", {
      query: "  크몽   데이터 엔지니어 채용 ",
    }),
    '"크몽 데이터 엔지니어 채용" 검색 중'
  );
  // Before the call's input is known, the fixed label still fills the wait.
  assert.equal(
    getCareerToolStartThinkingLog("open_url", "en"),
    "Checking the shared link."
  );
  assert.equal(getCareerToolStartThinkingLog("web_search", "ko"), "");
});
