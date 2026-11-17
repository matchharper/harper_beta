import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import AgentTab from "./AgentTab";
import { gtmCall } from "./api";
import FunnelTab from "./FunnelTab";
import { Badge } from "./ui";

type Behind = { button: string; does: string; cost: string };

/** Each play: what it is for, the order Chris works through it, and what runs behind each button. */
const TABS = [
  {
    id: "1",
    label: "후보자 링크",
    subtitle: "대신 지원서 → 회사가 열고 가입하는지",
    unfinished: false,
    purpose: "하퍼가 후보 대신 보낸 지원서에 후보 요약 링크를 넣고, 회사가 링크를 열어보고 → 버튼을 누르고 → 가입해서 그 후보를 받는지 회사별로 봐요.",
    steps: ["후보가 지원서 승인 때 'Harper 후보 요약 링크 넣기' 체크", "하퍼가 지원 메일 끝에 링크를 붙여 보냄", "회사가 후보 요약 열기(가입 없이)", "질문·일정 잡기·후보 더 검토하기 → 가입", "그 공고로 Role + 후보가 '연결을 요청할 후보'에"],
    note: "링크 1개 = 후보 1명 · 회사 1곳 · 공고 1개(90일). 보여 주는 내용은 링크를 만들 때 고정돼요. 지금은 메일 지원만 링크가 들어가요(회사 사이트 지원서는 아직).",
    behind: [
      { button: "화면 열기 · 기간", does: "회사별 보낸 지원서 수를 세요: 회사 사이트로 = 하퍼 브라우저가 후보 승인을 받아 실제로 낸 지원서(후보·공고 1쌍에 1건, 실행 보고의 제출 확인이나 후보 기회 '지원함'으로 판단, 멈춘 시도는 빼요), 회사 메일로 = 후보 Gmail로 회사 도메인 주소에 보낸 지원 메일(첨부 파일이 있거나 후보 요약 링크를 넣은 것, 메일 1통은 회사 1곳에만). 그중 지원서에 들어간 후보 요약 링크 수와, 회사가 그 링크를 연·버튼을 누른·가입해서 받은 링크 수도 세요(링크 1개 = 후보 1명 · 공고 1개, 가입률 = 가입 ÷ 링크 넣음). 지원서와 링크는 같은 기간으로 세고, 기간 시작이 첫 링크가 생긴 날보다 앞이면 그날부터 세요. 링크 넣음이 많은 회사부터 보여요. 하퍼 직원·테스트 계정은 빼요.", cost: "운영 DB 읽기만" },
      { button: "(후보가) 지원서 승인", does: "공고에 지원하는 메일을 회사 주소로 보낼 때 Career 검토 폼에 'Harper 후보 요약 링크 넣기'가 같이 나와요. 체크하면 그 후보·회사·공고로 링크를 찾거나 만들어(새로 만들 때 '회사가 지금 필요한 것 → 후보의 이 경험 → 그래서 맞음' 틀로 한 문장과 맞는 이유를 써서 고정, 희망 연봉은 빼요) 메일 끝에 붙여요. 후보가 차단한 회사, 개인 메일 주소로는 안 붙여요.", cost: "새 링크면 LLM 1회" },
      { button: "(회사가) 후보 요약 열기", does: "/c/<링크>에서 가입 없이 후보 요약을 봐요(검색 엔진에는 안 나와요). 1초 넘게 열려 있으면 '열어봄'으로 세요. 기간이 지났거나 후보가 탈퇴하면 '볼 수 없는 링크'예요.", cost: "읽기만" },
      { button: "(회사가) 버튼 → 가입", does: "질문·일정 잡기·후보 더 검토하기 중 하나를 누르면 가입 창이 떠요. 구글로 가입·로그인하면 /org?share=<링크>로 가서: 공고로 Role을 만들고(회사 아웃바운드와 같은 방식, 찾는 사람·기준까지 써서 켜요) 그 후보를 '연결을 요청할 후보'에 바로 올려요(평가 없이, '후보가 관심 표현'). 누른 질문은 Role 채팅 입력창에 채워져 있어요. 같은 회사가 이미 같은 공고로 Role을 만들었으면 거기에 붙여요. 다른 회사 계정이 먼저 받은 링크는 안 돼요. 연결 요청을 누르면 Intro를 쓰지 않고, 후보에게 다시 묻지 않고 바로 연결돼요.", cost: "회사 쪽에서 LLM: 기준 1회" },
      { button: "회사 누르기 · 후보 누르기", does: "그 회사에 보낸 지원서 목록(최근 100건)과 후보 프로필(경력·학력)을 읽어요.", cost: "읽기만" },
    ],
  },
  {
    id: "5",
    label: "후보자 소싱 에이전트",
    subtitle: "에이전트가 이직 신호 보고 연락",
    unfinished: false,
    purpose: "에이전트가 뒤에서 매일 이직하려는 사람을 찾아(링크드인 지원자, #OpenToWork 글, Threads 이직 글) 맞는 회사 2~3곳을 골라 연락하고, 하퍼 가입과 회사 연결까지 데려와요. 누구에게 언제 무엇을 어느 채널로 보냈는지와 그 뒤 일을 사람마다 모두 기록해요.",
    steps: ["사람 찾기(지원자 올리기 · 최근 14일 이직 글)", "중복·제외(하퍼 회원, 30일 안 연락, 수신 거부 등)", "맞는 회사 2~3곳 고르기(없으면 기록만)", "메일은 자동으로, 메일이 없으면 사람이 보낼 목록에", "클릭 → 가입 → 공고가 '내 기회'에 → 회사 연결"],
    note: "메일 주소가 없으면 링크드인·X·Threads 메시지를 에이전트가 써 두고 사람이 직접 보내요(자동으로 보내면 계정이 막혀요). 맞는 회사가 2곳이 안 되면 연락하지 않아요.",
    behind: [
      { button: "지금 실행", does: "오늘 실행을 하나 만들어요. 몇 분마다 도는 실행기가 이어받아, 찾은 사람마다 제외 확인 → 공고 고르기 → 메시지 쓰기 → 보내기(또는 사람이 보낼 목록에 올리기)를 해요. 하루 메일 수·비용 상한·보내는 시간을 넘지 않아요. '테스트 실행'은 숫자에서 빠져요.", cost: "쓰기 켜짐일 때만 · 사람마다 공고 고르기·글쓰기 LLM" },
      { button: "Role로 사람 찾기", does: "고른 Role 하나로(고객사 Role·공고 URL·JD로 새로 저장해도 돼요) 하퍼 회원·스크래핑 DB·외부 검색에서 사람을 찾고, 에이전트의 다른 사람처럼 제외 확인 → 메일 초안 → (승인) → 발송해요. 메일 버튼으로 가입·로그인하면 그 공고가 그 사람 '내 기회'에 들어가요. Harper GTM Role은 실제 회사 이름 대신 'Harper 고객사(회사 설명)'으로 보여요.", cost: "쓰기 켜짐일 때만 · 새 Role 기준 LLM 1회 · 외부 검색 1회 약 $1~4 · 이메일 찾기 1명 약 $0.12" },
      { button: "긴급 중지", does: "에이전트를 끄고, 기다리거나 도는 실행을 모두 멈춰요. 이미 나간 메일은 그대로예요. 쓰기가 꺼진 서버에서도 돼요.", cost: "쓰기" },
      { button: "숫자", does: "기간 안에 찾은 사람을 찾은 곳마다 세요: 찾음 → 제외·맞는 회사 없음 → 연락 → 클릭 → 가입 → 관심·지원 → 회사 연결, 답장, 비용. 오늘 비용·메일 수를 상한과 함께 보여요. 테스트는 '테스트 포함'을 켤 때만 세요.", cost: "운영 DB 읽기만" },
      { button: "보냈어요 · 건너뛰기", does: "사람이 링크드인 등에서 직접 보낸 뒤 눌러요. 보낸 계정과 시각이 타임라인에 남고, 반응이 없으면 정한 날 뒤 후속 메시지 초안이 다시 올라와요. 계정마다 하루 보낼 수만큼만 목록에 보여요.", cost: "쓰기" },
      { button: "답장 옴", does: "받은 답장을 붙여 넣어 남겨요(링크드인 답장은 하퍼가 볼 수 없어요). 답장이 오면 후속 메시지는 보내지 않아요. '연락 그만 요청'이면 그 주소를 하퍼 수신 거부 목록에 넣어요.", cost: "쓰기" },
      { button: "승인 · 승인 안 함", does: "설정에서 '보내기 전에 승인 받기'를 켰을 때만 보여요. 고쳐서 승인하면 고친 글로 나가요.", cost: "쓰기" },
      { button: "사람 (타임라인)", does: "찾은 사람 모두를 상태·찾은 곳·검색으로 보고, 줄을 누르면 찾은 근거, 제안한 공고와 이유, 보낸 메시지, 메일 클릭·가입, 모든 단계(시각·누가)를 보여요.", cost: "읽기만" },
      { button: "지원자 올리기", does: "Recruiter에서 받은 지원자 CSV(또는 표)를 붙여 넣으면 실행 1개로 올라가요. 열 이름으로 이름·이메일·프로필 등을 알아보고, 붙여 넣은 목록 안 중복은 빼요.", cost: "쓰기" },
      { button: "설정 저장", does: "켜기, 보내는 사람, 하루 메일 수, 하루 비용 상한, 보내는 시간, 승인, 후속 메시지 날짜, 끝난 뒤 쉬는 기간, 찾는 곳, 채널별 계정·하루 건수를 저장해요. 다음 실행부터 적용돼요.", cost: "쓰기" },
    ],
  },
] as const satisfies ReadonlyArray<{
  id: string; label: string; subtitle: string; unfinished: boolean; purpose: string; steps: readonly string[]; note: string | null;
  behind: readonly Behind[];
}>;

