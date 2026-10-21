import {
  LANDING_STATS_ABTEST_A,
  LANDING_STATS_ABTEST_B,
  LANDING_STATS_CONVERSION_WINDOW_MS,
  LANDING_STATS_EXPERIMENT,
  LANDING_STATS_EXPOSURE,
} from "@/lib/landingStatsExperiment";
import {
  extractEmailFromLandingLoginType,
  getLandingLogBaseType,
  isStartLandingLogType,
} from "@/lib/landingLogTypes";
import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
} from "./abTests";

export type LandingStatsLog = {
  local_id: string | null;
  type: string | null;
  created_at: string;
  abtest_type: string | null;
};
export type LandingStatsSignup = {
  localId: string;
  createdAt: string;
  userId: string;
};

export function buildLandingStatsExperiment({
  rows,
  signups,
  excludedUserIds = new Set<string>(),
  excludeEmail,
  now,
}: {
  rows: LandingStatsLog[];
  signups: LandingStatsSignup[];
  excludedUserIds?: Set<string>;
  excludeEmail: (email: string) => boolean;
  now: number;
}): OpsAbTestSummary {
  const visitors = new Map<string, LandingStatsLog[]>();
  for (const row of rows) {
    if (!row.local_id || Date.parse(row.created_at) > now) continue;
    const logs = visitors.get(row.local_id) ?? [];
    logs.push(row);
    visitors.set(row.local_id, logs);
  }
  const signupsByVisitor = new Map<string, LandingStatsSignup[]>();
  for (const signup of signups) {
    const events = signupsByVisitor.get(signup.localId) ?? [];
    events.push(signup);
    signupsByVisitor.set(signup.localId, events);
  }
  const groups = [...visitors.entries()].flatMap(([localId, rows]) => {
    const logs = [...rows].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    const signupEvents = signupsByVisitor.get(localId) ?? [];
    if (
      signupEvents.some((event) => excludedUserIds.has(event.userId)) ||
      logs.some((log) => {
        const email = extractEmailFromLandingLoginType(log.type);
        return email ? excludeEmail(email) : false;
      })
    )
      return [];
    const exposure = logs.find(
      (log) =>
        log.type === LANDING_STATS_EXPOSURE &&
        (log.abtest_type === LANDING_STATS_ABTEST_A ||
          log.abtest_type === LANDING_STATS_ABTEST_B)
    );
    if (!exposure) return [];
    const start = Date.parse(exposure.created_at);
    if (!Number.isFinite(start)) return [];
    const deadline = start + LANDING_STATS_CONVERSION_WINDOW_MS;
    const inWindow = (date: string) => {
      const time = Date.parse(date);
      return time >= start && time <= Math.min(deadline, now);
    };
    const subsequent = logs.filter((log) => inWindow(log.created_at));
    return [
      {
        variant: exposure.abtest_type,
        at: exposure.created_at,
        mature: deadline <= now,
        signedUp: signupEvents.some((event) => inWindow(event.createdAt)),
        started: subsequent.some((log) => isStartLandingLogType(log.type)),
        emailSubmitted: subsequent.some((log) =>
          ["email_capture_sent", "email_capture_already_sent"].includes(
            getLandingLogBaseType(log.type)
          )
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
    const group = groups.filter((visitor) => visitor.variant === id);
    const mature = group.filter((visitor) => visitor.mature);
    return {
      id,
      label,
      description,
      sampleCount: group.length,
      primary: makeOpsAbTestRate(
        mature.filter((visitor) => visitor.signedUp).length,
        mature.length
      ),
      metrics: [
        {
          format: "count",
          label: "24시간 관찰 중",
          value: group.length - mature.length,
        },
        {
          format: "count",
          label: "가입 완료 브라우저",
          value: group.filter((visitor) => visitor.signedUp).length,
          description:
            "관찰 중인 방문자를 포함한 누적 가입 완료 수. 비율 비교는 24시간 관찰 완료 표본만 사용합니다.",
        },
        {
          format: "rate",
          label: "시작 클릭률 · 24시간",
          value: makeOpsAbTestRate(
            mature.filter((visitor) => visitor.started).length,
            mature.length
          ).rate,
        },
        {
          format: "rate",
          label: "이메일 제출률 · 24시간",
          value: makeOpsAbTestRate(
            mature.filter((visitor) => visitor.emailSubmitted).length,
            mature.length
          ).rate,
        },
        {
          format: "rate",
          label: "로그인 전환율 · 24시간",
          value: makeOpsAbTestRate(
            mature.filter((visitor) => visitor.loggedIn).length,
            mature.length
          ).rate,
          description: "신규 가입과 기존 계정 로그인을 모두 포함합니다.",
        },
      ],
    };
  };
  const variants: [OpsAbTestVariant, OpsAbTestVariant] = [
    makeVariant(LANDING_STATS_ABTEST_A, "A · 통계 없음", "기존 홈 랜딩"),
    makeVariant(
      LANDING_STATS_ABTEST_B,
      "B · 통계 표시",
      "인재 로고 아래 인재 수 · 평균 메시지 · 매칭 횟수"
    ),
  ];
  const dates = groups.map((visitor) => visitor.at).sort();
  return {
    id: LANDING_STATS_EXPERIMENT,
    title: "홈 랜딩 통계 표시",
    allocation: "브라우저별 고정 50:50",
    unitLabel: "브라우저",
    primaryMetricLabel: "신규 가입 완료율 · 24시간",
    status: groups.length ? "running" : "awaiting_data",
    firstObservedAt: dates[0] ?? null,
    lastObservedAt: dates.at(-1) ?? null,
    caveat:
      "로그아웃 상태의 홈 방문자를 집계합니다. 선택 기간의 첫 방문 이후 24시간 내 서버 가입 완료 기록을 같은 브라우저 ID로 연결합니다. 24시간 관찰이 끝난 방문자만 전환율과 차이 계산에 포함하며, 재방문·중복 이벤트는 한 번만 셉니다. 통계 로딩 실패나 스크롤 여부로 표본을 제외하지 않습니다. 기존 가입 화면 실험과는 별도 배정입니다. 확인된 내부 이메일은 제외하며, 저장소 삭제·다른 기기에서는 연결이 끊길 수 있습니다.",
    variants,
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
  };
}
