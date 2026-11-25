import assert from "node:assert/strict";
import test from "node:test";
import {
  ONE_SCREEN_DRAFT_MAX_AGE_MS,
  checkOneScreenLinkedinUrl,
  chooseOneScreenAccountSlot,
  clearOneScreenDraft,
  hasOneScreenGoogleParam,
  isOneScreenEmail,
  isOneScreenMaterialReady,
  oneScreenBrowserUrl,
  readOneScreenFromVisitor,
  oneScreenDraftKey,
  oneScreenReturnPath,
  parseOneScreenDraft,
  readOneScreenDraft,
  writeOneScreenDraft,
} from "./oneScreenDraft";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const filled = {
  name: "김예시",
  linkedinUrl: "https://www.linkedin.com/in/example",
  note: "에이전트 제품을 만들어 봤어요",
  consent: true,
  hadResume: true,
};

test("keeps the draft under harper_onescreen_draft:<slug> and reads it back", () => {
  const storage = memoryStorage();
  writeOneScreenDraft(storage, "example-role", filled, 1_000);
  assert.equal(oneScreenDraftKey("example-role"), "harper_onescreen_draft:example-role");
  assert.ok(storage.items.has("harper_onescreen_draft:example-role"));
  assert.deepEqual(readOneScreenDraft(storage, "example-role", 2_000), {
    ...filled,
    savedAt: 1_000,
  });
});

test("never keeps a file, only that one had been picked", () => {
  const storage = memoryStorage();
  writeOneScreenDraft(
    storage,
    "s",
    { ...filled, resumeFile: { name: "cv.pdf" } } as typeof filled,
    1
  );
  const saved = JSON.parse(storage.items.get(oneScreenDraftKey("s")) ?? "{}");
  assert.equal("resumeFile" in saved, false);
  assert.equal(saved.hadResume, true);
});

test("an empty form removes the draft", () => {
  const storage = memoryStorage();
  writeOneScreenDraft(storage, "s", filled, 1);
  writeOneScreenDraft(
    storage,
    "s",
    { name: " ", linkedinUrl: "", note: "", consent: false, hadResume: false },
    2
  );
  assert.equal(storage.items.size, 0);
});

test("clears the draft", () => {
  const storage = memoryStorage();
  writeOneScreenDraft(storage, "s", filled, 1);
  clearOneScreenDraft(storage, "s");
  assert.equal(readOneScreenDraft(storage, "s", 2), null);
});

test("drops an old, broken or foreign draft", () => {
  const saved = JSON.stringify({ ...filled, savedAt: 0 });
  assert.equal(parseOneScreenDraft(saved, ONE_SCREEN_DRAFT_MAX_AGE_MS + 1), null);
  assert.ok(parseOneScreenDraft(saved, ONE_SCREEN_DRAFT_MAX_AGE_MS));
  assert.equal(parseOneScreenDraft("{not json", 0), null);
  assert.equal(parseOneScreenDraft("null", 0), null);
  assert.equal(parseOneScreenDraft(JSON.stringify({ name: "x" }), 0), null);
  assert.deepEqual(
    parseOneScreenDraft(JSON.stringify({ savedAt: 5, name: 3, consent: "yes" }), 5),
    { name: "", linkedinUrl: "", note: "", consent: false, hadResume: false, savedAt: 5 }
  );
});

test("blocked storage never throws", () => {
  assert.equal(readOneScreenDraft(throwingStorage, "s"), null);
  assert.doesNotThrow(() => writeOneScreenDraft(throwingStorage, "s", filled));
  assert.doesNotThrow(() => clearOneScreenDraft(throwingStorage, "s"));
  assert.equal(readOneScreenDraft(null, "s"), null);
});

test("writing the same draft again keeps the time it was really written", () => {
  const store = memoryStorage();
  writeOneScreenDraft(store, "s", filled, 1_000);
  // A restore saves the same content back: the 24 hours still run from 1_000.
  writeOneScreenDraft(store, "s", filled, 5_000);
  assert.equal(readOneScreenDraft(store, "s", 6_000)?.savedAt, 1_000);
  assert.equal(readOneScreenDraft(store, "s", 1_000 + ONE_SCREEN_DRAFT_MAX_AGE_MS + 1), null);
  // A real change starts a new clock.
  writeOneScreenDraft(store, "s", { ...filled, name: filled.name + "!" }, 7_000);
  assert.equal(readOneScreenDraft(store, "s", 8_000)?.savedAt, 7_000);
});

