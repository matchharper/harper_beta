import assert from "node:assert/strict";
import test from "node:test";
import { formatCompanyNameSearch } from "./companyNames";

test("a company-name search tells which named employers matched the directory and had matching roles", () => {
  const text = formatCompanyNameSearch([
    { query: "Upstage", matches: [{ companyWorkspaceId: "u", name: "Upstage" }], partial: false },
    { query: "뤼튼", matches: [{ companyWorkspaceId: "w", name: "뤼튼테크놀로지스" }], partial: true },
    { query: "Liner", matches: [], partial: false },
  ], new Map([["u", 2], ["w", 0]]));
  assert.match(text, /Upstage → Upstage \(2 matching roles retrieved\)/);
  assert.match(text, /뤼튼 → no exact name; partial matches 뤼튼테크놀로지스 \(0 matching roles retrieved\)/);
  assert.match(text, /Liner: not in Harper's company directory/);
  assert.match(text, /official careers page/);
});
