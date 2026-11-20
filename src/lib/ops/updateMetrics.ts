// 업데이트 지표: compares weeks before and after a release on the metrics the release is expected to move.
// Weeks are 7-day blocks anchored at the release time, so the first week after it starts at the release itself.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** Cohort metrics look at what a talent did in the first 3 days after signing up. */
const COHORT_DAYS = 3;
/** A landing visit converts when the same browser signs up within a day. */
const LANDING_CONVERSION_DAYS = 1;

export const UPDATE_METRICS_WEEKS_BEFORE = 4;
export const UPDATE_METRICS_MAX_WEEKS_AFTER = 8;

export type OpsUpdateRelease = {
  /** KST date (YYYY-MM-DD) the release went out; null until it does. */
  deployedOn: string | null;
  id: string;
  title: string;
};

/** Releases followed on /ops/update-metrics. Set deployedOn once the release is in production. */
export const OPS_UPDATE_RELEASES: OpsUpdateRelease[] = [
  {
    deployedOn: "2026-11-20",
    id: "2026-11-signup-first-recommendation",
    title: "가입·첫 추천 업데이트",
  },
];

export type UpdateMetricsBucket = {
  end: string;
  /** Still running: the latest week after the release. */
  partial: boolean;
  side: "after" | "before";
  start: string;
};

export type UpdateMetricValue =
  | { denominator: number; kind: "rate"; numerator: number }
  | { days: number; kind: "count"; value: number }
  | { denominator: number; kind: "average"; total: number };

export type UpdateMetricUnit = "count" | "minutes" | "percent" | "usd";

export type UpdateMetricRow = {
  /** Which way is an improvement; null when either way is fine. */
  better: "down" | "up" | null;
  detail: string;
  key: string;
  label: string;
  unit: UpdateMetricUnit;
  values: {
    after: UpdateMetricValue;
    before: UpdateMetricValue;
    buckets: UpdateMetricValue[];
  };
};

export type UpdateMetricGroup = {
  key: string;
  label: string;
  rows: UpdateMetricRow[];
};

export type OpsUpdateMetricsResponse = {
  buckets: UpdateMetricsBucket[];
  deployedAt: string;
  generatedAt: string;
  groups: UpdateMetricGroup[];
};

export type UpdateMetricsSignupRow = {
  applyWithHarperAt: Date | string | null;
  costUsd3d: number;
  disliked3d: number;
  firstChatAt: Date | string | null;
  gmailAt: Date | string | null;
  hasMaterials: boolean;
  liked3d: number;
  llmMs3d: number;
  onboardingSubmittedAt: Date | string | null;
  recommendations3d: number;
  signedUpAt: Date | string;
  userId: string;
};

export type UpdateMetricsRecommendationRow = {
  bucketIndex: number;
  company: number;
  hiringPost: number;
  nonPostingTalents: number;
  total: number;
};

export type UpdateMetricsLandingRow = {
  at: Date | string;
  signedUpAt: Date | string | null;
};

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function kstDateOnly(ms: number) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST midnight of a YYYY-MM-DD date, as epoch ms. */
export function kstMidnightMs(date: string) {
  if (!isDateOnly(date)) throw new Error("배포일이 올바르지 않습니다.");
  const ms = Date.parse(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(ms)) throw new Error("배포일이 올바르지 않습니다.");
  return ms;
}

export function buildUpdateMetricsBuckets(deployedAtMs: number, nowMs: number) {
  const buckets: UpdateMetricsBucket[] = [];
  for (let week = UPDATE_METRICS_WEEKS_BEFORE; week >= 1; week -= 1) {
    const start = deployedAtMs - week * WEEK_MS;
    const end = Math.min(start + WEEK_MS, nowMs);
    if (end <= start) break;
    buckets.push({
      end: new Date(end).toISOString(),
      partial: start + WEEK_MS > nowMs,
      side: "before",
      start: new Date(start).toISOString(),
    });
  }
  for (let week = 0; week < UPDATE_METRICS_MAX_WEEKS_AFTER; week += 1) {
    const start = deployedAtMs + week * WEEK_MS;
    if (start >= nowMs) break;
    const end = Math.min(start + WEEK_MS, nowMs);
    buckets.push({
      end: new Date(end).toISOString(),
      partial: start + WEEK_MS > nowMs,
      side: "after",
      start: new Date(start).toISOString(),
    });
  }
  return buckets;
}

const toMs = (value: Date | string | null | undefined) =>
  value === null || value === undefined ? null : new Date(value).getTime();

