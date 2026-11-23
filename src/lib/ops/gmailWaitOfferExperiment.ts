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

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export type GmailWaitOfferExposure = { user_id: string | null; created_at: string; meta_data: Json | null };
/** One person's dated event after the exposure window opened. */
export type GmailWaitOfferEvent = { userId: string; at: string };
export type GmailWaitOfferForm = GmailWaitOfferEvent & { formId: string };
export type GmailWaitOfferAnswer = GmailWaitOfferEvent & { formIds: string[] };
export type GmailWaitOfferOutcomes = {
  /** Gmail connections the server confirmed against the live Google grant. */
  connections: GmailWaitOfferEvent[];
  /** Applications the browser reported as submitted. */
  submissions: GmailWaitOfferEvent[];
  /** Applications that stopped at a screen waiting for an emailed code. */
  emailCodeStops: GmailWaitOfferEvent[];
  /** Application review forms Harper showed. */
  reviewForms: GmailWaitOfferForm[];
  /** Form answers, with the forms each one answers. */
  formAnswers: GmailWaitOfferAnswer[];
};

function record(value: Json | null): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function byUser<T extends GmailWaitOfferEvent>(events: T[]) {
  const map = new Map<string, (T & { time: number })[]>();
  for (const event of events) {
    const time = Date.parse(event.at);
    if (Number.isFinite(time)) map.set(event.userId, [...(map.get(event.userId) ?? []), { ...event, time }]);
  }
  return map;
}

/**
 * The /ops summary of the Gmail card test. `exposures` holds every exposure up to now: a person counts once, from their
 * first exposure ever, and only when that first exposure falls on or after `since`. Counting from a later exposure
 * would favor whoever did not connect the first time, since connecting ends the offer.
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
  const connections = byUser(outcomes.connections);
  const submissions = byUser(outcomes.submissions);
  const codeStops = byUser(outcomes.emailCodeStops);
  const reviewForms = byUser(outcomes.reviewForms);
  const answers = byUser(outcomes.formAnswers);
  const inWindow = (time: number, start: number, ms: number) => time >= start && time <= start + ms;
  const people = [...first].flatMap(([userId, { at, variant }]) => {
    if (at < since || excludedUserIds.has(userId)) return [];
    const submitTimes = (submissions.get(userId) ?? []).map((event) => event.time);
    // A code stop counts only when nothing was submitted after it within the week: Harper often reads the code
    // and finishes the same application in a later run.
    const stuckAtCode = (codeStops.get(userId) ?? []).some((stop) => inWindow(stop.time, at, WEEK_MS)
      && !submitTimes.some((time) => time >= stop.time && time <= at + WEEK_MS));
    const forms = (reviewForms.get(userId) ?? []).filter((form) => inWindow(form.time, at, DAY_MS));
    const answered = forms.some((form) => (answers.get(userId) ?? []).some((answer) =>
      answer.formIds.includes(form.formId) && inWindow(answer.time, form.time, DAY_MS)));
    return [{
      variant,
      at,
      dayDone: at + DAY_MS <= now,
      // The form can arrive up to a day after the exposure and be answered up to a day after that.
      formDone: at + 2 * DAY_MS <= now,
      weekDone: at + WEEK_MS <= now,
      connected: (connections.get(userId) ?? []).some((event) => inWindow(event.time, at, DAY_MS)),
      submitted: submitTimes.some((time) => inWindow(time, at, WEEK_MS)),
      stuckAtCode,
      gotForm: forms.length > 0,
      answered,
    }];
  });

  const makeVariant = (id: GmailWaitOfferVariant, label: string, description: string): OpsAbTestVariant => {
    const group = people.filter((person) => person.variant === id);
    type Person = (typeof group)[number];
    // Each measure counts only people whose own window has fully passed.
    const rate = (done: (person: Person) => boolean, hit: (person: Person) => boolean, name: string, text: string) => {
      const base = group.filter(done);
      const numerator = base.filter(hit).length;
      return {
        format: "rate" as const,
        label: name,
        value: makeOpsAbTestRate(numerator, base.length).rate,
        detail: `${numerator.toLocaleString()} / ${base.length.toLocaleString()}명`,
        description: text,
      };
    };
    const dayDone = group.filter((person) => person.dayDone);
    return {
      id,
      label,
      description,
      sampleCount: group.length,
      primary: makeOpsAbTestRate(dayDone.filter((person) => person.connected).length, dayDone.length),
      metrics: [],
      summaryMetrics: [
        rate((person) => person.dayDone, (person) => person.connected, "24시간 안 Gmail 연결",
          "카드 조건이 처음 맞은 때부터 24시간 안에 Gmail 연결을 마친 사람 ÷ 조건이 처음 맞은 지 24시간이 지난 사람."),
        rate((person) => person.weekDone, (person) => person.submitted, "7일 안 웹 제출 성공",
          "같은 시작점부터 7일 안에 하퍼가 회사 사이트 제출을 확인한 지원이 1건 이상인 사람 ÷ 7일이 지난 사람."),
        rate((person) => person.weekDone, (person) => person.stuckAtCode, "메일 인증 코드에서 끝내 못 냄",
          "7일 안에 메일 인증 코드 화면에서 멈췄고, 그 뒤 7일 창이 끝날 때까지 제출 확인이 한 건도 없는 사람 ÷ 7일이 지난 사람. 낮을수록 좋습니다."),
        rate((person) => person.formDone && person.gotForm, (person) => person.answered, "확인 폼에 답함",
          "24시간 안에 지원 확인 폼을 받은 사람 중, 그 폼에 24시간 안에 답한 사람 (48시간이 지난 사람만). 카드가 확인 폼을 방해하는지 봅니다."),
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
    primaryMetricLabel: "24시간 안 Gmail 연결",
    status: !people.length ? "awaiting_data" : variants.every((variant) => variant.sampleCount > 0) ? "running" : "observing",
    firstObservedAt: dates.length ? new Date(dates[0]).toISOString() : null,
    lastObservedAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
    caveat:
      "하퍼가 지원서를 읽기 시작했고, Google 메일을 쓰며, Gmail 보내기 권한이 없는 사람이 대상입니다. 조건이 맞은 순간 두 쪽 모두 기록하고, A는 카드를 보지 않습니다. 같은 사람은 처음 기록된 때부터 한 번만 세고, 처음 기록이 선택한 기간 안에 있는 사람만 셉니다. 각 지표는 그 지표의 기간이 다 지난 사람만 셉니다. Gmail 연결은 서버가 Google 권한을 확인한 기록으로 셉니다. 확인된 내부 이메일은 제외합니다.",
    variants,
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
  };
}
