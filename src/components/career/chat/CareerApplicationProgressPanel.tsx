import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useCareerOpenForms, type CareerOpenFormsSnapshot } from "@/hooks/career/useCareerOpenForms";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import {
  careerApplicationCounts,
  careerApplicationPercent,
  type CareerApplicationProgress,
  type CareerApplicationStep,
  type CareerApplicationSubStep,
} from "@/lib/career/applicationProgress/types";
// The timeline's own time format ("오늘 오후 4:52"), so the panel and the conversation read the same.
import { formatChatDateDividerLabel } from "@/lib/chat/dateDivider";
import { cn } from "@/lib/utils";
import { CareerAnimatedRegion } from "../CareerAnimatedRegion";
import { useCareerFormRevealer } from "./CareerFormReferenceProvider";
import { useBrowserSessionOpener } from "../BrowserSessionDock";

type T = ReturnType<typeof useCareerT>;
type Locale = "ko" | "en";
/** you: waits on the person. working: Harper is on it (or between steps). */
type Tone = "done" | "skipped" | "failed" | "you" | "working" | "todo";

/** The work poll carries the list; a response without it (older server) means no applications. */
export function careerApplicationsOf(snapshot: CareerOpenFormsSnapshot | undefined): CareerApplicationProgress[] {
  return Array.isArray(snapshot?.applications) ? snapshot.applications : [];
}

const currentStep = (app: CareerApplicationProgress) => app.steps.find(step => step.state === "current");
const currentSub = (step: CareerApplicationStep | undefined) => step?.subSteps?.find(sub => sub.state === "current");
const finishedSteps = (app: CareerApplicationProgress) =>
  app.steps.filter(step => step.state === "done" || step.state === "skipped").length;

function mainTone(step: CareerApplicationStep, app: CareerApplicationProgress): Tone {
  if (step.state !== "current") return step.state;
  // A sub-step that waits on the person carries the "you" mark; the main step stays in progress around it.
  return app.status === "needs_you" && !currentSub(step) ? "you" : "working";
}
const subTone = (sub: CareerApplicationSubStep, app: CareerApplicationProgress): Tone =>
  sub.state === "current" ? (app.status === "needs_you" ? "you" : "working") : sub.state;

/** Re-renders while something runs so "N분째" advances even when polls return the same data. */
function useNow(ticking: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [ticking]);
  return now;
}

function elapsed(at: string | undefined, now: number, t: T) {
  const started = at ? Date.parse(at) : Number.NaN;
  if (Number.isNaN(started)) return null;
  const minutes = Math.floor((now - started) / 60_000);
  if (minutes < 1) return null;
  return minutes < 60
    ? t("career.applicationProgress.elapsed_minutes", "{count}분째", { values: { count: minutes } })
    : t("career.applicationProgress.elapsed_hours", "{count}시간째", { values: { count: Math.floor(minutes / 60) } });
}

