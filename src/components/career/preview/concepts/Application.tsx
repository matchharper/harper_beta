// career-i18n-skip-file: Synthetic application preview.
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Quiet, Reading } from "./shared";
import s from "./Concepts.module.css";

const original = "LLM 기반 검색 시스템 개발. RAG 파이프라인 구축 및 배포.";
const tailored =
  "고객 인터뷰에서 반복 문의의 원인을 정의하고, 내부 문서 검색을 위한 RAG 시스템을 설계·배포했습니다. 검색 평가와 운영 모니터링을 구축했습니다.";
const recipient = "careers@novalabs.example";
const subject = "Forward Deployed Engineer 지원 · 김지민";
const initialEmail =
  "안녕하세요, 노바랩스 채용팀.\n\nForward Deployed Engineer 역할에 지원하는 김지민입니다. 고객의 반복 문의를 줄이기 위한 문서 검색 시스템을 문제 정의부터 배포까지 맡았습니다.\n\n고객의 요구를 공통 제품 개선으로 연결하는 방식에 관심이 있습니다. 제 경험을 더 자세히 나눌 기회가 있으면 좋겠습니다.\n\n감사합니다.\n김지민";

type ApplicationView = "resume" | "email" | "evidence" | "review" | "done";
export function usePreviewApplication() {
  const [resume, setResume] = useState(true);
  const [email, setEmail] = useState(false);
  const [emailBody, setEmailBody] = useState(initialEmail);
  const [evidence, setEvidence] = useState("");
  const [evidenceDraft, setEvidenceDraft] = useState("");
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const [view, setView] = useState<ApplicationView>("resume");
  const navigate = (next: ApplicationView) => {
    const missingMail = next === "review" && email && !emailBody.trim();
    if (next === "review") setReviewAttempted(missingMail);
    setView(missingMail ? "email" : next);
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>(
        "main:not([hidden]) [data-application-title]"
      );
      heading?.closest("main")?.scrollTo(0, 0);
      if (missingMail)
        document
          .querySelector<HTMLTextAreaElement>("#concept-email-body")
          ?.focus();
      else heading?.focus({ preventScroll: true });
    });
  };
  return {
    resume,
    setResume,
    email,
    setEmail,
    emailBody,
    setEmailBody,
    evidence,
    setEvidence,
    evidenceDraft,
    setEvidenceDraft,
    invalidMail: reviewAttempted && email && !emailBody.trim(),
    view,
    navigate,
  };
}
type ApplicationState = ReturnType<typeof usePreviewApplication>;

export function ApplicationChecklist({
  state,
  onOpen,
}: {
  state: ApplicationState;
  onOpen: (view: ApplicationView) => void;
}) {
  const { resume, setResume, email, setEmail, view } = state;
  const checklist = useRef<HTMLDivElement>(null);
  return (
    <Card className={s.applicationChecklist} ref={checklist}>
      {view === "done" ? (
        <>
          <div className={s.submissionFile}>
            <Check size={18} />
            <div>
              지원 후 화면 예시
              <small>프리뷰에서 선택한 자료를 확인할 수 있어요.</small>
            </div>
          </div>
          <Quiet onClick={() => onOpen("resume")}>
            선택 다시 보기 <ArrowRight size={13} />
          </Quiet>
        </>
      ) : view === "review" ? (
        <>
          <h3>이대로 지원할까요?</h3>
          <ul className={s.confirmActions}>
            <li>
              <FileText size={15} />{" "}
              <span>
                채용 페이지에 {resume ? "맞춤 이력서" : "기존 이력서"} 제출
              </span>
            </li>
            {email && (
              <li>
                <Check size={15} /> <span>채용팀에 소개 메일 발송</span>
              </li>
            )}
          </ul>
          <div className={s.checkFooter}>
            <Quiet
              onClick={() => {
                onOpen("resume");
                requestAnimationFrame(() =>
                  checklist.current
                    ?.querySelector<HTMLInputElement>('input[type="checkbox"]')
                    ?.focus()
                );
              }}
            >
              <ArrowLeft size={13} /> 선택 수정
            </Quiet>
            <MuteButton variant="dark" onClick={() => onOpen("done")}>
              지원 후 화면 보기 <ArrowRight size={14} />
            </MuteButton>
          </div>
        </>
      ) : (
        <>
          <h3>이번 지원에 포함할 항목</h3>
          <div className={s.checkItems}>
            <div className={s.checkItem}>
              <div className={s.checkChoice}>
                <Checkbox
                  label={
                    <span className="font-medium text-neutral-primary">
                      맞춤 이력서
                    </span>
                  }
                  checked={resume}
                  onChange={(e) => setResume(e.target.checked)}
                  size="medium"
                />
                <small>고객과 문제를 정의한 경험 강조</small>
              </div>
              <Quiet
                aria-current={
                  view === "resume" || view === "evidence" ? "true" : undefined
                }
                onClick={() => onOpen("resume")}
              >
                변경 보기
              </Quiet>
            </div>
            <div className={s.checkItem}>
              <div className={s.checkChoice}>
                <Checkbox
                  label={
                    <span className="font-medium text-neutral-primary">
                      채용팀 소개 메일
                    </span>
                  }
                  checked={email}
                  onChange={(e) => setEmail(e.target.checked)}
                  size="medium"
                />
                <small>채용 페이지 지원과 별도로 발송</small>
              </div>
              <Quiet
                aria-current={view === "email" ? "true" : undefined}
                onClick={() => onOpen("email")}
              >
                초안 보기
              </Quiet>
            </div>
          </div>
          <div className={s.checkFooter}>
            <small aria-live="polite">
              {resume ? "맞춤 이력서" : "기존 이력서"}
              {email ? " + 소개 메일" : ""}
            </small>
            <MuteButton variant="dark" onClick={() => onOpen("review")}>
              지원 내용 확인 <ArrowRight size={14} />
            </MuteButton>
          </div>
        </>
      )}
    </Card>
  );
}

