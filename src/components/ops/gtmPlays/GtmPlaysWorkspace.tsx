import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { gtmCall } from "./api";
import DemandTab from "./DemandTab";
import FunnelTab from "./FunnelTab";
import OutreachTab from "./OutreachTab";
import PoolTab from "./PoolTab";
import { Badge } from "./ui";

type Behind = { button: string; does: string; cost: string };

/** Each play: what it is for, the order Chris works through it, and what runs behind each button. */
const TABS = [
  {
    id: "1",
    label: "#1 대신 지원 → 회사",
    unfinished: true,
    purpose: "하퍼가 후보 대신 보낸 지원서를 회사별로 세요.",
    steps: ["회사별 보낸 지원서 수", "회사 고르기 → 보낸 지원서 목록", "후보 프로필"],
    note: "아직 미완성이에요. 지금은 보낸 지원서 수만 세요. 회사가 지원서를 열어봤는지는 세지 않아요. 지원서에 하퍼 링크를 넣는 방법(문구·후보 동의)을 정한 뒤에 붙여요.",
    behind: [
      { button: "화면 열기 · 기간", does: "회사별로 보낸 지원서 수를 세요. 회사 사이트로 = 하퍼 브라우저가 후보 승인을 받아 실제로 낸 지원서(후보·공고 1쌍에 1건, 실행 보고의 제출 확인이나 후보 기회 '지원함'으로 판단, 멈춘 시도는 빼요), 회사 메일로 = 후보 Gmail로 회사 도메인 주소에 첨부 파일과 함께 보낸 메일(메일 1통은 회사 1곳에만). 하퍼 직원·테스트 계정은 빼요.", cost: "운영 DB 읽기만" },
      { button: "회사 누르기", does: "그 회사에 보낸 지원서 목록(지원서 1건 = 1줄, 후보·방법·Role 또는 메일 제목·시각·시도 횟수)을 읽어요. 100건이 넘으면 최근 100건만 보여요.", cost: "읽기만" },
      { button: "후보 누르기", does: "후보 프로필(경력·학력)을 읽어요.", cost: "읽기만" },
    ],
  },
  {
    id: "2",
    label: "#2 공고 → 내부 후보",
    unfinished: false,
    purpose: "공고 하나에 맞는 하퍼 회원을 골라 익명 카드로 그 회사 채용 담당자에게 보내요.",
    steps: ["JD 입력", "가까운 회원 50명", "카드에 넣을 후보 고르기", "익명 카드", "담당자 메일", "가입하면 그 공고 Role에 후보가 들어가요"],
    note: "메일 버튼으로 가입한 회사는 이 JD로 만든 Role을 바로 받고, 메일 속 후보가 몇 분 뒤 '연결을 요청할 후보'에 올라와요.",
    behind: [
      { button: "JD 읽기", does: "URL이면 공고 페이지를 읽어 JD로 정리하고(Career 공고 가져오기와 같은 코드), 붙여넣기면 그대로, 고객 Role이면 DB에서 읽어요.", cost: "URL만 웹 읽기 1회" },
      { button: "후보 찾기", does: "JD를 임베딩해 매칭 공개·내부 추천을 허용한 회원 중 가까운 50명을 찾아요(Role 시작과 같은 후보 풀). 그 회사의 모든 이름(하퍼 계정 이름·공개 이름, 같은 홈페이지 도메인의 회사)으로 차단한 회원과, 지금 그 회사에 다니는 회원은 빠져요. 점수는 1위를 1.00으로 둔 상대 점수예요.", cost: "임베딩 1회 · 읽기만" },
      { button: "카드 만들기", does: "고른 후보마다 익명 카드를 써요. 경력 연수는 코드가 계산하고, 이름·회사·학교·링크·이메일이 들어간 카드는 코드가 걸러 한 번 다시 써요. 그래도 안 되면 그 후보 번호를 알려 줘요. 만드는 동안에는 선택을 바꿀 수 없어요. 카드마다 '고치기'로 직접 고칠 수 있고, 고친 카드도 같은 검사를 거쳐 걸리면 보내기가 막혀요.", cost: "LLM 1회 (걸러진 카드만 1회 더)" },
      { button: "초안 만들기", does: "메일 제목과 첫 문단을 써요. 카드·버튼('Harper에서 후보 보기' → 회사 가입)·서명은 하퍼 메일 형식으로 코드가 붙여요.", cost: "LLM 1회" },
      { button: "(회사가) 메일 버튼 → 가입", does: "/org?gtm=<메일 id>로 가입·로그인하면: 이 JD로 Role을 만들고(이름·설명·공고 링크·위치, 찾는 사람·기준은 #4 '기준 만들기'와 같은 방식) /org와 같은 함수로 켜요 → 메일 속 회원을 그 Role 기준으로 평가(회사의 '이 사람들 평가'와 같은 검색) → 평가가 끝나면 2단계를 통과한 사람을 '연결을 요청할 후보'에 올려요. 같은 메일·같은 회사는 Role 1개. 비공개로 바꾼 회원은 빠져요. 무료 한도에 걸리면 Role은 초안으로 두고 카드로 알려요.", cost: "회사 쪽에서 LLM: 기준 1회 + 평가 + 후보마다 카드 1회" },
      { button: "하퍼가 찾기", does: "웹 검색으로 회사 채용 메일 주소를 찾아요. 페이지에 적힌 주소만 써요.", cost: "웹 검색 1회 (약 1센트)" },
      { button: "보내기", does: "수신 거부·반송 주소와 30일 안 같은 주소·같은 공고 메일을 막고(@matchharper.com 주소는 30일 규칙 없이 테스트 가능), 보내는 사람(기본 Chris, @matchharper.com 주소)으로 보내요. 답장은 그 주소로 가요. 발송 기록을 남기고, 나중에 반송·스팸 신고가 오면 기록에 표시하고 그 주소는 막아요.", cost: "쓰기 켜짐일 때만" },
    ],
  },
  {
    id: "3",
    label: "#3 관심 쌓인 고객사",
    unfinished: false,
    purpose: "하퍼 고객사의 /org Role마다 회사를 기다리는 후보가 몇 명인지 보고, 쌓인 회사에 '지금 N명이 기다리고 있어요' 메일을 보내 /org로 다시 들어오게 해요.",
    steps: ["기다리는 후보 많은 고객사·Role", "Role 눌러 후보 확인", "받는 사람 고르기", "메일 (/org Role로 가는 버튼)"],
    note: "숫자는 /org와 같은 이름·같은 계산이에요: 연결을 기다리는 후보 / 연결을 요청할 후보 / 외부 후보 / 저장.",
    behind: [
      { button: "화면 열기", does: "하퍼 고객사(하퍼 회사 계정이 있는 회사)마다 /org Role의 숫자를 /org와 같은 함수(readOrgDecisionCounts, 회사 owner 기준)로 읽고, 외부 후보는 /org 외부 후보 탭과 같은 조건으로 세요. 기다리는 후보가 많은 순이에요. 기간은 '펼쳐보기'의 채용 사이트 공고 활동에만 써요.", cost: "운영 DB 읽기만 · 회사 수만큼 /org 숫자 읽기" },
      { button: "Role 누르기", does: "그 Role의 숫자와 그 뒤 사람(연결을 기다리는·연결을 요청할 후보 이름, 외부 후보 목록), /org 링크, 그 Role 메일을 열어요.", cost: "읽기만" },
      { button: "회사 누르기", does: "회사 전체 합계와 Role 목록, 회사 전체 메일을 열어요.", cost: "읽기만" },
      { button: "초안 만들기", does: "숫자 문장은 코드가 /org 숫자로 쓰고, LLM은 앞뒤 인사 문장과 제목만 써요(숫자를 쓰면 정해진 문장으로 바꿔요). 후보가 누구인지는 넣지 않아요. 버튼은 /org의 그 Role로 가요.", cost: "LLM 1회" },
      { button: "하퍼가 찾기", does: "웹 검색으로 회사 채용 메일 주소를 찾아요. 보통은 하퍼 계정 멤버에게 보내요.", cost: "웹 검색 1회 (약 1센트)" },
      { button: "보내기", does: "보내는 사람·참조는 폼에서 정해요. 수신 거부·반송 주소와 30일 안 같은 주소·같은 Role 메일을 막고(@matchharper.com 주소는 30일 규칙 없음) 보낸 뒤 기록을 남겨요. 반송·스팸 신고가 오면 기록에 표시하고 그 주소는 막아요.", cost: "쓰기 켜짐일 때만" },
    ],
  },
  {
    id: "4",
    label: "#4 Role 아웃리치",
    unfinished: false,
    purpose: "회사 Role을 들고 후보를 골라 메일을 보내 후보를 데려와요(#2와 반대 방향). 우리를 쓰려 하거나 곧 결제할 회사의 Role이 대상이에요.",
    steps: ["하퍼 고객사 Role 또는 외부 공고·JD", "검색 기준·추가 요청", "후보 고르기: Choice 1 하퍼 회원 · 2 외부 후보 · 3 스크래핑 DB", "후보 메일", "하퍼 공고 페이지 → 가입하면 공고가 인박스에"],
    note: "제품 접근이 없는 회사(예: Wonderful, Sierra)는 소싱만 하고, 답장으로 온 이력서는 크리스가 받아서 전달해요.",
    behind: [
      { button: "JD 읽기", does: "#2와 같아요. 같은 공고로 저장한 Role이 있으면 '열기'를 보여 줘요.", cost: "URL만 웹 읽기 1회" },
      { button: "기준 만들기", does: "JD로 요청과 기준 초안을 써요. 추가 요청은 직접 적어요.", cost: "LLM 1회" },
      { button: "Choice 1 · 우리 DB 검색", does: "JD·요청·추가 요청·기준으로 하퍼 회원 중 가까운 50명을 찾아요(#2와 같은 계산). 저장 전에도 돼요. 메일 주소는 그 회원의 하퍼 계정 주소예요.", cost: "임베딩 1회 · 읽기만" },
      { button: "외부 검색", does: "외부 검색은 Role 단위로만 돌아서, 'Harper GTM' 워크스페이스(하퍼 채용 계정과 별도)에 Role 1개로 저장해요(후보·회사에는 안 보여요). 검색 기준은 Brief 이력에 'GTM 플레이'로 남아요. 같은 공고면 새로 만들지 않고 전에 저장한 Role을 열어요. '하퍼가 만든 Role'로 표시해서 무료 Role 한도를 쓰지 않아요.", cost: "쓰기" },
      { button: "Choice 2 · 외부 검색", does: "운영 외부 검색 요청을 만들고, worker가 요청·기준으로 웹·LinkedIn에서 하퍼 밖 후보를 찾아요. 하퍼 계정의 하루 외부 검색 한도(20회) 안에서 돌아요. 찾은 사람은 모두(애매한 사람 포함) 점수 높은 순으로 보여요.", cost: "1회 약 $1~4, 3~6분" },
      { button: "이메일 찾기", does: "Choice 2 후보 1명의 이메일을 찾아요. 찾은 사람만 후보 메일을 받을 수 있어요.", cost: "1명 약 $0.12" },
      { button: "Choice 3 (열면 자동)", does: "Role 내용으로 LinkedIn 한 줄 소개에 쓸 만한 키워드 6개를 만들고, 스크래핑 프로필 DB(candid) 중 메일 주소가 있는 약 2.2만 명에서 한 줄 소개·요약에 키워드가 들어간 사람을 많이 맞은 순으로 찾아요. 키워드를 고쳐 '다시 찾기'를 누를 수 있어요.", cost: "LLM 1회 + DB 읽기 1회 (2~3초)" },
      { button: "초안 만들기", does: "Role 내용으로 후보 메일 제목·본문을 써요. 인사말(이름)과 버튼·서명은 코드가 붙여요. 버튼 아래 문구(설명·서명)는 고칠 수 있고, 수신 거부 줄은 항상 코드가 붙여요.", cost: "LLM 1회" },
      { button: "n명에게 보내기", does: "한 사람에 한 통씩, 보내는 사람 주소로 보내요(답장도 그 주소로, 참조 포함). 수신 거부·반송 주소와 30일 안 같은 Role 메일을 받은 주소는 막고(@matchharper.com 주소는 30일 규칙 없음), 보낸 기록을 남겨요. 반송·스팸 신고가 오면 기록에 표시하고 그 주소는 막아요. 'Harper에서 공고 보기'는 로그인 없이 보는 하퍼 공고 페이지를 열고(하퍼 고객사 공고는 그 /jobs 페이지), 거기서 가입·온보딩을 마치면 공고가 그 사람 인박스(새 기회)에 들어가고 바로 열려요.", cost: "쓰기 켜짐일 때만" },
      { button: "고객 Role로 보내기", does: "체크한 Choice 2 후보를 고객 Role의 외부 후보 탭에 넣어요. 그 Role에 이미 있는 사람은 빼고, 고객의 하루 검색 한도는 쓰지 않아요.", cost: "쓰기" },
      { button: "끝내기 · 다시 열기", does: "Role은 저절로 닫히지 않아요. 누를 때만 끝냄/진행 중으로 바꿔요(/org와 같은 변경 경로, 이력 남음). 끝낸 Role은 검색하지 않고 active Role 수에서 빠져요.", cost: "쓰기" },
    ],
  },
] as const satisfies ReadonlyArray<{
  id: string; label: string; unfinished: boolean; purpose: string; steps: readonly string[]; note: string | null;
  behind: readonly Behind[];
}>;

