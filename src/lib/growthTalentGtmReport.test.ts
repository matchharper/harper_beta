import assert from "node:assert/strict";
import test from "node:test";
import {
  addTalentGtmDateDays,
  buildTalentGtmReportFromRows,
  classifyTalentGtmChannel,
  formatTalentGtmCountDelta,
  formatTalentGtmSlackMessages,
} from "@/lib/growthTalentGtmReport";

test("uses same-weekday date arithmetic across month boundaries", () => {
  assert.equal(addTalentGtmDateDays("2026-09-03", -7), "2026-08-27");
});

test("classifies broad GTM channels without losing legacy content sources", () => {
  assert.equal(classifyTalentGtmChannel({ source: "official_jobs" }), "jobs");
  assert.equal(
    classifyTalentGtmChannel({
      source: "official_jobs",
      utmSource: "linkedin",
    }),
    "linkedin"
  );
  assert.equal(
    classifyTalentGtmChannel({
      source: "official_jobs",
      utmSource: "instagram",
    }),
    "instagram_content"
  );
  assert.equal(classifyTalentGtmChannel({ source: "Threads" }), "threads");
  assert.equal(
    classifyTalentGtmChannel({ source: "contents06" }),
    "instagram_content"
  );
  assert.equal(classifyTalentGtmChannel({ source: "seo" }), "seo");
  assert.equal(classifyTalentGtmChannel({ source: "career" }), "other");
});

test("formats zero baselines without infinite percentages", () => {
  assert.equal(formatTalentGtmCountDelta(3, 0), "▲신규 3");
  assert.equal(formatTalentGtmCountDelta(0, 0), "→");
  assert.equal(formatTalentGtmCountDelta(5, 10), "▼50.0%");
});

test("builds one-channel-per-metric daily report with job and UTM details", () => {
  const report = buildTalentGtmReportFromRows({
    targetDate: "2026-09-15",
    excludedEmails: ["@matchharper.com"],
    excludedUserIds: new Set<string>(),
    entryLogs: [
      {
        created_at: "2026-09-14T15:10:00.000Z",
        local_id: "threads-1",
        type: "new_visit:threads",
      },
      {
        created_at: "2026-09-14T16:10:00.000Z",
        local_id: "instagram-1",
        type: "new_visit:instagram",
      },
      {
        created_at: "2026-09-14T17:10:00.000Z",
        local_id: "job-1",
        type: "new_visit:official_jobs",
      },
      {
        created_at: "2026-09-14T18:10:00.000Z",
        local_id: "direct-1",
        type: "new_visit:career",
      },
      {
        created_at: "2026-09-07T15:10:00.000Z",
        local_id: "threads-prev",
        type: "new_visit:threads",
      },
    ],
    identityLogs: [
      {
        created_at: "2026-09-14T15:20:00.000Z",
        local_id: "threads-1",
        type: "login_email:threads@example.com:threads",
      },
      {
        created_at: "2026-09-14T17:20:00.000Z",
        local_id: "job-1",
        type: "login_email:job@example.com:official_jobs",
      },
      {
        created_at: "2026-09-07T15:20:00.000Z",
        local_id: "threads-prev",
        type: "login_email:prev@example.com:threads",
      },
    ],
    utmLogs: [
      {
        created_at: "2026-09-14T16:09:00.000Z",
        local_id: "instagram-1",
        type: "utm:utm_source=instagram&utm_medium=reels&utm_campaign=creator_collab&utm_content=contents06",
      },
    ],
    signupLogs: [
      {
        created_at: "2026-09-14T15:30:00.000Z",
        user_id: "user-threads",
      },
      {
        created_at: "2026-09-14T17:30:00.000Z",
        user_id: "user-job",
      },
      {
        created_at: "2026-09-07T15:30:00.000Z",
        user_id: "user-prev",
      },
    ],
    onboardingEvents: [
      {
        created_at: "2026-09-14T16:00:00.000Z",
        event_type: "onboarding_completed",
        source: "chat",
        talent_id: "user-threads",
      },
    ],
    officialJobIntentEvents: [],
    talentUsers: [
      { email: "threads@example.com", user_id: "user-threads" },
      { email: "job@example.com", user_id: "user-job" },
      { email: "prev@example.com", user_id: "user-prev" },
    ],
    jobEventLogs: [
      {
        created_at: "2026-09-14T17:11:00.000Z",
        local_id: "job-1",
        type: "official_jobs:job_view:linkedin-role",
      },
      {
        created_at: "2026-09-14T17:15:00.000Z",
        local_id: "job-1",
        type: "official_jobs:talk_click:linkedin-role",
      },
    ],
    jobs: [
      {
        company_name: "Acme",
        is_published: true,
        role_title: "AI Engineer",
        slug: "linkedin-role",
      },
      {
        company_name: "Beta",
        is_published: true,
        role_title: "Product Engineer",
        slug: "web-role",
      },
    ],
  });

  assert.deepEqual(report.overall.current, {
    onboardingCompleted: 1,
    signups: 2,
    uniqueUsers: 4,
  });
  assert.deepEqual(report.overall.yesterday, {
    onboardingCompleted: 0,
    signups: 0,
    uniqueUsers: 0,
  });
  assert.deepEqual(report.overall.lastWeek, {
    onboardingCompleted: 0,
    signups: 1,
    uniqueUsers: 1,
  });
  assert.deepEqual(
    report.channels.map((row) => [row.key, row.current]),
    [
      ["linkedin", { onboardingCompleted: 0, signups: 0, uniqueUsers: 0 }],
      ["jobs", { onboardingCompleted: 0, signups: 1, uniqueUsers: 1 }],
      ["threads", { onboardingCompleted: 1, signups: 1, uniqueUsers: 1 }],
      [
        "instagram_content",
        { onboardingCompleted: 0, signups: 0, uniqueUsers: 1 },
      ],
      ["seo", { onboardingCompleted: 0, signups: 0, uniqueUsers: 0 }],
      ["other", { onboardingCompleted: 0, signups: 0, uniqueUsers: 1 }],
    ]
  );
  assert.equal(report.contentRows[0]?.content, "contents06");
  assert.equal(report.jobRows.length, 2);
  assert.equal(report.jobRows[0]?.slug, "linkedin-role");

  const insight =
    "Threads에서 방문자 1명, 가입 1명, 온보딩 완료 1명이 기록됐습니다.";
  const messages = formatTalentGtmSlackMessages(report, { insight });
  assert.equal(messages.main.text.split("\n")[0], insight);
  assert.deepEqual(messages.main.blocks?.[0], {
    text: { text: insight, type: "plain_text" },
    type: "section",
  });
  assert.match(messages.main.text, /방문자/);
  assert.doesNotMatch(messages.main.text, /Unique|퍼널|최근 7일|집계 기준/);
  assert.doesNotMatch(messages.jobs.text, /상태|상담 클릭|CTA/);
  assert.match(messages.main.text, /지난주 대비/);
  assert.match(messages.main.text, /Jobs/);
  assert.match(messages.jobs.text, /Acme · AI Engineer/);
  assert.match(messages.content.text, /contents06/);
  assert.match(messages.notes.text, /직접 방문·출처 미확인/);
  assert.equal(
    messages.main.blocks?.some((block) => block.type === "table"),
    true
  );
});