export function Application({ state }: { state: ApplicationState }) {
  const {
    resume,
    email,
    evidence,
    setEvidence,
    evidenceDraft,
    setEvidenceDraft,
    invalidMail,
    emailBody,
    setEmailBody,
    view,
    navigate,
  } = state;
  const resumeName = resume ? "김지민_노바랩스_FDE.pdf" : "김지민_이력서.pdf";
  const title = {
    resume: "맞춤 이력서",
    email: "채용팀 소개 메일",
    evidence: "프로젝트 성과 보강",
    review: "제출 전 확인",
    done: "지원 후 화면 예시",
  }[view];

  return (
    <div className={s.applicationReading}>
      <header className={s.readerHeader}>
        <p>{view === "done" ? "지원 기록 · 프리뷰" : "노바랩스 · 지원 준비"}</p>
        <h2 data-application-title tabIndex={-1}>
          {title}
        </h2>
      </header>
      {view === "resume" && (
        <>
          {!resume && <p className={s.meta}>현재 선택 · 기존 이력서</p>}
          <div className={s.resumeDiff}>
            <div>
              <h3>기존 문장</h3>
              <Reading text={original} />
            </div>
            <div>
              <h3>변경 문장</h3>
              <Reading text={tailored} />
              {evidence.trim() && <Reading text={evidence} />}
            </div>
          </div>
          <div className={s.featureActions}>
            <Quiet onClick={() => navigate("evidence")}>
              {evidence.trim() ? "보강한 내용 수정" : "프로젝트 성과 보강"}{" "}
              <ArrowRight size={13} />
            </Quiet>
          </div>
        </>
      )}
      {view === "email" && (
        <>
          <p className={s.meta}>
            {email ? "이번 지원에 포함" : "선택하지 않은 초안"}
          </p>
          <dl className={s.deliveryDetails}>
            <div>
              <dt>받는 사람</dt>
              <dd>{recipient}</dd>
            </div>
            <div>
              <dt>제목</dt>
              <dd>{subject}</dd>
            </div>
          </dl>
          <Textarea
            id="concept-email-body"
            aria-label="소개 메일 본문"
            aria-invalid={invalidMail || undefined}
            aria-describedby={invalidMail ? "concept-email-error" : undefined}
            rows={10}
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
          />
          {invalidMail && (
            <p id="concept-email-error" role="alert" className={s.fieldError}>
              메일 본문을 작성하거나 왼쪽에서 메일 선택을 해제해 주세요.
            </p>
          )}
        </>
      )}
      {view === "evidence" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEvidence(evidenceDraft.trim());
            navigate("resume");
          }}
        >
          <label className={s.evidenceLabel} htmlFor="concept-evidence">
            배포한 뒤 고객의 업무가 어떻게 달라졌나요?
          </label>
          <Textarea
            id="concept-evidence"
            name="evidence"
            rows={4}
            value={evidenceDraft}
            onChange={(e) => setEvidenceDraft(e.target.value)}
            placeholder="직접 확인한 변화나 고객 반응을 적어주세요."
          />
          <div className={s.featureActions}>
            <MuteButton
              type="submit"
              variant="dark"
              disabled={evidenceDraft.trim() === evidence}
            >
              {evidenceDraft.trim() ? "맞춤 이력서에 반영" : "보강 내용 제거"}
            </MuteButton>
            <Quiet
              onClick={() => {
                setEvidenceDraft(evidence);
                navigate("resume");
              }}
            >
              변경 취소
            </Quiet>
          </div>
        </form>
      )}
      {(view === "review" || view === "done") && (
        <>
          <Card className={s.submissionCard}>
            <div className={s.groupTitle}>
              <h3>채용 페이지</h3>
              <span>노바랩스</span>
            </div>
            <div className={s.submissionFile}>
              <FileText size={18} />
              <div>
                {resumeName}
                <small>{resume ? "맞춤 이력서" : "기존 이력서"}</small>
              </div>
            </div>
            <h4 className={s.submissionExcerpt}>프로젝트 문장 발췌</h4>
            <Reading
              text={
                resume
                  ? [tailored, evidence.trim()].filter(Boolean).join("\n\n")
                  : original
              }
            />
          </Card>
          {email && (
            <Card className={s.submissionCard}>
              <div className={s.groupTitle}>
                <h3>소개 메일</h3>
                <span>{recipient}</span>
              </div>
              <p className={s.mailSubject}>{subject}</p>
              <Reading text={emailBody} />
            </Card>
          )}
          {view === "done" && (
            <div className={s.featureActions}>
              <span className={s.meta}>프리뷰 · 가상 지원 기록</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
