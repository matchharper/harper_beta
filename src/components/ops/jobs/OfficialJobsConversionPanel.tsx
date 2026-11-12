import { Info } from "lucide-react";
import { useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { useOpsOfficialJobsConversion } from "@/hooks/ops/useOpsOfficialJobs";
import {
  DEFAULT_JOBS_CONVERSION_DAYS,
  JOBS_CONVERSION_DAYS,
  JOBS_LOGIN_STEPS_STARTED_AT,
  signupRate,
  type JobsAudience,
  type JobsConversionDays,
  type JobsConversionSteps,
  type JobsLoginPath,
} from "@/lib/ops/officialJobsConversion";

const AUDIENCE_LABEL: Record<JobsAudience, string> = {
  linkedin_ios: "LinkedIn 앱 · iOS",
  linkedin_android: "LinkedIn 앱 · Android",
  mobile_other: "그 외 모바일",
  desktop: "데스크톱",
};

const STEPS_SINCE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).format(new Date(JOBS_LOGIN_STEPS_STARTED_AT));

const HINTS = {
  panel: (days: number) =>
    `한국시간으로 오늘을 포함한 ${days}일이에요. 내부 계정, 내부 계정으로 로그인한 적 있는 브라우저, 검색엔진 같은 봇은 빼고 셉니다. 숫자는 모두 브라우저 기준이라 같은 사람도 기기나 브라우저가 다르면 따로 셀 수 있어요.`,
  visitors: "공고 목록이나 공고 페이지를 연 브라우저 수예요.",
  clickers: "공고나 목록에서 Talk to Harper를 누른 브라우저 수예요.",
  newSignups:
    "이 기간에 처음 누른 뒤 Career 계정이 새로 생긴 수예요. Safari·Chrome으로 옮겨서 가입해도 로그인 링크로 이어서 셉니다. 이어 줄 기록이 없는 가입은 세지 않아요. 비율은 기존 회원을 뺀 누른 사람 대비예요.",
  existingMembers:
    "누르기 전부터 계정이 있던 수예요. 이미 로그인한 상태였거나, 누른 뒤 기존 계정으로 로그인한 경우예요.",
  loginPage: `${STEPS_SINCE}부터 기록해요. LinkedIn 앱 안에서는 구글 로그인이 막혀서, 로그인 화면이 Safari·Chrome으로 옮기는 버튼 2개(브라우저에서 열기, 로그인 링크 복사)와 앱 안 이메일 입력을 보여 줘요. 여기서 각 길을 고른 사람이 실제로 Safari·Chrome에 도착했는지, 새로 가입했는지 셉니다.`,
  loginEligible:
    "LinkedIn 앱에서 Talk to Harper를 누른 사람 중 로그인 화면 기록이 있는 수예요. 아래 '사람' 비율의 분모예요.",
  people:
    "그 길을 고른 사람 수예요. 비율은 로그인 화면 본 사람 대비예요. 두 길을 다 쓴 사람은 양쪽에 셉니다.",
  arrived:
    "그 길을 고른 사람 중 Safari·Chrome에서 로그인 화면이 실제로 열린 수예요. 비율은 그 길을 고른 사람 대비예요. 그 브라우저에 이미 로그인돼 있었다면 기록되지 않아요.",
  signedUp:
    "그 길을 고른 사람 중 Career 계정이 새로 생긴 수예요. 비율은 그 길을 고른 사람 대비이고, 위 표의 '새로 가입'과 같은 기준이에요.",
  openedBrowser:
    "앱 안에서 '브라우저에서 열기'를 누른 사람이에요. iPhone은 Safari, Android는 Chrome으로 넘기려고 해요.",
  copiedLink:
    "앱 안에서 '로그인 링크 복사'를 누른 사람이에요. Safari·Chrome 주소창에 붙여 넣어야 도착해요.",
  arrivedOtherwise:
    "두 버튼을 누르지 않고 Safari·Chrome에서 로그인 화면이 열린 사람이에요. LinkedIn 메뉴의 '브라우저로 열기' 같은 경우예요.",
  typedEmail:
    "앱을 떠나지 않고 이메일·비밀번호를 넣어 가입이나 로그인을 누른 사람이에요. 새 가입은 인증 메일의 링크를 눌러야 끝나요.",
  noAction: "로그인 화면만 보고 위의 어느 것도 하지 않은 사람이에요.",
} as const;

/** The per-job "총 회원가입" uses the same linking as the panel's 새로 가입. */
export const JOB_SIGNUPS_HINT =
  "전체 기간 동안 이 공고를 보거나 Talk to Harper를 누른 뒤 Career 계정이 새로 생긴 사람이에요. Safari·Chrome으로 옮겨서 가입해도 로그인 링크로 이어서 셉니다. 다른 공고도 봤다면 그 공고에도 같이 셉니다.";

