import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
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
import type { CareerOpportunityMention } from "@/lib/career/opportunityMentionText";
// The timeline's own time format ("오늘 오후 4:52"), so the panel and the conversation read the same.
import { formatChatDateDividerLabel } from "@/lib/chat/dateDivider";
import { cn } from "@/lib/utils";
import { CareerAnimatedRegion } from "../CareerAnimatedRegion";
import { CareerFormReferenceProvider, useCareerFormRevealer } from "./CareerFormReferenceProvider";
import { CareerInlineForms } from "./CareerInlineForms";
import { BrowserSessionDock, useBrowserSessionOpener, type BrowserSessionReopen } from "../BrowserSessionDock";
import { useOptionalCareerChatPanelContext } from "../CareerChatPanelContext";

type T = ReturnType<typeof useCareerT>;
type Locale = "ko" | "en";
/** you: waits on the person. working: Harper is on it (or between steps). paused: the person stopped it. */
type Tone = "done" | "skipped" | "failed" | "you" | "working" | "todo" | "paused";

/** The work poll carries the list; a response without it (older server) means no applications. */
export function careerApplicationsOf(snapshot: CareerOpenFormsSnapshot | undefined): CareerApplicationProgress[] {
  return Array.isArray(snapshot?.applications) ? snapshot.applications : [];
}

const currentStep = (app: CareerApplicationProgress) => app.steps.find(step => step.state === "current");
const currentSub = (step: CareerApplicationStep | undefined) => step?.subSteps?.find(sub => sub.state === "current");
const subStepsOf = (app: CareerApplicationProgress) => app.steps.flatMap(step => step.subSteps ?? []);
const finishedSteps = (app: CareerApplicationProgress) =>
  app.steps.filter(step => step.state === "done" || step.state === "skipped").length;
/** The step the application is on (the first one not finished), 1 to 4. */
function stepNumber(app: CareerApplicationProgress) {
  const index = app.steps.findIndex(step => step.state !== "done" && step.state !== "skipped");
  return index < 0 ? app.steps.length : index + 1;
}
/** Stopped by the person (Stop, or closing the browser it waited on): said plainly, not as an error. */
const stoppedByPerson = (app: CareerApplicationProgress) => app.status === "failed" && app.failure?.reason === "stopped";
/**
 * The sub-step under way: the current step's. Only with no step under way, the newest current one (a login still open
 * in a finished step, while Harper goes on from the page the person returned); a submission is not that login.
 */
const activeSub = (app: CareerApplicationProgress) => {
  const step = currentStep(app);
  return step ? currentSub(step) : subStepsOf(app).filter(sub => sub.state === "current").at(-1);
};

/** The sub-step the person is asked about (a login, a code, a link or a new question), when the ask is one. */
function askedSub(app: CareerApplicationProgress) {
  if (app.status !== "needs_you") return undefined;
  const subs = subStepsOf(app);
  const current = (...keys: CareerApplicationSubStep["key"][]) =>
    subs.filter(sub => sub.state === "current" && keys.includes(sub.key)).at(-1);
  switch (app.action?.kind) {
    case "answer_form": return current("new_question");
    case "open_browser": return current("verification_code", "email_link") ?? current("login");
    case "reopen_browser": return subs.filter(sub => sub.key === "login" && sub.state === "failed").at(-1);
    // A code Harper asked for in chat, or a link in the person's mail.
    case undefined: return current("verification_code", "email_link");
    default: return undefined;
  }
}

function mainTone(step: CareerApplicationStep, app: CareerApplicationProgress, asked: CareerApplicationSubStep | undefined): Tone {
  if (stoppedByPerson(app) && (step.state === "current" || step.state === "failed")) return "paused";
  if (step.state !== "current") return step.state;
  // A sub-step that waits on the person carries the "you" mark; the main step stays in progress around it.
  return app.status === "needs_you" && (!asked || asked.state === "failed") ? "you" : "working";
}
const subTone = (sub: CareerApplicationSubStep, app: CareerApplicationProgress, asked: CareerApplicationSubStep | undefined): Tone =>
  stoppedByPerson(app) && sub.state !== "done" ? "paused"
    : sub.state === "current" ? (sub === asked ? "you" : "working") : sub.state;

