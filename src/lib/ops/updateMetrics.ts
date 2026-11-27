// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// /ops/update-metrics — "배포 후 실험중인 지표"
//
// 사용자가 정한 화면 원칙(2026-11-24). 이 화면을 고칠 때 먼저 읽고 지킨다.
//  1. 우리가 배포한 변화 중 지표로 추적해야 하는 것만 둔다. 단순 오류 수정은 넣지 않는다.
//  2. 맨 위에는 여러 변화가 함께 반영되는 대표 지표 하나(OPS_HEADLINE_CHART: 가입과 3일 안 채팅)를 두고, 추적 중인
//     변화의 배포일을 세로선으로 표시한다.
//  3. 그 아래는 추적할 작업 단위(OPS_TRACKED_CHANGES)마다 접히는 줄을 둔다. 접힌 줄에는 이름, 배포일, 대표 값의 배포 전후만
//     보인다. 펼치면 그 작업을 확인할 지표를 한 그래프에 그린다. 함께 볼 수 있는 지표는 한 그래프에 막대(건수)와
//     선(비율)으로 같이 넣는다.
//  4. 추적을 계속할지 끝낼지는 화면에서 누른다(ops_tracked_changes.ended_at). 끝낸 변화는 맨 아래 '종료'에 접혀 있고
//     다시 켤 수 있다. 변화 자체와 그 지표는 코드(OPS_TRACKED_CHANGES)에 더한다.
//  5. 범위(30·90·180일, 직접 선택)와 단위(일·주)를 /ops/metrics처럼 고른다.
//  6. 화면 글씨는 최소로 둔다. 설명과 계산식은 ⓘ 안에 넣는다. "가입·첫 추천 업데이트" 같은 묶음 제목, 메일 종류별 표,
//     "버튼 메일 행동 비율 -", "안 본 답장 메일 0통" 같은 숫자 칸을 다시 만들지 않는다.
//  7. /ops 지표 그래프(Talent 지표와 이 화면)에는 그 그래프에 정말 영향을 주는 중요한 변화만 배포일에 표시한다. 모든 커밋을
//     넣지 않는다. 표시는 OPS_TRACKED_CHANGES 중 추적 중인 것이고, 어느 그래프에 영향을 주는지는 talentCharts에 적는다.
//     마우스를 올리면 날짜 아래에 무엇을 바꿨는지 쉬운 말(detail)로 보이고, 표시를 누르면 이 화면의 그 변화 줄이 열린다.
//     그 줄에서 PR(links)로 갈 수 있다. (OpsChartTooltip, OpsChangeMarks)
//
// 새 변화를 추적하려면 OPS_TRACKED_CHANGES에 항목을 더한다. detail에는 사용자에게 무엇이 바뀌었는지 한두 문장으로 쓰고,
// talentCharts에는 그 변화가 실제로 움직일 Talent 지표 그래프만 적는다. 필요한 지표가 없으면 UPDATE_METRICS에 정의를 더하고
// buildOpsUpdateMetrics에서 날마다 값을 만든다.
//
// 값은 KST 날짜마다 만든다. 가입 코호트 지표는 그날 가입한 사람, 그 밖의 지표는 그날 일어난 일로 센다. 화면이 날을 주로
// 묶는다. 가입 N일 안 지표는 가입한 지 N일이 안 된 사람도 지금까지 한 것으로 센다(2026-11-21·11-23 기준). 그래서 최근
// 값은 기간이 차면서 오를 수 있다.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** Cohort metrics look at what a talent did in the first 3 days after signing up. */
const COHORT_DAYS = 3;
/** A landing visit converts when the same browser signs up within a day. */
const LANDING_CONVERSION_DAYS = 1;
/** The folded row compares the days since the deploy with this many days before it. */
export const UPDATE_METRICS_BEFORE_DAYS = 28;

export type UpdateMetricUnit = "count" | "minutes" | "percent" | "usd";

export type UpdateMetricValue =
  /** A share: numerator out of denominator. */
  | { denominator: number; kind: "rate"; numerator: number }
  /** A count over `days` days (the running day counts as the part that has passed). */
  | { days: number; kind: "count"; value: number }
  /** A per-person average: total over denominator people. */
  | { denominator: number; kind: "average"; total: number };

export type UpdateMetricDefinition = {
  /** Which way is an improvement; null when either way is fine. */
  better: "down" | "up" | null;
  /** ⓘ text: what is counted and how. */
  detail: string;
  label: string;
  unit: UpdateMetricUnit;
};

const SINCE_SO_FAR = "가입한 지 기간이 안 된 사람은 지금까지 한 것으로 셉니다.";
/** What "지원" counts for the /jobs entry rows: the /ops/metrics 맡김 plus the person's own 직접 지원. */
const APPLIED_7D =
  "가입 후 7일 안에 지원한 사람의 비율입니다. 지원은 다음 중 하나라도 한 것입니다: ① 공고의 'Harper와 지원하기'를 누름 ② 하퍼 자리에 연결 요청을 보냄 ③ 대신 지원을 확정함(제출에 실패해도 셈) ④ Harper가 회사에 소개를 보냄 ⑤ 공고의 '직접 지원했어요'(채용 글이면 '직접 연락했어요')를 누름. ①~④는 /ops/metrics의 '맡김'과 같습니다. ⑤는 본인이 누른 표시라 실제로 냈는지는 확인하지 못합니다.";
