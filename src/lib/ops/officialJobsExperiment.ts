import {
  OFFICIAL_JOBS_LAYOUT_ABTEST_A,
  OFFICIAL_JOBS_LAYOUT_ABTEST_B,
  OFFICIAL_JOBS_LAYOUT_EXPERIMENT,
} from "@/lib/officialJobs/experiment";
import { parseOfficialJobLandingLogType } from "@/lib/officialJobs/landingLogs";
import { extractEmailFromLandingLoginType } from "@/lib/landingLogTypes";
import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
} from "./abTests";

type JobsExperimentLog = {
  local_id: string | null;
  type: string | null;
  created_at: string;
  abtest_type: string | null;
};

export function buildOfficialJobsExperiment(
  rows: JobsExperimentLog[],
  excludeEmail: (email: string) => boolean
): OpsAbTestSummary {
  const visitors = new Map<string, JobsExperimentLog[]>();
  for (const row of rows) {
    if (!row.local_id) continue;
    const logs = visitors.get(row.local_id) ?? [];
    logs.push(row);
    visitors.set(row.local_id, logs);
  }
  const groups = [...visitors.values()].flatMap((rows) => {
    const logs = [...rows].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    if (
      logs.some((log) => {
        const email = extractEmailFromLandingLoginType(log.type);
        return email ? excludeEmail(email) : false;
      })
    )
      return [];
    const exposure = logs.find((log) => {
      const event = parseOfficialJobLandingLogType(log.type)?.event;
      return (
        (event === "list_view" || event === "job_view") &&
        (log.abtest_type === OFFICIAL_JOBS_LAYOUT_ABTEST_A ||
          log.abtest_type === OFFICIAL_JOBS_LAYOUT_ABTEST_B)
      );
    });
    if (!exposure) return [];
    const subsequent = logs.filter(
      (log) =>
        log.created_at >= exposure.created_at &&
        log.abtest_type === exposure.abtest_type
    );
    return [
      {
        variant: exposure.abtest_type,
        at: exposure.created_at,
        started: subsequent.some((log) => {
          const event = parseOfficialJobLandingLogType(log.type)?.event;
          return event === "talk_click" || event === "list_talk_click";
        }),
        detail: subsequent.some(
          (log) =>
            parseOfficialJobLandingLogType(log.type)?.event === "job_view"
        ),
        loggedIn: subsequent.some((log) =>
          Boolean(extractEmailFromLandingLoginType(log.type))
        ),
      },
    ];
  });
  const makeVariant = (
    id: string,
    label: string,
    description: string
  ): OpsAbTestVariant => {
    const group = groups.filter((item) => item.variant === id);
    const total = group.length;
    return {
      id,
      label,
      description,
      sampleCount: total,
      primary: makeOpsAbTestRate(
        group.filter((item) => item.started).length,
        total
      ),
      metrics: [
        {
          format: "rate",
          label: "로그인 전환율",
          value: total
            ? group.filter((item) => item.loggedIn).length / total
            : null,
        },
        {
          format: "rate",
          label: "상세 조회율",
          value: total
            ? group.filter((item) => item.detail).length / total
            : null,
        },
      ],
    };
  };
  const variants: [OpsAbTestVariant, OpsAbTestVariant] = [
    makeVariant(
      OFFICIAL_JOBS_LAYOUT_ABTEST_A,
      "A · 기존 화면",
      "기존 목록 테이블과 역할 상세 페이지"
    ),
    makeVariant(
      OFFICIAL_JOBS_LAYOUT_ABTEST_B,
      "B · 카드와 안내 섹션",
      "최대 4열 카드 그리드, About 영상, 이용 방법, FAQ, 엔딩 섹션. 상세 페이지에는 About 제외."
    ),
  ];
  const dates = groups.map((item) => item.at).sort();
  return {
    id: OFFICIAL_JOBS_LAYOUT_EXPERIMENT,
    title: "Jobs 목록·상세 UI",
    status: "running",
    allocation: "브라우저별 고정 50:50",
    unitLabel: "브라우저",
    primaryMetricLabel: "대화 시작 클릭률",
    caveat:
      "목록 또는 상세 첫 노출 이후 대화 시작 CTA를 클릭한 브라우저 비율입니다. 21개씩 추가 로드는 양쪽에 동일하게 적용합니다. 로그인은 신규 가입과 기존 로그인을 포함하며, 상세 직접 유입도 포함합니다.",
    firstObservedAt: dates[0] ?? null,
    lastObservedAt: dates.at(-1) ?? null,
    variants,
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
  };
}
