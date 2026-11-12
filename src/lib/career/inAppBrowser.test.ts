import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSafariOpenUrl,
  describeBrowserForLog,
  detectInAppBrowserApp,
  detectMobileOs,
  readOfficialJobsLandingIdFromSearch,
  watchForPageLeave,
} from "./inAppBrowser";

const LINKEDIN_IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31.1234";
const LINKEDIN_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [LinkedInApp]/4.1.1000";
const KAKAO_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.9.0";
const SAFARI_IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const LOGIN_URL =
  "https://matchharper.com/career_login?next=%2Fcareer&source=official_jobs&lid=3f2b8c1e-9a0d-4c5e-8f7a-1b2c3d4e5f60#top";

test("names the in-app browser's app, and nothing for Safari or desktop Chrome", () => {
  assert.equal(detectInAppBrowserApp(LINKEDIN_IPHONE_UA), "linkedin");
  assert.equal(detectInAppBrowserApp(LINKEDIN_ANDROID_UA), "linkedin");
  assert.equal(detectInAppBrowserApp(KAKAO_ANDROID_UA), "kakaotalk");
  assert.equal(detectInAppBrowserApp(SAFARI_IPHONE_UA), null);
  assert.equal(detectInAppBrowserApp(DESKTOP_CHROME_UA), null);
});

test("detects the mobile OS", () => {
  assert.equal(detectMobileOs(LINKEDIN_IPHONE_UA), "ios");
  assert.equal(detectMobileOs(LINKEDIN_ANDROID_UA), "android");
  assert.equal(detectMobileOs(DESKTOP_CHROME_UA), "other");
});

test("describes the browser for logs without anything about the user", () => {
  assert.deepEqual(describeBrowserForLog(LINKEDIN_IPHONE_UA, true), {
    inApp: true,
    app: "linkedin",
    os: "ios",
  });
  assert.deepEqual(describeBrowserForLog(SAFARI_IPHONE_UA, false), {
    inApp: false,
    app: null,
    os: "ios",
  });
  // An Android WebView the login page treats as in-app, from no known app.
  assert.deepEqual(
    describeBrowserForLog(
      "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
      true
    ),
    { inApp: true, app: "other", os: "android" }
  );
});

test("builds the Safari link with the whole URL, including the visitor ID", () => {
  assert.equal(
    buildSafariOpenUrl(LOGIN_URL),
    "x-safari-https://matchharper.com/career_login?next=%2Fcareer&source=official_jobs&lid=3f2b8c1e-9a0d-4c5e-8f7a-1b2c3d4e5f60#top"
  );
  assert.equal(
    buildSafariOpenUrl("http://localhost:3000/career_login?lid=abc"),
    "x-safari-http://localhost:3000/career_login?lid=abc"
  );
  assert.equal(buildSafariOpenUrl("intent://x#Intent;end"), null);
});

test("reads the /jobs visitor ID only from a Jobs login URL", () => {
  const lid = "3f2b8c1e-9a0d-4c5e-8f7a-1b2c3d4e5f60";
  assert.equal(
    readOfficialJobsLandingIdFromSearch(`?source=official_jobs&lid=${lid}`),
    lid
  );
  // The auth callback carries them inside `next` too.
  assert.equal(
    readOfficialJobsLandingIdFromSearch(
      `?flow=talent_capture&next=${encodeURIComponent(
        `/career?source=official_jobs&lid=${lid}`
      )}`
    ),
    lid
  );
  assert.equal(
    readOfficialJobsLandingIdFromSearch(`?source=career&lid=${lid}`),
    null
  );
  assert.equal(readOfficialJobsLandingIdFromSearch("?source=official_jobs"), null);
  assert.equal(
    readOfficialJobsLandingIdFromSearch("?source=official_jobs&lid=<script>"),
    null
  );
  // Older anonymous IDs are `${Date.now()}-${hex}`.
  assert.equal(
    readOfficialJobsLandingIdFromSearch(
      "?source=official_jobs&lid=1731400000000-9f3a2b"
    ),
    "1731400000000-9f3a2b"
  );
});

function fakePage() {
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, { at: number; handler: () => void }>();
  let now = 0;
  let nextId = 1;
  const add = (type: string, listener: () => void) => {
    const set = listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    listeners.set(type, set);
  };
  const remove = (type: string, listener: () => void) => {
    listeners.get(type)?.delete(listener);
  };
  const fire = (type: string) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener();
  };
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: add,
    removeEventListener: remove,
  };
  const win = {
    addEventListener: add,
    removeEventListener: remove,
    setTimeout: (handler: () => void, timeout: number) => {
      const id = nextId++;
      timers.set(id, { at: now + timeout, handler });
      return id;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
  };
  return {
    doc,
    win,
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.handler();
      }
    },
    hide() {
      doc.visibilityState = "hidden";
      fire("visibilitychange");
    },
    unload() {
      fire("pagehide");
    },
    pending() {
      let count = 0;
      for (const set of listeners.values()) count += set.size;
      return count + timers.size;
    },
  };
}

function watch(page: ReturnType<typeof fakePage>, calls: string[]) {
  return watchForPageLeave({
    doc: page.doc,
    win: page.win,
    stayedAfterMs: 1500,
    watchMs: 60000,
    onLeft: () => calls.push("left"),
    onReplaced: () => calls.push("replaced"),
    onStayed: () => calls.push("stayed"),
  });
}

test("reports leaving when the outside browser takes over, and shows no fallback", () => {
  const page = fakePage();
  const calls: string[] = [];
  watch(page, calls);
  page.advance(400);
  page.hide();
  page.advance(5000);
  assert.deepEqual(calls, ["left"]);
  assert.equal(page.pending(), 0);
});

test("reports a replaced page (e.g. an error page for the link) apart from leaving", () => {
  const page = fakePage();
  const calls: string[] = [];
  watch(page, calls);
  page.advance(300);
  page.unload();
  page.hide();
  assert.deepEqual(calls, ["replaced"]);
  assert.equal(page.pending(), 0);
});

test("shows the fallback when the page is still there, and still notes a later leave", () => {
  const page = fakePage();
  const calls: string[] = [];
  watch(page, calls);
  page.advance(1500);
  assert.deepEqual(calls, ["stayed"]);
  page.advance(20000);
  page.hide();
  assert.deepEqual(calls, ["stayed", "left"]);
  assert.equal(page.pending(), 0);
});

test("stops watching after the watch window and on cleanup", () => {
  const page = fakePage();
  const calls: string[] = [];
  watch(page, calls);
  page.advance(60000);
  page.hide();
  assert.deepEqual(calls, ["stayed"]);
  assert.equal(page.pending(), 0);

  const second = fakePage();
  const secondCalls: string[] = [];
  const cleanup = watch(second, secondCalls);
  cleanup();
  second.advance(70000);
  second.hide();
  assert.deepEqual(secondCalls, []);
  assert.equal(second.pending(), 0);
});
