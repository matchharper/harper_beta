import assert from "node:assert/strict";
import test from "node:test";
import {
  OFFICIAL_JOBS_ONESCREEN_ROLLOUT,
  decideOfficialJobsOneScreenScope,
  initialOfficialJobsOneScreenPanel,
  type OfficialJobsOneScreenRollout,
} from "./oneScreen";
import { classifyOfficialJobLinkedRole } from "./visibility";

const AB = "ws-ab";
const off: OfficialJobsOneScreenRollout = {
  abWorkspaceIds: [AB],
  allRolePostings: false,
  bundlePostings: false,
  closedRoleCard: false,
};

test("at release only the A/B workspaces' open role postings get the one screen", () => {
  assert.deepEqual(OFFICIAL_JOBS_ONESCREEN_ROLLOUT.allRolePostings, false);
  assert.deepEqual(OFFICIAL_JOBS_ONESCREEN_ROLLOUT.bundlePostings, false);
  assert.deepEqual(OFFICIAL_JOBS_ONESCREEN_ROLLOUT.closedRoleCard, false);
  assert.equal(OFFICIAL_JOBS_ONESCREEN_ROLLOUT.abWorkspaceIds.length, 1);

  assert.deepEqual(
    decideOfficialJobsOneScreenScope({
      roleId: "r",
      linkedRole: { workspaceId: AB, open: true },
      rollout: off,
    }),
    { kind: "role", abTest: true }
  );
  for (const linkedRole of [
    { workspaceId: "other", open: true },
    { workspaceId: AB, open: false },
    { workspaceId: null, open: true },
  ]) {
    assert.equal(
      decideOfficialJobsOneScreenScope({ roleId: "r", linkedRole, rollout: off }),
      null
    );
  }
  assert.equal(
    decideOfficialJobsOneScreenScope({ roleId: null, linkedRole: null, rollout: off }),
    null
  );
});

test("the switched-off paths turn on one by one without an A/B", () => {
  const on = { ...off, allRolePostings: true, bundlePostings: true, closedRoleCard: true };
  assert.deepEqual(
    decideOfficialJobsOneScreenScope({
      roleId: "r",
      linkedRole: { workspaceId: "other", open: true },
      rollout: on,
    }),
    { kind: "role", abTest: false }
  );
  assert.deepEqual(
    decideOfficialJobsOneScreenScope({ roleId: null, linkedRole: null, rollout: on }),
    { kind: "bundle", abTest: false }
  );
  assert.deepEqual(
    decideOfficialJobsOneScreenScope({
      roleId: "r",
      linkedRole: { workspaceId: AB, open: false },
      rollout: on,
    }),
    { kind: "closed", abTest: false }
  );
});

test("a closed role is told apart from a hidden one", () => {
  const role = {
    role_id: "r",
    source_type: "internal",
    status: "active",
    is_expired: false,
    expires_at: null,
    information: {},
  };
  const promoted = { role_id: "r", is_promote: true };
  assert.equal(classifyOfficialJobLinkedRole(role, promoted), "public");
  assert.equal(classifyOfficialJobLinkedRole({ ...role, status: "paused" }, promoted), "public");
  assert.equal(classifyOfficialJobLinkedRole({ ...role, status: "ended" }, promoted), "closed");
  assert.equal(classifyOfficialJobLinkedRole({ ...role, is_expired: true }, promoted), "closed");
  assert.equal(
    classifyOfficialJobLinkedRole({ ...role, expires_at: "2000-01-01T00:00:00Z" }, promoted),
    "closed"
  );
  assert.equal(classifyOfficialJobLinkedRole(role, { ...promoted, is_promote: false }), "hidden");
  // A role that was never public does not become a closed card when it ends.
  assert.equal(
    classifyOfficialJobLinkedRole({ ...role, status: "ended" }, { ...promoted, is_promote: false }),
    "hidden"
  );
  assert.equal(classifyOfficialJobLinkedRole({ ...role, status: "ended" }, undefined), "hidden");
  assert.equal(classifyOfficialJobLinkedRole(role, undefined), "hidden");
  assert.equal(
    classifyOfficialJobLinkedRole({ ...role, information: { testOnly: true } }, promoted),
    "hidden"
  );
  assert.equal(
    classifyOfficialJobLinkedRole({ ...role, source_type: "external" }, promoted),
    "hidden"
  );
  assert.equal(classifyOfficialJobLinkedRole(undefined, promoted), "hidden");
});