/** Re-renders while something runs or a browser waits, so "N분째" and "N분 남음" move between polls too. */
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

/** Whole minutes until a waiting browser closes by itself (approximate); critical in the last 3. Nothing once past. */
function remaining(expiresAt: string | undefined, now: number, t: T) {
  const end = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isNaN(end) || end <= now) return null;
  const minutes = Math.ceil((end - now) / 60_000);
  return {
    text: t("career.applicationProgress.remaining_minutes", "{count}분 남음", { values: { count: minutes } }),
    critical: minutes <= 3,
  };
}

function applicationName(app: CareerApplicationProgress, t: T) {
  const parts = [app.companyName, app.title].map(part => part?.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : t("career.applicationProgress.untitled", "이름 없는 공고");
}

/** The chat mention that tells Harper which application a request is about. Only a role id can be mentioned. */
const mentionOf = (app: CareerApplicationProgress, t: T): CareerOpportunityMention | null =>
  app.kind === "opportunity" ? null : { label: applicationName(app, t), roleId: app.id };

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
    case "email_link": return t("career.applicationProgress.sub.email_link", "메일 인증 링크");
    case "new_question": return t("career.applicationProgress.sub.new_question", "새 질문");
    case "retry": return t("career.applicationProgress.sub.retry", "다시 시도");
  }
}

/** What the person is asked to do, in one line. */
function askLine(step: CareerApplicationStep | undefined, sub: CareerApplicationSubStep | undefined, t: T) {
  if (sub?.key === "login") return t("career.applicationProgress.ask.login", "{site} 로그인이 필요해요", { values: { site: siteName(sub, t) } });
  if (sub?.key === "verification_code") return t("career.applicationProgress.ask.code", "메일 인증 코드가 필요해요");
  if (sub?.key === "email_link") return t("career.applicationProgress.ask.email_link", "메일 인증 링크를 열어 주세요");
  if (sub?.key === "new_question") return t("career.applicationProgress.ask.new_question", "새 질문에 답해 주세요");
  if (step?.key === "confirm") return t("career.applicationProgress.ask.confirm", "지원 확인 폼에 답해 주세요");
  if (step?.key === "review") return t("career.applicationProgress.ask.review", "내 답을 확인해 주세요");
  return t("career.applicationProgress.ask.default", "확인이 필요해요");
}

const pausedLine = (t: T) => t("career.applicationProgress.paused", "진행이 멈췄어요");
const replyLine = (t: T) => t("career.applicationProgress.reply_in_chat", "Harper가 채팅에서 답을 기다려요");

/** A needs-you row's line: what its action asks. */
function needsYouLine(app: CareerApplicationProgress, asked: CareerApplicationSubStep | undefined, t: T) {
  switch (app.action?.kind) {
    case "continue": return pausedLine(t);
    case "reply_in_chat": return replyLine(t);
    case "reopen_browser": return t("career.applicationProgress.ask.login_closed", "{site} 로그인 창이 닫혔어요", { values: { site: siteName(asked, t) } });
    default: return askLine(currentStep(app), asked, t);
  }
}

