import type { DailyUserStatsToolRow } from "./dailyUserStats";
import type { DebugProfileStats } from "./dailyDebugProfiles";
import type {
  DebugRecommendationStats,
  DebugCount,
} from "./dailyDebugRecommendations";

export type DebugRun = {
  id: string;
  talent_id: string | null;
  trigger: string;
  status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  not_before: string;
  error_message: string | null;
  coverage: { agentOutcome?: string } | null;
  trigger_payload: {
    runContract?: string;
    createdBy?: string;
    agentInvocation?: { acceptedAt?: string };
  } | null;
};
export type DebugDelivery = {
  id: string;
  talent_id: string | null;
  discovery_run_id: string | null;
  channel: string;
  status: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  error_message: string | null;
  payload: { resendEmailId?: string; sentAt?: string } | null;
};
export type DebugReply = {
  id: string;
  talent_id: string | null;
  status: string;
  kind: string;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  last_error: string | null;
};
export type DebugPending = { id: string; talent_id: string; due_at: string };
export type DebugFeatureExecution = {
  id: string;
  talent_id: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  error: string | null;
};
export type DebugProfileError = {
  id: string;
  user_id: string;
  type: string;
  error: string | null;
};
export type DebugSection<T> =
  | { data: T; error?: never }
  | { data: null; error: string };
export type DailyDebugReport = {
  date: string;
  startIso: string;
  endIso: string;
  observedAt: string;
  runs: DebugSection<DebugRun[]>;
  deliveries: DebugSection<DebugDelivery[]>;
  tools: DebugSection<DailyUserStatsToolRow[]>;
  recommendations: DebugSection<DebugRecommendationStats>;
  replies: DebugSection<DebugReply[]>;
  schedules: DebugSection<DebugPending[]>;
  sources: DebugSection<DebugPending[]>;
  profiles: DebugSection<DebugProfileStats>;
  profileErrors: DebugSection<DebugProfileError[]>;
  searches: DebugSection<DebugFeatureExecution[]>;
  browsers: DebugSection<DebugFeatureExecution[]>;
};

const ACTIVE_RUNS = new Set(["queued", "running", "handed_off"]);
const PENDING_DELIVERIES = new Set(["pending", "queued", "retry", "sending"]);
const PENDING_REPLIES = new Set([
  "queued",
  "running",
  "processing",
  "retry",
  "waiting_career",
]);
const n = (value: number) => value.toLocaleString("en-US");
const countPeople = (value: DebugCount) =>
  `${n(value.count)}건 / ${n(value.users)}명`;
const safe = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const inDebugDay = (
  value: string | null | undefined,
  report: Pick<DailyDebugReport, "startIso" | "endIso">
) =>
  Boolean(
    value &&
    Date.parse(value) >= Date.parse(report.startIso) &&
    Date.parse(value) < Date.parse(report.endIso)
  );
export const debugRunStartedAt = (run: DebugRun) =>
  run.started_at ?? run.trigger_payload?.agentInvocation?.acceptedAt ?? null;
const isCareerAgentRun = (run: DebugRun) =>
  run.trigger_payload?.runContract === "career_agent_v1";
export const debugDeliverySent = (row: DebugDelivery) =>
  row.status === "sent" || Boolean(row.payload?.resendEmailId);

export type DebugRunOutcome =
  | "sent"
  | "noSend"
  | "failedNoSend"
  | "sentWithError"
  | "cancelled"
  | "pending"
  | "unknown";
export function classifyDebugRun(
  run: DebugRun,
  deliveries: DebugDelivery[]
): DebugRunOutcome {
  const sent = deliveries.some(debugDeliverySent);
  const failed =
    run.status === "failed" ||
    run.status === "partial" ||
    deliveries.some((d) => d.status === "failed");
  if (sent && failed) return "sentWithError";
  if (
    deliveries.some(
      (d) => !debugDeliverySent(d) && d.status === "delivery_unknown"
    )
  )
    return "unknown";
  if (
    ACTIVE_RUNS.has(run.status) ||
    deliveries.some(
      (d) => !debugDeliverySent(d) && PENDING_DELIVERIES.has(d.status)
    )
  )
    return "pending";
  if (sent) return "sent";
  if (failed) return "failedNoSend";
  if (
    run.status === "cancelled" ||
    deliveries.some((d) => ["cancelled", "context_changed"].includes(d.status))
  )
    return "cancelled";
  // A completed model invocation is not itself a delivery receipt. In particular,
  // missing delivery rows must not turn delivery_pending/sent into normal no-send.
  if (
    run.status === "completed" &&
    run.coverage?.agentOutcome === "no_send" &&
    deliveries.length === 0
  )
    return "noSend";
  return "unknown";
}