/** What each button runs behind the screen: reads only, LLM calls, paid runs, or writes. */
function BehindTable({ rows }: { rows: readonly Behind[] }) {
  return (
    <div className="mt-3">
      <p className="text-[12px] font-medium text-neutral-muted">버튼을 누르면 뒤에서 하는 일</p>
      <table className="mt-1 w-full text-[12px] leading-5">
        <tbody className={cx("divide-y", opsTheme.divider)}>
          {rows.map((row) => (
            <tr key={row.button} className="align-top">
              <td className="whitespace-nowrap py-1.5 pr-4 font-medium text-neutral-primary">{row.button}</td>
              <td className="py-1.5 pr-4 text-neutral-muted">{row.does}</td>
              <td className="whitespace-nowrap py-1.5 text-right text-neutral-muted">{row.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TabId = (typeof TABS)[number]["id"];

export default function GtmPlaysWorkspace() {
  const router = useRouter();
  const queryTab = typeof router.query.tab === "string" ? router.query.tab : "";
  // #5 is the default: no ?tab=, or an old play's id (#2 · #3 · #4 are gone), opens it.
  const tab: TabId = (TABS.find((item) => item.id === queryTab)?.id ?? "5");
  const active = TABS.find((item) => item.id === tab) ?? TABS[TABS.length - 1];
  const canFetch = useCanFetchInternal();
  const [writes, setWrites] = useState<boolean | null>(null);
  useEffect(() => {
    if (!canFetch) return;
    gtmCall<{ writes: boolean }>("config").then((config) => setWrites(config.writes)).catch(() => setWrites(false));
  }, [canFetch]);
  const select = (id: TabId) => {
    void router.replace({ pathname: router.pathname, query: { ...router.query, tab: id } }, undefined, { shallow: true });
  };
  return (
    <div className="px-1 py-2">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className={opsTheme.titleSm}>GTM 플레이</h1>
        {writes === false ? <Badge tone="critical" title="조회·미리보기만 돼요. 쓰기·발송·외부 검색은 GTM_PLAYS_WRITES=on 서버에서만">쓰기 꺼짐</Badge> : null}
      </div>
      <div className="mb-6 border-b border-neutral-1000-a10 pb-5">
        <div className="mb-3 grid gap-2 sm:grid-cols-2" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => select(item.id)}
              className={cx(
                "relative overflow-hidden rounded-lg border px-4 py-2.5 text-left shadow-sm transition-colors",
                tab === item.id
                  ? "border-transparent bg-surface-inverse text-neutral-00"
                  : "border-neutral-1000-a10 bg-bg-default hover:border-neutral-400 hover:bg-bg-weak",
              )}
            >
              {/* Not finished yet: a red line corner to corner, under the words. */}
              {item.unfinished ? (
                <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line x1="0" y1="100" x2="100" y2="0" className="stroke-critical" strokeWidth="1.5" strokeOpacity="0.75" vectorEffect="non-scaling-stroke" />
                </svg>
              ) : null}
              <span className="relative flex items-center gap-1.5 text-sm font-medium">
                {item.label}
                {item.unfinished ? (
                  <span className="rounded bg-critical-faded px-1.5 py-px text-[11px] font-medium text-critical">미완성</span>
                ) : null}
              </span>
              <span className={cx("relative block text-[12px]", tab === item.id ? "opacity-70" : "text-neutral-muted")}>{item.subtitle}</span>
            </button>
          ))}
        </div>
        <details className={cx(opsTheme.panelMuted, "group px-4 py-3")}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-neutral-primary">
              {active.unfinished ? <><Badge tone="critical">미완성!</Badge>{" "}</> : null}{active.purpose}
            </span>
            <span className="text-[12px] text-neutral-muted underline group-open:hidden">사용법 · 뒤에서 하는 일 보기</span>
            <span className="hidden text-[12px] text-neutral-muted underline group-open:inline">접기</span>
          </summary>
          <p className="mt-2 text-[12px] text-neutral-muted">{active.steps.join(" → ")}</p>
          {active.note ? <p className="mt-1 text-[12px] text-neutral-muted">{active.note}</p> : null}
          <BehindTable rows={active.behind} />
        </details>
      </div>
      {!canFetch || writes === null ? null : <>
      {tab === "1" ? <FunnelTab /> : null}
      {tab === "5" ? <AgentTab writes={Boolean(writes)} /> : null}
      </>}
    </div>
  );
}
