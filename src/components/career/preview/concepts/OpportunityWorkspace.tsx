// career-i18n-skip-file: Synthetic local opportunity workspace.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarDays,
  ChevronRight,
  FileText,
  Link2,
  Plus,
} from "lucide-react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PreviewUI } from "../../chat/elements/DocumentPreviewCards";
import OpportunityCard from "../../history/OpportunityCard";
import { questions, research, type Job } from "./data";
import { toOpportunity } from "./opportunityFixture";
import { Quiet, Reading, navigateTabs, type Context } from "./shared";
import s from "./Concepts.module.css";

type Material = {
  title: string;
  meta: string;
  text: string;
  id?: string;
  url?: string;
};
type Reader = {
  title: string;
  meta: string;
  content: ReactNode;
  material?: Material;
};
const emptyMaterial = { title: "", text: "", url: "" };

function materialUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
const submitted: Material[] = [
  { title: "김지민_FDE_이력서.pdf", meta: "이력서 · 제출본 예시", text: "" },
  {
    title: "지원서 답변",
    meta: "채용 페이지 지원 양식",
    text: "노바랩스에 지원한 이유\n고객이 실제로 겪는 문제를 제품팀에 가져가고, 여러 고객이 함께 쓸 수 있는 기능으로 만드는 일에 관심이 있습니다.\n\n관련 프로젝트\n고객 인터뷰에서 반복 문의가 발생하는 지점을 찾아, 내부 문서 검색 시스템을 설계하고 배포했습니다. 도입 이후에는 검색 실패와 문서 권한 문제를 분리해 개선했습니다.",
  },
];
const briefing: Material = {
  title: "면접 전 5분 요약",
  meta: "Harper · 제품팀 1차 인터뷰",
  text: "가장 먼저 꺼낼 경험\n문서 검색 프로젝트. 고객이 요청한 기능과 실제로 해결하려던 문제를 구분했던 순간부터 이야기하기.\n\n내 판단을 보여줄 부분\n고객과 성공 기준을 합의한 뒤, 바로 모델을 바꾸기보다 문서 권한과 검색 범위를 먼저 점검한 이유.\n\n물어볼 질문\n첫 3개월에 기대하는 성과는 무엇인가요?\n고객별 개발과 공통 제품 개발의 비중은 어느 정도인가요? 최근 사례가 있나요?",
};
const timeline = [
  {
    date: "11월 10일",
    title: "제품팀 1차 인터뷰 확정",
    description: "11월 13일 금요일 오후 2시 · 화상 면접",
  },
  {
    date: "11월 9일",
    title: "채용팀과 첫 통화",
    description: "역할 범위와 고객 방문 빈도 논의",
  },
  {
    date: "11월 8일",
    title: "지원서 제출",
    description: "이력서와 지원서 답변",
  },
];
const questionNotes = [
  "고객사와 문제를 정의하는 역할이라, 고객의 최초 요청과 실제 문제를 어떻게 구분했는지 이야기해보세요.",
  "검색 평가 경험을 중심으로 데이터 누락, 검색 실패, 응답 생성 문제를 나눠 확인한 순서를 설명해보세요.",
  "한 고객에게만 필요한 요구와 여러 고객이 겪는 문제를 어떻게 구분했는지, 직접 했던 판단을 설명해보세요.",
  "고객과 성공 기준을 어떻게 합의했고, 배포 뒤 무엇을 관찰했는지 이야기해보세요.",
];
const pastPractice = [
  {
    title: "2회차 · 문제 정의가 더 구체적이 됐어요",
    text: "고객 인터뷰에서 시작해서 본인의 판단이 드러났어요. 다음에는 실제로 확인한 결과를 근거로 덧붙여보세요.",
    answer:
      "검색 정확도를 높여 달라는 요청을 받았어요. 인터뷰해보니 반복 문의를 처리하는 시간이 더 큰 문제였고, 그래서 문의 처리 시간을 성공 기준으로 합의했습니다.",
  },
  {
    title: "1회차 · 기술보다 문제부터 이야기하기",
    text: "기술 설명이 길어져 고객의 문제가 늦게 나왔어요. 어떤 문제를 발견했는지부터 이야기해보세요.",
    answer:
      "검색에 벡터 검색과 키워드 검색을 함께 사용했습니다. 권한 필터를 추가하고 배포한 뒤 검색 지표를 모니터링했습니다.",
  },
];

