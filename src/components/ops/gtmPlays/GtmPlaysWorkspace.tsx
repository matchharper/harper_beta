import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import AgentTab from "./AgentTab";
import { gtmCall } from "./api";
import FunnelTab from "./FunnelTab";
import OutreachTab from "./OutreachTab";
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
      { button: "화면 열기 · 기간", does: "회사별 보낸 지원서 수를 세요: 회사 사이트로 = 하퍼 브라우저가 후보 승인을 받아 실제로 낸 지원서(후보·공고 1쌍에 1건, 실행 보고의 제출 확인이나 후보 기회 '지원함'으로 판단, 멈춘 시도는 빼요), 회사 메일로 = 후보 Gmail로 회사 도메인 주소에 보낸 지원 메일(첨부 파일이 있거나 후보 요약 링크를 넣은 것, 메일 1통은 회사 1곳에만). 그중 지원서에 들어간 후보 요약 링크 수와, 회사가 그 링크를 연·버튼을 누른·가입해서 받은 링크 수도 세요(링크 1개 = 후보 1명 · 공고 1개). 하퍼 직원·테스트 계정은 빼요.", cost: "운영 DB 읽기만" },
      { button: "(후보가) 지원서 승인", does: "공고에 지원하는 메일을 회사 주소로 보낼 때 Career 검토 폼에 'Harper 후보 요약 링크 넣기'가 같이 나와요. 체크하면 그 후보·회사·공고로 링크를 찾거나 만들어(새로 만들 때 프로필·경력·찾는 일로 소개 문장과 '맞는 이유'를 써서 고정, 희망 연봉은 빼요) 메일 끝에 붙여요. 후보가 차단한 회사, 개인 메일 주소로는 안 붙여요.", cost: "새 링크면 LLM 1회" },
      { button: "(회사가) 후보 요약 열기", does: "/c/<링크>에서 가입 없이 후보 요약을 봐요(검색 엔진에는 안 나와요). 1초 넘게 열려 있으면 '열어봄'으로 세요. 기간이 지났거나 후보가 탈퇴하면 '볼 수 없는 링크'예요.", cost: "읽기만" },
      { button: "(회사가) 버튼 → 가입", does: "질문·일정 잡기·후보 더 검토하기 중 하나를 누르면 가입 창이 떠요. 구글로 가입·로그인하면 /org?share=<링크>로 가서: 공고로 Role을 만들고(회사 아웃바운드와 같은 방식, 찾는 사람·기준까지 써서 켜요) 그 후보를 '연결을 요청할 후보'에 바로 올려요(평가 없이, '후보가 관심 표현'). 누른 질문은 Role 채팅 입력창에 채워져 있어요. 같은 회사가 이미 같은 공고로 Role을 만들었으면 거기에 붙여요. 다른 회사 계정이 먼저 받은 링크는 안 돼요. 연결 요청을 누르면 Intro를 쓰지 않고, 후보에게 다시 묻지 않고 바로 연결돼요.", cost: "회사 쪽에서 LLM: 기준 1회" },
      { button: "회사 누르기 · 후보 누르기", does: "그 회사에 보낸 지원서 목록(최근 100건)과 후보 프로필(경력·학력)을 읽어요.", cost: "읽기만" },
    ],
  },
  {
    id: "4",
    label: "후보자 아웃바운드",
    subtitle: "Role에 맞는 후보에게 메일",
    unfinished: false,
    purpose: "회사 Role을 들고 후보를 골라 메일을 보내 후보를 데려와요(회사 아웃바운드와 반대 방향). 우리를 쓰려 하거나 곧 결제할 회사의 Role이 대상이에요.",
    steps: ["하퍼 고객사 Role 또는 외부 공고·JD", "검색 기준·추가 요청", "후보 고르기: Choice 1 하퍼 회원 · 2 외부 후보 · 3 스크래핑 DB", "후보 메일", "하퍼 공고 페이지 → 가입하면 공고가 인박스에"],
    note: "제품 접근이 없는 회사(예: Wonderful, Sierra)는 소싱만 하고, 답장으로 온 이력서는 크리스가 받아서 전달해요.",
    behind: [
      { button: "JD 읽기", does: "회사 아웃바운드와 같아요. 같은 공고로 저장한 Role이 있으면 '열기'를 보여 줘요.", cost: "URL만 웹 읽기 1회" },
      { button: "기준 만들기", does: "JD를 읽으면 바로 요청과 기준 초안을 써요('다시 만들기'로 다시 써요). 추가 요청은 직접 적어요.", cost: "LLM 1회" },
      { button: "Choice 1 · 하퍼 회원", does: "기준이 생기면 바로 한 번 JD·요청·추가 요청·기준으로 하퍼 회원 중 가까운 50명을 찾아요(회사 아웃바운드와 같은 계산, '다시 검색'은 지금 기준으로). 저장 전에도 돼요. 메일 주소는 그 회원의 하퍼 계정 주소예요.", cost: "임베딩 1회 · 읽기만" },
      { button: "저장하고 외부 검색으로", does: "외부 검색은 Role 단위로만 돌아서, 'Harper GTM' 워크스페이스(하퍼 채용 계정과 별도)에 Role 1개로 저장해요(후보·회사에는 안 보여요). 검색 기준은 Brief 이력에 'GTM 플레이'로 남아요. 같은 공고면 새로 만들지 않고 전에 저장한 Role을 열어요. '하퍼가 만든 Role'로 표시해서 무료 Role 한도를 쓰지 않아요.", cost: "쓰기" },
      { button: "Choice 2 · 외부 검색", does: "운영 외부 검색 요청을 만들고, worker가 요청·기준으로 웹·LinkedIn에서 하퍼 밖 후보를 찾아요. 하퍼 계정의 하루 외부 검색 한도(20회) 안에서 돌아요. 찾은 사람은 모두(애매한 사람 포함) 점수 높은 순으로 보여요.", cost: "1회 약 $1~4, 3~6분" },
      { button: "이메일 찾기", does: "Choice 2 후보 1명의 이메일을 찾아요. 찾은 사람만 후보 메일을 받을 수 있어요.", cost: "1명 약 $0.12" },
      { button: "Choice 3 (열면 자동)", does: "Role 내용으로 LinkedIn 한 줄 소개에 쓸 만한 키워드 6개를 만들고, 스크래핑 프로필 DB(candid) 중 메일 주소가 있는 약 2.2만 명에서 한 줄 소개·요약에 키워드가 들어간 사람을 많이 맞은 순으로 찾아요. 키워드를 고쳐 '다시 찾기'를 누를 수 있어요.", cost: "LLM 1회 + DB 읽기 1회 (2~3초)" },
      { button: "초안 만들기", does: "Role 내용으로 후보 메일 제목·본문을 써요. 인사말(이름)과 버튼·서명은 코드가 붙여요. 버튼 아래 문구(설명·서명)는 고칠 수 있고, 수신 거부 줄은 항상 코드가 붙여요.", cost: "LLM 1회" },
      { button: "Role별 메일 결과", does: "기간 안에 나간 후보 메일을 Role마다 세요: 보냄·반송·수신 거부 → 클릭(하퍼 공고 페이지가 1초 넘게 열림, 하퍼 직원 제외)·가입 → 관심·지원·회사 연결. Role 줄을 누르면 검색 기준과, 후보를 찾은 곳(하퍼 회원·외부 검색·스크래핑 DB)마다의 결과, 보낸 메일 목록이 열려요. '열기'는 그 Role을 아래에서 열어요. @matchharper.com 테스트 메일은 빼요.", cost: "운영 DB 읽기만" },
      { button: "n명에게 보내기", does: "한 사람에 한 통씩, 보내는 사람 주소로 보내요(답장도 그 주소로, 참조 포함). 개인 메일(gmail·naver 등)로만 보내고 회사 메일 주소는 빼요(@matchharper.com은 테스트로 허용). 보내는 사람마다 하루(한국 시간) GTM 메일 50통까지예요(회사 메일 포함, @matchharper.com은 안 셈). 외부 공고 URL·JD 붙여넣기로 시작한 공고는 첫 메일을 보낼 때 'Harper GTM' 워크스페이스에 Role로 저장해요('저장하고 외부 검색으로'와 같은 저장, 검색은 안 돌아요). 같은 공고면 그 Role을 다시 써요. 수신 거부·반송 주소와 30일 안 같은 Role 메일을 받은 주소는 막고(@matchharper.com 주소는 30일 규칙 없음), 보낸 기록을 남겨요. 반송·스팸 신고가 오면 기록에 표시하고 그 주소는 막아요. 'Harper에서 공고 보기'는 로그인 없이 보는 하퍼 공고 페이지를 열고(하퍼 고객사 공고는 그 /jobs 페이지), 거기서 가입·온보딩을 마치면 공고가 그 사람 인박스(새 기회)에 들어가고 바로 열려요.", cost: "쓰기 켜짐일 때만" },
      { button: "(후보가) 메일 버튼 → 가입·로그인", does: "공고 URL을 읽을 수 있으면 그 공고를 외부 공고처럼 '내 기회'에 넣어요. URL이 없거나(JD 붙여넣기) 읽지 못하면 메일의 Role을 넣어요: 고객사 Role은 그대로, Harper GTM Role은 메일을 받은 사람에게만 열려요(다른 회원에게는 추천·검색·연락이 가지 않아요). JD 붙여넣기 등 GTM Role로 가는 후보에게는 실제 회사 이름 대신 'Harper 고객사(회사 설명)'으로 보여요(메일·공고 페이지). '내 기회'·연결 뒤 화면의 회사 칸은 'Harper 고객사', Role 제목은 '회사 설명 · 직함'이에요. 회사 설명은 2단계에서 정하고, 같은 회사는 처음 정한 설명을 계속 써요. 실제 회사 이름은 Ops에서만 보여요. 후보가 관심을 누르면 Harper GTM의 그 Role '연결을 기다리는 후보'에 뜨고 위 표 '관심·지원'에 잡혀요. /org에서 '연결'을 누르면 후보는 'Harper'와 이어져요. 실제 회사에는 Ops가 직접 연락해요.", cost: "쓰기" },
      { button: "고객 Role로 보내기", does: "체크한 Choice 2 후보를 고객 Role의 외부 후보 탭에 넣어요. 그 Role에 이미 있는 사람은 빼고, 고객의 하루 검색 한도는 쓰지 않아요.", cost: "쓰기" },
      { button: "끝내기 · 다시 열기", does: "Role은 저절로 닫히지 않아요. 누를 때만 끝냄/진행 중으로 바꿔요(/org와 같은 변경 경로, 이력 남음). 끝낸 Role은 검색하지 않고 active Role 수에서 빠져요.", cost: "쓰기" },
    ],
  },
  {
    id: "5",
    label: "후보자 소싱 에이전트",
    subtitle: "에이전트가 이직 신호 보고 연락",
    unfinished: true,
    purpose: "에이전트가 뒤에서 매일 이직하려는 사람을 찾아(링크드인 지원자, #OpenToWork 글, Threads 이직 글) 맞는 회사 2~3곳을 골라 연락하고, 하퍼 가입과 회사 연결까지 데려와요. 누구에게 언제 무엇을 어느 채널로 보냈는지와 그 뒤 일을 사람마다 모두 기록해요.",
    steps: ["사람 찾기(지원자 올리기 · 최근 14일 이직 글)", "중복·제외(하퍼 회원, 30일 안 연락, 수신 거부 등)", "맞는 회사 2~3곳 고르기(없으면 기록만)", "메일은 자동으로, 메일이 없으면 사람이 보낼 목록에", "클릭 → 가입 → 공고가 '내 기회'에 → 회사 연결"],
    note: "메일 주소가 없으면 링크드인·X·Threads 메시지를 에이전트가 써 두고 사람이 직접 보내요(자동으로 보내면 계정이 막혀요). 맞는 회사가 2곳이 안 되면 연락하지 않아요.",
    behind: [
      { button: "지금 실행", does: "오늘 실행을 하나 만들어요. 몇 분마다 도는 실행기가 이어받아, 찾은 사람마다 제외 확인 → 공고 고르기 → 메시지 쓰기 → 보내기(또는 사람이 보낼 목록에 올리기)를 해요. 하루 메일 수·비용 상한·보내는 시간을 넘지 않아요. '테스트 실행'은 숫자에서 빠져요.", cost: "쓰기 켜짐일 때만 · 사람마다 공고 고르기·글쓰기 LLM" },
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
  const tab: TabId = (TABS.find((item) => item.id === queryTab)?.id ?? "4");
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
        <div className="mb-3 grid gap-2 sm:grid-cols-3" role="tablist">
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
      {tab === "4" ? <OutreachTab writes={Boolean(writes)} /> : null}
      {tab === "5" ? <AgentTab writes={Boolean(writes)} /> : null}
      </>}
    </div>
  );
}
