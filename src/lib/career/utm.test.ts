import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_LANDING_SESSION_GAP_MS,
  readCareerSourceFromReferrer,
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

test("classifies untagged external referrers into broad GTM channels", () => {
  assert.equal(
    readCareerSourceFromReferrer("android-app://com.linkedin.android/"),
    "linkedin"
  );
  assert.equal(
    readCareerSourceFromReferrer("https://www.google.com/search?q=harper"),
    "seo"
  );
  assert.equal(
    readCareerSourceFromReferrer(
      "https://search.naver.com/search.naver?query=harper"
    ),
    "seo"
  );
  assert.equal(
    readCareerSourceFromReferrer("https://www.linkedin.com/feed/"),
    "linkedin"
  );
  assert.equal(
    readCareerSourceFromReferrer(
      "https://l.instagram.com/?u=https%3A%2F%2Fmatchharper.com"
    ),
    "instagram"
  );
  assert.equal(
    readCareerSourceFromReferrer("https://www.threads.net/@matchharper"),
    "threads"
  );
});

test("does not invent a channel for direct, internal, or invalid referrers", () => {
  assert.equal(readCareerSourceFromReferrer(""), null);
  assert.equal(readCareerSourceFromReferrer("not a url"), null);
  assert.equal(
    readCareerSourceFromReferrer("https://matchharper.com/career"),
    null
  );
});