function SubmittedResume() {
  return (
    <article className={s.resumePaper}>
      <header>
        <h3>김지민</h3>
        <p>AI Engineer · Seoul · jimin@example.com</p>
      </header>
      <section>
        <h4>경력</h4>
        <h5>서치랩 · AI Engineer</h5>
        <p>2023.03 – 2026.10 · 서울</p>
        <ul>
          <li>
            기업 고객의 반복 문의를 줄이는 내부 문서 검색 시스템을 설계하고
            배포했습니다.
          </li>
          <li>
            고객 인터뷰를 진행하고 검색 성공률과 문의 처리 시간을 운영 지표로
            정했습니다.
          </li>
          <li>
            문서별 접근 권한을 검색에 적용하고, 평가 데이터셋과 배포 후
            모니터링을 구축했습니다.
          </li>
        </ul>
        <h5>노스스택 · Software Engineer</h5>
        <p>2020.07 – 2023.02 · 서울</p>
        <ul>
          <li>
            고객 업무 도구와 데이터 파이프라인을 연결하는 백엔드 서비스를
            개발했습니다.
          </li>
          <li>
            사용 로그를 분석해 동기화 실패를 재현하고 알림과 복구 절차를
            정리했습니다.
          </li>
        </ul>
      </section>
      <section>
        <h4>프로젝트</h4>
        <h5>고객 문서 검색</h5>
        <p>
          검색에서 답을 얻지 못하는 사례를 분류하고, 데이터 누락과 모델 오류를
          구분하는 평가 흐름을 만들었습니다. 고객 검토 결과를 제품팀과 공유해
          공통 검색 기능에 반영했습니다.
        </p>
        <h5>온보딩 자동화</h5>
        <p>
          고객 환경마다 반복하던 연동 설정을 표준화하고 도입 문서를
          작성했습니다. 고객 성공 팀이 개발팀 지원 없이 초기 설정을 마칠 수 있게
          했습니다.
        </p>
      </section>
      <section>
        <h4>기술</h4>
        <p>Python · TypeScript · PostgreSQL · 검색 평가 · 고객 환경 배포</p>
      </section>
    </article>
  );
}
function ReadingRow({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <li>
      <BareButton className={s.readingRow} onClick={onClick}>
        <span>{title}</span>
        <ChevronRight size={14} />
      </BareButton>
    </li>
  );
}