function applicationName(app: CareerApplicationProgress, t: T) {
  const parts = [app.companyName, app.title].map(part => part?.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : t("career.applicationProgress.untitled", "이름 없는 공고");
}

const siteName = (sub: CareerApplicationSubStep | undefined, t: T) =>
  sub?.site?.trim() || t("career.applicationProgress.sub.site", "사이트");

function stepLabel(step: CareerApplicationStep, working: boolean, t: T) {
  switch (step.key) {
    case "confirm": return t("career.applicationProgress.step.confirm", "지원 확인");
    case "fill": return working
      ? t("career.applicationProgress.step.fill_working", "회사 양식 채우는 중")
      : t("career.applicationProgress.step.fill", "회사 양식 채우기");
    case "review": return t("career.applicationProgress.step.review", "내 답 확인");
    case "submit": return working
      ? t("career.applicationProgress.step.submit_working", "제출 중")
      : t("career.applicationProgress.step.submit", "제출");
  }
}

function subStepLabel(sub: CareerApplicationSubStep, t: T) {
  switch (sub.key) {
    case "login": return t("career.applicationProgress.sub.login", "{site} 로그인", { values: { site: siteName(sub, t) } });
    case "verification_code": return t("career.applicationProgress.sub.verification_code", "메일 인증 코드");
    case "new_question": return t("career.applicationProgress.sub.new_question", "새 질문");
    case "retry": return t("career.applicationProgress.sub.retry", "다시 시도");
  }
}

/** What the person is asked to do, in one line. */
function askLine(step: CareerApplicationStep | undefined, sub: CareerApplicationSubStep | undefined, t: T) {
  if (sub?.key === "login") return t("career.applicationProgress.ask.login", "{site} 로그인이 필요해요", { values: { site: siteName(sub, t) } });
  if (sub?.key === "verification_code") return t("career.applicationProgress.ask.code", "메일 인증 코드가 필요해요");
  if (sub?.key === "new_question") return t("career.applicationProgress.ask.new_question", "새 질문에 답해 주세요");
  if (step?.key === "confirm") return t("career.applicationProgress.ask.confirm", "지원 확인 폼에 답해 주세요");
  if (step?.key === "review") return t("career.applicationProgress.ask.review", "내 답을 확인해 주세요");
  return t("career.applicationProgress.ask.default", "확인이 필요해요");
}

/** What Harper is doing now, in one line. */
function workingLine(step: CareerApplicationStep | undefined, sub: CareerApplicationSubStep | undefined, t: T) {
  switch (sub?.key) {
    case "login": return t("career.applicationProgress.working.login", "{site} 로그인하는 중", { values: { site: siteName(sub, t) } });
    case "verification_code": return t("career.applicationProgress.working.code", "메일 인증 코드 확인하는 중");
    case "new_question": return t("career.applicationProgress.working.new_question", "새 질문 살펴보는 중");
    case "retry": return t("career.applicationProgress.working.retry", "다시 시도하는 중");
  }
  switch (step?.key) {
    case "confirm": return t("career.applicationProgress.working.confirm", "지원 확인하는 중");
    case "review": return t("career.applicationProgress.working.review", "내 답 확인하는 중");
    case "fill":
    case "submit": return stepLabel(step, true, t);
    default: return t("career.applicationProgress.working.default", "진행 중");
  }
}

function submittedLine(app: CareerApplicationProgress, t: T, locale: Locale) {
  const at = app.submittedAt ?? app.steps.find(step => step.key === "submit")?.at ?? app.updatedAt;
  const time = at ? formatChatDateDividerLabel(at, locale) : "";
  return time
    ? t("career.applicationProgress.submitted_at", "제출 완료 · {time}", { values: { time } })
    : t("career.applicationProgress.submitted", "제출 완료");
}

const stoppedLine = (app: CareerApplicationProgress, t: T) =>
  app.status === "closed" || app.failure?.reason === "closed"
    ? t("career.applicationProgress.closed", "마감된 공고예요")
    : t("career.applicationProgress.failed", "제출하지 못했어요");

const waitingLine = (t: T) => t("career.applicationProgress.waiting", "Harper가 다음 단계를 준비하는 중");

/** The one status line under a row's name. */
function statusLine(app: CareerApplicationProgress, now: number, t: T, locale: Locale): { text: string; critical?: boolean } {
  const step = currentStep(app);
  const sub = currentSub(step);
  switch (app.status) {
    case "submitted": return { text: submittedLine(app, t, locale) };
    case "failed":
    case "closed": return { text: stoppedLine(app, t), critical: true };
    case "needs_you": return { text: askLine(step, sub, t) };
    case "running": {
      const line = workingLine(step, sub, t);
      const time = elapsed((sub ?? step)?.at, now, t);
      return { text: time ? `${line} · ${time}` : line };
    }
    default: return { text: waitingLine(t) };
  }
}

function StepDot({ tone, small = false }: { tone: Tone; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border",
        small ? "mt-0.5 size-4" : "size-5",
        tone === "done" && "border-neutral-primary bg-neutral-primary text-neutral-00",
        tone === "failed" && "border-critical bg-critical text-neutral-00",
        tone === "you" && "border-action bg-action",
        tone === "working" && "border-2 border-action",
        tone === "skipped" && "border-dashed border-neutral-primary/30",
        tone === "todo" && "border-neutral-primary/15"
      )}
    >
      {tone === "done" ? <Check className={small ? "size-2.5" : "size-3"} strokeWidth={3} /> : null}
      {tone === "failed" ? <X className={small ? "size-2.5" : "size-3"} strokeWidth={3} /> : null}
      {tone === "working" ? <span className="size-1.5 rounded-full bg-action motion-safe:animate-pulse" /> : null}
    </span>
  );
}

