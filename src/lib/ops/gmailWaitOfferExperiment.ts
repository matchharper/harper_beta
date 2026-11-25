import {
  assignGmailWaitOfferVariant,
  GMAIL_WAIT_OFFER_EXPERIMENT,
  type GmailWaitOfferVariant,
} from "@/lib/career/gmailWaitOfferExperiment";
import type { Json } from "@/types/database.types";
import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
} from "./abTests";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type GmailWaitOfferExposure = { user_id: string | null; created_at: string; meta_data: Json | null };
/** One person's dated event after the exposure window opened. */
export type GmailWaitOfferEvent = { userId: string; at: string };
export type GmailWaitOfferOutcomes = {
  /** Gmail connections the server confirmed against the live Google grant. */
  connections: GmailWaitOfferEvent[];
  /** Finished applications: a submission the browser confirmed, or a new email (not a reply) Harper sent to a company. */
  completions: GmailWaitOfferEvent[];
  /** The person's own moves: a chat, a form answer, an approved submission, a "직접 지원" click. */
  actions: GmailWaitOfferEvent[];
};

export const GMAIL_WAIT_OFFER_METRICS = {
  completed: "지금까지 지원 완료",
  silent: "지금까지 말없이 떠남",
  connected: "지금까지 Gmail 연결",
} as const;

function record(value: Json | null): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function timesByUser(events: GmailWaitOfferEvent[]) {
  const map = new Map<string, number[]>();
  for (const event of events) {
    const time = Date.parse(event.at);
    if (Number.isFinite(time)) map.set(event.userId, [...(map.get(event.userId) ?? []), time]);
  }
  return map;
}

/**
 * The /ops summary of the Gmail card test. `exposures` holds every exposure up to now: a person counts once, from their
 * first exposure ever, and only when that first exposure falls on or after `since`. Counting from a later exposure
 * would favor whoever did not connect the first time, since connecting ends the offer.
 *
 * Every measure counts from that first exposure up to `now`, with no fixed window: both sides are assigned at random
 * and fill at the same pace, so people who started a moment ago sit on both sides alike and the two sides compare
 * fairly, though the numbers themselves move day to day.
 */
