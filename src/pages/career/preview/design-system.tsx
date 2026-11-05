// career-i18n-skip-file: Local-only design handoff with synthetic data.
import type { GetServerSideProps } from "next";
import Head from "next/head";
import {
  useRef,
  useState,
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ArrowUp, Download, Plus } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RichText from "@/components/ui/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { CareerActionItemList } from "@/components/career/CareerActionItemsPanel";
import { CareerScheduleList } from "@/components/career/CareerAutomationSettingsSection";
import { AppointmentList } from "@/components/career/UpcomingAppointments";
import { CareerWorkActivityStatus } from "@/components/career/chat/CareerWorkActivity";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { CareerPendingActionContextCard } from "@/components/career/chat/CareerPendingActionContextCard";
import { CareerAnimatedRegion } from "@/components/career/CareerAnimatedRegion";
import { QuestionComposer } from "@/components/career/chat/QuestionComposer";
import { OnboardingFrame } from "@/components/common/onboarding/Onboarding";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { exportDesignHandoff } from "@/components/career/preview/exportDesignHandoff";
import type { CareerActionItem } from "@/lib/career/actionItems";
import type { CareerSchedule } from "@/lib/career/schedules/server";
import type { TalentMeetingSchedule } from "@/lib/career/meetings/types";

const actions: CareerActionItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    revision: 1,
    title: "스텔라AI가 먼저 만나보고 싶어 해요",
    description: "오늘 답하시면 이번 주에 첫 통화를 잡을 수 있어요.",
    buttonText: "채팅에서 답하기",
    action: { type: "compose_reply", text: "스텔라AI 연결 제안에 답변할게요." },
    priority: 3,
    urgency: "normal",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    revision: 1,
    title: "노바랩스 과제, 오늘 18시까지",
    description: "파일만 주시면 제가 양식에 맞춰 보낼게요.",
    buttonText: "파일 올리기",
    action: { type: "compose_reply", text: "노바랩스 과제 파일을 첨부할게요." },
    priority: 2,
    urgency: "normal",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    revision: 1,
    title: "핀플로우가 5일째 조용해요",
    description: "후속 연락 내용을 함께 확인해요.",
    buttonText: "채팅에서 확인하기",
    action: {
      type: "compose_reply",
      text: "핀플로우 후속 연락을 확인하고 싶어요.",
    },
    priority: 1,
    urgency: "normal",
  },
];
const initialSchedule: CareerSchedule = {
  id: "demo-schedule",
  talent_id: "demo",
  conversation_id: null,
  title: "핀플로우 후속 연락 확인",
  instruction:
    "회사 답변을 확인하고, 아직 답변이 없으면 다음 연락을 준비해 주세요.",
  target_refs: {},
  timezone: "Asia/Seoul",
  next_run_at: "2026-11-05T05:00:00Z",
  recurrence: null,
  status: "active",
  revision: 1,
  directive_revision: 1,
  last_run_id: null,
};
const meeting: TalentMeetingSchedule = {
  id: "demo-meeting",
  talent_id: "demo",
  role_id: null,
  scheduling_source: "external",
  title: "스텔라AI · 첫 미팅",
  content: "제품팀과 역할의 범위를 이야기하는 30분 미팅입니다.",
  timezone: "Asia/Seoul",
  confirmed_start_at: "2026-11-06T05:00:00Z",
  confirmed_end_at: "2026-11-06T05:30:00Z",
  status: "confirmed",
  version: 1,
  source_key: null,
  source_refs: {},
};
function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="handoff-section">
      <div className="handoff-section-head">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
type HandoffSnapshots = { css: string; frames: string[] };
const SnapshotsContext = createContext<HandoffSnapshots | null>(null);
const screenTitles = [
  "데스크톱 · 채팅과 팔로업",
  "데스크톱 · 기회 펼치기",
  "모바일 · 홈과 작은 입력창",
  "모바일 · 기회와 상세",
  "채팅 동적 UI · 실제 parser와 renderer",
  "설정 모달 · 같은 글라스 토큰",
  "프로필 메뉴와 오른쪽 내 정보 패널",
  "거절·보류와 회사 상세 · 실제 기회 흐름",
];
const subscribeSnapshot = () => () => {};