/** What "연결" counts: the /ops/metrics rule. */
const CONNECTED_7D =
  "가입 후 7일 안에 회사에 실제로 닿은 사람의 비율입니다. 연결은 /ops/metrics와 같이 대신 지원이 실제로 제출됨(메일 지원은 발송 성공, 사이트 지원은 실행이 끝나고 제출 확인 문구가 있음) 또는 Harper가 회사에 소개를 보낸 것입니다. 직접 지원은 제출을 확인할 수 없어 들어가지 않습니다.";

/** Every metric the screen can draw. Keys are stable: tracked changes and stored snapshots refer to them. */
export const UPDATE_METRICS = {
  signups: {
    better: "up",
    detail: "그 기간에 가입한 talent 수입니다.",
    label: "가입",
    unit: "count",
  },
  chatRate24h: {
    better: "up",
    detail: `그 기간 가입자 중 가입 후 24시간 안에 채팅 메시지를 보낸 비율입니다. 직접 입력과 채팅 버튼(선택지, 오픈 포지션 더 추천, 소개 요청, 양식 답변)으로 보낸 메시지를 모두 셉니다. ${SINCE_SO_FAR}`,
    label: "24시간 안 채팅",
    unit: "percent",
  },
  chatRate3d: {
    better: "up",
    detail: `그 기간 가입자 중 가입 후 3일 안에 채팅 메시지를 보낸 비율입니다. 직접 입력과 채팅 버튼으로 보낸 메시지를 모두 셉니다. ${SINCE_SO_FAR}`,
    label: "3일 안 채팅",
    unit: "percent",
  },
  startedWithoutMaterials: {
    better: null,
    detail:
      "그 기간 가입자 중 이력서·LinkedIn 없이 3일 안에 온보딩을 제출하거나 채팅을 시작한 비율입니다. 자료 여부는 지금 프로필 기준입니다.",
    label: "자료 없이 시작",
    unit: "percent",
  },
  costPerChatter: {
    better: "down",
    detail:
      "가입 후 3일 안에 채팅한 사람의 첫 3일 LLM 추정 비용 평균입니다(llm_logs, 도구별 배분 행 제외).",
    label: "1인당 비용 (3일)",
    unit: "usd",
  },
  llmMinutesPerChatter: {
    better: "down",
    detail:
      "가입 후 3일 안에 채팅한 사람의 첫 3일 LLM 호출 시간(elapsedMs) 합계 평균입니다. 병렬 호출은 겹쳐 더해집니다.",
    label: "1인당 LLM 시간 (3일)",
    unit: "minutes",
  },
  companyRecommendations: {
    better: "up",
    detail: "Worker 정기 추천을 뺀 추천 중 회사 자체를 추천한 건수입니다.",
    label: "회사 추천",
    unit: "count",
  },
  hiringPostRecommendations: {
    better: "up",
    detail: "Worker 정기 추천을 뺀 추천 중 채용 글(공식 공고가 아닌 글)을 추천한 건수입니다.",
    label: "채용 글 추천",
    unit: "count",
  },
  nonPostingShare: {
    better: "up",
    detail: "Worker 정기 추천을 뺀 전체 추천 중 회사 자체·채용 글 추천의 비율입니다.",
    label: "추천 중 공고 아닌 기회",
    unit: "percent",
  },
  recommendationRecipients: {
    better: "up",
    detail: "그 기간 가입자 중 가입 후 3일 안에 추천을 받은 사람 수입니다.",
    label: "3일 안 추천 받은 사람",
    unit: "count",
  },
  recipientLikeRate: {
    better: "up",
    detail:
      "가입 후 3일 안에 추천을 받은 사람 중 그 추천에 3일 안에 좋아요를 하나 이상 누른 비율입니다. ‘이미 지원했던 회사/역할’로 제외한 것도 좋아요로 셉니다.",
    label: "추천 받은 사람 중 좋아요",
    unit: "percent",
  },
  applyWithHarperRate: {
    better: "up",
    detail: "가입 후 3일 안에 추천을 받은 사람 중 3일 안에 ‘Harper와 지원하기’를 누른 비율입니다.",
    label: "Harper와 지원하기",
    unit: "percent",
  },
  gmailProposedRate: {
    better: null,
    detail: `그 기간 가입자 중 3일 안에 Harper가 채팅에서 Gmail 연결 카드를 보여 준 비율입니다. ${SINCE_SO_FAR}`,
    label: "Gmail 연결 제안",
    unit: "percent",
  },
  gmailRate: {
    better: "up",
    detail: `그 기간 가입자 중 3일 안에 Gmail을 연결한 비율입니다. ${SINCE_SO_FAR}`,
    label: "Gmail 연결",
    unit: "percent",
  },
  landingVisitors: {
    better: "up",
    detail: "후보자 랜딩(/)을 처음 본 브라우저 수입니다(landing_stats_exposure).",
    label: "랜딩 방문",
    unit: "count",
  },
  landingConversion: {
    better: "up",
    detail:
      "후보자 랜딩을 본 브라우저 중 하루 안에 같은 브라우저로 가입한 비율입니다. 본 지 하루가 안 된 방문은 지금까지 가입한 것으로 셉니다.",
    label: "랜딩 전환율",
    unit: "percent",
  },
  jobsWithoutRoleSignups: {
    better: null,
    detail:
      "하퍼 자리(내부 Role)가 없는 /jobs 공고(묶음 공고 등)로 가입한 사람 수입니다. 가입한 날로 셉니다. 어느 공고로 왔는지는 /ops/metrics 가입 경로와 같은 규칙으로 정합니다.",
    label: "미연결 공고로 가입",
    unit: "count",
  },
  jobsWithoutRoleRecommended: {
    better: "up",
    detail: "미연결 /jobs 공고로 가입한 사람 중 가입 후 3일 안에 다른 추천을 받은 비율입니다.",
    label: "다른 추천을 받음",
    unit: "percent",
  },
  jobsWithoutRoleApplied7d: {
    better: "up",
    detail: `${APPLIED_7D} 계산: 지원한 사람 ÷ 미연결 공고로 가입한 사람. 예: 10명 가입, 그중 3명이 지원 → 30%. ${SINCE_SO_FAR}`,
    label: "미연결 공고 7일 안 지원",
    unit: "percent",
  },
  jobsWithoutRoleConnected7d: {
    better: "up",
    detail: `${CONNECTED_7D} 계산: 연결된 사람 ÷ 미연결 공고로 가입한 사람. 예: 10명 가입, 그중 1명 연결 → 10%. ${SINCE_SO_FAR}`,
    label: "미연결 공고 7일 안 연결",
    unit: "percent",
  },
  jobsUnfinishedSignups: {
    better: null,
    detail:
      "/jobs 공고(하퍼 자리 유무와 상관없이)로 가입하고 가입 후 3일 안에 가입 양식을 내지 않은 사람 수입니다. 가입한 날로 셉니다. 가입한 지 3일이 안 된 사람은 아직 양식을 안 냈으면 들어갑니다.",
    label: "양식 미완료 공고 가입",
    unit: "count",
  },
  jobsUnfinishedApplied7d: {
    better: "up",
    detail: `${APPLIED_7D} 양식을 안 낸 사람은 주로 Harper 메일에 답해서 맡깁니다. 계산: 지원한 사람 ÷ 양식 미완료 공고 가입자. ${SINCE_SO_FAR}`,
    label: "양식 미완료 7일 안 지원",
    unit: "percent",
  },
  jobsUnfinishedConnected7d: {
    better: "up",
    detail: `${CONNECTED_7D} 계산: 연결된 사람 ÷ 양식 미완료 공고 가입자. ${SINCE_SO_FAR}`,
    label: "양식 미완료 7일 안 연결",
    unit: "percent",
  },
  choiceEmails: {
    better: null,
    detail:
      "Harper가 보낸 메일(정기 추천, 예약 실행, 이메일 답장, 연락 큐) 중 선택지 버튼이 들어간 메일 수입니다. 보낸 날로 셉니다.",
    label: "버튼 메일",
    unit: "count",
  },
  plainEmails: {
    better: null,
    detail: "Harper가 보낸 메일 중 선택지 버튼이 없는 메일 수입니다.",
    label: "버튼 없는 메일",
    unit: "count",
  },
  emailActionRate: {
    better: "up",
    detail:
      "Harper가 보낸 메일 중 받은 사람이 72시간 안에 행동한 비율입니다. 행동은 답장 메일, 채팅, 기회 반응(좋아요·싫어요, 저장 단계 변경)입니다. 72시간이 안 된 메일은 지금까지 한 것으로 셉니다.",
    label: "메일 받은 뒤 행동",
    unit: "percent",
  },
  choiceEmailActionRate: {
    better: "up",
    detail: "선택지 버튼이 들어간 메일 중 72시간 안에 행동한 비율입니다. 행동의 기준은 ‘메일 받은 뒤 행동’과 같습니다.",
    label: "버튼 메일 행동",
    unit: "percent",
  },
  plainEmailActionRate: {
    better: "up",
    detail: "선택지 버튼이 없는 메일 중 72시간 안에 행동한 비율입니다.",
    label: "버튼 없는 메일 행동",
    unit: "percent",
  },
  unseenReviewed: {
    better: null,
    detail:
      "답장을 5분 동안 보지 않고 떠나 Harper가 메일로도 전할지 검토한 수입니다(Career 실행 career_reply_unseen). 그사이 돌아와 본 답장은 검토하지 않습니다.",
    label: "안 본 답장 검토",
    unit: "count",
  },
  unseenEmailed: {
    better: null,
    detail: "그 검토에서 Harper가 실제로 메일을 보낸 수입니다.",
    label: "메일로 전함",
    unit: "count",
  },
  unseenEmailActionRate: {
    better: "up",
    detail:
      "안 본 답장을 메일로 받은 사람 중 72시간 안에 행동한 비율입니다. 행동은 답장 메일, 채팅, 기회 반응입니다.",
    label: "메일 받고 돌아옴",
    unit: "percent",
  },
  applyConfirmed: {
    better: null,
    detail:
      "talent가 Harper에게 실행을 승인한 대신 지원 수입니다. 승인한 날로 셉니다. /ops/metrics ‘대신지원 성공률’의 최종 컨펌과 같습니다.",
    label: "최종 컨펌",
    unit: "count",
  },
  applySubmitted: {
    better: "up",
    detail:
      "승인한 대신 지원 중 Gmail 발송이 성공했거나, 회사 사이트 실행 보고의 첫 문장이 제출 완료를 말하는 지원 수입니다. 승인한 날로 셉니다.",
    label: "제출 완료",
    unit: "count",
  },
  applySuccessRate: {
    better: "up",
    detail:
      "승인한 날이 같은 대신 지원 중 제출 완료의 비율(제출 완료 ÷ 최종 컨펌)입니다. 아직 진행 중인 지원은 제출 전으로 세므로 최근 값은 오를 수 있습니다.",
    label: "대신지원 성공률",
    unit: "percent",
  },
} as const satisfies Record<string, UpdateMetricDefinition>;