export function buildGmailWaitOfferExperiment({ exposures, outcomes, excludedUserIds = new Set(), since, now }: {
  exposures: GmailWaitOfferExposure[];
  outcomes: GmailWaitOfferOutcomes;
  excludedUserIds?: ReadonlySet<string>;
  since: number;
  now: number;
}): OpsAbTestSummary {
  const first = new Map<string, { at: number; variant: GmailWaitOfferVariant }>();
  for (const row of exposures) {
    const userId = row.user_id?.trim();
    const at = Date.parse(row.created_at);
    const meta = record(row.meta_data);
    if (!userId || !Number.isFinite(at) || at > now || meta?.experiment !== GMAIL_WAIT_OFFER_EXPERIMENT) continue;
    const variant = assignGmailWaitOfferVariant(userId);
    if (meta.variant !== variant) continue;
    const seen = first.get(userId);
    if (!seen || at < seen.at) first.set(userId, { at, variant });
  }
  const connections = timesByUser(outcomes.connections);
  const completions = timesByUser(outcomes.completions);
  const actions = timesByUser(outcomes.actions);
  const people = [...first].flatMap(([userId, { at, variant }]) => {
    if (at < since || excludedUserIds.has(userId)) return [];
    const after = (times: Map<string, number[]>) => (times.get(userId) ?? []).some((time) => time >= at && time <= now);
    const connected = after(connections);
    return [{ variant, at, completed: after(completions), connected, silent: !connected && !after(actions) }];
  });

  const sides = { no_card: "A", card: "B" } as const;
  // How long each side has been watched on average, since a side that started later looks worse for now.
  const watched = (Object.keys(sides) as GmailWaitOfferVariant[]).flatMap((id) => {
    const group = people.filter((person) => person.variant === id);
    if (!group.length) return [];
    const days = group.reduce((sum, person) => sum + (now - person.at), 0) / group.length / DAY_MS;
    return [`${sides[id]} 평균 ${days.toFixed(1)}일`];
  });
  const shared = [
    "시작: 하퍼가 지원서 페이지를 처음 연 순간 (B는 카드가 뜬 순간, A도 같은 순간)",
    "대상: Gmail 보내기 권한이 없는 사람. 한 사람은 처음 시작한 때부터 한 번만 셈",
    ...(watched.length ? [`지켜본 기간: ${watched.join(", ")} (차이가 크면 숫자도 흔들려요)`] : []),
  ];
  const explain = (...lines: string[]) => [...lines, ...shared].join("\n");
  const base = "분모: 선택한 기간에 대신 지원을 처음 시작한 사람";

  const makeVariant = (id: GmailWaitOfferVariant, label: string, description: string): OpsAbTestVariant => {
    const group = people.filter((person) => person.variant === id);
    type Person = (typeof group)[number];
    const rate = (hit: (person: Person) => boolean, name: string, text: string) => {
      const numerator = group.filter(hit).length;
      return {
        format: "rate" as const,
        label: name,
        value: makeOpsAbTestRate(numerator, group.length).rate,
        detail: `${numerator.toLocaleString()} / ${group.length.toLocaleString()}명`,
        description: text,
      };
    };
    return {
      id,
      label,
      description,
      sampleCount: group.length,
      primary: makeOpsAbTestRate(group.filter((person) => person.completed).length, group.length),
      metrics: [],
      summaryMetrics: [
        rate((person) => person.completed, GMAIL_WAIT_OFFER_METRICS.completed, explain(base,
          "분자: 그중 지금까지 지원을 끝낸 사람 (회사 사이트 제출이 확인됐거나, 하퍼가 새 메일을 보냄. 답장은 제외)")),
        rate((person) => person.silent, GMAIL_WAIT_OFFER_METRICS.silent, explain("낮을수록 좋아요.", base,
          "분자: 그중 시작한 뒤로 채팅, 폼 답, 제출 승인, Gmail 연결, \"직접 지원\"이 하나도 없는 사람")),
        rate((person) => person.connected, GMAIL_WAIT_OFFER_METRICS.connected, explain(base,
          "분자: 그중 시작한 뒤로 Gmail 연결을 마친 사람 (서버가 Google 권한을 확인한 때)")),
      ],
    };
  };
  const variants: [OpsAbTestVariant, OpsAbTestVariant] = [
    makeVariant("no_card", "A · 카드 없음", "지금처럼 카드를 보여주지 않음"),
    makeVariant("card", "B · 카드", "하퍼가 지원서를 읽는 동안 작업 화면 아래에 Gmail 연결 카드"),
  ];
  const dates = people.map((person) => person.at).sort((a, b) => a - b);
  return {
    id: GMAIL_WAIT_OFFER_EXPERIMENT,
    title: "지원 준비 중 Gmail 카드",
    allocation: "사람별 고정 50:50",
    unitLabel: "명",
    primaryMetricLabel: GMAIL_WAIT_OFFER_METRICS.completed,
    status: !people.length ? "awaiting_data" : variants.every((variant) => variant.sampleCount > 0) ? "running" : "observing",
    firstObservedAt: dates.length ? new Date(dates[0]).toISOString() : null,
    lastObservedAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
    caveat:
      "하퍼가 지원서 페이지를 열기 시작했고, Google 메일을 쓰며, Gmail 보내기 권한이 없는 사람이 대상입니다. 조건이 맞은 순간 두 쪽 모두 기록하고, A는 카드를 보지 않습니다. 같은 사람은 처음 기록된 때부터 한 번만 세고, 처음 기록이 선택한 기간 안에 있는 사람만 셉니다. 모든 지표는 그 순간부터 지금까지를 셉니다. A와 B는 같은 때 무작위로 나뉘어 차이를 비교할 수 있지만, 숫자 자체는 매일 바뀝니다. 확인된 내부 이메일과 테스트 계정은 제외합니다.",
    variants,
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
  };
}