function StepLine({ tone, label, detail, small, t }: {
  tone: Tone; label: string; detail?: string | null; small?: boolean; t: T;
}) {
  // The dot is decorative, so its meaning is also spoken.
  const spoken = tone === "done" ? t("career.applicationProgress.state.done", "완료")
    : tone === "you" ? t("career.applicationProgress.state.you", "답 필요")
    : tone === "working" ? t("career.applicationProgress.state.working", "진행 중")
    : tone === "failed" ? t("career.applicationProgress.state.failed", "멈춤")
    : null;
  return (
    <div className="flex items-start gap-2.5 text-[13px] leading-5">
      <StepDot tone={tone} small={small} />
      <span className="min-w-0">
        <span className={tone === "todo" ? "text-neutral-primary/45" : "text-neutral-primary"}>{label}</span>
        {spoken ? <span className="sr-only">{` (${spoken})`}</span> : null}
        {detail ? <span className="block text-[12px] leading-[18px] text-neutral-muted">{detail}</span> : null}
      </span>
    </div>
  );
}

function mainDetail(step: CareerApplicationStep, app: CareerApplicationProgress, now: number, t: T, locale: Locale) {
  if (step.state === "skipped") return t("career.applicationProgress.step.skipped", "건너뜀 · 물을 게 없었어요");
  if (step.state === "done" && step.at && (step.key === "confirm" || step.key === "review")) {
    const time = formatChatDateDividerLabel(step.at, locale);
    return time ? t("career.applicationProgress.step.answered", "{time} 답함", { values: { time } }) : null;
  }
  if (step.state !== "current" || currentSub(step)) return null;
  if (app.status === "needs_you") return askLine(step, undefined, t);
  if (app.status === "running") return elapsed(step.at, now, t);
  if (app.status === "waiting") return waitingLine(t);
  return null;
}

function subDetail(sub: CareerApplicationSubStep, step: CareerApplicationStep, app: CareerApplicationProgress, now: number, t: T) {
  if (sub.state !== "current") return null;
  if (app.status === "running") return elapsed(sub.at, now, t);
  if (app.status !== "needs_you") return null;
  if (sub.key === "login") return t("career.applicationProgress.sub.login_hint", "로그인하면 이어서 채워요");
  if (sub.key === "verification_code") return app.action?.kind === "open_browser"
    ? t("career.applicationProgress.sub.code_hint", "메일로 받은 코드를 넣어 주세요")
    : t("career.applicationProgress.sub.code_chat_hint", "메일로 받은 코드를 채팅으로 보내 주세요");
  if (sub.key === "new_question") return askLine(step, sub, t);
  return null;
}