/** What Harper is doing now, in one line. */
function workingLine(step: CareerApplicationStep | undefined, sub: CareerApplicationSubStep | undefined, t: T) {
  switch (sub?.key) {
    case "login": return t("career.applicationProgress.working.login", "{site} 로그인하는 중", { values: { site: siteName(sub, t) } });
    case "verification_code": return t("career.applicationProgress.working.code", "메일 인증 코드 확인하는 중");
    case "email_link": return t("career.applicationProgress.working.email_link", "메일 인증 기다리는 중");
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
    : stoppedByPerson(app)
      ? t("career.applicationProgress.stopped", "중단했어요")
      : t("career.applicationProgress.failed", "제출하지 못했어요");

/** At most this many history pages (20 messages each) are loaded to reach a form from the panel. */
const SEEK_PAGE_LIMIT = 25;

const waitingLine = (t: T) => t("career.applicationProgress.waiting", "Harper가 다음 단계를 준비하는 중");

/** The one status line under a row's name. */
function statusLine(app: CareerApplicationProgress, now: number, t: T, locale: Locale): { text: string; critical?: boolean } {
  const step = currentStep(app);
  const sub = activeSub(app);
  switch (app.status) {
    case "submitted": return { text: submittedLine(app, t, locale) };
    case "failed":
    case "closed": return { text: stoppedLine(app, t), critical: !stoppedByPerson(app) };
    case "needs_you": {
      const asked = askedSub(app);
      const line = needsYouLine(app, asked, t);
      // A browser waiting for the person closes by itself: say how long it still waits.
      const left = asked?.state === "current" ? remaining(asked.expiresAt, now, t) : null;
      return left ? { text: `${line} · ${left.text}`, critical: left.critical } : { text: line };
    }
    case "running": {
      const line = workingLine(step, sub, t);
      const time = elapsed((sub ?? step)?.at, now, t);
      return { text: time ? `${line} · ${time}` : line };
    }
    default: return { text: sub ? workingLine(step, sub, t) : waitingLine(t) };
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
        tone === "todo" && "border-neutral-primary/15",
        tone === "paused" && "border-neutral-primary/30 bg-neutral-1000-a10"
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
    : tone === "failed" || tone === "paused" ? t("career.applicationProgress.state.failed", "멈춤")
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
  // Only an answer the person gave reads "답함": a form closed without one (a Stop, an answer in chat) does not.
  if (step.state === "done" && step.answeredAt && (step.key === "confirm" || step.key === "review")) {
    const time = formatChatDateDividerLabel(step.answeredAt, locale);
    return time ? t("career.applicationProgress.step.answered", "{time} 답함", { values: { time } }) : null;
  }
  // Nothing moves it any more: said once, at the step it is on (a step not started yet when the last one finished).
  if (app.status === "needs_you" && (app.action?.kind === "continue" || app.action?.kind === "reply_in_chat")) {
    if (step !== app.steps[stepNumber(app) - 1]) return null;
    if (app.action.kind === "reply_in_chat") return replyLine(t);
    const time = formatChatDateDividerLabel(app.updatedAt, locale);
    return time
      ? t("career.applicationProgress.paused_detail", "{time} 이후 진행된 일이 없어요. Harper가 채팅에서 물어본 게 있으면 채팅에서 답해 주세요.", { values: { time } })
      : pausedLine(t);
  }
  if (step.state !== "current" || currentSub(step) || stoppedByPerson(app)) return null;
  if (app.status === "needs_you") {
    // The closed login below says it.
    return app.action?.kind === "reopen_browser" ? null : askLine(step, undefined, t);
  }
  if (app.status === "running") return elapsed(step.at, now, t);
  if (app.status === "waiting") return waitingLine(t);
  return null;
}

function subDetail(sub: CareerApplicationSubStep, step: CareerApplicationStep, app: CareerApplicationProgress,
  asked: CareerApplicationSubStep | undefined, reopenOffered: boolean, now: number, t: T) {
  if (sub === asked && sub.state === "failed")
    return reopenOffered ? t("career.applicationProgress.sub.login_closed_hint", "다시 열기를 누르면 Harper가 창을 다시 열어요") : null;
  if (sub.state !== "current") return null;
  if (app.status === "running") return elapsed(sub.at, now, t);
  if (sub !== asked) return null;
  const hint = sub.key === "login" ? t("career.applicationProgress.sub.login_hint", "로그인하면 이어서 채워요")
    : sub.key === "verification_code" ? app.action?.kind === "open_browser"
      ? t("career.applicationProgress.sub.code_hint", "메일로 받은 코드를 넣어 주세요")
      : t("career.applicationProgress.sub.code_chat_hint", "메일로 받은 코드를 채팅으로 보내 주세요")
    : sub.key === "email_link" ? t("career.applicationProgress.sub.email_link_hint", "사이트가 보낸 메일의 링크를 열어 주세요")
    : sub.key === "new_question" ? askLine(step, sub, t)
    : null;
  const left = remaining(sub.expiresAt, now, t);
  return hint && left ? `${hint} · ${left.text}` : hint;
}

/** One application's four steps, in the job page progress box's language (OneScreenProgressBox). */
function ApplicationSteps({ app, reopenOffered, now, t, locale }: {
  app: CareerApplicationProgress; reopenOffered: boolean; now: number; t: T; locale: Locale;
}) {
  const titleId = useId();
  const finished = finishedSteps(app);
  const percent = careerApplicationPercent(app);
  const stopped = app.status === "failed" || app.status === "closed";
  const asked = askedSub(app);
  return (
    <div className="rounded-md border border-stroke-subtle bg-bg-floating/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <p id={titleId} className="text-[13px] font-medium leading-5 text-neutral-primary">
          {app.status === "submitted"
            ? submittedLine(app, t, locale)
            : t("career.applicationProgress.box.title", "제출까지 4단계 중 {count}단계", { values: { count: stepNumber(app) } })}
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
          const tone = mainTone(step, app, asked);
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
                      <StepLine small t={t} tone={subTone(sub, app, asked)} label={subStepLabel(sub, t)}
                        detail={subDetail(sub, step, app, asked, reopenOffered, now, t)} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
      {stopped ? (
        <p className={cn("mt-3 text-[12px] leading-[18px]", stoppedByPerson(app) ? "text-neutral-muted" : "text-critical")}>
          {stoppedLine(app, t)}
        </p>
      ) : null}
    </div>
  );
}

function Segments({ app }: { app: CareerApplicationProgress }) {
  const paused = stoppedByPerson(app);
  return (
    <span aria-hidden="true" className="grid shrink-0 grid-cols-[repeat(4,14px)] gap-[3px]">
      {app.steps.map(step => (
        <span
          key={step.key}
          className={cn(
            "h-1 rounded-full",
            step.state === "done" || step.state === "skipped" ? "bg-neutral-primary"
              : paused && (step.state === "current" || step.state === "failed") ? "bg-neutral-primary/30"
              : step.state === "current" ? "bg-action"
              : step.state === "failed" ? "bg-critical"
              : "bg-neutral-1000-a10"
          )}
        />
      ))}
    </span>
  );
}

/**
 * Sends the person's own chat message about one application, with its mention so Harper takes the right one (as
 * "Harper와 지원하기" and the detail page's continue do). One at a time for the whole panel, also while its list is
 * folded; the chat shows a failed send itself.
 */
function useApplicationRequest() {
  const chat = useOptionalCareerChatPanelContext();
  const lock = useRef(false);
  const [sending, setSending] = useState(false);
  const send = useCallback(async (text: string, mention: CareerOpportunityMention) => {
    if (!chat || lock.current) return;
    lock.current = true;
    setSending(true);
    try {
      await chat.onSendChatMessage({ text, opportunityMentions: [mention] });
    } catch {
      // The shared chat handler shows the error and allows a retry.
    } finally {
      lock.current = false;
      setSending(false);
    }
  }, [chat]);
  return {
    send,
    available: Boolean(chat?.user && chat.conversationId),
    disabled: !chat || sending || Boolean(chat.chatPending || chat.assistantTyping),
  };
}

const reopenText = (name: string, t: T) =>
  t("career.applicationProgress.reopen_message", "{name} 로그인 창을 다시 열어 줘.", { values: { name } });
const continueText = (name: string, t: T) =>
  t("career.applicationProgress.continue_message", "{name} 진행을 이어서 해 줘.", { values: { name } });

/** Shows Harper's newest message, where a question it waits on is. */
function scrollToHarperReply(scroller: HTMLElement | null | undefined) {
  const replies = (scroller ?? document).querySelectorAll<HTMLElement>('[data-career-message-role="assistant"]');
  const latest = replies[replies.length - 1];
  if (latest) latest.scrollIntoView({ block: "start", behavior: "smooth" });
  else scroller?.scrollTo?.({ top: scroller.scrollHeight, behavior: "smooth" });
}

const PRIMARY = "shrink-0 border-action bg-action text-on-inverse hover:border-action-strong hover:bg-action-strong active:border-action-strong active:bg-action-strong";

type ApplicationRequest = ReturnType<typeof useApplicationRequest>;

function ApplicationRow({ app, open, onToggle, onAnswer, onAnswered, request, now, t, locale }: {
  app: CareerApplicationProgress;
  open: boolean;
  onToggle: () => void;
  onAnswer: (formId: number, name: string) => void;
  onAnswered: () => void;
  request: ApplicationRequest;
  now: number;
  t: T;
  locale: Locale;
}) {
  const stepsId = useId();
  const { canReveal } = useCareerFormRevealer();
  const chat = useOptionalCareerChatPanelContext();
  const name = applicationName(app, t);
  const line = statusLine(app, now, t, locale);
  const mention = mentionOf(app, t);
  const action = app.action;
  const answerFormId = action?.kind === "answer_form" ? action.formId : null;
  // A form not on screen is loaded from earlier history, or opened in a sheet: the button is always there with a chat.
  const formId = answerFormId !== null && (canReveal(answerFormId) || chat) ? answerFormId : null;
  // A site login waits in Harper's browser: open it where the timeline shows it.
  const openBrowser = useBrowserSessionOpener(action?.kind === "open_browser" ? action.sessionId : null);
  // The row stands for the application's open browser (its card no longer floats), so it can still be watched.
  const viewBrowser = useBrowserSessionOpener(openBrowser ? null : app.browserSessionId ?? null);
  // Asked in the person's own words in chat, like "Harper와 지원하기": no new mechanism behind the button.
  const asks = Boolean(mention && request.available);
  const reopen = asks && action?.kind === "reopen_browser";
  const resume = asks && action?.kind === "continue";
  const reply = Boolean(chat) && action?.kind === "reply_in_chat";
  const send = (text: string) => { if (mention) { onAnswered(); void request.send(text, mention); } };
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
            <Segments app={app} />
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
            className={PRIMARY}
            onClick={() => onAnswer(formId, name)}
          >
            {t("career.applicationProgress.answer", "답하기")}
          </MuteButton>
        ) : openBrowser ? (
          <MuteButton
            size="sm"
            variant="dark"
            aria-label={t("career.applicationProgress.open_browser_label", "{name} 브라우저 열기", { values: { name } })}
            className={PRIMARY}
            onClick={() => { openBrowser(); onAnswered(); }}
          >
            {t("career.applicationProgress.open_browser", "브라우저 열기")}
          </MuteButton>
        ) : reopen ? (
          <MuteButton
            size="sm"
            variant="dark"
            aria-label={t("career.applicationProgress.reopen_label", "{name} 로그인 창 다시 열기", { values: { name } })}
            className={PRIMARY}
            disabled={request.disabled}
            onClick={() => send(reopenText(name, t))}
          >
            {t("career.applicationProgress.reopen", "다시 열기")}
          </MuteButton>
        ) : resume ? (
          <MuteButton
            size="sm"
            // Stopped by the person: offered, not pressed on them.
            variant={app.status === "needs_you" ? "dark" : "default"}
            aria-label={t("career.applicationProgress.continue_label", "{name} 이어서 하기", { values: { name } })}
            className={app.status === "needs_you" ? PRIMARY : "shrink-0"}
            disabled={request.disabled}
            onClick={() => send(continueText(name, t))}
          >
            {t("career.applicationProgress.continue", "이어서 하기")}
          </MuteButton>
        ) : reply ? (
          <MuteButton
            size="sm"
            variant="dark"
            aria-label={t("career.applicationProgress.reply_label", "{name} 채팅에서 답하기", { values: { name } })}
            className={PRIMARY}
            onClick={() => { onAnswered(); scrollToHarperReply(chat?.scrollRef?.current); }}
          >
            {t("career.applicationProgress.answer", "답하기")}
          </MuteButton>
        ) : viewBrowser ? (
          <MuteButton
            size="sm"
            variant="default"
            aria-label={t("career.applicationProgress.view_browser_label", "{name} 브라우저 보기", { values: { name } })}
            className="shrink-0"
            onClick={() => { viewBrowser(); onAnswered(); }}
          >
            {t("career.applicationProgress.view_browser", "보기")}
          </MuteButton>
        ) : null}
      </div>
      <CareerAnimatedRegion open={open}>
        <div id={stepsId} className="pb-2.5">
          <ApplicationSteps app={app} reopenOffered={reopen} now={now} t={t} locale={locale} />
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
 * The browser dock above the composer, minus the browsers the panel's rows stand for: an application's browser is
 * opened from its row ("브라우저 열기", "보기") instead of floating as one more card over the others. A login browser
 * that closed while its viewer was open offers "다시 열기" there too.
 */
export function CareerApplicationBrowserDock({ conversationId }: { conversationId?: string | null }) {
  const t = useCareerT();
  const applications = careerApplicationsOf(useCareerOpenForms(conversationId).data);
  const key = applications.map(app => app.browserSessionId).filter(Boolean).join(" ");
  const claimed = useMemo(() => new Set(key ? key.split(" ") : []), [key]);
  const request = useApplicationRequest();
  const reopen = (sessionId: string): BrowserSessionReopen | null => {
    const app = applications.find(item => item.action?.kind === "reopen_browser" && item.action.sessionId === sessionId);
    const mention = app && mentionOf(app, t);
    if (!app || !mention || !request.available) return null;
    return { disabled: request.disabled, onReopen: () => void request.send(reopenText(mention.label, t), mention) };
  };
  return <BrowserSessionDock claimedSessionIds={claimed} reopen={reopen} />;
}

/** A form the timeline does not show (no reply placed it, or it is beyond the history loaded): answered here instead. */
function ApplicationFormSheet({ form, onClose, t }: { form: { formId: number; name: string }; onClose: () => void; t: T }) {
  return (
    <TalentCareerModal
      open
      onClose={onClose}
      mobileBottomSheet
      panelClassName="max-w-[560px]"
      title={t("career.applicationProgress.answer_label", "{name} 답하기", { values: { name: form.name } })}
    >
      {/* Its own references, so the sheet neither takes the form from the timeline nor counts as on screen. */}
      <CareerFormReferenceProvider>
        <CareerInlineForms formIds={[form.formId]} />
      </CareerFormReferenceProvider>
    </TalentCareerModal>
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
  const now = useNow(applications.some(app => app.status === "running"
    || app.steps.some(step => step.subSteps?.some(sub => sub.state === "current" && sub.expiresAt))));
  const { canReveal, reveal } = useCareerFormRevealer();
  const chat = useOptionalCareerChatPanelContext();
  const request = useApplicationRequest();
  // The form a "답하기" asked for that is older than the loaded history: earlier pages load until it is on screen.
  const [seeking, setSeeking] = useState<{ formId: number; name: string } | null>(null);
  // A form no loaded page shows: it opens in a sheet.
  const [sheet, setSheet] = useState<{ formId: number; name: string } | null>(null);
  const pages = useRef(0);
  const seekingOnScreen = seeking !== null && canReveal(seeking.formId);
  useEffect(() => {
    if (seeking === null) return;
    if (seekingOnScreen) {
      reveal(seeking.formId);
      setSeeking(null);
    } else if (!chat?.hasOlderMessages || pages.current >= SEEK_PAGE_LIMIT) {
      // A page's forms register only after it renders: look once more, then answer it in the sheet, never nothing.
      const timer = window.setTimeout(() => { setSeeking(null); setSheet(seeking); }, 0);
      return () => window.clearTimeout(timer);
    } else if (!chat.loadingOlderMessages) {
      pages.current += 1;
      void chat.onLoadOlderMessages();
    }
    // reveal and chat are new objects every render; the search moves only with these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeking, seekingOnScreen, chat?.hasOlderMessages, chat?.loadingOlderMessages]);
  // Answered (or no longer asked): the sheet closes by itself.
  const sheetAsked = sheet !== null && applications.some(app => app.action?.kind === "answer_form" && app.action.formId === sheet.formId);
  useEffect(() => { if (sheet && !sheetAsked) setSheet(null); }, [sheet, sheetAsked]);
  const answer = (formId: number, name: string) => {
    setExpanded(false);
    if (canReveal(formId)) return reveal(formId);
    if (!chat?.hasOlderMessages) return setSheet({ formId, name });
    pages.current = 0;
    setSeeking({ formId, name });
  };
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
                onAnswer={answer}
                onAnswered={() => setExpanded(false)}
                request={request}
                now={now}
                t={t}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      </CareerAnimatedRegion>
      {sheet ? <ApplicationFormSheet form={sheet} onClose={() => setSheet(null)} t={t} /> : null}
    </section>
  );
}