test("shows yesterday deltas in every channel metric and only visitor deltas for last week", () => {
  const report = buildTalentGtmReportFromRows({
    targetDate: "2026-09-15",
    excludedEmails: [],
    excludedUserIds: new Set<string>(),
    entryLogs: [
      {
        created_at: "2026-09-14T15:10:00.000Z",
        local_id: "threads-current",
        type: "new_visit:threads",
      },
      {
        created_at: "2026-09-13T15:10:00.000Z",
        local_id: "threads-yesterday",
        type: "new_visit:threads",
      },
      {
        created_at: "2026-09-07T15:10:00.000Z",
        local_id: "threads-last-week",
        type: "new_visit:threads",
      },
    ],
    identityLogs: [
      {
        created_at: "2026-09-14T15:20:00.000Z",
        local_id: "threads-current",
        type: "login_email:current@example.com:threads",
      },
      {
        created_at: "2026-09-13T15:20:00.000Z",
        local_id: "threads-yesterday",
        type: "login_email:yesterday@example.com:threads",
      },
    ],
    utmLogs: [],
    signupLogs: [
      { created_at: "2026-09-14T15:30:00.000Z", user_id: "current" },
      { created_at: "2026-09-13T15:30:00.000Z", user_id: "yesterday" },
    ],
    onboardingEvents: [
      {
        created_at: "2026-09-14T16:00:00.000Z",
        event_type: "onboarding_completed",
        source: "chat",
        talent_id: "current",
      },
      {
        created_at: "2026-09-13T16:00:00.000Z",
        event_type: "onboarding_completed",
        source: "chat",
        talent_id: "yesterday",
      },
    ],
    officialJobIntentEvents: [],
    talentUsers: [
      { email: "current@example.com", user_id: "current" },
      { email: "yesterday@example.com", user_id: "yesterday" },
    ],
    jobEventLogs: [],
    jobs: [],
  });

  assert.equal(report.yesterdayDate, "2026-09-14");
  assert.equal(report.weekComparisonDate, "2026-09-08");

  const messages = formatTalentGtmSlackMessages(report);
  const table = messages.main.blocks?.find((block) => block.type === "table");
  assert.ok(table && "rows" in table);
  if (!table || !("rows" in table)) throw new Error("Channel table is missing");

  const threads = table.rows.find((row) => row[0]?.text === "Threads");
  assert.deepEqual(
    threads?.map((cell) => cell.text),
    ["Threads", "1 →", "1 →", "1 →", "→"]
  );
  assert.deepEqual(
    table.rows[0]?.map((cell) => cell.text),
    ["채널", "방문자", "회원가입", "온보딩 완료", "지난주 방문자 대비"]
  );
});

