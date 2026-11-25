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
const DAY_MS = 24 * 60 * 60 * 1_000;

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
  now = Date.now(),
}: {
  rows: JobsOneScreenBrowserRow[];
  /** By user id; missing when auth.users could not be read, and then those few sign-ups are not counted. */
  pendingAccounts?: ReadonlyMap<string, JobsOneScreenPendingAccount>;
  /** The company's name, read from the database (the public code never names a customer). */
  companyName: string | null;
  excludeEmail: (email: string) => boolean;
  now?: number;
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

  // How each row is counted, written like the Gmail card test's: 분모 / 분자 first, then the lines every row shares.
  // The same text for both arms (the table shows the first arm's).
  const watched = (["A", "B"] as const).flatMap((arm) => {
    const group = browsers.filter((browser) => browser.arm === arm);
    if (!group.length) return [];
    const days = group.reduce((sum, browser) => sum + (now - browser.at), 0) / group.length / DAY_MS;
    return [`${arm} 평균 ${days.toFixed(1)}일`];
  });
  const shared = [
    `시작: 그 브라우저가 ${company} 공고 상세를 처음 연 순간. 그때부터 지금까지 일어난 일을 셈`,
    "대상: 선택한 기간에 공고를 처음 연 브라우저. 한 브라우저는 한 번만 셈",
    "뺀 것: 봇, 내부·테스트 계정, A와 B를 둘 다 본 브라우저",
    "합친 것: LinkedIn 앱에서 Safari로 넘어간 브라우저는 처음 브라우저와 같은 하나로 셈",
    ...(watched.length ? [`지켜본 기간: ${watched.join(", ")} (차이가 크면 숫자도 흔들려요)`] : []),
  ];
  const explain = (...lines: string[]) => [...lines, ...shared].join("\n");
  const base = "분모: 1번 브라우저 (공고를 본 브라우저)";
  const kept = (step: number) =>
    `분모: ${step}번까지 온 브라우저. 남음 + 빠짐 = 100% (B는 남음 + 추천받기 + 빠짐 = 100%)`;
  const similarLeft =
    "추천받기 (B만): 다음 단계로 안 넘어갔지만 \"비슷한 공고 추천받기\"를 신청한 브라우저. 빠짐에는 넣지 않음";
  const late = (what: string) =>
    `주의: A는 가입한 뒤 나중에 ${what}, 최근에 온 브라우저는 아직 빠짐으로 잡혀요. 2주 넘게 돌린 뒤 비교하세요.`;
  const similarDescription = explain(
    "B에만 있어요. A 화면에는 이 버튼이 없어요.",
    base,
    "분자: 그중 \"비슷한 공고 추천받기\"로 메일을 신청한 브라우저 (테스트 신청은 뺌)"
  );

  const makeVariant = (arm: "A" | "B", label: string, description: string): OpsAbTestVariant => {
    const all = browsers.filter((browser) => browser.arm === arm);
    // People who had an account before the posting are not part of the sign-up funnel: one row of their own.
    const isMember = (b: Browser) => b.had_account && !b.signed_up;
    const members = all.filter(isMember);
    const membersIntroduced = members.filter((b) => b.intro_any).length;
    const group = all.filter((b) => !isMember(b));
    const total = group.length;
    const count = (hit: (browser: Browser) => boolean) => group.filter(hit).length;
    const share = (numerator: number): Pick<OpsAbTestMetric, "value" | "detail"> => ({
      value: makeOpsAbTestRate(numerator, total).rate,
      detail: `${numerator.toLocaleString()} / ${total.toLocaleString()}`,
    });
    const absent = (name: string, text: string): OpsAbTestMetric => ({
      format: "rate",
      label: name,
      value: null,
      displayValue: NOT_IN_ARM,
      description: text,
    });

    // Each step sits inside the one before, so 남음 + 빠짐 is the step before (100%): a later step reached
    // without the earlier one recorded (a sign-up from another page, an intro before the form) counts for both.
    const introduced = (b: Browser) => b.intro_new;
    const submitted = (b: Browser) => b.submitted || introduced(b);
    const signedUp = (b: Browser) => b.signed_up || submitted(b);
    const pressed = (b: Browser) => b.talk_click || (arm === "B" && b.card_account) || signedUp(b);
    const stages = [(_: Browser) => true, pressed, signedUp, submitted, introduced];
    const reached = stages.map(count);
    // 남음 + (B only) 추천받기 + 빠짐 = the step before: in B, someone who stopped here but asked for similar postings
    // did not leave with nothing, so they get their own share instead of counting as 빠짐.
    const stay = (step: number): Pick<OpsAbTestMetric, "value" | "detail"> => {
      const before = reached[step - 2];
      const now = reached[step - 1];
      const similar =
        arm === "B" ? count((b) => stages[step - 2](b) && !stages[step - 1](b) && b.similar_requested) : 0;
      const left = before - now - similar;
      const part = (n: number) => (before > 0 ? ` (${((n / before) * 100).toFixed(1)}%)` : "");
      const parts = [
        `${now.toLocaleString()} 남음`,
        ...(arm === "B" ? [`${similar.toLocaleString()} 추천받기${part(similar)}`] : []),
        `${left.toLocaleString()} 빠짐${part(left)}`,
      ];
      return { value: makeOpsAbTestRate(now, before).rate, detail: parts.join(" · ") };
    };

    // One description per row for both arms: the summary table shows the first arm's.
    const steps: OpsAbTestMetric[] = [
      {
        format: "count",
        label: "1. 공고를 봄",
        value: total,
        detail: "시작 (100%)",
        description: explain(
          "모든 단계의 시작이에요. LinkedIn, 검색, 공유 링크 등 어디서 들어왔든 셈",
          "이미 회원으로 확인된 브라우저는 여기서 빼고 \"따로: 이미 회원\"에 셈"
        ),
      },
      {
        format: "rate",
        label: "2. 가입 버튼을 누름",
        ...stay(2),
        description: explain(
          kept(1),
          "남음: 가입 버튼을 누른 브라우저. A는 Talk to Harper, B는 Talk to Harper 또는 카드의 Google·이메일 코드 버튼 (버튼 없이 다른 화면에서 가입한 브라우저도 셈)",
          "빠짐: 누르지 않고 나간 브라우저",
          similarLeft
        ),
      },
      {
        format: "rate",
        label: "3. 새로 가입함",
        ...stay(3),
        description: explain(
          kept(2),
          "남음: Harper 계정을 새로 만든 브라우저 (B에서 코드나 Google로 계정만 만들고 나간 경우도 셈)",
          "빠짐: 눌렀지만 가입하지 않은 브라우저",
          similarLeft
        ),
      },
      {
        format: "rate",
        label: "4. 이력서나 LinkedIn을 냄",
        ...stay(4),
        description: explain(
          kept(3),
          "남음: 이력서나 LinkedIn까지 낸 브라우저. A는 Harper 가입 폼, B는 카드의 \"가입하고 소개 보내기\" 또는 가입 폼",
          "빠짐: 가입했지만 아직 안 낸 브라우저",
          similarLeft,
          late("내서")
        ),
      },
      {
        format: "rate",
        label: `5. ${company}에 소개가 나감`,
        ...stay(5),
        description: explain(
          kept(4),
          `남음: ${company} 자리로 소개가 실제로 나간 브라우저 (채팅 소개와 같은 기록. 실패·취소는 뺌)`,
          "빠짐: 자료를 냈지만 아직 소개가 안 나간 브라우저",
          similarLeft,
          late("소개가 나가서")
        ),
      },
      arm === "A"
        ? absent("따로: 비슷한 공고 추천받기 신청", similarDescription)
        : {
            format: "rate",
            label: "따로: 비슷한 공고 추천받기 신청",
            ...share(count((b) => b.similar_requested)),
            description: similarDescription,
          },
      {
        format: "count",
        label: "따로: 이미 회원",
        value: members.length,
        detail: `그중 소개 ${membersIntroduced.toLocaleString()}`,
        description: explain(
          "공고를 보기 전부터 Harper 계정이 있던 브라우저 수예요. 가입할 사람이 아니라서 1~5번에서는 뺌",
          `작은 글씨 "그중 소개": 이 브라우저 중 ${company}에 소개가 나간 수`
        ),
      },
    ];

    const card = (name: string, hit: (b: Browser) => boolean, text: string): OpsAbTestMetric =>
      arm === "A"
        ? absent(name, "A 화면에는 카드가 없어요.")
        : { format: "rate", label: name, ...share(count(hit)), description: explain(base, `분자: 그중 ${text}`) };

    return {
      id: arm,
      label,
      description,
      sampleCount: total,
      primary: makeOpsAbTestRate(reached[2], total),
      summaryMetrics: steps,
      metrics: [
        card("카드: Google·이메일 코드 누름", (b) => b.card_account, "카드의 계정 칸에서 Google·이메일 코드 버튼을 누른 브라우저"),
        card("카드: 이름 넣음", (b) => b.card_name, "카드의 이름 칸을 채운 브라우저"),
        card("카드: 이력서나 LinkedIn 넣음", (b) => b.card_material, "카드에 이력서나 LinkedIn을 넣은 브라우저"),
        card("카드: 동의 체크", (b) => b.card_consent, "카드의 동의를 체크한 브라우저"),
        card("카드: 가입하고 소개 보내기 누름", (b) => b.card_submit_click, "카드의 \"가입하고 소개 보내기\"를 누른 브라우저"),
        card("카드: 추천받기 박스 열기", (b) => b.similar_open, "\"비슷한 공고 추천받기\" 박스나 버튼을 연 브라우저"),
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
    primaryMetricLabel: "가입률 (1번 중 3번까지 온 비율)",
    metricLayout: "table",
    status: !browsers.length
      ? "awaiting_data"
      : variants.every((variant) => variant.sampleCount > 0)
        ? "running"
        : "observing",
    firstObservedAt: dates.length ? new Date(dates[0]).toISOString() : null,
    lastObservedAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
    caveat: `${company} 공고를 처음 본 때부터 지금까지 일어난 일을 세요. 선택한 기간에 처음 본 브라우저만 셉니다. 각 단계의 %는 앞 단계까지 온 브라우저 중 남은 비율이고, 빠짐과 더하면 100%예요. 가입(3단계)은 A와 B 모두 공고를 본 그 자리에서 일어나서 바로 비교할 수 있어요. 4·5단계는 B는 카드에서 한 번에 끝나고 A는 가입 뒤 폼과 채팅에서 나중에 일어나서, 최근에 온 사람이 많을수록 A의 빠짐이 크게 보여요. 그래서 4·5단계는 실험을 2주 넘게 돌린 뒤에 비교하세요. 봇, 내부·테스트 계정, A와 B를 둘 다 본 브라우저는 빼고, 이미 회원은 따로 셉니다.`,
    variants,
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
  };
}