export function ConversionHint({ label, text }: { label: string; text: string }) {
  return (
    <Tooltips side="top" text={text}>
      <MuteButton
        aria-label={`${label} 기준`}
        className="-my-1"
        size="sm"
        variant="transparent"
      >
        <Info className="h-3 w-3" aria-hidden />
      </MuteButton>
    </Tooltips>
  );
}

function percent(value: number | null) {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

function share(part: number, whole: number) {
  return percent(whole > 0 ? part / whole : null);
}

function Stat({
  label,
  hint,
  value,
  ratio,
  loading,
}: {
  label: string;
  hint: string;
  value: number | undefined;
  ratio?: string | null;
  loading: boolean;
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-3 py-2")}>
      <div className="flex items-center gap-1 text-xs text-neutral-soft">
        {label}
        <ConversionHint label={label} text={hint} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        {loading ? (
          <span className="inline-block h-5 w-12 animate-pulse rounded bg-bg-weak" />
        ) : (
          <span className="text-base font-semibold tabular-nums text-neutral-primary">
            {typeof value === "number" ? value.toLocaleString("ko-KR") : "-"}
          </span>
        )}
        {!loading && ratio ? (
          <span className="text-xs tabular-nums text-neutral-muted">
            {ratio}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Count({ value, of }: { value: number | null; of: number }) {
  if (value === null) return <span className="text-neutral-soft">–</span>;
  const ratio = share(value, of);
  return (
    <span className="tabular-nums">
      {value.toLocaleString("ko-KR")}
      {ratio ? <span className="ml-1.5 text-xs text-neutral-muted">{ratio}</span> : null}
    </span>
  );
}

/** The ways on from the LinkedIn in-app login page: three that leave the app, one that stays, and none. */
const LOGIN_PATHS: Array<{
  key: string;
  way: string | null;
  label: string;
  hint: string;
  pick: (steps: JobsConversionSteps) => JobsLoginPath;
}> = [
  { key: "opened", way: "앱 밖으로", label: "브라우저 열기", hint: HINTS.openedBrowser, pick: (steps) => steps.openedBrowser },
  { key: "copied", way: "앱 밖으로", label: "링크 복사", hint: HINTS.copiedLink, pick: (steps) => steps.copiedLink },
  { key: "otherwise", way: "앱 밖으로", label: "버튼 없이", hint: HINTS.arrivedOtherwise, pick: (steps) => steps.arrivedOtherwise },
  { key: "email", way: "앱 안에서", label: "이메일 직접 입력", hint: HINTS.typedEmail, pick: (steps) => steps.typedEmail },
  { key: "none", way: null, label: "아무것도 안 함", hint: HINTS.noAction, pick: (steps) => steps.noAction },
];

/** Numbers are right-aligned, so the ⓘ goes before the label and the label ends where the numbers end. */
function HeaderCell({ label, hint, alignRight = true }: { label: string; hint: string; alignRight?: boolean }) {
  return (
    <th className={cx("py-1.5 font-normal", alignRight && "text-right")}>
      <span className={cx("inline-flex items-center gap-1 whitespace-nowrap", alignRight && "justify-end")}>
        {alignRight ? <ConversionHint label={label} text={hint} /> : null}
        {label}
        {alignRight ? null : <ConversionHint label={label} text={hint} />}
      </span>
    </th>
  );
}

function LinkedInLoginPaths({ audience, steps }: { audience: JobsAudience; steps: JobsConversionSteps }) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-3 py-2.5")}>
      <div className="flex items-center gap-1 text-xs">
        <span className="font-medium text-neutral-primary">{AUDIENCE_LABEL[audience]}</span>
        <span className="text-neutral-muted">· 로그인 화면 본 사람 {steps.eligible.toLocaleString("ko-KR")}명</span>
        <ConversionHint label="로그인 화면 본 사람" text={HINTS.loginEligible} />
      </div>
      <table className="mt-1.5 w-full text-sm">
        <thead className="text-left text-xs text-neutral-soft">
          <tr>
            <th className="py-1.5 font-normal">로그인 화면에서 고른 길</th>
            <HeaderCell label="사람" hint={HINTS.people} />
            <HeaderCell label="그중 Safari·Chrome 도착" hint={HINTS.arrived} />
            <HeaderCell label="그중 새로 가입" hint={HINTS.signedUp} />
          </tr>
        </thead>
        <tbody className={cx("divide-y", opsTheme.divider)}>
          {LOGIN_PATHS.map((path) => {
            const row = path.pick(steps);
            return (
              <tr key={path.key}>
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-1">
                    {path.way ? <span className="text-neutral-muted">{path.way} ·</span> : null}
                    <span className="text-neutral-primary">{path.label}</span>
                    <ConversionHint label={path.label} text={path.hint} />
                  </span>
                </td>
                <td className="py-1.5 text-right"><Count value={row.people} of={steps.eligible} /></td>
                <td className="py-1.5 text-right"><Count value={row.arrived} of={row.people} /></td>
                <td className="py-1.5 text-right"><Count value={row.signedUp} of={row.people} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** /jobs visitors → Talk to Harper → new accounts, split by where people pressed the button. */
export default function OfficialJobsConversionPanel({
  enabled,
}: {
  enabled: boolean;
}) {
  const [days, setDays] = useState<JobsConversionDays>(
    DEFAULT_JOBS_CONVERSION_DAYS
  );
  const query = useOpsOfficialJobsConversion(days, enabled);
  const conversion = query.data?.conversion;
  const loading = query.isLoading;
  const loginAudiences = (conversion?.audiences ?? []).flatMap((row) =>
    row.steps && row.steps.eligible > 0
      ? [{ audience: row.audience, steps: row.steps }]
      : []
  );

  const headers = [
    { label: "누른 사람", hint: HINTS.clickers },
    { label: "새로 가입", hint: HINTS.newSignups },
    { label: "기존 회원", hint: HINTS.existingMembers },
  ];

  return (
    <section className={cx(opsTheme.panel, "mb-5 p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-sm font-semibold text-neutral-primary">
            공고에서 가입까지
          </h2>
          <ConversionHint label="공고에서 가입까지" text={HINTS.panel(days)} />
        </div>
        <div className="flex gap-1" role="group" aria-label="기간">
          {JOBS_CONVERSION_DAYS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={cx(
                "h-8 rounded-md px-3 text-sm transition",
                days === option
                  ? "bg-surface-inverse text-neutral-00"
                  : "bg-bg-weak text-neutral-primary hover:bg-bg-weak/70"
              )}
            >
              최근 {option}일
            </button>
          ))}
        </div>
      </div>

      {query.error ? (
        <div className="mt-3 text-xs text-critical">
          가입 전환 숫자를 불러오지 못했습니다.
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Stat
          label="방문자"
          hint={HINTS.visitors}
          value={conversion?.visitors}
          loading={loading}
        />
        <Stat
          label="Talk to Harper 누름"
          hint={`${HINTS.clickers} 비율은 방문자 대비예요.`}
          value={conversion?.clickers}
          ratio={
            conversion
              ? share(conversion.clickers, conversion.visitors)
              : null
          }
          loading={loading}
        />
        <Stat
          label="새로 가입"
          hint={HINTS.newSignups}
          value={conversion?.newSignups}
          ratio={conversion ? percent(signupRate(conversion)) : null}
          loading={loading}
        />
        <Stat
          label="기존 회원"
          hint={`${HINTS.existingMembers} 비율은 누른 사람 대비예요.`}
          value={conversion?.existingMembers}
          ratio={
            conversion
              ? share(conversion.existingMembers, conversion.clickers)
              : null
          }
          loading={loading}
        />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-xs text-neutral-soft">
            <tr>
              <th className="py-2 font-normal">접속 환경</th>
              {headers.map((header) => (
                <th key={header.label} className="py-2 text-right font-normal">
                  <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
                    <ConversionHint label={header.label} text={header.hint} />
                    {header.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={cx("divide-y", opsTheme.divider)}>
            {(conversion?.audiences ?? []).map((row) => (
              <tr key={row.audience}>
                <td className="py-2 text-neutral-primary">
                  {AUDIENCE_LABEL[row.audience]}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.clickers.toLocaleString("ko-KR")}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.newSignups.toLocaleString("ko-KR")}
                  {percent(signupRate(row)) ? (
                    <span className="ml-1.5 text-xs text-neutral-muted">
                      {percent(signupRate(row))}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.existingMembers.toLocaleString("ko-KR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {conversion ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-1">
            <h3 className="text-xs font-semibold text-neutral-primary">
              LinkedIn 앱 로그인 화면
            </h3>
            <ConversionHint label="LinkedIn 앱 로그인 화면" text={HINTS.loginPage} />
          </div>
          {loginAudiences.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {loginAudiences.map((row) => (
                <div key={row.audience} className="overflow-x-auto">
                  <LinkedInLoginPaths audience={row.audience} steps={row.steps} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-neutral-muted">이 기간 기록 없음</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