const within = (
  at: Date | string | null,
  fromMs: number,
  days: number
) => {
  const ms = toMs(at);
  return ms !== null && ms >= fromMs && ms < fromMs + days * DAY_MS;
};

function bucketIndexOf(buckets: UpdateMetricsBucket[], atMs: number) {
  return buckets.findIndex(
    (bucket) => atMs >= Date.parse(bucket.start) && atMs < Date.parse(bucket.end)
  );
}

const rate = (numerator: number, denominator: number): UpdateMetricValue => ({
  denominator,
  kind: "rate",
  numerator,
});

const average = (total: number, denominator: number): UpdateMetricValue => ({
  denominator,
  kind: "average",
  total,
});

function sumValues(values: UpdateMetricValue[]): UpdateMetricValue | null {
  const first = values[0];
  if (!first) return null;
  if (first.kind === "rate") {
    return values.reduce<UpdateMetricValue>(
      (acc, value) =>
        acc.kind === "rate" && value.kind === "rate"
          ? rate(acc.numerator + value.numerator, acc.denominator + value.denominator)
          : acc,
      rate(0, 0)
    );
  }
  if (first.kind === "average") {
    return values.reduce<UpdateMetricValue>(
      (acc, value) =>
        acc.kind === "average" && value.kind === "average"
          ? average(acc.total + value.total, acc.denominator + value.denominator)
          : acc,
      average(0, 0)
    );
  }
  return values.reduce<UpdateMetricValue>(
    (acc, value) =>
      acc.kind === "count" && value.kind === "count"
        ? { days: acc.days + value.days, kind: "count", value: acc.value + value.value }
        : acc,
    { days: 0, kind: "count", value: 0 }
  );
}

/** Before and after pool their weeks: rates and averages over all rows, counts per 7 days. */
function withSides(
  buckets: UpdateMetricsBucket[],
  values: UpdateMetricValue[],
  empty: UpdateMetricValue
): UpdateMetricRow["values"] {
  const side = (name: UpdateMetricsBucket["side"]) =>
    sumValues(values.filter((_, index) => buckets[index]?.side === name)) ?? empty;
  return { after: side("after"), before: side("before"), buckets: values };
}

/** The value a cell shows: a rate (0–1), a per-person average, or a count per 7 days. */
export function updateMetricDisplayValue(value: UpdateMetricValue) {
  if (value.kind === "rate") {
    return value.denominator > 0 ? value.numerator / value.denominator : null;
  }
  if (value.kind === "average") {
    return value.denominator > 0 ? value.total / value.denominator : null;
  }
  return value.days > 0 ? (value.value / value.days) * 7 : null;
}