export type UpdateMetricKey = keyof typeof UPDATE_METRICS;

/** One chart: bars on the left axis, lines on the right axis (the left when there are no bars). */
export type UpdateMetricChart = {
  bars?: UpdateMetricKey[];
  /** Bars that are parts of one whole are stacked; otherwise they stand side by side. */
  stackBars?: boolean;
  lines?: UpdateMetricKey[];
};

/** /ops/metrics (Talent 지표) charts a tracked change can be marked on. */
export type OpsTalentChartKey =
  | "activeTalents"
  | "applyDelegation"
  | "applySuccess"
  | "connections"
  | "dau"
  | "gmail"
  | "internalAcceptance"
  | "messages"
  | "recommendationFeedback"
  | "signups"
  | "wau";

export type OpsTrackedChange = UpdateMetricChart & {
  /** KST date (YYYY-MM-DD) the change reached production. The charts draw a line there. */
  deployedOn: string;
  /** What changed for users, in a sentence or two. Shown under the date when hovering a marked chart. */
  detail: string;
  key: string;
  /** Where to read the change itself (the PR that shipped it). */
  links: Array<{ label: string; url: string }>;
  /** The metric whose before and after show on the folded row. */
  primary: UpdateMetricKey;
  /** Talent 지표 charts this change really moves; only those mark it. */
  talentCharts: OpsTalentChartKey[];
  title: string;
};

