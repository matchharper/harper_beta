import { OFFICIAL_JOBS_ONESCREEN_EXPERIMENT } from "@/lib/officialJobs/oneScreen";
import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
  type OpsAbTestMetric,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
} from "./abTests";

/** One browser from JOBS_ONESCREEN_AB_SQL: its arm, first view of an A/B posting, and what happened since (till now). */
export type JobsOneScreenBrowserRow = {
  anonymous_id: string;
  arm: string;
  first_at: string | Date;
  talk_click: boolean;
  card_account: boolean;
  card_name: boolean;
  card_material: boolean;
  card_consent: boolean;
  card_submit_click: boolean;
  similar_open: boolean;
  signed_up: boolean;
  had_account: boolean;
  submitted: boolean;
  intro_new: boolean;
  intro_any: boolean;
  similar_requested: boolean;
  /** Signed-in ids on its rows with no talent_users row yet (a one-screen sign-up that never submitted). */
  pending_user_ids?: string[] | null;
  emails: string[] | null;
};

/** auth.users facts for pending_user_ids: when each account was created, and its address. */
export type JobsOneScreenPendingAccount = { createdAt: string | Date; email: string | null };

type Browser = JobsOneScreenBrowserRow & { arm: "A" | "B"; at: number };

/** Shown where arm A has no such step ("없음", never 0; decided 11/25). */
const NOT_IN_ARM = "없음";
const SIMILAR_DESCRIPTION =
  "B에만 있어요(A는 없음). 가입 없이 비슷한 공고 메일을 신청한 브라우저예요. 테스트 신청은 세지 않고, 테스트로 신청한 브라우저는 빼요.";

const iso = (value: string | Date) => (value instanceof Date ? value.toISOString() : value);

/**
 * The /ops card of the job page's one-screen A/B on one company's LinkedIn postings. Every browser counts once, from
 * its first view of those postings in the selected period, and every step counts what happened from then until now
 * ("지금까지", like the Gmail card test): both arms are split at random over the same days, so newer visitors having
 * had less time weighs on both alike. Each step is a share of the browsers that saw a posting (100%).
 */