export function OpportunityWorkspace({
  job,
  initialInterview,
  interviewRequest,
  ctx,
  onBack,
  saved,
  onSave,
}: {
  job: Job;
  initialInterview: boolean;
  interviewRequest: number;
  ctx: Context;
  onBack: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  const [section, setSection] = useState("overview");
  const [interview, setInterview] = useState(initialInterview);
  const [reader, setReader] = useState<Reader | null>(null);
  const [documents, setDocuments] = useState<Material[]>(() =>
    research.map((doc, index) =>
      index === 2 ? { ...doc, id: "personal-research" } : doc
    )
  );
  const [adding, setAdding] = useState(false);
  const [materialDraft, setMaterialDraft] = useState<{
    id?: string;
    title: string;
    text: string;
    url: string;
  }>(emptyMaterial);
  const [note, setNote] = useState(
    "고객과 일하는 시간이 절반 정도. 제품팀에 고객 피드백이 반영되는 구조가 좋아 보였다. 최근에 실제로 반영된 사례를 물어보고 싶다."
  );
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [interviewNote, setInterviewNote] = useState("");
  const [interviewNoteDraft, setInterviewNoteDraft] = useState<string | null>(
    null
  );
  const root = useRef<HTMLDivElement>(null);
  const editorId = useId();
  const materialTitle = useRef<HTMLInputElement>(null);
  const latest = ctx.records.at(-1);
  const practiceQuestion = latest?.question ?? questions[0];
  const urlError = Boolean(
    materialDraft.url.trim() && !materialUrl(materialDraft.url.trim())
  );
  useEffect(() => {
    if (!interviewRequest) return;
    setReader(null);
    setSection("overview");
    setInterview(true);
  }, [interviewRequest]);
  const returnPosition = useRef({
    top: 0,
    trigger: null as HTMLElement | null,
  });
  const focusPage = () =>
    requestAnimationFrame(() => {
      root.current?.closest("main")?.scrollTo(0, 0);
      root.current
        ?.querySelector<HTMLElement>("[data-view-title]")
        ?.focus({ preventScroll: true });
    });
  const openReader = (next: Reader) => {
    returnPosition.current = {
      top: root.current?.closest("main")?.scrollTop ?? 0,
      trigger: document.activeElement as HTMLElement,
    };
    setReader(next);
    focusPage();
  };
  const closeReader = () => {
    setReader(null);
    requestAnimationFrame(() => {
      root.current?.closest("main")?.scrollTo(0, returnPosition.current.top);
      returnPosition.current.trigger?.focus({ preventScroll: true });
    });
  };
  const openDoc = (doc: Material) =>
    openReader({
      ...doc,
      material: doc.id ? doc : undefined,
      content:
        doc === submitted[0] ? (
          <SubmittedResume />
        ) : (
          <>
            {doc.text && <Reading text={doc.text} />}
            {doc.url && (
              <a
                className={s.materialLink}
                href={doc.url}
                target="_blank"
                rel="noreferrer"
              >
                <Link2 size={15} />
                {new URL(doc.url).hostname}에서 열기
              </a>
            )}
          </>
        ),
    });
  const showInterview = (next: boolean) => {
    setInterview(next);
    focusPage();
  };
  const startMaterial = (doc?: Material) => {
    if (doc)
      setMaterialDraft({
        id: doc.id,
        title: doc.title,
        text: doc.text,
        url: doc.url ?? "",
      });
    setReader(null);
    setInterview(false);
    setSection("materials");
    setAdding(true);
    requestAnimationFrame(() => materialTitle.current?.focus());
  };
  const files = (docs: Material[]) => (
    <div className={s.fileGrid}>
      {docs.map((doc) => (
        <div key={doc.id ?? doc.title} data-personal-material={doc.id}>
          <PreviewUI
            icon={
              doc.url ? (
                <Link2 size={18} className="text-neutral-muted" />
              ) : (
                <FileText size={18} className="text-neutral-muted" />
              )
            }
            title={doc.title}
            description={doc.meta}
            trailing={<ChevronRight size={14} className="text-neutral-muted" />}
            onClick={() => openDoc(doc)}
          />
        </div>
      ))}
    </div>
  );
  const submittedGroup = (
    <section className={s.workspaceGroup}>
      <div className={s.groupTitle}>
        <h3 data-view-title tabIndex={-1}>
          제출한 자료
        </h3>
        <span>11월 8일 · 채용 페이지</span>
      </div>
      {files(submitted)}
    </section>
  );

  return (
    <div
      ref={root}
      className={s.detail}
      onKeyDown={(event) => {
        if (reader && event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          closeReader();
        }
      }}
    >
      {reader && (
        <div className={s.reader}>
          <Quiet onClick={closeReader}>
            <ArrowLeft size={14} />{" "}
            {interview
              ? "면접 준비"
              : section === "materials"
                ? "자료"
                : section === "activity"
                  ? "기록"
                  : "개요"}
            로 돌아가기
          </Quiet>
          <header className={s.readerHeader}>
            <p>
              {job.company} · {reader.meta}
            </p>
            <h2 data-view-title tabIndex={-1}>
              {reader.title}
            </h2>
          </header>
          <div className={s.readerContent}>{reader.content}</div>
          {reader.material &&
            (materialDraft.title && materialDraft.id !== reader.material.id ? (
              <Quiet onClick={() => startMaterial()}>
                작성 중인 자료로 <ArrowRight size={13} />
              </Quiet>
            ) : (
              <Quiet onClick={() => startMaterial(reader.material)}>
                자료 수정 <ArrowRight size={13} />
              </Quiet>
            ))}
        </div>
      )}
      <div hidden={!!reader}>
        <div className={s.breadcrumb}>
          <Quiet onClick={onBack}>
            <ArrowLeft size={14} /> 기회
          </Quiet>
          <Quiet
            label={saved ? "관심 기회 저장 해제" : "관심 기회 저장"}
            aria-pressed={saved}
            onClick={onSave}
          >
            <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
          </Quiet>
        </div>
        <OpportunityCard
          item={toOpportunity(job)}
          expanded={false}
          showUnreadIndicator={false}
          titleAdornment={
            <ChevronRight size={14} className="text-neutral-muted" />
          }
          onOpenDetail={() =>
            openReader({
              title: "공고",
              meta: job.role,
              content: (
                <OpportunityCard
                  item={toOpportunity(job)}
                  showUnreadIndicator={false}
                />
              ),
            })
          }
        />
        {interview ? (
          <>
            <div className={s.workspaceTitle}>
              <Quiet onClick={() => showInterview(false)}>
                <ArrowLeft size={13} /> 개요
              </Quiet>
              <h2 data-view-title tabIndex={-1}>
                면접 준비
              </h2>
              <p>11월 13일 금요일 · 제품팀 1차 인터뷰</p>
            </div>
            <Card className={s.prepCard}>
              <h3>
                {latest
                  ? "마지막 질문 다시 연습"
                  : "고객의 문제를 어떻게 정의했는지"}
              </h3>
              {latest ? (
                <p>{latest.question}</p>
              ) : (
                <p>
                  지난 연습에서 문제 정의가 구체적이었어요. 이번에는 어떤 대안
                  중에서 무엇을 골랐는지 이어서 이야기해보세요.
                </p>
              )}
              <div className={s.featureActions}>
                <MuteButton
                  variant="dark"
                  onClick={() => ctx.practice(practiceQuestion)}
                >
                  {ctx.activeQuestion === practiceQuestion
                    ? "답변 입력으로"
                    : "이어서 연습"}{" "}
                  <ArrowRight size={14} />
                </MuteButton>
                <Quiet onClick={() => openDoc(briefing)}>5분 요약</Quiet>
              </div>
            </Card>
            <section className={s.workspaceGroup}>
              <div className={s.groupTitle}>
                <h3>예상 질문</h3>
                <span>{questions.length}개</span>
              </div>
              <ul className={s.readingList}>
                {questions.map((question, index) => (
                  <ReadingRow
                    key={question}
                    title={
                      ctx.activeQuestion === question
                        ? `연습 중 · ${question}`
                        : question
                    }
                    onClick={() =>
                      openReader({
                        title: question,
                        meta: "예상 질문",
                        content: (
                          <>
                            <Reading text={questionNotes[index]} />
                            <MuteButton
                              variant="dark"
                              className="mt-6"
                              onClick={() => ctx.practice(question)}
                            >
                              이 질문으로 연습 <ArrowRight size={14} />
                            </MuteButton>
                          </>
                        ),
                      })
                    }
                  />
                ))}
              </ul>
            </section>
            <section className={s.workspaceGroup}>
              <div className={s.groupTitle}>
                <h3>준비 자료</h3>
              </div>
              {files(documents)}
            </section>
            <section className={s.workspaceGroup}>
              <div className={s.groupTitle}>
                <h3>연습 기록</h3>
                <span>{ctx.records.length + 2}회</span>
              </div>
              <ul className={s.readingList}>
                {[...ctx.records].reverse().map((record, index) => (
                  <ReadingRow
                    key={record.id}
                    title={`${ctx.records.length + 2 - index}회차 · ${record.question}`}
                    onClick={() =>
                      openReader({
                        title: record.question,
                        meta: `${ctx.records.length + 2 - index}회차`,
                        content: (
                          <>
                            <Reading text={record.answer} />
                            <MuteButton
                              className="mt-6"
                              onClick={() => ctx.practice(record.question)}
                            >
                              다시 연습
                            </MuteButton>
                          </>
                        ),
                      })
                    }
                  />
                ))}
                {pastPractice.map((record) => (
                  <ReadingRow
                    key={record.title}
                    title={record.title}
                    onClick={() =>
                      openReader({
                        title: record.title,
                        meta: "연습 피드백 예시",
                        content: (
                          <div className={s.practiceReview}>
                            <section>
                              <h3>당시 답변</h3>
                              <Reading text={record.answer} />
                            </section>
                            <section>
                              <h3>피드백 예시</h3>
                              <Reading text={record.text} />
                            </section>
                            <MuteButton
                              onClick={() => ctx.practice(questions[0])}
                            >
                              다시 연습 <ArrowRight size={14} />
                            </MuteButton>
                          </div>
                        ),
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          </>
        ) : (
          <>
            <Tabs
              aria-label="기회 상세"
              className={s.workspaceTabs}
              activeValue={section}
              items={[
                { value: "overview", label: "개요" },
                { value: "materials", label: "자료" },
                { value: "activity", label: "기록" },
              ]}
              onValueChange={setSection}
              onKeyDown={navigateTabs}
            />
            {section === "overview" && (
              <>
                <Card className={s.nextMeeting}>
                  <div className={s.meetingHeader}>
                    <div className={s.meetingIcon}>
                      <CalendarDays size={20} />
                    </div>
                    <div>
                      <h2 data-view-title tabIndex={-1}>
                        제품팀 1차 인터뷰
                      </h2>
                      <time
                        className={s.meetingDate}
                        dateTime="2026-11-13T14:00:00+09:00"
                      >
                        11월 13일 금요일 · 오후 2:00 KST
                      </time>
                      <p>화상 면접 · 45분</p>
                    </div>
                  </div>
                  <div className={s.featureActions}>
                    <MuteButton
                      variant="dark"
                      onClick={() => showInterview(true)}
                    >
                      면접 준비 이어가기 <ArrowRight size={14} />
                    </MuteButton>
                    <Quiet onClick={() => openDoc(briefing)}>5분 요약</Quiet>
                  </div>
                </Card>
                {submittedGroup}
                <section className={s.workspaceGroup}>
                  <div className={s.groupTitle}>
                    <h3>첫 통화 메모</h3>
                    <Quiet
                      onClick={() => {
                        setSection("activity");
                        focusPage();
                      }}
                    >
                      기록 보기 <ArrowRight size={12} />
                    </Quiet>
                  </div>
                  <div className={s.notePreview}>
                    <Reading text={note} />
                  </div>
                </section>
              </>
            )}
            {section === "materials" && (
              <>
                {submittedGroup}
                <section className={s.workspaceGroup}>
                  <div className={s.groupTitle}>
                    <h3>준비 자료</h3>
                    <Quiet
                      aria-expanded={adding}
                      aria-controls={editorId}
                      onClick={() =>
                        adding ? setAdding(false) : startMaterial()
                      }
                    >
                      <Plus size={13} />{" "}
                      {materialDraft.title && !adding
                        ? "작성 이어가기"
                        : "자료 추가"}
                    </Quiet>
                  </div>
                  {files(documents)}
                  {adding && (
                    <form
                      className={s.inlineEditor}
                      id={editorId}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const title = materialDraft.title.trim();
                        const text = materialDraft.text.trim();
                        const url =
                          materialUrl(materialDraft.url.trim()) ?? undefined;
                        if (!title || (!text && !url) || urlError) return;
                        const id = materialDraft.id ?? crypto.randomUUID();
                        const doc = { id, title, text, url, meta: "내가 추가" };
                        setDocuments((current) =>
                          materialDraft.id
                            ? current.map((item) =>
                                item.id === id ? doc : item
                              )
                            : [...current, doc]
                        );
                        setMaterialDraft(emptyMaterial);
                        setAdding(false);
                        requestAnimationFrame(() =>
                          root.current
                            ?.querySelector<HTMLElement>(
                              `[data-personal-material="${id}"] button`
                            )
                            ?.focus()
                        );
                      }}
                    >
                      <h4>{materialDraft.id ? "자료 수정" : "새 자료"}</h4>
                      <Input
                        ref={materialTitle}
                        name="title"
                        aria-label="자료 이름"
                        placeholder="자료 이름"
                        value={materialDraft.title}
                        onChange={(e) =>
                          setMaterialDraft((v) => ({
                            ...v,
                            title: e.target.value,
                          }))
                        }
                        required
                      />
                      <Textarea
                        name="text"
                        aria-label="자료 내용"
                        placeholder="메모"
                        value={materialDraft.text}
                        onChange={(e) =>
                          setMaterialDraft((v) => ({
                            ...v,
                            text: e.target.value,
                          }))
                        }
                        rows={3}
                      />
                      <Input
                        name="url"
                        aria-label="자료 링크"
                        placeholder="https:// 링크 (선택)"
                        value={materialDraft.url}
                        onChange={(e) =>
                          setMaterialDraft((v) => ({
                            ...v,
                            url: e.target.value,
                          }))
                        }
                        aria-invalid={urlError || undefined}
                        aria-describedby={
                          urlError ? `${editorId}-url-error` : undefined
                        }
                      />
                      {urlError && (
                        <p
                          id={`${editorId}-url-error`}
                          className={s.fieldError}
                        >
                          https:// 또는 http://로 시작하는 주소를 입력하세요.
                        </p>
                      )}
                      <div className={s.featureActions}>
                        <MuteButton
                          variant="dark"
                          type="submit"
                          disabled={
                            !materialDraft.title.trim() ||
                            (!materialDraft.text.trim() &&
                              !materialDraft.url.trim()) ||
                            urlError
                          }
                        >
                          자료 저장
                        </MuteButton>
                        <Quiet onClick={() => setAdding(false)}>접기</Quiet>
                        <Quiet
                          onClick={() => {
                            setMaterialDraft(emptyMaterial);
                            setAdding(false);
                          }}
                        >
                          입력 취소
                        </Quiet>
                      </div>
                    </form>
                  )}
                </section>
              </>
            )}
            {section === "activity" && (
              <>
                <section className={s.workspaceGroup}>
                  <div className={s.groupTitle}>
                    <h3 data-view-title tabIndex={-1}>
                      첫 통화 메모
                    </h3>
                    {noteDraft === null && (
                      <Quiet onClick={() => setNoteDraft(note)}>수정</Quiet>
                    )}
                  </div>
                  {noteDraft !== null ? (
                    <>
                      <Textarea
                        aria-label="첫 통화 메모"
                        rows={5}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                      />
                      <div className={s.featureActions}>
                        <MuteButton
                          size="sm"
                          variant="dark"
                          onClick={() => {
                            setNote(noteDraft.trim());
                            setNoteDraft(null);
                          }}
                        >
                          메모 저장
                        </MuteButton>
                        <Quiet onClick={() => setNoteDraft(null)}>취소</Quiet>
                      </div>
                    </>
                  ) : (
                    <div className={s.notePreview}>
                      <Reading text={note} />
                    </div>
                  )}
                </section>
                <section className={s.workspaceGroup}>
                  <div className={s.groupTitle}>
                    <h3>면접 메모</h3>
                    {interviewNoteDraft === null && (
                      <Quiet
                        onClick={() => setInterviewNoteDraft(interviewNote)}
                      >
                        {interviewNote ? "수정" : "메모 쓰기"}
                      </Quiet>
                    )}
                  </div>
                  {interviewNoteDraft !== null ? (
                    <>
                      <Textarea
                        aria-label="면접 메모"
                        rows={4}
                        value={interviewNoteDraft}
                        onChange={(e) => setInterviewNoteDraft(e.target.value)}
                        placeholder="기억해둘 답변이나 면접에서 느낀 점"
                      />
                      <div className={s.featureActions}>
                        <MuteButton
                          size="sm"
                          variant="dark"
                          onClick={() => {
                            setInterviewNote(interviewNoteDraft.trim());
                            setInterviewNoteDraft(null);
                          }}
                        >
                          면접 메모 저장
                        </MuteButton>
                        <Quiet onClick={() => setInterviewNoteDraft(null)}>
                          취소
                        </Quiet>
                      </div>
                    </>
                  ) : interviewNote ? (
                    <div className={s.notePreview}>
                      <Reading text={interviewNote} />
                    </div>
                  ) : null}
                </section>
                <section className={s.workspaceGroup}>
                  <div className={s.groupTitle}>
                    <h3>진행 기록</h3>
                  </div>
                  <ol className={s.activityTimeline}>
                    {timeline.map((event) => (
                      <li key={event.date}>
                        <time>{event.date}</time>
                        <div>
                          <strong>{event.title}</strong>
                          <p>{event.description}</p>
                          {event.title === "지원서 제출" && (
                            <Quiet
                              onClick={() => {
                                setSection("materials");
                                focusPage();
                              }}
                            >
                              제출한 자료 보기 <ArrowRight size={12} />
                            </Quiet>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
