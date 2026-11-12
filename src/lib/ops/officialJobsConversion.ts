/**
 * /ops/jobs "공고에서 가입까지": the client-safe half of the /jobs conversion numbers.
 * The counts come from one read-only query in officialJobsConversion.server.ts; this module holds the
 * period rule, the audience order and the mapping from query rows to the panel.
 */

export const JOBS_CONVERSION_DAYS = [30, 7] as const;
export type JobsConversionDays = (typeof JOBS_CONVERSION_DAYS)[number];
export const DEFAULT_JOBS_CONVERSION_DAYS: JobsConversionDays = 30;

/** The login page began logging its steps (LinkedIn guide, browser hand-off) with this deploy. */
export const JOBS_LOGIN_STEPS_STARTED_AT = "2026-11-12T04:32:45.000Z";

/**
 * Crawlers that run the /jobs pages (Googlebot, AhrefsBot, bingbot, HeadlessChrome, Bytespider,
 * AdsBot-Google, Google-InspectionTool...).
 * Case-insensitive; written so it reads the same as a JavaScript RegExp and a Postgres `~*` pattern.
 */
export const BOT_USER_AGENT_PATTERN =
  "(bot/|bot;|spider|crawl|headless|externalhit|slurp|adsbot|inspectiontool)";
const BOT_USER_AGENT = new RegExp(BOT_USER_AGENT_PATTERN, "i");

export function isBotUserAgent(userAgent: string | null | undefined) {
  return BOT_USER_AGENT.test(String(userAgent ?? ""));
}

/** Where the Talk to Harper click happened, from the clicking browser's user agent. */
export const JOBS_AUDIENCES = [
  "linkedin_ios",
  "linkedin_android",
  "mobile_other",
  "desktop",
] as const;
export type JobsAudience = (typeof JOBS_AUDIENCES)[number];

/**
 * One way on from the LinkedIn in-app login page, and what became of the people who took it: reached the
 * login page in Safari/Chrome (`arrived`, null where that is not part of the way) and got a new account.
 */
export type JobsLoginPath = {
  people: number;
  arrived: number | null;
  signedUp: number;
};

export type JobsConversionSteps = {
  /** LinkedIn clickers whose login page logged a step (it began logging at JOBS_LOGIN_STEPS_STARTED_AT). */
  eligible: number;
  /** Of those, the login page opened in another browser (Safari, Chrome) carrying their visitor id. */
  arrivedOutside: number;
  /** Pressed "브라우저에서 열기" inside the app. */
  openedBrowser: JobsLoginPath;
  /** Pressed "로그인 링크 복사" inside the app. */
  copiedLink: JobsLoginPath;
  /** Reached Safari/Chrome without either button (LinkedIn's own menu, a link they had). */
  arrivedOtherwise: JobsLoginPath;
  /** Submitted the email sign-up or sign-in form inside the app. */
  typedEmail: JobsLoginPath;
  /** None of the above. */
  noAction: JobsLoginPath;
};

/** Counts of browsers: clickers = newSignups + existingMembers + clickers with no account found. */
export type JobsConversionAudience = {
  audience: JobsAudience;
  clickers: number;
  newSignups: number;
  existingMembers: number;
  /** LinkedIn rows only. */
  steps: JobsConversionSteps | null;
};

export type OpsOfficialJobsConversion = {
  days: JobsConversionDays;
  periodStart: string;
  generatedAt: string;
  stepsStartedAt: string;
  visitors: number;
  clickers: number;
  newSignups: number;
  existingMembers: number;
  audiences: JobsConversionAudience[];
};

export type OpsOfficialJobsConversionResponse = {
  conversion: OpsOfficialJobsConversion;
};