export function buildOpsUpdateMetrics(args: {
  deployedAtMs: number;
  /** Signups attributed to a /jobs posting with no internal Role behind it. */
  jobsWithoutRoleUserIds: Set<string>;
  landing: UpdateMetricsLandingRow[];
  nowMs: number;
  recommendations: UpdateMetricsRecommendationRow[];
  signups: UpdateMetricsSignupRow[];
}): OpsUpdateMetricsResponse {
  const buckets = buildUpdateMetricsBuckets(args.deployedAtMs, args.nowMs);
  const bucketDays = buckets.map(
    (bucket) => (Date.parse(bucket.end) - Date.parse(bucket.start)) / DAY_MS
  );
  const signupsByBucket = buckets.map(() => [] as UpdateMetricsSignupRow[]);
  for (const signup of args.signups) {
    const index = bucketIndexOf(buckets, new Date(signup.signedUpAt).getTime());
    if (index >= 0) signupsByBucket[index]?.push(signup);
  }
  // Cohort metrics only count talents whose first 3 days are over.
  const matured = signupsByBucket.map((rows) =>
    rows.filter(
      (row) => new Date(row.signedUpAt).getTime() + COHORT_DAYS * DAY_MS <= args.nowMs
    )
  );
  const cohort = (
    measure: (rows: UpdateMetricsSignupRow[]) => UpdateMetricValue
  ) => matured.map(measure);
  const signedUpMs = (row: UpdateMetricsSignupRow) => new Date(row.signedUpAt).getTime();
  const chatted = (row: UpdateMetricsSignupRow) =>
    within(row.firstChatAt, signedUpMs(row), COHORT_DAYS);
  const started = (row: UpdateMetricsSignupRow) =>
    chatted(row) || within(row.onboardingSubmittedAt, signedUpMs(row), COHORT_DAYS);
  const recipients = (rows: UpdateMetricsSignupRow[]) =>
    rows.filter((row) => row.recommendations3d > 0);

  const row = (
    definition: Omit<UpdateMetricRow, "values">,
    values: UpdateMetricValue[],
    empty: UpdateMetricValue
  ): UpdateMetricRow => ({ ...definition, values: withSides(buckets, values, empty) });

  const emptyRate = rate(0, 0);
  const emptyAverage = average(0, 0);
  const emptyCount: UpdateMetricValue = { days: 0, kind: "count", value: 0 };

  const recommendationsByBucket = buckets.map(
    (_, index) =>
      args.recommendations.find((item) => item.bucketIndex === index) ?? {
        bucketIndex: index,
        company: 0,
        hiringPost: 0,
        nonPostingTalents: 0,
        total: 0,
      }
  );

  const landingByBucket = buckets.map(() => ({ converted: 0, visitors: 0 }));
  for (const visit of args.landing) {
    const atMs = new Date(visit.at).getTime();
    // A visit counts once its conversion window has passed.
    if (atMs + LANDING_CONVERSION_DAYS * DAY_MS > args.nowMs) continue;
    const index = bucketIndexOf(buckets, atMs);
    const bucket = landingByBucket[index];
    if (!bucket) continue;
    bucket.visitors += 1;
    if (within(visit.signedUpAt, atMs, LANDING_CONVERSION_DAYS)) bucket.converted += 1;
  }

  const groups: UpdateMetricGroup[] = [
    {
      key: "signup",
      label: "가입 → 채팅",
      rows: [
        row(
          {
            better: "up",
            detail: "주에 가입한 talent 수입니다. 배포 전·후 칸은 7일 평균입니다.",
            key: "signups",
            label: "가입",
            unit: "count",
          },
          signupsByBucket.map((rows, index) => ({
            days: bucketDays[index] ?? 0,
            kind: "count",
            value: rows.length,
          })),
          emptyCount
        ),
        row(
          {
            better: "up",
            detail: "가입 후 3일 안에 채팅 메시지를 한 번이라도 보낸 비율입니다. 가입 후 3일이 지난 사람만 셉니다.",
            key: "chatRate",
            label: "가입 대비 채팅 진행",
            unit: "percent",
          },
          cohort((rows) => rate(rows.filter(chatted).length, rows.length)),
          emptyRate
        ),
        row(
          {
            better: null,
            detail:
              "전체 가입자 중 이력서·LinkedIn 없이 온보딩을 제출하거나 채팅을 시작한 비율입니다. 자료 여부는 지금 프로필 기준입니다.",
            key: "startedWithoutMaterials",
            label: "이력서·LinkedIn 없이 시작",
            unit: "percent",
          },
          cohort((rows) =>
            rate(rows.filter((item) => started(item) && !item.hasMaterials).length, rows.length)
          ),
          emptyRate
        ),
        row(
          {
            better: null,
            detail: "전체 가입자 중 프로필에 이력서 파일이나 LinkedIn URL이 있는 비율입니다. 지금 프로필 기준입니다.",
            key: "submittedMaterials",
            label: "이력서·LinkedIn 제출",
            unit: "percent",
          },
          cohort((rows) => rate(rows.filter((item) => item.hasMaterials).length, rows.length)),
          emptyRate
        ),
      ],
    },
    {
      key: "cost",
      label: "1인당 시간·비용",
      rows: [
        row(
          {
            better: "down",
            detail:
              "가입 후 3일 안에 채팅한 사람의 첫 3일 LLM 추정 비용 평균입니다(llm_logs, 도구별 배분 행 제외).",
            key: "costPerChatter",
            label: "1인당 비용 (3일)",
            unit: "usd",
          },
          cohort((rows) => {
            const people = rows.filter(chatted);
            return average(
              people.reduce((sum, item) => sum + item.costUsd3d, 0),
              people.length
            );
          }),
          emptyAverage
        ),
        row(
          {
            better: "down",
            detail:
              "가입 후 3일 안에 채팅한 사람의 첫 3일 LLM 호출 시간(elapsedMs) 합계 평균입니다. 병렬 호출은 겹쳐 더해집니다.",
            key: "llmMinutesPerChatter",
            label: "1인당 LLM 시간 (3일)",
            unit: "minutes",
          },
          cohort((rows) => {
            const people = rows.filter(chatted);
            return average(
              people.reduce((sum, item) => sum + item.llmMs3d / 60_000, 0),
              people.length
            );
          }),
          emptyAverage
        ),
      ],
    },
    {
      key: "nonPosting",
      label: "공고가 아닌 기회 추천",
      rows: [
        row(
          {
            better: "up",
            detail:
              "회사 자체 추천과 채용 글 추천 건수입니다. 배포 전·후 칸은 7일 평균입니다.",
            key: "nonPostingCount",
            label: "추천 건수",
            unit: "count",
          },
          recommendationsByBucket.map((item, index) => ({
            days: bucketDays[index] ?? 0,
            kind: "count",
            value: item.company + item.hiringPost,
          })),
          emptyCount
        ),
        row(
          {
            better: "up",
            detail:
              "Worker 정기 추천을 뺀 전체 추천 중 회사 자체·채용 글 추천의 비율입니다.",
            key: "nonPostingShare",
            label: "추천 중 비율",
            unit: "percent",
          },
          recommendationsByBucket.map((item) => rate(item.company + item.hiringPost, item.total)),
          emptyRate
        ),
      ],
    },
    {
      key: "firstRecommendations",
      label: "첫 3일 추천",
      rows: [
        row(
          {
            better: "up",
            detail:
              "가입 후 3일 안에 추천을 받은 사람 중 그 추천에 3일 안에 좋아요를 하나 이상 누른 비율입니다.",
            key: "recipientLikeRate",
            label: "추천 받은 사람 중 좋아요",
            unit: "percent",
          },
          cohort((rows) => {
            const people = recipients(rows);
            return rate(people.filter((item) => item.liked3d > 0).length, people.length);
          }),
          emptyRate
        ),
        row(
          {
            better: "up",
            detail: "첫 3일 추천에 첫 3일 안에 남긴 좋아요·싫어요 중 좋아요 비율입니다.",
            key: "feedbackLikeRate",
            label: "피드백 중 좋아요",
            unit: "percent",
          },
          cohort((rows) =>
            rate(
              rows.reduce((sum, item) => sum + item.liked3d, 0),
              rows.reduce((sum, item) => sum + item.liked3d + item.disliked3d, 0)
            )
          ),
          emptyRate
        ),
        row(
          {
            better: "up",
            detail:
              "가입 후 3일 안에 추천을 받은 사람 중 3일 안에 ‘Harper와 지원하기’를 누른 비율입니다.",
            key: "applyWithHarperRate",
            label: "Harper와 지원하기",
            unit: "percent",
          },
          cohort((rows) => {
            const people = recipients(rows);
            return rate(
              people.filter((item) => within(item.applyWithHarperAt, signedUpMs(item), COHORT_DAYS))
                .length,
              people.length
            );
          }),
          emptyRate
        ),
      ],
    },
    {
      key: "email",
      label: "이메일 연결",
      rows: [
        row(
          {
            better: "up",
            detail: "가입 후 3일 안에 Gmail을 연결한 비율입니다.",
            key: "gmailRate",
            label: "가입 대비 Gmail 연결",
            unit: "percent",
          },
          cohort((rows) =>
            rate(
              rows.filter((item) => within(item.gmailAt, signedUpMs(item), COHORT_DAYS)).length,
              rows.length
            )
          ),
          emptyRate
        ),
      ],
    },
    {
      key: "landing",
      label: "랜딩페이지",
      rows: [
        row(
          {
            better: "up",
            detail:
              "후보자 랜딩(/)을 본 브라우저 중 하루 안에 같은 브라우저로 가입한 비율입니다. 방문은 landing_stats_exposure로 셉니다. 배포 전 칸은 4주를 합친 주간 평균입니다.",
            key: "landingConversion",
            label: "랜딩 전환율",
            unit: "percent",
          },
          landingByBucket.map((item) => rate(item.converted, item.visitors)),
          emptyRate
        ),
      ],
    },
    {
      key: "jobs",
      label: "/jobs 미연결 공고 유입",
      rows: [
        row(
          {
            better: "up",
            detail:
              "/jobs 공고로 가입했는데 그 공고에 연결된 내부 Role이 없는 사람 중 가입 후 3일 안에 추천을 받은 비율입니다. 가입 경로는 /ops/metrics와 같은 규칙으로 정합니다.",
            key: "jobsWithoutRoleRecommended",
            label: "다른 추천을 받음",
            unit: "percent",
          },
          cohort((rows) => {
            const people = rows.filter((item) => args.jobsWithoutRoleUserIds.has(item.userId));
            return rate(
              people.filter((item) => item.recommendations3d > 0).length,
              people.length
            );
          }),
          emptyRate
        ),
      ],
    },
  ];

  return {
    buckets,
    deployedAt: new Date(args.deployedAtMs).toISOString(),
    generatedAt: new Date(args.nowMs).toISOString(),
    groups,
  };
}
