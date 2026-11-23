import assert from "node:assert/strict";
import test from "node:test";
import { getCareerToolStartThinkingLog, isCareerApplicationCheckTool } from "./toolThinkingLog";

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
      query: "  서울   데이터 엔지니어 채용 ",
    }),
    '"서울 데이터 엔지니어 채용" 검색 중'
  );
  // Before the call's input is known, the fixed label still fills the wait.
  assert.equal(
    getCareerToolStartThinkingLog("open_url", "en"),
    "Checking the shared link."
  );
  assert.equal(getCareerToolStartThinkingLog("web_search", "ko"), "");
});

test("a batched link read has one fallback status covering its sites", () => {
  assert.equal(getCareerToolStartThinkingLog("open_url", "en", {
    url: ["https://www.example.com/a", "https://example.com/b", "https://other.test/c"],
  }), "Reading example.com, other.test");
});

test("only a browser run that reads a form before review counts as an application check", () => {
  assert.equal(isCareerApplicationCheckTool("use_browser", { action: "run", mode: "prepare" }), true);
  assert.equal(isCareerApplicationCheckTool("use_browser", { action: "run" }), true);
  assert.equal(isCareerApplicationCheckTool("use_browser", { action: "run", mode: "execute" }), false);
  assert.equal(isCareerApplicationCheckTool("use_browser", { action: "close" }), false);
  assert.equal(isCareerApplicationCheckTool("open_url", { action: "run" }), false);
});
