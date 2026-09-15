import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_LANDING_SESSION_GAP_MS,
  readCareerUtmParamsFromSearch,
  resolveActiveCareerExplicitUtmSource,
} from "@/lib/career/utm";

test("reads a complete UTM payload from any page search string", () => {
  assert.deepEqual(
    readCareerUtmParamsFromSearch(
      "?utm_source=linkedin&utm_medium=social&utm_campaign=fall&utm_content=post-1&utm_term=ai"
    ),
    {
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "fall",
      utm_content: "post-1",
      utm_term: "ai",
    }
  );
});

test("keeps an explicit UTM source active for the attribution session", () => {
  const capturedAt = Date.UTC(2026, 8, 14, 0, 0, 0);

  assert.equal(
    resolveActiveCareerExplicitUtmSource(
      "LinkedIn",
      String(capturedAt),
      capturedAt + CAREER_LANDING_SESSION_GAP_MS - 1
    ),
    "linkedin"
  );
  assert.equal(
    resolveActiveCareerExplicitUtmSource(
      "linkedin",
      String(capturedAt),
      capturedAt + CAREER_LANDING_SESSION_GAP_MS
    ),
    null
  );
});

test("rejects invalid or incomplete explicit UTM attribution state", () => {
  assert.equal(resolveActiveCareerExplicitUtmSource("", "123", 123), null);
  assert.equal(
    resolveActiveCareerExplicitUtmSource("linkedin", "not-a-date", 123),
    null
  );
});