test("a one-screen entry shows its record instead of the generic \"not consent\" line", async () => {
  const { buildCareerPostOnboardingContextSection } = await import(
    "../career/prompts/postOnboardingGuide"
  );
  const record =
    "Entry from the job page's sign-up card: 예시회사 / Engineer. On that card the candidate consented to send their profile and resume to this company, and Harper sent the introduction right after sign-up.";
  const base = {
    companyName: "예시회사",
    roleTitle: "Engineer",
    verifiedActiveRoleId: "role-1",
    hasLinkedRole: true,
  };
  const generic = buildCareerPostOnboardingContextSection({
    context: { entryOpportunity: base },
    toolNames: ["apply_to_internal_role"],
  });
  assert.match(generic, /not as a completed recommendation, candidate acceptance/);
  assert.match(generic, /company sharing still needs explicit introduction consent/);

  const oneScreen = buildCareerPostOnboardingContextSection({
    context: { entryOpportunity: { ...base, oneScreenRecord: record } },
    toolNames: ["apply_to_internal_role"],
  });
  assert.ok(oneScreen.includes(record));
  assert.doesNotMatch(oneScreen, /candidate acceptance/);
  assert.doesNotMatch(oneScreen, /still needs explicit introduction consent/);
  assert.match(oneScreen, /Tool-only exact active roleId: "role-1"/);

  const facts = buildCareerPostOnboardingContextSection({
    context: { entryOpportunity: { ...base, oneScreenRecord: record } },
    factsOnly: true,
  });
  assert.ok(facts.includes(record));
});

test("the PC card starts with Talk to Harper open; the phone page opens the box whose button was pressed", () => {
  const card = { layout: "card" as const, similarOpen: true };
  assert.equal(initialOfficialJobsOneScreenPanel({ ...card, kind: "role" }), "join");
  assert.equal(initialOfficialJobsOneScreenPanel({ ...card, kind: "bundle" }), "join");
  // The PC card ignores ?mode=similar: only the phone page opens on it.
  assert.equal(initialOfficialJobsOneScreenPanel({ ...card, kind: "role", initialMode: "similar" }), "join");
  const page = { layout: "page" as const, similarOpen: true, kind: "role" as const };
  assert.equal(initialOfficialJobsOneScreenPanel(page), "join");
  assert.equal(initialOfficialJobsOneScreenPanel({ ...page, initialMode: "join" }), "join");
  assert.equal(initialOfficialJobsOneScreenPanel({ ...page, initialMode: "similar" }), "similar");
});

test("a posting with only one box starts with it open", () => {
  // Request channel off: only the sign-up box.
  assert.equal(
    initialOfficialJobsOneScreenPanel({ layout: "card", kind: "role", similarOpen: false }),
    "join"
  );
  assert.equal(
    initialOfficialJobsOneScreenPanel({ layout: "page", kind: "role", similarOpen: false, initialMode: "similar" }),
    "join"
  );
  // Closed role: only the similar-postings box, or nothing when the channel is off.
  assert.equal(
    initialOfficialJobsOneScreenPanel({ layout: "card", kind: "closed", similarOpen: true }),
    "similar"
  );
  assert.equal(
    initialOfficialJobsOneScreenPanel({ layout: "card", kind: "closed", similarOpen: false }),
    null
  );
});