const PR_474 = { label: "PR #474", url: "https://github.com/matchharper/harper_beta/pull/474" };
const PR_436 = { label: "PR #436", url: "https://github.com/matchharper/harper_beta/pull/436" };
const PR_433 = { label: "PR #433", url: "https://github.com/matchharper/harper_beta/pull/433" };
const PR_400 = { label: "PR #400", url: "https://github.com/matchharper/harper_beta/pull/400" };
const PR_363 = { label: "PR #363", url: "https://github.com/matchharper/harper_beta/pull/363" };

/** 대신 지원 changes all read the same chart: confirmations, submissions among them, and the share submitted. */
const applySuccessChart = (): Pick<OpsTrackedChange, "bars" | "lines" | "primary" | "talentCharts"> => ({
  // Submitted is a part of confirmed, so stacking would count it twice; the bars stand side by side.
  bars: ["applyConfirmed", "applySubmitted"],
  lines: ["applySuccessRate"],
  primary: "applySuccessRate",
  talentCharts: ["applySuccess"],
});

/** The one metric many changes move at once: signups, and how many of them talk to Harper within 3 days. */
export const OPS_HEADLINE_CHART: UpdateMetricChart & { primary: UpdateMetricKey } = {
  bars: ["signups"],
  lines: ["chatRate3d"],
  primary: "chatRate3d",
};

/**
 * Changes followed on /ops/update-metrics, newest deploy first. A team member ends or resumes one on the screen
 * (ops_tracked_changes); the definition stays here.
 */