export function buildJobsOneScreenExperiment({
  rows,
  companyName,
  excludeEmail,
  pendingAccounts,
}: {
  rows: JobsOneScreenBrowserRow[];
  /** By user id; missing when auth.users could not be read, and then those few sign-ups are not counted. */
  pendingAccounts?: ReadonlyMap<string, JobsOneScreenPendingAccount>;
  /** The company's name, read from the database (the public code never names a customer). */
  companyName: string | null;
  excludeEmail: (email: string) => boolean;
}): OpsAbTestSummary {
  const company = companyName?.trim() || "회사";
  const browsers: Browser[] = rows.flatMap((row) => {
    const at = Date.parse(iso(row.first_at));
    if ((row.arm !== "A" && row.arm !== "B") || !Number.isFinite(at)) return [];
    // The one screen creates the talent row only on submit: an account made by its email code or Google that never
    // submitted is still a sign-up, timed by auth.users like the login page's sign-ups.
    const pending = (row.pending_user_ids ?? []).flatMap((id) => {
      const account = pendingAccounts?.get(id);
      const createdAt = account ? Date.parse(iso(account.createdAt)) : NaN;
      return Number.isFinite(createdAt) ? [{ isNew: createdAt >= at, email: account?.email ?? null }] : [];
    });
    const emails = [...(row.emails ?? []), ...pending.flatMap((account) => (account.email ? [account.email] : []))];
    if (emails.some((email) => excludeEmail(email))) return [];
    return [
      {
        ...row,
        arm: row.arm,
        at,
        emails,
        signed_up: row.signed_up || pending.some((account) => account.isNew),
        had_account: row.had_account || pending.some((account) => !account.isNew),
      },
    ];
  });

  const makeVariant = (arm: "A" | "B", label: string, description: string): OpsAbTestVariant => {
    const group = browsers.filter((browser) => browser.arm === arm);
    const total = group.length;
    const count = (hit: (browser: Browser) => boolean) => group.filter(hit).length;
    const share = (numerator: number, extra?: string): Pick<OpsAbTestMetric, "value" | "detail"> => ({
      value: makeOpsAbTestRate(numerator, total).rate,
      detail: `${numerator.toLocaleString()} / ${total.toLocaleString()}${extra ? ` · ${extra}` : ""}`,
    });
    const ofPrevious = (numerator: number, previous: number) =>
      previous > 0 ? `앞 단계의 ${Math.round((numerator / previous) * 100)}%` : undefined;
    const absent = (name: string, text: string): OpsAbTestMetric => ({
      format: "rate",
      label: name,
      value: null,
      displayValue: NOT_IN_ARM,
      description: text,
    });

    const isPressed = (b: Browser) => b.talk_click || (arm === "B" && b.card_account);
    const pressed = count(isPressed);
    const signedUp = count((b) => b.signed_up);
    // Not every sign-up pressed first (a later sign-up from the home page), so the share of presses uses both.
    const pressedThenSignedUp = count((b) => isPressed(b) && b.signed_up);
    const submitted = count((b) => b.submitted);
    const introduced = count((b) => b.intro_new);
    const members = group.filter((b) => b.had_account && !b.signed_up);
    const membersIntroduced = members.filter((b) => b.intro_any).length;

    // One description per row for both arms: the summary table shows the first arm's.
    const steps: OpsAbTestMetric[] = [
      {
        format: "rate",
        label: "1. 공고를 봄",
        ...share(total),
        description: `${company} 공고(LinkedIn에 올린 공고) 상세를 처음 연 브라우저예요. 어디서 들어왔는지는 가리지 않아요. 이 줄이 100%이고, 아래 줄은 모두 이 수로 나눠요. 봇, 내부·테스트 계정에 이어진 브라우저, LinkedIn 앱에서 Safari로 넘어간 두 번째 브라우저는 따로 세지 않아요.`,
      },
      {
        format: "rate",
        label: "2. 가입 버튼을 누름",
        ...share(pressed, ofPrevious(pressed, total)),
        description:
          "A: 공고나 목록의 Talk to Harper를 누른 브라우저. B: 공고나 목록의 Talk to Harper를 눌렀거나, 카드에서 Google·이메일 코드 버튼을 누른 브라우저. B의 PC 카드는 처음부터 열려 있어서 Google·이메일 코드 버튼이 첫 버튼이에요.",
      },
      {
        format: "rate",
        label: "3. 새로 가입함",
        ...share(
          signedUp,
          pressed > 0 ? `누른 곳 중 ${Math.round((pressedThenSignedUp / pressed) * 100)}%` : undefined
        ),
        description:
          "공고를 처음 본 뒤에 만든 계정이 이어진 브라우저예요. B에서 코드나 Google로 계정만 만들고 나간 사람도 세요. LinkedIn 앱에서 Safari로 넘어가 가입한 사람도 같은 사람으로 세요(/ops 공고 전환과 같은 규칙).",
      },
      {
        format: "rate",
        label: "4. 이력서나 LinkedIn을 냄",
        ...share(submitted, ofPrevious(submitted, signedUp)),
        description:
          "새로 가입한 사람 중 이력서나 LinkedIn을 낸 사람이에요. A는 Harper 가입 폼, B는 카드의 '가입하고 소개 보내기'(또는 Harper 가입 폼)예요.",
      },
      {
        format: "rate",
        label: `5. ${company}에 소개가 나감`,
        ...share(introduced, ofPrevious(introduced, submitted)),
        description: `새로 가입한 사람 중 ${company} 자리로 소개가 실제로 나간 사람이에요(채팅 소개와 같은 기록). 누르기만 하고 실패하거나 취소된 건 빼요.`,
      },
      arm === "A"
        ? absent("따로: 비슷한 공고 추천받기 신청", SIMILAR_DESCRIPTION)
        : {
            format: "rate",
            label: "따로: 비슷한 공고 추천받기 신청",
            ...share(count((b) => b.similar_requested)),
            description: SIMILAR_DESCRIPTION,
          },
      {
        format: "rate",
        label: "따로: 이미 회원",
        ...share(members.length, `그중 소개 ${membersIntroduced.toLocaleString()}`),
        description: `공고를 보기 전부터 계정이 있던 사람이에요. 위 흐름에는 넣지 않고, 그중 ${company}에 소개가 나간 사람 수를 같이 보여요.`,
      },
    ];

    const card = (name: string, hit: (b: Browser) => boolean, text: string): OpsAbTestMetric =>
      arm === "A"
        ? absent(name, "A안에는 카드가 없어요.")
        : { format: "rate", label: name, ...share(count(hit)), description: text };

    return {
      id: arm,
      label,
      description,
      sampleCount: total,
      primary: makeOpsAbTestRate(signedUp, total),
      summaryMetrics: steps,
      metrics: [
        card("카드: Google·이메일 코드 누름", (b) => b.card_account, "카드의 계정 칸에서 버튼을 누른 브라우저"),
        card("카드: 이름 넣음", (b) => b.card_name, "이름 칸을 채운 브라우저"),
        card("카드: 이력서나 LinkedIn 넣음", (b) => b.card_material, "자료 칸을 채운 브라우저"),
        card("카드: 동의 체크", (b) => b.card_consent, "동의를 체크한 브라우저"),
        card("카드: 가입하고 소개 보내기 누름", (b) => b.card_submit_click, "보내기 버튼을 누른 브라우저"),
        card("카드: 추천받기 박스 열기", (b) => b.similar_open, "추천받기 박스나 버튼을 연 브라우저"),
      ],
    };
  };

  const variants: [OpsAbTestVariant, OpsAbTestVariant] = [
    makeVariant("A", "A · 지금 화면", "공고 위 Talk to Harper가 로그인 화면으로 가요."),
    makeVariant("B", "B · 한 화면", "공고 안에서 가입하고 소개 보내기, 또는 비슷한 공고 추천받기."),
  ];
  const dates = browsers.map((browser) => browser.at).sort((a, b) => a - b);
  return {
    id: OFFICIAL_JOBS_ONESCREEN_EXPERIMENT,
    title: companyName?.trim() ? `${companyName.trim()} 링크드인 공고화면` : "링크드인 공고화면 A/B",
    allocation: "브라우저별 고정 50:50",
    unitLabel: "브라우저",
    primaryMetricLabel: "가입률 (3. 새로 가입함)",
    metricLayout: "table",
    status: !browsers.length
      ? "awaiting_data"
      : variants.every((variant) => variant.sampleCount > 0)
        ? "running"
        : "observing",
    firstObservedAt: dates.length ? new Date(dates[0]).toISOString() : null,
    lastObservedAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
    caveat: `${company} 공고를 처음 본 때부터 지금까지 일어난 일을 세요. 선택한 기간에 처음 본 브라우저만 셉니다. 각 비율은 공고를 본 브라우저 수로 나눈 값이에요. 가입(3단계)은 A와 B 모두 공고를 본 그 자리에서 일어나서 바로 비교할 수 있어요. 4·5단계는 B는 카드에서 한 번에 끝나고 A는 가입 뒤 폼과 채팅에서 나중에 일어나서, 최근에 온 사람이 많을수록 A가 낮게 보여요. 그래서 4·5단계는 실험을 2주 넘게 돌린 뒤에 비교하세요. 봇, 내부·테스트 계정, A와 B를 둘 다 본 브라우저는 빼요.`,
    variants,
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
  };
}