function age(value: string, observedAt: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(observedAt) - Date.parse(value)) / 60_000)
  );
  if (minutes < 60) return `${minutes}분`;
  if (minutes < 1440)
    return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  return `${Math.floor(minutes / 1440)}일 ${Math.floor((minutes % 1440) / 60)}시간`;
}
function pendingLine(
  label: string,
  rows: Array<{ due_at: string }>,
  report: DailyDebugReport
) {
  if (!rows.length) return "";
  const oldest = rows.map((r) => r.due_at).sort()[0];
  return `• ${label} ${n(rows.length)}건 · 최장 ${age(oldest, report.observedAt)}`;
}

function summarizeError(message: string) {
  const text = message.trim();
  if (text.startsWith("[")) {
    try {
      const issues: unknown = JSON.parse(text);
      if (Array.isArray(issues)) {
        const messages = issues.flatMap((issue) =>
          typeof issue?.message === "string" ? [issue.message.trim()] : []
        );
        if (messages.length)
          return [...new Set(messages)].sort().join(" · ");
      }
    } catch {
      // Older logs also store plain text.
    }
  }
  return text.split("\n", 1)[0];
}

function errorSummary(label: string, errors: (string | null)[]) {
  if (!errors.length) return [];
  const counts = new Map<string, number>();
  for (const error of errors) {
    const message = summarizeError(error ?? "") || "오류 내용 기록 없음";
    counts.set(message, (counts.get(message) ?? 0) + 1);
  }
  const ranked = [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const short = (message: string) =>
    safe(message.length > 160 ? `${message.slice(0, 159)}…` : message);
  const heading = `• ${label} ${n(errors.length)}건`;
  if (ranked.length === 1) return [`${heading} · ${short(ranked[0][0])}`];
  const rest = ranked.slice(3).reduce((sum, [, count]) => sum + count, 0);
  return [
    heading,
    ...ranked.slice(0, 3).map(([message, count]) =>
      `  ↳ ${n(count)}건 · ${short(message)}`
    ),
    ...(rest ? [`  ↳ 그 외 ${n(rest)}건`] : []),
  ];
}

function recordedExternalSubmission(stats: {
  confirmed: DebugCount;
  submitted: DebugCount;
}) {
  const parts = [
    stats.confirmed.count ? `승인 ${countPeople(stats.confirmed)}` : "",
    stats.submitted.count ? `완료 ${countPeople(stats.submitted)}` : "",
  ].filter(Boolean);
  return parts.length ? [`• 기록으로 확인된 제출 ${parts.join(" · ")}`] : [];
}
function kst(iso: string) {
  return new Date(Date.parse(iso) + 9 * 3600_000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

const triggerLabels: Record<string, string> = {
  career_schedule_due: "정기 커리어 실행",
  career_daily_due: "회사 소식·면접 일정 등 일일 안내 (career_daily_due)",
  conversation_completed: "온보딩 후 실행",
  immediate_opportunity_requested: "즉시 추천 요청",
  agent_contact_received: "회사 연락",
  career_source_reconciled: "변경 사항 재처리",
  career_internal_evaluation: "내부 기회 평가",
  onboarding_internal_evaluation: "온보딩 내부 기회 평가",
};

export function formatDailyDebugSlackMessages(report: DailyDebugReport) {
  const errors = Object.entries(report).flatMap(([name, value]) =>
    value && typeof value === "object" && "error" in value && value.error
      ? [`${name}: ${value.error}`]
      : []
  );
  const dayRuns = report.runs.data?.filter((r) =>
    inDebugDay(debugRunStartedAt(r), report)
  );
  const deliveryByRun = new Map<string, DebugDelivery[]>();
  for (const row of report.deliveries.data ?? []) {
    if (!row.discovery_run_id) continue;
    const rows = deliveryByRun.get(row.discovery_run_id) ?? [];
    rows.push(row);
    deliveryByRun.set(row.discovery_run_id, rows);
  }
  const failedRuns = report.runs.data?.filter(
    (r) =>
      ["failed", "partial"].includes(r.status) &&
      inDebugDay(r.completed_at ?? r.updated_at, report)
  );
  const email = report.deliveries.data?.filter((d) => d.channel === "email");
  const retryEmail = email?.filter(
    (d) => d.status === "retry" && !debugDeliverySent(d)
  );
  const unknownEmail = email?.filter(
    (d) => d.status === "delivery_unknown" && !debugDeliverySent(d)
  );
  const failedEmail = email?.filter(
    (d) =>
      d.status === "failed" &&
      inDebugDay(d.updated_at, report) &&
      !debugDeliverySent(d)
  );
  const failedReplies = report.replies.data?.filter(
    (r) =>
      r.status === "failed" &&
      inDebugDay(r.processed_at ?? r.updated_at, report)
  );
  const failedTools = report.tools.data?.filter((t) => t.failedCallCount > 0);
  const toolFailureCount = failedTools?.reduce(
    (sum, t) => sum + t.failedCallCount,
    0
  );
  const unknownRuns =
    report.deliveries.data &&
    dayRuns?.filter(
      (r) =>
        isCareerAgentRun(r) &&
        classifyDebugRun(r, deliveryByRun.get(r.id) ?? []) === "unknown"
    );

  function runLines(trigger: string) {
    const label = triggerLabels[trigger] ?? safe(trigger);
    if (!dayRuns) return [`*${label}* — 집계 실패`];
    const rows = dayRuns.filter((r) => r.trigger === trigger);
    // Internal evaluation contracts do not deliver messages. A successful
    // evaluation needs no email receipt and must not raise a delivery alert.
    const workers = rows.filter((r) => !isCareerAgentRun(r));
    const agents = rows.filter(isCareerAgentRun);
    const workerLines = workers.length
      ? [
          `  평가·Worker: 완료 ${n(workers.filter((r) => r.status === "completed").length)} · 오류 ${n(workers.filter((r) => ["failed", "partial"].includes(r.status)).length)} · 취소 ${n(workers.filter((r) => r.status === "cancelled").length)} · 진행 중 ${n(workers.filter((r) => ACTIVE_RUNS.has(r.status)).length)}`,
        ]
      : [];
    if (workers.length && !agents.length)
      return [`*${label}* — 시작 ${n(rows.length)}건`, ...workerLines];
    if (!report.deliveries.data)
      return [`*${label}* — 시작 ${n(rows.length)}건 · 발송 결과 집계 실패`];
    const counts: Record<DebugRunOutcome, number> = {
      sent: 0,
      noSend: 0,
      failedNoSend: 0,
      sentWithError: 0,
      cancelled: 0,
      pending: 0,
      unknown: 0,
    };
    for (const row of agents)
      counts[classifyDebugRun(row, deliveryByRun.get(row.id) ?? [])]++;
    const extra = [
      counts.sentWithError ? `발송 후 오류 ${n(counts.sentWithError)}건` : "",
      counts.cancelled ? `취소 ${n(counts.cancelled)}건` : "",
      counts.pending ? `아직 실행·발송 중 ${n(counts.pending)}건` : "",
      counts.unknown ? `발송 여부 확인 필요 ${n(counts.unknown)}건` : "",
    ].filter(Boolean);
    return [
      `*${label}* — 시작 ${n(rows.length)}건`,
      `• 메일·메시지 보냄 ${n(counts.sent)}건 / 보내지 않고 완료 ${n(counts.noSend)}건`,
      `• 오류로 보내지 못함 ${n(counts.failedNoSend)}건`,
      ...(extra.length ? [`  ${extra.join(" · ")}`] : []),
      ...workerLines,
    ];
  }

  const pendingReplies = report.replies.data?.filter((r) =>
    PENDING_REPLIES.has(r.status)
  );
  const percentage = (part: number, total: number) =>
    total ? `${((100 * part) / total).toFixed(1)}%` : "해당 없음";
  const profile = report.profiles.data;
  const profileErrorRows = report.profileErrors.data;
  const searchFinished = report.searches.data?.filter((r) =>
    ["completed", "failed", "partial"].includes(r.status)
  );
  const searchFailed = searchFinished?.filter((r) =>
    ["failed", "partial"].includes(r.status)
  );
  const browserFinished = report.browsers.data?.filter(
    (r) =>
      ["completed", "succeeded", "failed"].includes(r.status) &&
      inDebugDay(r.finished_at, report)
  );
  const browserFailed = browserFinished?.filter((r) => r.status === "failed");
  // Existing incident checks use 30 minutes for email replies and one hour for
  // browser runs; ordinary in-flight work is not labelled a failure.
  const lateReplies = pendingReplies?.filter(
    (r) =>
      Date.parse(r.created_at) < Date.parse(report.observedAt) - 30 * 60_000
  );
  const lateBrowsers = report.browsers.data?.filter(
    (r) =>
      [
        "reserved",
        "preparing",
        "dispatching",
        "running",
        "cancelling",
        "capacity_wait",
      ].includes(r.status) &&
      Date.parse(r.created_at) < Date.parse(report.observedAt) - 60 * 60_000
  );
  const recommendationLines = (group: "external" | "internal") => {
    const stats = report.recommendations.data?.[group];
    const label =
      group === "external" ? "외부 추천·반응·지원" : "내부 추천·반응·연결";
    if (!stats) return [`*${label}* — 집계 실패`];
    return [
      `*${label}*`,
      `• 새 추천 ${countPeople(stats.recommended)}`,
      ...(group === "internal"
        ? [`  ↳ 사용자 직접 요청으로 추가된 추천 ${countPeople(stats.candidateRequested)}`]
        : []),
      `• 좋아요 ${countPeople(stats.likes)} · 싫어요 ${countPeople(stats.dislikes)}`,
      `• 보관 ${countPeople(stats.kept)} · 저장함 이동 ${countPeople(stats.saved)}`,
      `• 조회 ${countPeople(stats.views)} · 링크 클릭 ${countPeople(stats.clicks)}`,
      ...(group === "external"
        ? [
            `• 지원하기 클릭 ${countPeople(stats.applyClicks)}`,
            `• Harper와 지원하기 선택 ${countPeople(stats.applyRequests)}`,
            `• 채용 페이지에서 직접 지원 선택 ${countPeople(stats.directApplyClicks)}`,
            ...recordedExternalSubmission(stats),
          ]
        : [
            `• 지원·연결하기 클릭 ${countPeople(stats.applyClicks)}`,
            `• 연결 수락 확정 ${countPeople(stats.confirmed)}`,
            `• 회사 에이전트에 지원 의사·프로필 전달 ${countPeople(stats.submitted)}`,
          ]),
    ];
  };
  const summary = [
    `*Harper Daily Debug · ${report.date} KST*`,
    `집계 기간: ${kst(report.startIso)} ~ ${kst(report.endIso)} KST`,
    ...(errors.length
      ? [`⚠️ 집계하지 못한 항목 ${errors.length}개 — 상세 스레드 확인`]
      : []),
    "",
    "*이력서·LinkedIn → 프로필 저장 (집계 기간 내 등록자)*",
    ...(profile
      ? [
          `• 당일 이력서 업로드 또는 LinkedIn 등록 ${n(profile.registeredUsers)}명`,
          `• 경력·학력·extra가 모두 0개: *${n(profile.emptyUserIds.length)}명 (${percentage(profile.emptyUserIds.length, profile.registeredUsers)})*`,
        ]
      : ["• 집계 실패"]),
    "",
    ...runLines("career_schedule_due"),
    "",
    ...runLines("career_daily_due"),
    "",
    "*기능별 오류·지연*",
    profileErrorRows
      ? `• 이력서 업로드·프로필 저장 오류: ${n(profileErrorRows.length)}건 / ${n(new Set(profileErrorRows.map((r) => r.user_id)).size)}명`
      : "• 이력서 업로드·프로필 저장 오류: 집계 실패",
    searchFinished
      ? searchFinished.length
        ? `• 외부 공고 검색 실패·일부 실패: 종료 ${n(searchFinished.length)}건 중 ${n(searchFailed!.length)}건 (${percentage(searchFailed!.length, searchFinished.length)})`
        : "• 외부 공고 검색: 종료된 검색 없음"
      : "• 외부 공고 검색 오류: 집계 실패",
    browserFinished
      ? browserFinished.length
        ? `• 자동 브라우저 실행 실패: 종료 ${n(browserFinished.length)}건 중 ${n(browserFailed!.length)}건 (${percentage(browserFailed!.length, browserFinished.length)})`
        : "• 자동 브라우저: 종료된 실행 없음"
      : "• 자동 브라우저 실행 오류: 집계 실패",
    lateBrowsers
      ? `• 1시간 넘게 종료되지 않은 자동 브라우저: ${n(lateBrowsers.length)}건`
      : "• 자동 브라우저 장기 미종료: 집계 실패",
    failedReplies
      ? `• 사용자 이메일에 답장을 보내다 실패: ${n(failedReplies.length)}건`
      : "• 사용자 이메일 답장 오류: 집계 실패",
    lateReplies
      ? `• 사용자 이메일을 받은 지 30분 넘게 답장을 못 보냄: ${n(lateReplies.length)}건`
      : "• 사용자 이메일 답장 지연: 집계 실패",
    "",
    ...recommendationLines("external"),
    "",
    ...recommendationLines("internal"),
    "",
    report.tools.data
      ? `Tool ${n(report.tools.data.reduce((sum, t) => sum + t.callCount, 0))}회 호출 중 오류 ${n(toolFailureCount!)}회${report.tools.data.length ? " — 상위 20개는 스레드" : ""}`
      : "Tool 집계 실패",
    `_현재 상태 기준: ${kst(report.observedAt)} KST. 실행 결과는 집계 기간에 시작한 건 기준._`,
  ].join("\n");

  const toolLine = (t: DailyUserStatsToolRow) =>
    `• ${safe(t.name)} · ${n(t.callCount)}회 / ${n(t.userCount)}명${t.failedCallCount ? ` · 오류 ${n(t.failedCallCount)}회` : ""}`;
  const topTools = report.tools.data?.slice(0, 20) ?? [];
  const topToolNames = new Set(topTools.map((t) => t.name));
  const otherFailedTools = (failedTools ?? []).filter(
    (t) => !topToolNames.has(t.name)
  );
  const tools = topTools.length
    ? [
        "*Tool 호출 상위 20개*",
        ...topTools.map(toolLine),
        ...(otherFailedTools.length
          ? [
              "",
              "*상위 20개 밖에서 오류가 난 Tool*",
              ...otherFailedTools.map(toolLine),
            ]
          : []),
      ].join("\n")
    : "";
  const details = [
    ...errorSummary("이력서·프로필 오류", (profileErrorRows ?? []).map((r) => r.error)),
    ...errorSummary("외부 공고 검색 오류", (searchFailed ?? []).map((r) => r.error)),
    ...errorSummary("자동 브라우저 실패", (browserFailed ?? []).map((r) => r.error)),
    ...errorSummary("Career 실행 실패", (failedRuns ?? []).map((r) => r.error_message)),
    ...errorSummary("Career 이메일 발송 실패", (failedEmail ?? []).map((r) => r.error_message)),
    ...errorSummary("사용자 이메일 답장 실패", (failedReplies ?? []).map((r) => r.last_error)),
    ...(retryEmail?.length
      ? [`• Career 이메일 발송 재시도 중 ${n(retryEmail.length)}건`]
      : []),
    ...(unknownEmail?.length
      ? [`• Career 이메일 발송 결과 미확정 ${n(unknownEmail.length)}건`]
      : []),
    ...(unknownRuns?.length
      ? [`• Career 실행 결과 미확인 ${n(unknownRuns.length)}건`]
      : []),
    pendingLine(
      "자동 브라우저 1시간 이상 미종료",
      (lateBrowsers ?? []).map((r) => ({ due_at: r.created_at })),
      report
    ),
    pendingLine(
      "사용자 이메일 답장 30분 이상 지연",
      (lateReplies ?? []).map((r) => ({ due_at: r.created_at })),
      report
    ),
    pendingLine("실행 시각이 지난 Career 예약", report.schedules.data ?? [], report),
    pendingLine("아직 검토하지 않은 회사 소식·일정", report.sources.data ?? [], report),
    ...errorSummary("보고서 집계 실패", errors),
  ].filter(Boolean);
  return {
    main: summary,
    details: [
      ...splitDebugSlackText(tools),
      ...(details.length ? [["*확인할 오류·지연*", ...details].join("\n")] : []),
    ],
  };
}

// Slack truncates text beyond 40,000 characters; keep every detail by splitting.
export function splitDebugSlackText(text: string) {
  const messages: string[] = [];
  let rest = text;
  while (rest.length > 35_000) {
    const boundary = rest.lastIndexOf("\n", 35_000);
    const end = boundary > 0 ? boundary : 35_000;
    messages.push(rest.slice(0, end));
    rest = rest.slice(end + (boundary > 0 ? 1 : 0));
  }
  if (rest) messages.push(rest);
  return messages;
}