test("③ is done with a CV, or a valid LinkedIn URL while the tile is on", () => {
  const url = "linkedin.com/in/example";
  assert.equal(isOneScreenMaterialReady({ resumeFile: null, linkedinOn: true, linkedinUrl: url }), true);
  assert.equal(isOneScreenMaterialReady({ resumeFile: null, linkedinOn: false, linkedinUrl: url }), false);
  assert.equal(
    isOneScreenMaterialReady({ resumeFile: null, linkedinOn: true, linkedinUrl: "linkedin.com/company/x" }),
    false
  );
  assert.equal(isOneScreenMaterialReady({ resumeFile: {}, linkedinOn: false, linkedinUrl: "" }), true);
  // A typed but invalid address blocks sending, even next to a CV.
  assert.equal(isOneScreenMaterialReady({ resumeFile: {}, linkedinOn: true, linkedinUrl: "linkedin.com/company/x" }), false);
  assert.equal(isOneScreenMaterialReady({ resumeFile: {}, linkedinOn: true, linkedinUrl: "  " }), true);
  assert.equal(isOneScreenMaterialReady({ resumeFile: {}, linkedinOn: true, linkedinUrl: url }), true);
});

test("accepts linkedin.com/in/... only", () => {
  assert.equal(
    checkOneScreenLinkedinUrl("https://www.linkedin.com/in/example-12ab/?utm_source=share"),
    "https://www.linkedin.com/in/example-12ab"
  );
  assert.equal(checkOneScreenLinkedinUrl("kr.linkedin.com/in/example"), "https://www.linkedin.com/in/example");
  for (const bad of [
    "",
    "https://www.linkedin.com/company/example",
    "https://www.linkedin.com/in/",
    "https://example.com/in/someone",
    "https://linkedin.com.evil.example/in/someone",
  ]) {
    assert.equal(checkOneScreenLinkedinUrl(bad), null, bad);
  }
});

test("checks email shape", () => {
  assert.equal(isOneScreenEmail(" someone@example.com "), true);
  assert.equal(isOneScreenEmail("someone@example"), false);
  assert.equal(isOneScreenEmail("someone example.com"), false);
});

test("returns to this page's sign-up box, without os_google or mode", () => {
  assert.equal(
    oneScreenReturnPath("https://matchharper.com/jobs/example?onescreen=1&os_google=1&mode=similar#x"),
    "/jobs/example?onescreen=1"
  );
  assert.equal(
    oneScreenReturnPath("https://matchharper.com/jobs/example?onescreen=1&utm_source=linkedin"),
    "/jobs/example?onescreen=1&utm_source=linkedin"
  );
  assert.equal(oneScreenReturnPath("/jobs/example"), "/jobs/example");
});

test("opens the full-page one screen in the outside browser, starting Google once", () => {
  const url = new URL(
    oneScreenBrowserUrl("https://matchharper.com/jobs/example?utm_source=li&mode=similar#top")
  );
  assert.equal(url.pathname, "/jobs/example");
  assert.equal(url.searchParams.get("utm_source"), "li");
  assert.equal(url.searchParams.get("onescreen"), "1");
  assert.equal(url.searchParams.get("os_google"), "1");
  assert.equal(url.searchParams.has("mode"), false);
  assert.equal(url.hash, "");
  assert.equal(hasOneScreenGoogleParam(url.search), true);
  assert.equal(hasOneScreenGoogleParam("?onescreen=1"), false);
  assert.equal(url.searchParams.has("lid"), false);

  const carried = new URL(
    oneScreenBrowserUrl("https://matchharper.com/jobs/example", "a1b2c3d4-visitor")
  );
  assert.equal(readOneScreenFromVisitor(carried.search), "a1b2c3d4-visitor");
  assert.equal(
    new URL(oneScreenBrowserUrl("https://matchharper.com/jobs/example", "bad id!")).searchParams.has("lid"),
    false
  );
  assert.equal(readOneScreenFromVisitor("?lid=%3Cscript%3E"), null);
});

test("picks the account slot by browser", () => {
  const iphoneLinkedIn =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1";
  const androidLinkedIn =
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 [LinkedInApp]/4.1";
  const androidKakao =
    "Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 KAKAOTALK 10.6.0";
  const iphoneSafari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const desktop =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
  assert.equal(chooseOneScreenAccountSlot(iphoneLinkedIn), "safari");
  assert.equal(chooseOneScreenAccountSlot(androidLinkedIn), "android_menu");
  assert.equal(chooseOneScreenAccountSlot(androidKakao), "in_app");
  assert.equal(chooseOneScreenAccountSlot(iphoneSafari), "google");
  assert.equal(chooseOneScreenAccountSlot(desktop), "google");
});