test("uses an attached UTM source when the entry row still says career", () => {
  const report = buildTalentGtmReportFromRows({
    targetDate: "2026-09-15",
    excludedEmails: [],
    excludedUserIds: new Set<string>(),
    entryLogs: [
      {
        created_at: "2026-09-14T15:10:00.000Z",
        local_id: "linkedin-local-id",
        type: "new_visit:career",
      },
    ],
    identityLogs: [
      {
        created_at: "2026-09-14T15:20:00.000Z",
        local_id: "linkedin-local-id",
        type: "login_email:linkedin@example.com:career",
      },
    ],
    utmLogs: [
      {
        created_at: "2026-09-14T15:09:00.000Z",
        local_id: "linkedin-local-id",
        type: "utm:utm_source=linkedin&utm_medium=social",
      },
    ],
    signupLogs: [
      { created_at: "2026-09-14T15:30:00.000Z", user_id: "linkedin" },
    ],
    onboardingEvents: [
      {
        created_at: "2026-09-14T16:00:00.000Z",
        event_type: "onboarding_completed",
        source: "chat",
        talent_id: "linkedin",
      },
    ],
    officialJobIntentEvents: [],
    talentUsers: [{ email: "linkedin@example.com", user_id: "linkedin" }],
    jobEventLogs: [],
    jobs: [],
  });

  assert.deepEqual(
    report.channels.find((row) => row.key === "linkedin")?.current,
    { onboardingCompleted: 1, signups: 1, uniqueUsers: 1 }
  );
});