export const OPS_TRACKED_CHANGES: OpsTrackedChange[] = [
  {
    ...applySuccessChart(),
    // Placeholder: set the real KST deploy day and the PR link when this branch reaches main.
    deployedOn: "2026-11-27",
    detail:
      "시작 확인 폼 한 장에서 공고, 맡길 범위, 공통 사실, 공고별 이력서, 로그인 유지를 한 번에 묻고, 새로 물을 것이 없으면 다시 검토하지 않고 제출합니다. 마감된 공고는 브라우저를 열기 전에 거르고, 채팅 입력창 위 패널에 지원마다 제출까지의 단계를 실시간으로 보여 줍니다.",
    key: "2026-11-27-apply-confirm-progress",
    links: [],
    title: "지원 확인폼·패널",
  },
  {
    bars: ["jobsWithoutRoleSignups"],
    deployedOn: "2026-11-27",
    detail:
      "하퍼 자리가 없는 /jobs 공고로 가입한 사람에게, 첫 메시지부터 그 공고에 맞춰 매일 미리 골라 둔 하퍼 자리(추천받기)와 비슷한 공개 공고(대신 지원)를 제안합니다.",
    key: "2026-11-27-jobs-entry-connection",
    links: [PR_474],
    lines: ["jobsWithoutRoleApplied7d", "jobsWithoutRoleConnected7d"],
    primary: "jobsWithoutRoleApplied7d",
    talentCharts: ["connections", "applyDelegation"],
    title: "미연결 공고 첫 제안",
  },
  {
    bars: ["jobsUnfinishedSignups"],
    deployedOn: "2026-11-27",
    detail:
      "공고로 가입하고 가입 양식을 끝내지 않은 사람에게 가는 메일이 들어온 공고에서 시작합니다. 메일 속 공고 링크는 하퍼 화면에서 열리고, 메일 서버가 구글인 학교·회사 주소에서는 선택 버튼이 답장 창을 엽니다.",
    key: "2026-11-27-jobs-unfinished-mail",
    links: [PR_474],
    lines: ["jobsUnfinishedApplied7d", "jobsUnfinishedConnected7d"],
    primary: "jobsUnfinishedApplied7d",
    talentCharts: ["connections", "applyDelegation"],
    title: "양식 미완료 메일",
  },
  {
    bars: ["signups"],
    deployedOn: "2026-11-24",
    detail:
      "가입하면 Harper가 바로 추천하지 않고 먼저 인사합니다. 낸 자료에서 이해한 점과 해 줄 수 있는 일을 말하고, 왜 왔는지와 지금 상황을 선택지 버튼으로 묻습니다.",
    key: "2026-11-24-first-greeting",
    links: [PR_436],
    lines: ["chatRate24h"],
    primary: "chatRate24h",
    talentCharts: ["messages", "activeTalents", "dau"],
    title: "가입 직후 첫 인사",
  },
  {
    bars: ["unseenReviewed", "unseenEmailed"],
    deployedOn: "2026-11-24",
    detail:
      "답장을 5분 동안 보지 않고 떠나면 Harper가 메일로도 전할지 정합니다. 그사이 돌아와 보면 보내지 않습니다.",
    key: "2026-11-24-unseen-reply-email",
    links: [PR_436],
    lines: ["unseenEmailActionRate"],
    primary: "unseenEmailActionRate",
    talentCharts: ["activeTalents", "dau", "wau"],
    title: "보지 못한 답장은 메일로",
  },
  {
    bars: ["choiceEmails", "plainEmails"],
    deployedOn: "2026-11-24",
    detail:
      "Harper 메일에도 선택지 버튼이 들어갑니다. Gmail·Outlook·iCloud에서는 답장 창이 열리고, 다른 메일함에서는 채팅 입력창에 답이 채워집니다.",
    key: "2026-11-24-email-choice-buttons",
    links: [PR_436],
    lines: ["choiceEmailActionRate", "plainEmailActionRate"],
    primary: "emailActionRate",
    stackBars: true,
    talentCharts: ["messages", "activeTalents", "dau"],
    title: "메일 선택지 버튼",
  },
  {
    ...applySuccessChart(),
    // main merge of PR #433: 2026-11-23 22:36 KST.
    deployedOn: "2026-11-23",
    detail:
      "여러 지원을 먼저 모두 준비한 뒤 한 번에 승인하고, 서로 다른 지원의 준비는 동시에 돌립니다. 확인 폼은 필수 칸을 표시하고 아는 내용은 미리 채우며, 제출 안 됨으로 끝난 지원은 다시 제출할 수 있고, 준비를 기다리는 동안 절반의 사람에게(A/B) Gmail 연결 카드를 보여 줍니다.",
    key: "2026-11-23-apply-batch",
    links: [PR_433],
    title: "지원 한번에 승인",
  },
  {
    bars: ["landingVisitors"],
    deployedOn: "2026-11-20",
    detail: "후보자 랜딩 /를 새 디자인으로 바꿨습니다.",
    key: "2026-11-20-landing",
    links: [PR_400],
    lines: ["landingConversion"],
    primary: "landingConversion",
    talentCharts: ["signups"],
    title: "새 랜딩",
  },
  {
    bars: ["companyRecommendations", "hiringPostRecommendations"],
    deployedOn: "2026-11-20",
    detail: "공식 공고 말고도 회사 자체와 채용 글(채용 신호)을 찾아 추천합니다.",
    key: "2026-11-20-non-posting",
    links: [PR_400],
    lines: ["nonPostingShare"],
    primary: "nonPostingShare",
    stackBars: true,
    talentCharts: ["recommendationFeedback"],
    title: "공고가 아닌 기회 추천",
  },
  {
    bars: ["recommendationRecipients"],
    deployedOn: "2026-11-20",
    detail: "Career 노트와 회사 탐색으로 가입 후 첫 추천을 고릅니다.",
    key: "2026-11-20-first-recommendations",
    links: [PR_400],
    lines: ["recipientLikeRate", "applyWithHarperRate"],
    primary: "recipientLikeRate",
    talentCharts: ["recommendationFeedback", "applyDelegation"],
    title: "첫 3일 추천",
  },
  {
    bars: ["signups"],
    deployedOn: "2026-11-20",
    detail: "이력서·LinkedIn 없이도 온보딩을 마치고 채팅을 시작할 수 있습니다.",
    key: "2026-11-20-without-materials",
    links: [PR_400],
    lines: ["startedWithoutMaterials"],
    primary: "startedWithoutMaterials",
    talentCharts: ["signups", "messages"],
    title: "자료 없이 시작",
  },
  {
    deployedOn: "2026-11-20",
    detail: "가입 후 대화에서 Harper가 Gmail 연결을 제안합니다.",
    key: "2026-11-20-gmail",
    links: [PR_400],
    lines: ["gmailProposedRate", "gmailRate"],
    primary: "gmailRate",
    talentCharts: ["gmail"],
    title: "Gmail 연결",
  },
  {
    bars: ["jobsWithoutRoleSignups"],
    deployedOn: "2026-11-20",
    detail: "내부 Role이 없는 /jobs 공고로 들어온 사람에게도 다른 기회를 추천합니다.",
    key: "2026-11-20-jobs-without-role",
    links: [PR_400],
    lines: ["jobsWithoutRoleRecommended"],
    primary: "jobsWithoutRoleRecommended",
    talentCharts: ["recommendationFeedback"],
    title: "/jobs 미연결 공고 유입",
  },
  {
    bars: ["costPerChatter"],
    deployedOn: "2026-11-20",
    detail: "가입·첫 추천을 바꾼 뒤 1인당 비용과 LLM 시간이 얼마나 늘었는지 봅니다.",
    key: "2026-11-20-cost",
    links: [PR_400],
    lines: ["llmMinutesPerChatter"],
    primary: "costPerChatter",
    talentCharts: [],
    title: "1인당 비용·LLM 시간",
  },
  {
    ...applySuccessChart(),
    // main merge of PR #363: 2026-11-18 18:15 KST.
    deployedOn: "2026-11-18",
    detail:
      "사이트가 보내는 인증 코드를 Harper가 직접 받아 같은 브라우저에 넣고, 로그인은 Harper 브라우저에서 맞는 로그인 입구까지 가서 합니다. 사람이 동의하면 사이트 로그인을 저장해 다음 지원부터 다시 로그인하지 않습니다.",
    key: "2026-11-18-apply-login-code",
    links: [PR_363],
    title: "지원 코드·로그인",
  },
];

