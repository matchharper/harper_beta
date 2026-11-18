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
    steps: ["후보가 지원서 승인 때 'Harper 후보 요약 링크 넣기' 체크", "하퍼가 지원 메일 끝에 링크를 붙여 보냄", "회사가 후보 요약 열기(가입 없이)", "질문·일정 잡기·후보 더 검토하기 → 가입", "그 공고로 채용 포지션이 생기고 후보가 '연결을 요청할 후보'에"],
    note: "링크 1개 = 후보 1명 · 회사 1곳 · 공고 1개(90일). 보여 주는 내용은 링크를 만들 때 고정돼요. 지금은 메일 지원만 링크가 들어가요(회사 사이트 지원서는 아직).",
    behind: [
      { button: "화면 열기 · 기간", does: "회사별 보낸 지원서 수를 세요: 회사 사이트로 = 하퍼 브라우저가 후보 승인을 받아 실제로 낸 지원서(후보·공고 1쌍에 1건, 실행 보고의 제출 확인이나 후보 기회 '지원함'으로 판단, 멈춘 시도는 빼요), 회사 메일로 = 후보 Gmail로 회사 도메인 주소에 보낸 지원 메일(첨부 파일이 있거나 후보 요약 링크를 넣은 것, 메일 1통은 회사 1곳에만). 그중 지원서에 들어간 후보 요약 링크 수와, 회사가 그 링크를 연·버튼을 누른·가입해서 받은 링크 수도 세요(링크 1개 = 후보 1명 · 공고 1개, 가입률 = 가입 ÷ 링크 넣음). 지원서와 링크는 같은 기간으로 세고, 기간 시작이 첫 링크가 생긴 날보다 앞이면 그날부터 세요. 링크 넣음이 많은 회사부터 보여요. 하퍼 직원·테스트 계정은 빼요.", cost: "읽기만" },
      { button: "(후보가) 지원서 승인", does: "공고에 지원하는 메일을 회사 주소로 보낼 때 후보의 지원서 확인 화면에 'Harper 후보 요약 링크 넣기'가 같이 나와요. 체크하면 그 후보·회사·공고로 링크를 찾거나 만들어(새로 만들 때 '회사가 지금 필요한 것 → 후보의 이 경험 → 그래서 맞음' 틀로 한 문장과 맞는 이유를 써서 고정, 희망 연봉은 빼요) 메일 끝에 붙여요. 후보가 차단한 회사, 개인 메일 주소로는 안 붙여요.", cost: "새 링크면 AI 1회" },
      { button: "(회사가) 후보 요약 열기", does: "후보 요약 페이지에서 가입 없이 후보 요약을 봐요(검색 엔진에는 안 나와요). 1초 넘게 열려 있으면 '열어봄'으로 세요. 기간이 지났거나 후보가 탈퇴하면 '볼 수 없는 링크'예요.", cost: "읽기만" },
      { button: "(회사가) 버튼 → 가입", does: "질문·일정 잡기·후보 더 검토하기 중 하나를 누르면 가입 창이 떠요. 구글로 가입·로그인하면 회사 화면으로 가서: 그 공고로 채용 포지션을 만들고(회사가 직접 만들 때와 같은 방식으로 찾는 사람·기준까지 써서 켜요) 그 후보를 '연결을 요청할 후보'에 바로 올려요(평가 없이, '후보가 관심 표현'). 누른 질문은 채팅 입력창에 채워져 있어요. 같은 회사가 이미 같은 공고로 포지션을 만들었으면 거기에 붙여요. 다른 회사 계정이 먼저 받은 링크는 안 돼요. 연결 요청을 누르면 소개 메일 없이, 후보에게 다시 묻지 않고 바로 연결돼요.", cost: "회사 쪽에서 AI 1회" },
      { button: "회사 누르기 · 후보 누르기", does: "그 회사에 보낸 지원서 목록(최근 100건)과 후보 프로필(경력·학력)을 읽어요.", cost: "읽기만" },
    ],
  },
  {
    id: "5",
    label: "후보자 소싱 에이전트",
    subtitle: "에이전트가 이직하려는 사람을 찾아 연락",
    unfinished: false,
    purpose: "에이전트가 매일 이직하려는 사람을 찾아(링크드인 지원자 파일, 여러 SNS·커뮤니티·블로그의 구직 글과 프로필, 그 밖의 웹) 맞는 회사 2~3곳을 골라 이메일로 연락하고, 하퍼 가입과 회사 연결까지 데려와요. 누구에게 언제 어떤 메일을 왜 보냈는지와 메일을 받은 사람의 반응을 사람마다 모두 기록해요.",
    steps: ["사람 찾기(지원자 파일 · 기본으로 찾는 곳의 최근 구직 글·프로필 · 그 밖의 웹)", "제외 확인(하퍼 회원, 30일 안 연락, 수신 거부 등)", "개인 이메일이 없으면 공개된 이메일 찾기(못 찾으면 제외)", "맞는 회사 2~3곳 고르기(없으면 제외)", "메일 자동 발송(평일 낮에 나눠서)", "클릭 → 가입 → 회사 연결"],
    note: "연락은 이메일로만, 개인 메일 주소로만 해요(회사 메일 주소로는 안 보내요).",
    behind: [
      { button: "켜기 / 끄기", does: "켜면 몇 분마다 에이전트가 이어서 일해요: 하루에 한 번 체크한 곳마다 사람을 찾고(검색 예산 중 정한 비율은 그 밖의 웹), 찾은 사람마다 제외 확인 → (개인 이메일이 없으면 이메일 찾기, 몇 분) → 공고 고르기 → 메일 쓰기 → 보내기를 해요. 하루 메일 수·비용 상한·보내는 시간을 넘지 않아요. 끄면 바로 멈춰요(이미 나간 메일은 그대로).", cost: "검색 한 곳당 약 $0.05~1 · 이메일 찾기 1명 약 $0.12 · 공고 고르기·메일 쓰기 1명 약 $0.01~0.02" },
      { button: "링크드인 지원자 파일", does: "Recruiter → 공고 → Apply starters → Export all to XLSX로 받은 파일을 올려요. 이미 들어온 사람은 건너뛰고 새 사람만 에이전트가 처리해요.", cost: "저장" },
      { button: "설정", does: "맨 위에서 펼쳐요. 보내는 사람, 하루 메일 수·비용 상한, 보내는 요일·시간, 후속 메일 날짜, 끝난 뒤 쉬는 기간, 검색 예산 나누기, 기본으로 찾는 곳(직접 추가 가능), 막을 도메인을 저장해요. 저장할 때마다 설정 버전이 올라가고, 찾은 사람마다 어느 버전으로 찾았는지 남아요.", cost: "저장" },
      { button: "수치", does: "고른 기간에 찾은 사람을 찾은 곳마다 세요(맨 위는 합계): 찾음 → 제외 → 연락 → 클릭 → 가입(가입률 = 가입 ÷ 연락) → 관심·지원 → 회사 연결, 답장, 비용. 최근 며칠 비용과 오늘 비용(한도와 함께)도 보여요.", cost: "읽기만" },
      { button: "로그", does: "사람: 찾은 모든 사람 한 줄씩(찾은 곳·단계·찾은 글·제외 이유, 연락한 사람은 메일 제목·제안한 공고·본문과 메일 반응). 수치의 숫자를 누르면 그 숫자의 사람만 보여요. 검색: 검색 한 번·지원자 파일 한 번에 한 줄씩(어디서 무엇을 찾았고 몇 명이 나왔고 얼마 썼는지). 줄을 누르면 오른쪽에 전체 기록이 열려요.", cost: "읽기만" },
      { button: "답장 옴", does: "보낸 사람 기록에서 받은 답장을 붙여 넣으면 후속 메일은 보내지 않아요. '연락 그만'이면 수신 거부 목록에 넣어요.", cost: "저장" },
    ],
  },
] as const satisfies ReadonlyArray<{
  id: string; label: string; subtitle: string; unfinished: boolean; purpose: string; steps: readonly string[]; note: string | null;
  behind: readonly Behind[];
}>;

/** What each button runs behind the screen: reads only, AI calls, paid runs, or saves. */
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
        {writes === false ? <Badge tone="critical" title="이 서버에서는 보기만 돼요. 저장·발송·검색은 운영 서버에서만 돼요.">쓰기 꺼짐</Badge> : null}
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
