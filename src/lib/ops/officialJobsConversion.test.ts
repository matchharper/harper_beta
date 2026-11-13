import assert from "node:assert/strict";
import test from "node:test";
import {
  buildJobsConversion,
  isBotUserAgent,
  JOBS_AUDIENCES,
  JOBS_LOGIN_STEPS_STARTED_AT,
  kstPeriodStart,
  normalizeJobsConversionDays,
  signupRate,
  type JobsConversionQueryRow,
} from "./officialJobsConversion";
import {
  excludedEmailParam,
  JOBS_CONVERSION_SQL,
  OFFICIAL_JOB_SIGNUPS_SQL,
} from "./officialJobsConversion.sql";

test("the period starts at midnight in Korea and today counts as the first day", () => {
  const afternoonKst = new Date("2026-11-12T05:00:00.000Z"); // 14:00 KST
  assert.equal(kstPeriodStart(30, afternoonKst).toISOString(), "2026-10-13T15:00:00.000Z");
  assert.equal(kstPeriodStart(7, afternoonKst).toISOString(), "2026-11-05T15:00:00.000Z");

  // 01:30 KST on 11/13 is still 11/12 in UTC: the Korean date decides.
  const afterMidnightKst = new Date("2026-11-12T16:30:00.000Z");
  assert.equal(kstPeriodStart(1, afterMidnightKst).toISOString(), "2026-11-12T15:00:00.000Z");
  assert.equal(kstPeriodStart(7, afterMidnightKst).toISOString(), "2026-11-06T15:00:00.000Z");
});

test("only the offered periods are accepted; anything else falls back to 30 days", () => {
  assert.equal(normalizeJobsConversionDays("7"), 7);
  assert.equal(normalizeJobsConversionDays(30), 30);
  assert.equal(normalizeJobsConversionDays("90"), 30);
  assert.equal(normalizeJobsConversionDays(null), 30);
  assert.equal(normalizeJobsConversionDays("abc"), 30);
});

function row(audience: string, values: Partial<JobsConversionQueryRow> = {}): JobsConversionQueryRow {
  return {
    audience,
    visitors: "5637",
    clickers: 0,
    new_signups: 0,
    existing_members: 0,
    step_eligible: 0,
    arrived_outside: 0,
    opened_browser: 0,
    opened_browser_arrived: 0,
    opened_browser_signed_up: 0,
    copied_link: 0,
    copied_link_arrived: 0,
    copied_link_signed_up: 0,
    arrived_otherwise: 0,
    arrived_otherwise_signed_up: 0,
    typed_email: 0,
    typed_email_signed_up: 0,
    no_action: 0,
    no_action_signed_up: 0,
    ...values,
  };
}

test("totals are the sum of the audience rows, and only LinkedIn rows carry login steps", () => {
  const conversion = buildJobsConversion({
    days: 30,
    periodStart: new Date("2026-10-13T15:00:00.000Z"),
    generatedAt: new Date("2026-11-12T05:00:00.000Z"),
    rows: [
      row("linkedin_ios", { clickers: "436", new_signups: "134", existing_members: 43, step_eligible: 5, arrived_outside: 3, opened_browser: 3, opened_browser_arrived: 3, opened_browser_signed_up: "2", copied_link: 1, no_action: 1 }),
      row("linkedin_android", { clickers: 16, new_signups: 1, existing_members: 1 }),
      row("mobile_other", { clickers: 409, new_signups: 219, existing_members: 77, step_eligible: 9 }),
      row("desktop", { clickers: 1846, new_signups: 1058, existing_members: 264 }),
    ],
  });

  assert.equal(conversion.visitors, 5637);
  assert.equal(conversion.clickers, 436 + 16 + 409 + 1846);
  assert.equal(conversion.newSignups, 134 + 1 + 219 + 1058);
  assert.equal(conversion.existingMembers, 43 + 1 + 77 + 264);
  assert.deepEqual(conversion.audiences.map((item) => item.audience), [...JOBS_AUDIENCES]);
  assert.deepEqual(conversion.audiences[0].steps, {
    eligible: 5,
    arrivedOutside: 3,
    openedBrowser: { people: 3, arrived: 3, signedUp: 2 },
    copiedLink: { people: 1, arrived: 0, signedUp: 0 },
    arrivedOtherwise: { people: 0, arrived: null, signedUp: 0 },
    typedEmail: { people: 0, arrived: null, signedUp: 0 },
    noAction: { people: 1, arrived: null, signedUp: 0 },
  });
  assert.equal(conversion.audiences[1].steps?.eligible, 0);
  assert.equal(conversion.audiences[2].steps, null);
  assert.equal(conversion.audiences[3].steps, null);
  assert.equal(conversion.stepsStartedAt, JOBS_LOGIN_STEPS_STARTED_AT);
  assert.equal(conversion.periodStart, "2026-10-13T15:00:00.000Z");
});

test("a missing audience reads as zero and an unknown one is an error, not a silent drop", () => {
  const conversion = buildJobsConversion({
    days: 7,
    periodStart: new Date("2026-11-05T15:00:00.000Z"),
    generatedAt: new Date("2026-11-12T05:00:00.000Z"),
    rows: [row("desktop", { clickers: 3, new_signups: 1 })],
  });
  assert.equal(conversion.clickers, 3);
  assert.equal(conversion.audiences.find((item) => item.audience === "linkedin_ios")?.clickers, 0);

  assert.throws(() => buildJobsConversion({
    days: 7,
    periodStart: new Date(),
    generatedAt: new Date(),
    rows: [row("tablet", { clickers: 1 })],
  }), /Unknown \/jobs audience/);
});

test("the sign-up rate leaves existing members out of the denominator", () => {
  // LinkedIn iOS, 30 days: 134 new of 436 clicks, 43 already had an account -> 134 / 393
  assert.equal(signupRate({ clickers: 436, newSignups: 134, existingMembers: 43 })?.toFixed(3), "0.341");
  assert.equal(signupRate({ clickers: 2, newSignups: 0, existingMembers: 2 }), null);
  assert.equal(signupRate({ clickers: 0, newSignups: 0, existingMembers: 0 }), null);
});

test("crawlers are recognised without catching phone models that contain BOT", () => {
  for (const userAgent of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "AdsBot-Google (+http://www.google.com/adsbot.html)",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)",
  ]) {
    assert.equal(isBotUserAgent(userAgent), true, userAgent);
  }
  for (const userAgent of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1",
    "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    null,
  ]) {
    assert.equal(isBotUserAgent(userAgent), false, String(userAgent));
  }
});

test("excluded entries are passed as one lowercase list the SQL splits on commas", () => {
  assert.equal(
    excludedEmailParam(["@MatchHarper.com", " Someone@Example.com ", "", "a,b@example.com"]),
    "@matchharper.com,someone@example.com"
  );
});

test("each query uses exactly the parameters the server passes", () => {
  const placeholders = (sql: string) => [...new Set(sql.match(/\$\d+/g) ?? [])].sort();
  assert.deepEqual(placeholders(JOBS_CONVERSION_SQL), ["$1", "$2"]);
  assert.deepEqual(placeholders(OFFICIAL_JOB_SIGNUPS_SQL), ["$1", "$2"]);
});