test("attributes Jobs arrivals and conversions to recorded sources across all comparison days", () => {
  type Input = Parameters<typeof buildTalentGtmReportFromRows>[0];
  const input: Input = {
    targetDate: "2026-09-15",
    excludedEmails: [],
    excludedUserIds: new Set(),
    entryLogs: [],
    identityLogs: [],
    utmLogs: [],
    signupLogs: [],
    onboardingEvents: [],
    officialJobIntentEvents: [],
    officialJobEvents: [],
    talentUsers: [],
    jobEventLogs: [],
    jobs: [
      {
        company_name: "Example",
        is_published: true,
        role_title: "Engineer",
        slug: "engineer",
      },
    ],
  };
  const cases = [
    {
      name: "linkedin-web",
      path: "/jobs/engineer",
      referrer: "https://www.linkedin.com/",
      channel: "linkedin",
    },
    {
      name: "linkedin-app",
      path: "/jobs/engineer",
      referrer: "android-app://com.linkedin.android/",
      channel: "linkedin",
    },
    {
      name: "linkedin-utm",
      path: "/jobs/engineer?utm_source=linkedin",
      referrer: null,
      channel: "linkedin",
    },
    { name: "direct", path: "/jobs/engineer", referrer: null, channel: "jobs" },
    {
      name: "internal",
      path: "/jobs/engineer",
      referrer: "https://matchharper.com/jobs",
      channel: "jobs",
    },
    {
      name: "search",
      path: "/jobs/engineer",
      referrer: "https://www.google.com/",
      channel: "seo",
    },
    {
      name: "utm-wins",
      path: "/jobs/engineer?utm_source=instagram&utm_content=contents99",
      referrer: "https://www.linkedin.com/",
      channel: "instagram_content",
    },
    {
      name: "legacy-source",
      path: "/jobs/engineer?source=threads",
      referrer: null,
      channel: "threads",
    },
    {
      name: "other-campaign",
      path: "/jobs/engineer?utm_source=newsletter",
      referrer: null,
      channel: "other",
    },
  ];
  for (const date of ["2026-09-15", "2026-09-14", "2026-09-08"]) {
    for (const item of cases) {
      const id = `${date}-${item.name}`;
      input.entryLogs.push({
        created_at: `${date}T00:00:00Z`,
        local_id: id,
        type: "new_visit:official_jobs",
      });
      input.officialJobEvents!.push(
        {
          anonymous_id: id,
          created_at: `${date}T00:00:01Z`,
          path: item.path,
          referrer: item.referrer,
        },
        {
          anonymous_id: id,
          created_at: `${date}T00:20:00Z`,
          path: "/jobs/engineer",
          referrer: "https://matchharper.com/jobs",
        },
        {
          anonymous_id: id,
          created_at: `${date}T00:40:00Z`,
          path: "/career?source=official_jobs",
          referrer: "https://matchharper.com/jobs/engineer",
        }
      );
      input.identityLogs.push({
        created_at: `${date}T00:40:01Z`,
        local_id: id,
        type: `login_email:${id}@example.com:official_jobs`,
      });
      input.utmLogs.push({
        created_at: `${date}T00:40:00Z`,
        local_id: id,
        type: "utm:utm_source=official_jobs",
      });
      input.signupLogs.push({ created_at: `${date}T00:41:00Z`, user_id: id });
      input.onboardingEvents.push({
        created_at: `${date}T02:00:00Z`,
        talent_id: id,
        source: "chat",
        event_type: "onboarding_completed",
      });
      input.talentUsers.push({ email: `${id}@example.com`, user_id: id });
      input.jobEventLogs.push({
        created_at: `${date}T00:00:01Z`,
        local_id: id,
        type: "official_jobs:job_view:engineer",
      });
    }
  }
  const report = buildTalentGtmReportFromRows(input);
  for (const row of report.channels) {
    const count = cases.filter((item) => item.channel === row.key).length;
    const expected = {
      uniqueUsers: count,
      signups: count,
      onboardingCompleted: count,
    };
    assert.deepEqual(row.current, expected, row.key);
    assert.deepEqual(row.yesterday, expected, row.key);
    assert.equal(row.lastWeekUniqueUsers, count, row.key);
  }
  assert.deepEqual(report.overall.current, {
    uniqueUsers: cases.length,
    signups: cases.length,
    onboardingCompleted: cases.length,
  });
  assert.deepEqual(
    report.channels.reduce(
      (sum, row) => ({
        uniqueUsers: sum.uniqueUsers + row.current.uniqueUsers,
        signups: sum.signups + row.current.signups,
        onboardingCompleted:
          sum.onboardingCompleted + row.current.onboardingCompleted,
      }),
      { uniqueUsers: 0, signups: 0, onboardingCompleted: 0 }
    ),
    report.overall.current
  );
  assert.equal(report.jobRows[0]?.uniqueUsers, cases.length);
  assert.equal(report.jobRows[0]?.signups, cases.length);
  assert.equal(report.jobRows[0]?.onboardingCompleted, cases.length);
  assert.equal(report.contentRows[0]?.content, "contents99");
});

test("does not carry a LinkedIn visit into a later direct Jobs session or an earlier conversion", () => {
  const report = buildTalentGtmReportFromRows({
    targetDate: "2026-09-15",
    excludedEmails: [],
    excludedUserIds: new Set(),
    entryLogs: [
      {
        created_at: "2026-09-15T02:00:00Z",
        local_id: "returning",
        type: "new_session:official_jobs",
      },
    ],
    identityLogs: [
      {
        created_at: "2026-09-15T02:02:00Z",
        local_id: "returning",
        type: "login_email:returning@example.com:official_jobs",
      },
    ],
    officialJobEvents: [
      {
        anonymous_id: "returning",
        created_at: "2026-09-15T00:00:00Z",
        path: "/jobs/a",
        referrer: "https://www.linkedin.com",
      },
      {
        anonymous_id: "returning",
        created_at: "2026-09-15T02:00:01Z",
        path: "/jobs/b",
        referrer: null,
      },
      {
        anonymous_id: "returning",
        created_at: "2026-09-15T02:10:00Z",
        path: "/jobs/c",
        referrer: "https://www.linkedin.com",
      },
    ],
    utmLogs: [],
    signupLogs: [{ created_at: "2026-09-15T02:03:00Z", user_id: "returning" }],
    onboardingEvents: [],
    officialJobIntentEvents: [],
    jobEventLogs: [],
    jobs: [],
    talentUsers: [{ email: "returning@example.com", user_id: "returning" }],
  });
  assert.deepEqual(report.channels.find((row) => row.key === "jobs")?.current, {
    uniqueUsers: 1,
    signups: 1,
    onboardingCompleted: 0,
  });
  assert.deepEqual(
    report.channels.find((row) => row.key === "linkedin")?.current,
    { uniqueUsers: 0, signups: 0, onboardingCompleted: 0 }
  );
});