function ReplySpecimen({ questionFirst = false }: { questionFirst?: boolean }) {
  const [selected, setSelected] = useState(!questionFirst);
  const [value, setValue] = useState("");
  const [question, setQuestion] = useState(questionFirst);
  const [answer, setAnswer] = useState("");
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" data-export-omit>
        <MuteButton onClick={() => setSelected(true)}>팔로업 선택</MuteButton>
        <MuteButton onClick={() => setQuestion((open) => !open)}>
          질문 카드 열기·닫기
        </MuteButton>
      </div>
      <CareerAnimatedRegion open={question}>
        <div className="career-reply-slot">
          <QuestionComposer
            title="스텔라AI · Backend Engineer"
            question="이번 주에 통화할 수 있는 시간을 알려주세요."
            index={0}
            count={2}
            value={answer}
            busy={false}
            closeLabel="질문 닫기"
            onClose={() => setQuestion(false)}
            onChange={setAnswer}
            onNavigate={() => {}}
            onAnswer={() => setQuestion(false)}
            onSkip={() => setQuestion(false)}
          />
        </div>
      </CareerAnimatedRegion>
      <CareerAnimatedRegion open={selected}>
        <div className="career-reply-slot">
          <CareerPendingActionContextCard
            action={{ ...actions[0], kind: "action_item" }}
            expanded={false}
            onDismiss={() => setSelected(false)}
            onToggleExpanded={() => {}}
          />
        </div>
      </CareerAnimatedRegion>
      <ChatComposerFrame
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="선택한 요청에 바로 답변해 주세요."
        action={
          <MuteButton
            variant="dark"
            aria-label="답변 예시"
            disabled={!value.trim()}
            onClick={() => {
              setValue("");
              setSelected(false);
            }}
          >
            <ArrowUp size={16} />
          </MuteButton>
        }
      />
    </div>
  );
}
function Screen({
  title,
  src,
  mobile = false,
}: {
  title: string;
  src: string;
  mobile?: boolean;
}) {
  const snapshots = useContext(SnapshotsContext);
  const mounted = useSyncExternalStore(
    subscribeSnapshot,
    () => true,
    () => false
  );
  const content = snapshots?.frames[screenTitles.indexOf(title)];
  const srcDoc =
    mounted && content
      ? `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${snapshots!.css}</style></head>${content}</html>`
      : undefined;
  return (
    <figure
      className={mobile ? "handoff-screen handoff-phone" : "handoff-screen"}
    >
      <figcaption>
        {title}{" "}
        <a href={src} target="_blank" rel="noreferrer" data-export-omit>
          {" "}
          · 실제 미리보기 열기
        </a>
      </figcaption>
      <div className="handoff-screen-scroll">
        <iframe
          title={title}
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          width={mobile ? 390 : 1200}
          height={mobile ? 844 : 780}
        />
      </div>
    </figure>
  );
}
export default function CareerDesignSystemPage({
  snapshots = null,
}: {
  snapshots?: HandoffSnapshots | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false),
    [feedback, setFeedback] = useState("");
  const [draft, setDraft] = useState("");
  const [schedule, setSchedule] = useState(initialSchedule);
  const [confirm, setConfirm] = useState(false);
  const demo = () =>
    setFeedback("디자인 예시입니다. 실제 저장·발송은 실행하지 않습니다.");
  return (
    <SnapshotsContext.Provider value={snapshots}>
      <Head>
        <title>Career · Floating Sky — 구현 전달서</title>
      </Head>
      <div
        ref={root}
        data-career-theme="sky"
        className="handoff-root career-sky-canvas"
      >
        <header className="handoff-hero">
          <p className="handoff-eyebrow">HARPER / CAREER / 2026.11.05</p>
          <h1>Floating Sky</h1>
          <p className="handoff-lede">옅은 하늘 위에, 대화와 다음 행동만.</p>
          <p className="handoff-caption">
            새 디자인의 실제 컴포넌트, 보이지 않던 상태, 제품에 맞춘 결정.
          </p>
          <div data-export-omit className="mt-7">
            <MuteButton
              variant="dark"
              disabled={exporting}
              onClick={async () => {
                if (!root.current) return;
                setExporting(true);
                try {
                  await exportDesignHandoff(root.current);
                  setFeedback("HTML 파일을 다운로드했습니다.");
                } catch (error) {
                  setFeedback(String(error));
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download size={16} />
              {exporting ? "화면과 스타일 묶는 중…" : "단일 HTML 다운로드"}
            </MuteButton>
          </div>
          <p
            id="demo-feedback"
            role="status"
            className="mt-4 text-sm text-neutral-muted"
          >
            {feedback}
          </p>
          <nav className="handoff-nav">
            <a href="#principles">기준</a>
            <a href="#desktop">데스크톱</a>
            <a href="#mobile">모바일</a>
            <a href="#components">컴포넌트</a>
            <a href="#details">설정·상세</a>
            <a href="#onboarding">온보딩</a>
            <a href="#decisions">구현 결정</a>
          </nav>
        </header>
        <main className="handoff-main">
          <div className="handoff-note career-glass">
            <strong>이 파일을 보는 방법</strong>
            <p>
              아래 화면과 회사·일정·숫자는 디자인 검토를 위한 예시입니다. 실제
              Career 컴포넌트를 사용합니다. 온라인 로컬 미리보기에서는 예시
              상태를 조작할 수 있고, 내려받은 HTML의 큰 화면은 내보낸 순간의
              상태입니다. 설명 접기·펼치기는 오프라인에서도 작동합니다. 어떤
              버튼도 실제 지원·발송을 실행하지 않습니다.
            </p>
            <p>
              브랜치 <code>codex/career-floating-sky-20261105</code> · 기존 배포
              기준 <code>bd21a125</code> · 미배포
            </p>
          </div>
          <Section id="principles" number="01" title="한 배경, 같은 유리 표면">
            <p>
              원본 HTML의 「글라스 · 떠 있는」 + 「바탕 · 옅은 하늘만」 수치를
              그대로 옮겼습니다. 네 겹의 gradient는 패널마다 반복하지 않고 화면
              전체에 한 번 깔립니다.
            </p>
            <div className="handoff-token-grid">
              {[
                ["Ink", "#1D1D1F"],
                ["Secondary", "#6E6E73"],
                ["Soft", "#AEAEB2"],
                ["Sky top", "#F5F6F8"],
                ["Sky bottom", "#E9ECF0"],
              ].map(([name, color]) => (
                <div key={name} className="career-glass handoff-token">
                  <span style={{ background: color }} />
                  <strong>{name}</strong>
                  <code>{color}</code>
                </div>
              ))}
            </div>
            <div className="handoff-grid">
              <div className="career-glass handoff-spec">
                <h3>기본 표면</h3>
                <dl>
                  <dt>색</dt>
                  <dd>white 52% → 34%</dd>
                  <dt>흐림</dt>
                  <dd>40px · saturation 1.6</dd>
                  <dt>모서리</dt>
                  <dd>카드 18 · 입력창 16 · 선택 탭 8px</dd>
                  <dt>그림자</dt>
                  <dd>원본의 5개 레이어 그대로</dd>
                </dl>
              </div>
              <div className="career-glass handoff-spec">
                <h3>겹치는 표면</h3>
                <p>
                  모달·메뉴·팝오버는 흰색 바탕을 추가해 뒤의 글자가 겹쳐 읽히지
                  않게 했습니다. 글꼴과 본문·설명·날짜 색은 원본의 시스템 폰트와
                  세 회색을 사용합니다. Hover와 키보드 focus는 별도 상태로
                  보입니다.
                </p>
              </div>
            </div>
          </Section>
          <Section id="desktop" number="02" title="대화 옆에, 지금 필요한 것">
            <p>
              상단은 채팅·기회, 우측 끝은 설정·프로필입니다. 본문과 입력창은
              최대 560px, 팔로업과 기회는 동일하게 420px입니다. 태블릿에서는 둘
              다 360px로 줄어듭니다. 내 정보·자료처럼 긴 내용을 읽는 패널만 더
              넓게 열립니다.
            </p>
            <Screen
              title="데스크톱 · 채팅과 팔로업"
              src="/career/preview?tab=chat"
            />
            <p>
              기회는 지원 방식·추천 날짜별 제목 없이 한 목록으로 보여줍니다.
              20px 로고와 회사명, 우측 지원 방식, 역할명, 근무 조건을 같은
              순서로 배치합니다. 접힌 행은 투명하고, 펼친 행에만 원본 글라스와
              그림자가 나타납니다. 새 기회·진행중·저장함·보관 목록 모두 같은
              카드입니다. 피드백은 구분선 없이 우측 하단에서 hover·키보드 focus
              때 나타나며, 터치 화면에서는 바로 누를 수 있습니다. 지원 버튼과
              마감 정보는 따로 유지합니다.
            </p>
            <Screen
              title="데스크톱 · 기회 펼치기"
              src="/career/preview?tab=history&historyTab=new&id=preview-role-1"
            />
          </Section>
          <Section id="mobile" number="03" title="홈에서 쓰고, 보내면 채팅으로">
            <p>
              홈·채팅·기회를 최상단에 둡니다. 홈의 입력창은 실제 입력창입니다.
              누르거나 입력해도 홈에 머무르고, 전송하면 채팅으로 이동합니다.
              같은 입력창을 유지하므로 탭을 오가도 작성 중인 내용이 남습니다.
              상단 바는 흰색에서 투명해지는 배경 위에 고정되고, 제목·탭·본문이
              그 뒤로 스크롤됩니다.
            </p>
            <div className="handoff-phone-grid">
              <Screen
                mobile
                title="모바일 · 홈과 작은 입력창"
                src="/career/preview?tab=home"
              />
              <Screen
                mobile
                title="모바일 · 기회와 상세"
                src="/career/preview?tab=history&historyTab=new&id=preview-role-1"
              />
            </div>
          </Section>
          <Section id="components" number="04" title="원본에 없던 컴포넌트까지">
            <div className="handoff-grid">
              <div>
                <h3>지금 팔로업</h3>
                <p>
                  실제 CareerActionItemList입니다. 22px의 가벼운 제목, 14px
                  설명, 18px 안쪽 여백과 12px 간격을 맞췄습니다. 카드 전체가
                  버튼이며 긴 제목은 잘리지 않습니다.
                </p>
                <div className="handoff-followup">
                  <p className="career-followups-date">
                    11월 5일 목요일 · 오전 9:02
                  </p>
                  <h4 className="mb-5 mt-1 text-base font-medium">
                    지금 팔로업 3
                  </h4>
                  <CareerActionItemList items={actions} onSelect={demo} />
                  <div className="career-summary career-glass">
                    <h2>지원 현황</h2>
                    <dl>
                      <div>
                        <dd>9</dd>
                        <dt>저장함</dt>
                      </div>
                      <div>
                        <dd>2</dd>
                        <dt>지원함</dt>
                      </div>
                      <div>
                        <dd>1</dd>
                        <dt>진행중</dt>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
              <div className="space-y-7">
                <div>
                  <h3>일정</h3>
                  <p>
                    저장된 미팅의 제목·시간·내용을 기존 AppointmentList로
                    표시합니다. 등록된 회의 링크와 관련 포지션이 있으면 함께
                    나옵니다.
                  </p>
                  <div className="career-glass p-[18px]">
                    <AppointmentList schedules={[meeting]} />
                  </div>
                </div>
                <div>
                  <h3>예약된 작업</h3>
                  <p>
                    기존 일정 목록을 공유합니다. 제목을 펼쳐 지시 내용을 읽고
                    중지·재개·취소할 수 있습니다. 아래 버튼은 예시 상태만
                    바꿉니다.
                  </p>
                  <div className="career-glass p-[18px]">
                    <CareerScheduleList
                      schedules={[schedule]}
                      onAction={(_, action) =>
                        setSchedule({
                          ...schedule,
                          status:
                            action === "pause"
                              ? "paused"
                              : action === "resume"
                                ? "active"
                                : "cancelled",
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <h3>Thinking / Working</h3>
                  <p>
                    원래 진행 로그와 중단 기능을 유지합니다. 진행 중인 일이
                    끝났다고 보이게 하는 장식 문구는 넣지 않습니다.
                  </p>
                  <div className="career-glass p-[18px]">
                    <CareerWorkActivityStatus admitting />
                  </div>
                </div>
              </div>
            </div>
            <div className="handoff-grid mt-10">
              <div>
                <h3>표도 떠 있는 표면 안에</h3>
                <RichText
                  variant="career"
                  content={
                    "| 항목 | 스텔라AI | 노바랩스 |\n| --- | --- | --- |\n| 역할 | Backend Engineer | Product Engineer |\n| 근무 | 대면 + 원격 | 원격 |\n| 다음 단계 | 미팅 일정 확인 | 과제 검토 |"
                  }
                />
                <p>
                  긴 표는 표 안에서 가로로 스크롤합니다. 원문·복사 내용·마크다운
                  의미는 그대로입니다.
                </p>
              </div>
              <div>
                <h3>입력·첨부·중단</h3>
                <ChatComposerFrame
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="어떤 이야기든 편하게 시작해요"
                  mobileLeadingAction={
                    <MuteButton
                      variant="transparent"
                      aria-label="첨부 예시"
                      data-demo-action
                      onClick={demo}
                    >
                      <Plus size={18} />
                    </MuteButton>
                  }
                  action={
                    <MuteButton
                      variant="dark"
                      aria-label="보내기 예시"
                      data-demo-action
                      onClick={demo}
                      disabled={!draft.trim()}
                    >
                      <ArrowUp size={16} />
                    </MuteButton>
                  }
                />
                <p>
                  기존 첨부·기회 언급·처리할 항목 메뉴는 유지합니다. 비어 있을
                  때는 비활성 전송 버튼, 작성 후에는 검은 전송 버튼을 보여
                  줍니다.
                </p>
              </div>
            </div>
            <div className="handoff-grid mt-10">
              <div>
                <h3>답변할 팔로업은 입력창 위에</h3>
                <ReplySpecimen />
                <p>
                  Hark의 독립된 맥락 카드와 입력창 배치를 참고했습니다. 요청은
                  12px 간격을 둔 글라스 카드에, 작성 중인 답변은 기존 입력창에
                  남습니다. 닫아도 초안은 지우지 않습니다. 정해진 질문에 답하는
                  폼도 입력창 위에 놓습니다.
                </p>
              </div>
              <div>
                <h3>질문·건너뛰기·답변 저장</h3>
                <ReplySpecimen questionFirst />
                <h3 className="mt-6">Hover · Focus · Motion</h3>
                <p>
                  Hover는 표면이 조금 밝아지고, 클릭할 때는 1px 눌립니다. 키보드
                  포커스는 파란 외곽선으로 표시합니다. 기회 상세와 답변 카드는
                  같은 spring으로 펼쳐지고 접힙니다. 닫히는 내용은 즉시 키보드
                  탐색에서 빠집니다.
                </p>
                <p>
                  색상·반경·그림자·blur·레이아웃 너비·상태 전환 시간을 공통
                  토큰으로 묶었습니다. 모션 감소 환경에서는 이동과 반복
                  애니메이션을 끕니다. 색과 대비, 로딩 문구로 상태를 계속 알 수
                  있습니다.
                </p>
              </div>
            </div>
            <div className="handoff-grid mt-10">
              <div className="career-glass handoff-spec">
                <h3>빈 상태</h3>
                <p>지금 확인할 할 일이 없어요.</p>
                <p>
                  0개를 숨기지 않고, 조회 실패를 빈 목록으로 바꾸지 않습니다.
                </p>
              </div>
              <div className="career-glass handoff-spec">
                <h3>불러오는 중 / 다시 시도</h3>
                <Skeleton className="h-5 w-3/4 mb-3" />
                <Skeleton className="h-5 w-1/2" />
                <p role="status">목록을 불러오지 못했어요.</p>
                <MuteButton data-demo-action onClick={demo}>
                  다시 불러오기
                </MuteButton>
              </div>
            </div>
            <details className="handoff-disclosure">
              <summary>채팅 동적 UI의 실제 범위</summary>
              <p>
                매칭 결과, 저장·진행중 기회, 원하는 조건은 기존 renderer를
                재사용합니다. 여기에 일정, 예약된 작업, 할 일을 추가했습니다.
                모델에는 웹 채팅 전용 표시 계약과 실제 식별자만 제공하며, UI를
                표시하는 것 자체는 지원·전송·예약을 실행하지 않습니다.
                자료·회사·프로필은 기존 메뉴와 링크로 접근합니다.
              </p>
            </details>
            <Screen
              title="채팅 동적 UI · 실제 parser와 renderer"
              src="/career/preview/chat-ui"
            />
          </Section>
          <Section
            id="details"
            number="05"
            title="설정, 프로필, 선택 이후의 상태"
          >
            <p>
              설정은 기존 모달입니다. 계정·기회 설정·해당 계정에 제공되는 초대
              기능을 유지합니다. 프로필 메뉴에서 내 정보·자료·원하는 조건·관심
              회사를 열 수 있습니다.
            </p>
            <Screen
              title="설정 모달 · 같은 글라스 토큰"
              src="/career/preview?tab=chat&panel=settings"
            />
            <Screen
              title="프로필 메뉴와 오른쪽 내 정보 패널"
              src="/career/preview?tab=profile"
            />
            <Screen
              title="거절·보류와 회사 상세 · 실제 기회 흐름"
              src="/career/preview?tab=history&historyTab=new&id=preview-role-1"
            />
            <div className="handoff-grid">
              <div className="career-glass handoff-spec">
                <h3>모달·드롭다운·우측 상세</h3>
                <p>
                  공통 TalentCareerModal과 메뉴 primitive의 Escape, 바깥 클릭,
                  focus 복귀를 유지합니다. 회사 상세와 원문, 지원 선택, 거절,
                  상태 변경도 같은 색·border·shadow를 받습니다. 문서 편집은 기존
                  오른쪽 편집기를 사용하며 자료 목록과 겹치지 않는 글라스 바탕을
                  둡니다. 기존 매칭 히스토리 패널은 가장자리에서 8px·데스크톱
                  16px 떨어져 열리는 둥근 표면으로 정리했습니다.
                </p>
                <MuteButton data-export-omit onClick={() => setConfirm(true)}>
                  확인 모달 열기
                </MuteButton>
              </div>
              <div className="career-glass handoff-spec">
                <h3>긍정·부정 행동을 함께</h3>
                <p>
                  만나볼게요 / 이번엔 넘길게요 / 저장하고 나중에 결정은 기존
                  내부 기회 계약을 유지합니다. 외부 공고는 관심·직접
                  지원·Harper와 준비 경로를 보존합니다. 준비 완료, 실제 제출,
                  회사 회신은 서로 다른 상태입니다.
                </p>
              </div>
            </div>
          </Section>
          <Section
            id="onboarding"
            number="06"
            title="처음 시작하는 화면도 같은 하늘 아래"
          >
            <p>
              가입의 정보·동의·제출 단계는 그대로 두고, 480px 메인 폼을 하늘
              배경 위에 바로 배치했습니다. 메인 영역에는 글라스
              배경·테두리·그림자·blur를 두지 않습니다. 입력과 선택 카드에는 개별
              표면을 유지합니다. 아래는 실제 공통 OnboardingFrame으로 만든 입력
              예시입니다. Google·이메일 인증과 제출 완료 화면도 같은 Career
              테마를 사용합니다.
            </p>
            <div className="career-onboarding handoff-onboarding">
              <OnboardingFrame
                progressStep={0}
                totalSteps={3}
                showProgress={false}
                flexibleTitle
                title={
                  <div className="pt-8">
                    <h3 className="text-2xl font-light">
                      어떻게 불러드릴까요?
                    </h3>
                    <p className="text-sm text-neutral-muted mt-3">
                      기본 정보를 확인하고 이야기를 시작해요.
                    </p>
                  </div>
                }
                footer={
                  <MuteButton
                    variant="dark"
                    data-demo-action
                    onClick={demo}
                    className="w-full"
                  >
                    계속
                  </MuteButton>
                }
              >
                <label className="block text-sm mb-2" htmlFor="handoff-name">
                  이름
                </label>
                <Input id="handoff-name" defaultValue="민서" />
                <p className="mt-4 text-sm text-neutral-muted">
                  실제 화면의 단계별 필수 정보와 동의 확인을 유지합니다.
                </p>
              </OnboardingFrame>
            </div>
          </Section>
          <Section id="decisions" number="07" title="제품에 맞춰 결정한 것">
            <div className="handoff-decisions">
              {[
                [
                  "아침 브리핑 대신 현재 대화와 팔로업",
                  "Career에는 별도의 아침 브리핑 생성·발행 기능이 없습니다. 시간대가 바뀌어도 실제로 존재하는 대화와 저장된 할 일을 보여 줍니다. 날짜는 사용자 locale의 현재 날짜·시간입니다.",
                ],
                [
                  "‘보냄 / 답 옴’ 대신 저장함·지원함·진행중",
                  "현재 집계는 기회 상태를 기준으로 합니다. 지원했다고 해서 실제 발송이나 회신을 받은 것은 아니므로, 검증할 수 있는 기존 세 가지 집계를 사용했습니다.",
                ],
                [
                  "자동 후속 연락은 실제 예약이 있을 때만",
                  "‘오후 2시에 연락할게요’ 같은 문구를 UI가 만들지 않습니다. 할 일의 저장된 내용을 보여 주고, 예약된 작업은 실제 일정 reader에서 별도로 확인합니다.",
                ],
                [
                  "보내는 내용은 실제 제출 검토에서 확인",
                  "‘같이 가는 것 / 안 가는 것’의 몇 가지 예시만으로 전체 공유 범위를 설명할 수 없습니다. 기존 프로필 공개 범위, 회사 연결 동의, 답변·첨부·제출 검토를 유지합니다. 보류·거절·취소 행동도 함께 제공됩니다.",
                ],
                [
                  "아바타는 내 계정으로 가는 입구",
                  "사용자의 기존 프로필 사진, 없으면 이름 이니셜을 씁니다. 생성 캐릭터나 새로운 인물 기능이 아니며, 프로필·자료·조건·관심 회사와 기존 계정 메뉴를 엽니다.",
                ],
                [
                  "사라진 탐색은 메뉴와 대화로 연결",
                  "내 정보·자료·원하는 조건·관심 회사의 URL은 유지합니다. 상단은 자주 쓰는 채팅·기회만 남기고, 목록을 대화에 꺼내는 실제 표시 계약을 모델 입력에 연결했습니다.",
                ],
                [
                  "팔로업 개수와 노출 시점",
                  "저장된 할 일을 보여 주며 네 개 제한이나 가입 후 며칠 같은 새 노출 규칙을 만들지 않았습니다. Gmail 연결 권유·프로필 보강·오래된 대화의 재개는 실제 정보와 대화 맥락에 따라 기존 Career가 판단합니다. 참고 화면의 예시 조건을 제품의 자동 실행 규칙으로 사용하지 않습니다.",
                ],
                [
                  "기회의 묶음은 현재 상태를 기준으로",
                  "새 기회·진행중·저장함과 종료/보관·숨긴 포지션을 그대로 찾을 수 있게 TabBoxes를 두 줄로 배치했습니다. ‘소개 메일’이라는 별도 기회 종류나 프로필 열람 횟수는 현재 목록에 없는 데이터라 표시하지 않습니다. 회사명 아래에는 위치·근무 방식·고용 형태를 표시합니다.",
                ],
                [
                  "작업 중 표시와 결과물",
                  "기존 thinking·working·브라우저 작업·중단과 완료된 문서·지원 검토를 유지합니다. 동시에 진행되는 실제 작업을 임의로 하나로 합치거나 가상의 ‘3/5 완료’로 환산하지 않습니다. 지원 검토와 입력 요청의 표면은 원본 작업 카드처럼 white 44% → 26%를 사용합니다.",
                ],
                [
                  "대화의 길이와 버튼",
                  "참고의 짧고 읽기 편한 구성을 반영하되 답변을 두세 문장으로 제한하지 않습니다. 기회별 행동·응답 선택·입력 폼은 기존 실행 흐름에 필요한 곳에 남습니다. 본문의 이동 링크, 자료, 실제 실행 버튼을 각각 기존 기능에 연결했습니다.",
                ],
                [
                  "공유 방식은 내 정보에서 확인",
                  "상단은 탐색·설정·프로필에 집중하고, 공유 방식은 기존 내 정보 상단의 실제 설정을 유지합니다. 회사에 전달되는 범위와 연결 동의는 해당 결정 화면에서 확인하므로 화면 전체에 같은 안내를 반복하지 않습니다.",
                ],
                [
                  "새로운 외부 기능을 암시하지 않기",
                  "리크루터에게 전화 걸기, 공공 서류 본인 인증, 임의 페이지 공유, 외부 회사 계정 자동 생성은 이 디자인 작업으로 생기지 않습니다. Gmail 등 연결과 실제 지원의 권한·동의·확인 절차는 현재 구현을 사용합니다. 허락 동사 다섯 개를 새 실행 상태로 만들지 않았습니다.",
                ],
                [
                  "회사에 공개되는 외부 프로필",
                  "외부 회사가 여는 공개 프로필은 별도 권한과 공유 계약을 가진 경로입니다. 이번 적용은 로그인한 후보자의 Career와 온보딩입니다. 외부 공개 화면까지 바뀌었다고 해석하면 안 됩니다.",
                ],
                [
                  "복사·삭제·시간·첨부·진행 상태",
                  "복사·삭제·시간·첨부·진행 상태와 실행 계약을 유지했습니다. 기본 입력창은 작성과 보내기에 집중합니다. 진행 중인 통화와 통화 시작 링크, 처리할 항목의 통화 진입은 기존 경로로 이어집니다.",
                ],
              ].map(([title, body]) => (
                <details key={title} className="handoff-disclosure" open>
                  <summary>{title}</summary>
                  <p>{body}</p>
                </details>
              ))}
            </div>
            <div className="handoff-note career-glass">
              <strong>팀원에게 전달할 범위</strong>
              <p>
                새 브랜치의 로컬 구현입니다. 운영 배포·실제 지원·이메일
                발송·가입 데이터 변경은 하지 않았습니다. 큰 예시 화면은 실제
                컴포넌트의 HTML 스냅샷이므로 내려받은 파일에서는 전체 앱의 상태
                변경까지 재현하지 않습니다. 실제 동작은 로컬 /career와
                /career/preview에서 확인합니다.
              </p>
            </div>
          </Section>
        </main>
        <footer className="handoff-footer">
          Harper · Career / Floating Sky / 2026.11.05
        </footer>
        <TalentCareerModal
          open={confirm}
          onClose={() => setConfirm(false)}
          title="보내기 전에 확인해요"
          description="실제 제출 검토에서는 해당 지원의 답변과 첨부 파일을 보여 줍니다."
          footer={
            <div className="flex gap-2 justify-end">
              <MuteButton onClick={() => setConfirm(false)}>
                아직 보내지 않을게요
              </MuteButton>
              <MuteButton
                variant="dark"
                onClick={() => {
                  setConfirm(false);
                  demo();
                }}
              >
                내용 확인
              </MuteButton>
            </div>
          }
        >
          <p className="text-sm text-neutral-muted">
            이 창은 모달 디자인 예시입니다. 실제 전송 내용은 기존 지원 검토
            컴포넌트가 담당합니다.
          </p>
        </TalentCareerModal>
      </div>
    </SnapshotsContext.Provider>
  );
}
export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV === "production") return { notFound: true };
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const html = await readFile(
    join(process.cwd(), "docs/design/career-floating-sky-handoff.html"),
    "utf8"
  );
  const saved = html.match(
    /<script type="application\/json" id="snapshots">([\s\S]*?)<\/script>/
  )?.[1];
  return { props: { snapshots: saved ? JSON.parse(saved) : null } };
};
