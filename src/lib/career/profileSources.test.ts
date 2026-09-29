import assert from "node:assert/strict";
import test from "node:test";
import {
  countCareerProfileLinks,
  getCareerProfileSourceSuggestion,
} from "./profileSources";

test("empty slots do not count; additional personal links do", () => {
  assert.equal(countCareerProfileLinks(["", "  ", "https://example.com"]), 1);
  assert.equal(
    countCareerProfileLinks([
      "",
      "",
      "",
      "",
      "",
      "https://one.dev",
      "https://two.dev",
    ]),
    2
  );
});

test("request sources only when saved links plus connected Gmail total at most one", () => {
  for (const [links, gmailConnected, shouldSuggest] of [
    [[], false, true],
    [[], true, true],
    [["https://linkedin.com/in/fixture"], false, true],
    [["https://linkedin.com/in/fixture"], true, false],
    [["https://one.dev", "https://two.dev"], false, false],
    [["https://one.dev", "https://two.dev"], true, false],
  ] as const) {
    assert.equal(
      Boolean(getCareerProfileSourceSuggestion(links, gmailConnected)),
      shouldSuggest
    );
  }
});

test("only missing source logos are suggested, using saved source slots", () => {
  assert.deepEqual(
    getCareerProfileSourceSuggestion(
      ["https://linkedin.com/in/fixture"],
      false
    ),
    {
      missingLinkIndexes: [1, 2, 3, 4],
      gmailMissing: true,
    }
  );
  assert.deepEqual(
    getCareerProfileSourceSuggestion(["", "", "", "", ""], true),
    {
      missingLinkIndexes: [0, 1, 2, 3, 4],
      gmailMissing: false,
    }
  );
});
