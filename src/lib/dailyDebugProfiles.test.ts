import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDebugProfileStats,
  buildDebugProfileSubmissions,
  type DebugProfileRow,
  type DebugProfileRevision,
  type DebugResumeUpload,
} from "./dailyDebugProfiles";

const startIso = "2026-11-09T15:00:00.000Z";
const endIso = "2026-11-10T15:00:00.000Z";
const before = "2026-11-09T14:59:59.999Z";
const link = "https://www.linkedin.com/in/person";
const upload = (
  user_id: string,
  created_at = startIso,
  origin_type = "upload"
): DebugResumeUpload => ({
  user_id,
  created_at,
  origin_type,
  storage_path: "resume.pdf",
});
const revision = (
  profile_id: string,
  n: number,
  resume_links: string[],
  created_at = startIso
): DebugProfileRevision => ({
  profile_id,
  revision: n,
  resume_links,
  created_at,
  source_kind: "profile_ui",
  profile: { talent_id: profile_id },
});
const row = (
  user_id: string,
  changes: Partial<DebugProfileRow> = {}
): DebugProfileRow => ({
  user_id,
  talent_experiences: [{ count: 0 }],
  talent_educations: [{ count: 0 }],
  talent_extras: null,
  ...changes,
});

test("24-hour registration cohort excludes old uploads and unchanged links, includes start but excludes end, and deduplicates people", () => {
  const submissions = buildDebugProfileSubmissions({
    startIso,
    endIso,
    uploads: [
      upload("both"),
      upload("both"),
      upload("old", before),
      upload("tomorrow", endIso),
      upload("generated", startIso, "harper_generated_resume"),
    ],
    previousRevisions: [
      revision("both", 1, [], before),
      revision("old-link", 1, [link], before),
    ],
    revisions: [
      revision("both", 2, [link]),
      revision("both", 3, [link]),
      revision("old-link", 2, [link]),
      revision("new-link", 1, [link]),
      revision("tomorrow-link", 1, [link], endIso),
      { ...revision("bootstrap", 1, [link]), source_kind: "existing_profile" },
      revision("not-person", 1, [
        "https://linkedin.com/company/harper",
        "https://linkedin.com.fake.test/in/person",
      ]),
    ],
  });
  assert.deepEqual(submissions, [
    { user_id: "both", resume: true, linkedin: true },
    { user_id: "new-link", resume: false, linkedin: true },
  ]);
  const result = buildDebugProfileStats(
    [
      row("both"),
      row("new-link", { talent_educations: [{ count: 1 }] }),
      row("old"),
    ],
    submissions
  );
  assert.equal(result.registeredUsers, 2);
  assert.equal(result.resumeUsers, 1);
  assert.equal(result.linkedinUsers, 2);
  assert.deepEqual(result.emptyUserIds, ["both"]);
});

test("any experience, education, or usable extra counts as stored profile; empty JSON does not", () => {
  const rows = [
    row("experience", { talent_experiences: [{ count: 1 }] }),
    row("extra", {
      talent_extras: { content: { items: [{ title: "Patent" }] } },
    }),
    row("empty-extra", { talent_extras: { content: { items: [{}] } } }),
  ];
  const result = buildDebugProfileStats(
    rows,
    rows.map((r) => ({ user_id: r.user_id, resume: true, linkedin: false }))
  );
  assert.deepEqual(result.emptyUserIds, ["empty-extra"]);
});

test("missing previous revision or missing submitted user's profile fails rather than inventing a count", () => {
  assert.throws(
    () =>
      buildDebugProfileSubmissions({
        startIso,
        endIso,
        uploads: [],
        revisions: [revision("user", 2, [link])],
        previousRevisions: [],
      }),
    /이전 프로필 이력 누락/
  );
  assert.throws(
    () =>
      buildDebugProfileStats(
        [],
        [{ user_id: "missing", resume: true, linkedin: false }]
      ),
    /프로필 조회 결과 누락/
  );
});