export const OPS_TRACKED_CHANGE_KEYS = new Set(OPS_TRACKED_CHANGES.map((change) => change.key));

/**
 * Which chart a mark belongs to: a Talent 지표 chart, this screen's headline (every tracked change), or one tracked
 * change's own chart (that change only).
 */
export type OpsChangeChart = OpsTalentChartKey | "headline" | { change: string };

export function changeMovesChart(change: OpsTrackedChange, chart: OpsChangeChart) {
  if (chart === "headline") return true;
  if (typeof chart === "object") return change.key === chart.change;
  return change.talentCharts.includes(chart);
}

export type OpsUpdateMetricsResponse = {
  /** KST dates covered, oldest first. Starts before the chosen range when a deploy needs its 28 days before. */
  days: string[];
  generatedAt: string;
  /** One value per day in `days`. A key can be missing in a result saved by an older build. */
  metrics: Partial<Record<UpdateMetricKey, UpdateMetricValue[]>>;
};

export type UpdateMetricsSignupRow = {
  applyWithHarperAt: Date | string | null;
  costUsd3d: number;
  disliked3d: number;
  firstChatAt: Date | string | null;
  gmailAt: Date | string | null;
  /** First Harper reply that showed the Gmail connection card. */
  gmailProposedAt: Date | string | null;
  hasMaterials: boolean;
  liked3d: number;
  llmMs3d: number;
  onboardingSubmittedAt: Date | string | null;
  /** First connection (a submitted 대신 지원 or a delivered introduction), at any time. */
  connectedAt?: Date | string | null;
  /** First application: a connection, a 맡김 (the /ops/metrics rule) or their own '직접 지원했어요', at any time. */
  appliedAt?: Date | string | null;
  recommendations3d: number;
  signedUpAt: Date | string;
  userId: string;
};

export type UpdateMetricsUsageRow = Pick<UpdateMetricsSignupRow, "costUsd3d" | "llmMs3d" | "userId">;

export type UpdateMetricsRecommendationRow = {
  company: number;
  day: string;
  hiringPost: number;
  total: number;
};

export type UpdateMetricsLandingRow = {
  at: Date | string;
  signedUpAt: Date | string | null;
};

export type UpdateMetricsEmailRow = {
  choiceActed: number;
  choiceEmails: number;
  day: string;
  plainActed: number;
  plainEmails: number;
};

export type UpdateMetricsUnseenReplyRow = {
  acted: number;
  day: string;
  emailed: number;
  reviewed: number;
};