/** One application's four steps, in the job page progress box's language (OneScreenProgressBox). */
function ApplicationSteps({ app, now, t, locale }: { app: CareerApplicationProgress; now: number; t: T; locale: Locale }) {
  const titleId = useId();
  const finished = finishedSteps(app);
  const percent = careerApplicationPercent(app);
  const stopped = app.status === "failed" || app.status === "closed";
  return (
    <div className="rounded-md border border-stroke-subtle bg-bg-floating/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <p id={titleId} className="text-[13px] font-medium leading-5 text-neutral-primary">
          {app.status === "submitted"
            ? submittedLine(app, t, locale)
            : t("career.applicationProgress.box.title", "제출까지 4단계 중 {count}단계", { values: { count: finished } })}
        </p>
        <span className="text-[13px] tabular-nums text-neutral-primary/50" aria-hidden="true">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={titleId}
        aria-valuemin={0}
        aria-valuemax={app.steps.length}
        aria-valuenow={finished}
        className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-1000-a10"
      >
        <div
          className="h-full rounded-full bg-neutral-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="mt-3 space-y-2">
        {app.steps.map(step => {
          const tone = mainTone(step, app);
          return (
            <li key={step.key} aria-current={step.state === "current" ? "step" : undefined}>
              <StepLine
                t={t}
                tone={tone}
                label={stepLabel(step, tone === "working" && app.status === "running", t)}
                detail={mainDetail(step, app, now, t, locale)}
              />
              {step.subSteps?.length ? (
                <ul className="mt-2 space-y-2 pl-[30px]">
                  {step.subSteps.map((sub, index) => (
                    <li key={`${sub.key}-${index}`}>
                      <StepLine small t={t} tone={subTone(sub, app)} label={subStepLabel(sub, t)}
                        detail={subDetail(sub, step, app, now, t)} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
      {stopped ? <p className="mt-3 text-[12px] leading-[18px] text-critical">{stoppedLine(app, t)}</p> : null}
    </div>
  );
}

function Segments({ steps }: { steps: CareerApplicationStep[] }) {
  return (
    <span aria-hidden="true" className="grid shrink-0 grid-cols-[repeat(4,14px)] gap-[3px]">
      {steps.map(step => (
        <span
          key={step.key}
          className={cn(
            "h-1 rounded-full",
            step.state === "done" || step.state === "skipped" ? "bg-neutral-primary"
              : step.state === "current" ? "bg-action"
              : step.state === "failed" ? "bg-critical"
              : "bg-neutral-1000-a10"
          )}
        />
      ))}
    </span>
  );
}

function ApplicationRow({ app, open, onToggle, onAnswered, now, t, locale }: {
  app: CareerApplicationProgress;
  open: boolean;
  onToggle: () => void;
  onAnswered: () => void;
  now: number;
  t: T;
  locale: Locale;
}) {
  const stepsId = useId();
  const { canReveal, reveal } = useCareerFormRevealer();
  const name = applicationName(app, t);
  const line = statusLine(app, now, t, locale);
  const formId = app.action?.kind === "answer_form" && canReveal(app.action.formId) ? app.action.formId : null;
  // A site login waits in Harper's browser: open it where the timeline shows it.
  const openBrowser = useBrowserSessionOpener(app.action?.kind === "open_browser" ? app.action.sessionId : null);
  return (
    <li className="border-t border-stroke-subtle first:border-t-0">
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? stepsId : undefined}
          onClick={onToggle}
          className="-mx-1.5 min-w-0 flex-1 rounded-lg px-1.5 py-0.5 text-left outline-none transition-colors hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[13px] font-medium leading-5 text-neutral-primary">{name}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 shrink-0 text-neutral-soft transition-transform motion-reduce:transition-none", open && "rotate-180")}
            />
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <Segments steps={app.steps} />
            <span className={cn("truncate text-[12px] leading-[18px]", line.critical ? "text-critical" : "text-neutral-muted")}>
              {line.text}
            </span>
          </span>
        </button>
        {formId !== null ? (
          <MuteButton
            size="sm"
            variant="dark"
            aria-label={t("career.applicationProgress.answer_label", "{name} 답하기", { values: { name } })}
            className="shrink-0 border-action bg-action text-on-inverse hover:border-action-strong hover:bg-action-strong active:border-action-strong active:bg-action-strong"
            onClick={() => { reveal(formId); onAnswered(); }}
          >
            {t("career.applicationProgress.answer", "답하기")}
          </MuteButton>
        ) : openBrowser ? (
          <MuteButton
            size="sm"
            variant="dark"
            aria-label={t("career.applicationProgress.open_browser_label", "{name} 브라우저 열기", { values: { name } })}
            className="shrink-0 border-action bg-action text-on-inverse hover:border-action-strong hover:bg-action-strong active:border-action-strong active:bg-action-strong"
            onClick={() => { openBrowser(); onAnswered(); }}
          >
            {t("career.applicationProgress.open_browser", "브라우저 열기")}
          </MuteButton>
        ) : null}
      </div>
      <CareerAnimatedRegion open={open}>
        <div id={stepsId} className="pb-2.5">
          <ApplicationSteps app={app} now={now} t={t} locale={locale} />
        </div>
      </CareerAnimatedRegion>
    </li>
  );
}

function Count({ children, emphasis = false }: { children: ReactNode; emphasis?: boolean }) {
  return (
    <span className={cn(
      "whitespace-nowrap rounded-full px-2 text-[12px] leading-5",
      emphasis ? "bg-action-faded font-medium text-action" : "bg-bg-weak text-neutral-muted"
    )}>
      {children}
    </span>
  );
}

/**
 * Where each delegated application stands, above the composer. Collapsed to one line by default; shown while a
 * reply streams too, because it reports recorded progress rather than asking anything.
 */
export function CareerApplicationProgressPanel({ conversationId }: { conversationId?: string | null }) {
  const t = useCareerT();
  const { locale } = useMessages();
  const forms = useCareerOpenForms(conversationId);
  const applications = careerApplicationsOf(forms.data);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const listId = useId();
  const now = useNow(applications.some(app => app.status === "running"));
  if (!applications.length) return null;
  const counts = careerApplicationCounts(applications);
  return (
    <section
      aria-label={t("career.applicationProgress.label", "지원 진행")}
      className="career-glass career-work-surface mb-2 overflow-hidden"
      data-career-application-progress=""
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        onClick={() => setExpanded(value => !value)}
        className="flex min-h-9 w-full items-center gap-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
      >
        <span aria-live="polite" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="whitespace-nowrap text-[13px] font-medium leading-5 text-neutral-primary">
            {t("career.applicationProgress.summary.total", "지원 {count}건", { values: { count: counts.total } })}
          </span>
          {counts.submitted ? <Count>{t("career.applicationProgress.summary.submitted", "제출 {count}", { values: { count: counts.submitted } })}</Count> : null}
          {counts.needsYou ? <Count emphasis>{t("career.applicationProgress.summary.needs_you", "답 필요 {count}", { values: { count: counts.needsYou } })}</Count> : null}
          {counts.inProgress ? <Count>{t("career.applicationProgress.summary.in_progress", "진행 중 {count}", { values: { count: counts.inProgress } })}</Count> : null}
          {counts.stopped ? <Count>{t("career.applicationProgress.summary.stopped", "멈춤 {count}", { values: { count: counts.stopped } })}</Count> : null}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-[12px] leading-5 text-neutral-muted">
          {expanded ? t("career.applicationProgress.collapse", "접기") : t("career.applicationProgress.expand", "펼치기")}
          {expanded ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronUp aria-hidden="true" className="size-3.5" />}
        </span>
      </button>
      <CareerAnimatedRegion open={expanded}>
        {/* Its own scroll keeps the composer and the chat usable on short phone screens. */}
        <div id={listId} className="max-h-[min(340px,40dvh)] overflow-y-auto overscroll-contain md:max-h-[min(440px,50dvh)] border-t border-stroke-subtle px-3">
          <ul aria-label={t("career.applicationProgress.list", "지원 목록")}>
            {applications.map(app => (
              <ApplicationRow
                key={app.id}
                app={app}
                open={openId === app.id}
                onToggle={() => setOpenId(current => (current === app.id ? null : app.id))}
                onAnswered={() => setExpanded(false)}
                now={now}
                t={t}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      </CareerAnimatedRegion>
    </section>
  );
}