/** One row per audience, as the query returns it. */
export type JobsConversionQueryRow = {
  audience: string;
  visitors: number | string | null;
  clickers: number | string | null;
  new_signups: number | string | null;
  existing_members: number | string | null;
  step_eligible: number | string | null;
  arrived_outside: number | string | null;
  opened_browser: number | string | null;
  opened_browser_arrived: number | string | null;
  opened_browser_signed_up: number | string | null;
  copied_link: number | string | null;
  copied_link_arrived: number | string | null;
  copied_link_signed_up: number | string | null;
  arrived_otherwise: number | string | null;
  arrived_otherwise_signed_up: number | string | null;
  typed_email: number | string | null;
  typed_email_signed_up: number | string | null;
  no_action: number | string | null;
  no_action_signed_up: number | string | null;
};

export function normalizeJobsConversionDays(value: unknown): JobsConversionDays {
  const days = Number(value);
  return JOBS_CONVERSION_DAYS.find((option) => option === days) ??
    DEFAULT_JOBS_CONVERSION_DAYS;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight in Korea on the first day of the period; today counts as the first of `days`. */
export function kstPeriodStart(days: number, now: Date = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const todayStartUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) -
    KST_OFFSET_MS;
  return new Date(todayStartUtcMs - (Math.max(days, 1) - 1) * DAY_MS);
}

export function isLinkedInAudience(audience: JobsAudience) {
  return audience === "linkedin_ios" || audience === "linkedin_android";
}

/**
 * Sign-up rate among people who could still sign up: existing members already had an account, so they
 * leave the denominator. Null when nobody is left to divide by.
 */
export function signupRate(
  row: Pick<JobsConversionAudience, "clickers" | "newSignups" | "existingMembers">
) {
  const couldSignUp = row.clickers - row.existingMembers;
  return couldSignUp > 0 ? row.newSignups / couldSignUp : null;
}

function count(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

/** Totals are sums of the audience rows: the query gives every clicking browser exactly one audience. */
export function buildJobsConversion(args: {
  days: JobsConversionDays;
  periodStart: Date;
  generatedAt: Date;
  rows: JobsConversionQueryRow[];
}): OpsOfficialJobsConversion {
  const byAudience = new Map(args.rows.map((row) => [row.audience, row]));
  const unknown = args.rows.find(
    (row) => !JOBS_AUDIENCES.some((audience) => audience === row.audience)
  );
  if (unknown) {
    throw new Error(`Unknown /jobs audience in conversion rows: ${unknown.audience}`);
  }

  const audiences = JOBS_AUDIENCES.map((audience): JobsConversionAudience => {
    const row = byAudience.get(audience);
    return {
      audience,
      clickers: count(row?.clickers),
      newSignups: count(row?.new_signups),
      existingMembers: count(row?.existing_members),
      steps: isLinkedInAudience(audience)
        ? {
            eligible: count(row?.step_eligible),
            arrivedOutside: count(row?.arrived_outside),
            openedBrowser: {
              people: count(row?.opened_browser),
              arrived: count(row?.opened_browser_arrived),
              signedUp: count(row?.opened_browser_signed_up),
            },
            copiedLink: {
              people: count(row?.copied_link),
              arrived: count(row?.copied_link_arrived),
              signedUp: count(row?.copied_link_signed_up),
            },
            arrivedOtherwise: {
              people: count(row?.arrived_otherwise),
              arrived: null,
              signedUp: count(row?.arrived_otherwise_signed_up),
            },
            typedEmail: {
              people: count(row?.typed_email),
              arrived: null,
              signedUp: count(row?.typed_email_signed_up),
            },
            noAction: {
              people: count(row?.no_action),
              arrived: null,
              signedUp: count(row?.no_action_signed_up),
            },
          }
        : null,
    };
  });
  const sum = (pick: (row: JobsConversionAudience) => number) =>
    audiences.reduce((total, row) => total + pick(row), 0);

  return {
    days: args.days,
    periodStart: args.periodStart.toISOString(),
    generatedAt: args.generatedAt.toISOString(),
    stepsStartedAt: JOBS_LOGIN_STEPS_STARTED_AT,
    visitors: count(args.rows[0]?.visitors),
    clickers: sum((row) => row.clickers),
    newSignups: sum((row) => row.newSignups),
    existingMembers: sum((row) => row.existingMembers),
    audiences,
  };
}