/** 대신 지원 confirmed on a KST day, and how many of them were submitted. */
export type UpdateMetricsApplicationRow = {
  confirmed: number;
  day: string;
  submitted: number;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function kstDateOnly(ms: number) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST midnight of a YYYY-MM-DD date, as epoch ms. */
export function kstMidnightMs(date: string) {
  if (!DATE_ONLY.test(date)) throw new Error("날짜가 올바르지 않습니다.");
  const ms = Date.parse(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(ms)) throw new Error("날짜가 올바르지 않습니다.");
  return ms;
}

export function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every KST date from start to end, inclusive. */
export function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * The days the server reads for a chosen range: from the range start, or 28 days before the earliest tracked deploy
 * when that is earlier, so every folded row has its before period.
 */
export function updateMetricsWindow(range: { from: string; to: string }) {
  const earliestBefore = OPS_TRACKED_CHANGES.reduce(
    (min, change) => {
      const start = addDays(change.deployedOn, -UPDATE_METRICS_BEFORE_DAYS);
      return start < min ? start : min;
    },
    range.from
  );
  return { from: earliestBefore, to: range.to };
}

const toMs = (value: Date | string | null | undefined) =>
  value === null || value === undefined ? null : new Date(value).getTime();

const within = (at: Date | string | null, fromMs: number, days: number) => {
  const ms = toMs(at);
  return ms !== null && ms >= fromMs && ms < fromMs + days * DAY_MS;
};

export const rate = (numerator: number, denominator: number): UpdateMetricValue => ({
  denominator,
  kind: "rate",
  numerator,
});

export const average = (total: number, denominator: number): UpdateMetricValue => ({
  denominator,
  kind: "average",
  total,
});

/** Adds values of one metric: rates and averages over all their rows, counts over all their days. */
export function sumValues(values: UpdateMetricValue[]): UpdateMetricValue | null {
  const first = values[0];
  if (!first) return null;
  if (first.kind === "rate") {
    let numerator = 0;
    let denominator = 0;
    for (const value of values) {
      if (value.kind !== "rate") continue;
      numerator += value.numerator;
      denominator += value.denominator;
    }
    return rate(numerator, denominator);
  }
  if (first.kind === "average") {
    let total = 0;
    let denominator = 0;
    for (const value of values) {
      if (value.kind !== "average") continue;
      total += value.total;
      denominator += value.denominator;
    }
    return average(total, denominator);
  }
  let value = 0;
  let days = 0;
  for (const item of values) {
    if (item.kind !== "count") continue;
    value += item.value;
    days += item.days;
  }
  return { days, kind: "count", value };
}

/** What a chart point shows: a rate (0–1), a per-person average, or the count itself. */
export function updateMetricChartValue(value: UpdateMetricValue | null | undefined) {
  if (!value) return null;
  if (value.kind === "rate") return value.denominator > 0 ? value.numerator / value.denominator : null;
  if (value.kind === "average") return value.denominator > 0 ? value.total / value.denominator : null;
  return value.value;
}

/** What a before/after comparison shows: like the chart, but a count is per day so periods of any length compare. */
export function updateMetricPeriodValue(value: UpdateMetricValue | null | undefined) {
  if (value?.kind === "count") return value.days > 0 ? value.value / value.days : null;
  return updateMetricChartValue(value);
}

/** The pooled value of `key` over KST days [start, end]; null when no day of it is in the data. */
export function updateMetricBetween(
  response: OpsUpdateMetricsResponse,
  key: UpdateMetricKey,
  start: string,
  end: string
) {
  const values = response.metrics[key] ?? [];
  return sumValues(
    response.days.flatMap((day, index) =>
      day >= start && day <= end && values[index] ? [values[index]] : []
    )
  );
}

/** The days since the deploy against the 28 days before it, for a change's primary metric. */
export function trackedChangeComparison(response: OpsUpdateMetricsResponse, change: { deployedOn: string; primary: UpdateMetricKey }) {
  const lastDay = response.days.at(-1) ?? change.deployedOn;
  return {
    after:
      lastDay >= change.deployedOn
        ? updateMetricBetween(response, change.primary, change.deployedOn, lastDay)
        : null,
    before: updateMetricBetween(
      response,
      change.primary,
      addDays(change.deployedOn, -UPDATE_METRICS_BEFORE_DAYS),
      addDays(change.deployedOn, -1)
    ),
  };
}

export function buildOpsUpdateMetrics(args: {
  applications: UpdateMetricsApplicationRow[];
  emails: UpdateMetricsEmailRow[];
  /** KST dates [from, to] the rows were read for. */
  from: string;
  /** Signups attributed to a /jobs posting with no internal Role behind it. */
  jobsWithoutRoleUserIds: Set<string>;
  /** Signups attributed to any /jobs posting. */
  jobsUserIds?: Set<string>;
  landing: UpdateMetricsLandingRow[];
  nowMs: number;
  recommendations: UpdateMetricsRecommendationRow[];
  signups: UpdateMetricsSignupRow[];
  to: string;
  unseenReplies: UpdateMetricsUnseenReplyRow[];
}): OpsUpdateMetricsResponse {
  const today = kstDateOnly(args.nowMs);
  const days = daysBetween(args.from, args.to < today ? args.to : today);
  const indexOf = new Map(days.map((day, index) => [day, index]));
  // The running day counts as the part of it that has passed, so per-day averages stay fair.
  const dayLength = days.map((day) =>
    day === today ? Math.max(0, (args.nowMs - kstMidnightMs(day)) / DAY_MS) : 1
  );
  const byDay = <T>(rows: T[], dayOf: (row: T) => string) => {
    const grouped = days.map(() => [] as T[]);
    for (const row of rows) {
      const index = indexOf.get(dayOf(row));
      if (index !== undefined) grouped[index]?.push(row);
    }
    return grouped;
  };
  const count = (values: number[]): UpdateMetricValue[] =>
    values.map((value, index) => ({ days: dayLength[index] ?? 1, kind: "count", value }));

  const signedUpMs = (row: UpdateMetricsSignupRow) => new Date(row.signedUpAt).getTime();
  const signups = byDay(args.signups, (row) => kstDateOnly(signedUpMs(row)));
  const chattedWithin = (row: UpdateMetricsSignupRow, daysAfter: number) =>
    within(row.firstChatAt, signedUpMs(row), daysAfter);
  const started = (row: UpdateMetricsSignupRow) =>
    chattedWithin(row, COHORT_DAYS) || within(row.onboardingSubmittedAt, signedUpMs(row), COHORT_DAYS);
  const share = (rows: UpdateMetricsSignupRow[], test: (row: UpdateMetricsSignupRow) => boolean) =>
    rate(rows.filter(test).length, rows.length);
  const chatterAverage = (rows: UpdateMetricsSignupRow[], amount: (row: UpdateMetricsSignupRow) => number) => {
    const people = rows.filter((row) => chattedWithin(row, COHORT_DAYS));
    return average(people.reduce((sum, row) => sum + amount(row), 0), people.length);
  };
  const recipients = signups.map((rows) => rows.filter((row) => row.recommendations3d > 0));
  const jobsSignups = signups.map((rows) => rows.filter((row) => args.jobsWithoutRoleUserIds.has(row.userId)));
  const connectedWithin7d = (row: UpdateMetricsSignupRow) => within(row.connectedAt ?? null, signedUpMs(row), 7);
  const appliedWithin7d = (row: UpdateMetricsSignupRow) => within(row.appliedAt ?? null, signedUpMs(row), 7);
  // Signed up from a posting and had not finished the signup form 3 days later.
  const jobsUnfinished = signups.map((rows) =>
    rows.filter((row) =>
      args.jobsUserIds?.has(row.userId) && !within(row.onboardingSubmittedAt, signedUpMs(row), COHORT_DAYS)
    )
  );

  const recommendations = byDay(args.recommendations, (row) => row.day).map((rows) =>
    rows.reduce(
      (sum, row) => ({
        company: sum.company + row.company,
        hiringPost: sum.hiringPost + row.hiringPost,
        total: sum.total + row.total,
      }),
      { company: 0, hiringPost: 0, total: 0 }
    )
  );

  const landing = byDay(args.landing, (row) => kstDateOnly(new Date(row.at).getTime())).map((rows) => ({
    converted: rows.filter((row) => within(row.signedUpAt, new Date(row.at).getTime(), LANDING_CONVERSION_DAYS))
      .length,
    visitors: rows.length,
  }));

  const emails = byDay(args.emails, (row) => row.day).map((rows) =>
    rows.reduce(
      (sum, row) => ({
        choiceActed: sum.choiceActed + row.choiceActed,
        choiceEmails: sum.choiceEmails + row.choiceEmails,
        plainActed: sum.plainActed + row.plainActed,
        plainEmails: sum.plainEmails + row.plainEmails,
      }),
      { choiceActed: 0, choiceEmails: 0, plainActed: 0, plainEmails: 0 }
    )
  );

  const unseen = byDay(args.unseenReplies, (row) => row.day).map((rows) =>
    rows.reduce(
      (sum, row) => ({
        acted: sum.acted + row.acted,
        emailed: sum.emailed + row.emailed,
        reviewed: sum.reviewed + row.reviewed,
      }),
      { acted: 0, emailed: 0, reviewed: 0 }
    )
  );

  const applications = byDay(args.applications, (row) => row.day).map((rows) =>
    rows.reduce(
      (sum, row) => ({
        confirmed: sum.confirmed + row.confirmed,
        submitted: sum.submitted + row.submitted,
      }),
      { confirmed: 0, submitted: 0 }
    )
  );

  const metrics: Record<UpdateMetricKey, UpdateMetricValue[]> = {
    signups: count(signups.map((rows) => rows.length)),
    chatRate24h: signups.map((rows) => share(rows, (row) => chattedWithin(row, 1))),
    chatRate3d: signups.map((rows) => share(rows, (row) => chattedWithin(row, COHORT_DAYS))),
    startedWithoutMaterials: signups.map((rows) => share(rows, (row) => started(row) && !row.hasMaterials)),
    costPerChatter: signups.map((rows) => chatterAverage(rows, (row) => row.costUsd3d)),
    llmMinutesPerChatter: signups.map((rows) => chatterAverage(rows, (row) => row.llmMs3d / 60_000)),
    companyRecommendations: count(recommendations.map((item) => item.company)),
    hiringPostRecommendations: count(recommendations.map((item) => item.hiringPost)),
    nonPostingShare: recommendations.map((item) => rate(item.company + item.hiringPost, item.total)),
    recommendationRecipients: count(recipients.map((rows) => rows.length)),
    recipientLikeRate: recipients.map((rows) => share(rows, (row) => row.liked3d > 0)),
    applyWithHarperRate: recipients.map((rows) =>
      share(rows, (row) => within(row.applyWithHarperAt, signedUpMs(row), COHORT_DAYS))
    ),
    gmailProposedRate: signups.map((rows) =>
      share(rows, (row) => within(row.gmailProposedAt, signedUpMs(row), COHORT_DAYS))
    ),
    gmailRate: signups.map((rows) => share(rows, (row) => within(row.gmailAt, signedUpMs(row), COHORT_DAYS))),
    landingVisitors: count(landing.map((item) => item.visitors)),
    landingConversion: landing.map((item) => rate(item.converted, item.visitors)),
    jobsWithoutRoleSignups: count(jobsSignups.map((rows) => rows.length)),
    jobsWithoutRoleRecommended: jobsSignups.map((rows) => share(rows, (row) => row.recommendations3d > 0)),
    jobsWithoutRoleApplied7d: jobsSignups.map((rows) => share(rows, appliedWithin7d)),
    jobsWithoutRoleConnected7d: jobsSignups.map((rows) => share(rows, connectedWithin7d)),
    jobsUnfinishedSignups: count(jobsUnfinished.map((rows) => rows.length)),
    jobsUnfinishedApplied7d: jobsUnfinished.map((rows) => share(rows, appliedWithin7d)),
    jobsUnfinishedConnected7d: jobsUnfinished.map((rows) => share(rows, connectedWithin7d)),
    choiceEmails: count(emails.map((item) => item.choiceEmails)),
    plainEmails: count(emails.map((item) => item.plainEmails)),
    emailActionRate: emails.map((item) =>
      rate(item.choiceActed + item.plainActed, item.choiceEmails + item.plainEmails)
    ),
    choiceEmailActionRate: emails.map((item) => rate(item.choiceActed, item.choiceEmails)),
    plainEmailActionRate: emails.map((item) => rate(item.plainActed, item.plainEmails)),
    unseenReviewed: count(unseen.map((item) => item.reviewed)),
    unseenEmailed: count(unseen.map((item) => item.emailed)),
    unseenEmailActionRate: unseen.map((item) => rate(item.acted, item.emailed)),
    applyConfirmed: count(applications.map((item) => item.confirmed)),
    applySubmitted: count(applications.map((item) => item.submitted)),
    applySuccessRate: applications.map((item) => rate(item.submitted, item.confirmed)),
  };

  return { days, generatedAt: new Date(args.nowMs).toISOString(), metrics };
}