test("the chat receipt says profile only when no resume was given, in both languages", async () => {
  // The module's imports create Supabase clients when loaded; nothing here calls them.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "local-check-only";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "local-check-only";
  const { buildOfficialJobsOneScreenReceipt } = await import("./oneScreenEntry.server");
  const entry = {
    slug: "example-engineer",
    kind: "role" as const,
    roleId: "role-1",
    companyName: "예시회사",
    roleTitle: "Engineer",
    note: null,
  };
  const receipt = (hasResume: boolean, locale: "ko" | "en") =>
    buildOfficialJobsOneScreenReceipt({ entry, materialsReceipt: "자료", hasResume, locale });
  assert.match(receipt(true, "ko"), /제 프로필과 이력서를 예시회사에 보내는 데 동의했어요/);
  assert.match(receipt(false, "ko"), /제 프로필을 예시회사에 보내는 데 동의했어요/);
  assert.doesNotMatch(receipt(false, "ko"), /이력서를 예시회사/);
  assert.match(receipt(true, "en"), /agreed to send my profile and CV to 예시회사/);
  assert.match(receipt(false, "en"), /agreed to send my profile to 예시회사/);
});

test("a failed material says which part failed, in both languages", async () => {
  const { getOneScreenCopy } = await import("./oneScreenCopy");
  const ko = getOneScreenCopy("ko");
  const en = getOneScreenCopy("en");
  // LinkedIn only and the profile could not be read: never blame a CV that was not given.
  assert.match(ko.materialFailed({ part: "profile", linkedin: true, resume: false }), /^LinkedIn 프로필을 읽지 못했어요/);
  assert.match(en.materialFailed({ part: "profile", linkedin: true, resume: false }), /^We couldn't read your LinkedIn profile/);
  assert.doesNotMatch(ko.materialFailed({ part: "profile", linkedin: true, resume: false }), /이력서를 읽지/);
  // The CV's text could not be read.
  assert.match(ko.materialFailed({ part: "resume", linkedin: true, resume: true }), /이력서를 빼고 LinkedIn만/);
  assert.match(ko.materialFailed({ part: "resume", linkedin: false, resume: true }), /LinkedIn 주소를 넣어/);
  assert.match(en.materialFailed({ part: "resume", linkedin: false, resume: true }), /add your LinkedIn URL/);
  // Both given and the profile failed as a whole.
  assert.match(ko.materialFailed({ part: "profile", linkedin: true, resume: true }), /^자료를 읽지 못했어요/);
  assert.match(en.materialFailed({ part: "profile", linkedin: true, resume: true }), /^We couldn't read that\. Check your LinkedIn URL/);
  // A CV only and the profile failed as a whole: that was the CV, never a LinkedIn that was not given.
  for (const copy of [ko, en]) {
    assert.equal(
      copy.materialFailed({ part: "profile", linkedin: false, resume: true }),
      copy.materialFailed({ part: "resume", linkedin: false, resume: true })
    );
  }
  assert.equal(
    ko.materialFailed({ part: "profile", linkedin: false, resume: true }),
    "이력서를 읽지 못했어요. 다른 이력서 파일을 올리거나 LinkedIn 주소를 넣어 주세요."
  );
  assert.equal(
    en.materialFailed({ part: "profile", linkedin: false, resume: true }),
    "We couldn't read your CV. Upload another CV file or add your LinkedIn URL."
  );
  assert.doesNotMatch(ko.materialFailed({ part: "profile", linkedin: false, resume: true }), /주소를 확인/);
  assert.doesNotMatch(en.materialFailed({ part: "profile", linkedin: false, resume: true }), /Check your LinkedIn/);
});

test("the consent line names the CV only when one is picked, in both languages", async () => {
  const { getOneScreenCopy } = await import("./oneScreenCopy");
  const ko = getOneScreenCopy("ko");
  const en = getOneScreenCopy("en");
  assert.equal(ko.consent("예시회사", true), "예시회사에 내 프로필과 이력서를 보내는 데 동의해요");
  assert.equal(ko.consent("예시회사", false), "예시회사에 내 프로필을 보내는 데 동의해요");
  assert.equal(en.consent("예시회사", true), "I agree to send my profile and CV to 예시회사");
  assert.equal(en.consent("예시회사", false), "I agree to send my profile to 예시회사");
});

test("the similar-postings done box has a line for a CV it could not read", async () => {
  const { getOneScreenCopy } = await import("./oneScreenCopy");
  assert.equal(getOneScreenCopy("ko").similarResumeIgnored, "이력서는 읽지 못해서 LinkedIn으로 추천해요.");
  assert.equal(getOneScreenCopy("en").similarResumeIgnored, "We couldn't read your CV, so we'll use your LinkedIn.");
});