/** What each button runs behind the screen: reads only, LLM calls, paid runs, or writes. */
function BehindTable({ rows }: { rows: readonly Behind[] }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[12px] text-neutral-muted">버튼을 누르면 뒤에서 하는 일</summary>
      <table className="mt-2 w-full text-[12px] leading-5">
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
    </details>
  );
}

type TabId = (typeof TABS)[number]["id"];

export default function GtmPlaysWorkspace() {
  const router = useRouter();
  const queryTab = typeof router.query.tab === "string" ? router.query.tab : "";
  const tab: TabId = (TABS.find((item) => item.id === queryTab)?.id ?? "4");
  const active = TABS.find((item) => item.id === tab) ?? TABS[3];
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
      <div className="mb-3 flex flex-wrap gap-1" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => select(item.id)}
            className={cx("h-9 rounded-md px-4 text-sm", tab === item.id ? "bg-surface-inverse text-neutral-00" : "bg-bg-default/70 hover:bg-bg-weak")}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className={cx(opsTheme.panelMuted, "mb-5 px-4 py-3")}>
        <p className="text-sm font-medium text-neutral-primary">
          {active.unfinished ? <Badge tone="critical">미완성</Badge> : null}{active.unfinished ? " " : null}{active.purpose}
        </p>
        <p className="mt-1 text-[12px] text-neutral-muted">{active.steps.join(" → ")}</p>
        {active.note ? <p className="mt-1 text-[12px] text-neutral-muted">{active.note}</p> : null}
        <BehindTable rows={active.behind} />
      </div>
      {!canFetch || writes === null ? null : <>
      {tab === "1" ? <FunnelTab /> : null}
      {tab === "2" ? <PoolTab writes={Boolean(writes)} /> : null}
      {tab === "3" ? <DemandTab writes={Boolean(writes)} /> : null}
      {tab === "4" ? <OutreachTab writes={Boolean(writes)} /> : null}
      </>}
    </div>
  );
}
