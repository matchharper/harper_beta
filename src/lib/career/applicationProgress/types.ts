/**
 * Progress of one delegated application, shown above the composer until it is submitted (Shaun 11/26: not being able
 * to follow progress is the biggest problem for the person). Built from durable records only (forms and their answers,
 * browser runs and sessions, sends), never from Harper's words, so the panel stays accurate while the reply streams.
 *
 * Four main steps are fixed so the percentage never goes back. What happens only on some sites (a login, a mail code, a
 * question that appears while submitting, a retry) is a sub-step inside a main step. Pure types and helpers; the
 * server builds the list and /api/talent/work returns it with each poll (1s while work runs, else 5s).
 */

export type CareerApplicationStepKey = "confirm" | "fill" | "review" | "submit";

/** skipped: the step was not needed (no review because nothing new to ask). It counts as done for the percentage. */
export type CareerApplicationStepState = "done" | "current" | "todo" | "skipped" | "failed";

/** email_link: a link the site mailed, which the person opens (a code is verification_code). */
export type CareerApplicationSubStepKey = "login" | "verification_code" | "email_link" | "new_question" | "retry";

export type CareerApplicationSubStep = {
  key: CareerApplicationSubStepKey;
  state: "done" | "current" | "failed";
  /** The site's name for a login or a code (e.g. "원티드", "Greenhouse"), when the record has it. */
  site?: string;
  /** When it finished (done/failed) or started (current). ISO 8601. */
  at?: string;
  /**
   * While a browser waits for the person (a login, a code or a link): about when it closes by itself, its run's end
   * plus the provider's idle time (CAREER_BROWSER_KEEP_ALIVE_SECONDS). Approximate. ISO 8601.
   */
  expiresAt?: string;
};

export type CareerApplicationStep = {
  key: CareerApplicationStepKey;
  state: CareerApplicationStepState;
  /** When it finished (done/skipped/failed), or when the work now under way in it started (current). ISO 8601. */
  at?: string;
  /** confirm and review: when the person answered its form, if they did (a form closed without an answer has none). */
  answeredAt?: string;
  /** Number of questions on the form waiting for the person (confirm or review), when one is open. */
  questions?: number;
  subSteps?: CareerApplicationSubStep[];
};

/**
 * What the person can do now. answer_form reveals that form in the chat; open_browser opens that browser session;
 * reopen_browser asks Harper in chat to open again the login browser that closed while it waited; continue asks Harper
 * in chat to go on (nothing moves the application, or the person stopped it); reply_in_chat: nothing moves it while a
 * Harper turn in this chat is on hold, so the panel points to the chat (the hold names no application and no question).
 */
export type CareerApplicationAction =
  | { kind: "answer_form"; formId: number }
  | { kind: "open_browser"; sessionId: string }
  | { kind: "reopen_browser"; sessionId: string }
  | { kind: "continue" }
  | { kind: "reply_in_chat" };

/**
 * needs_you: an action waits on the person (also when nothing moves the application any more). running: a browser run
 * or send is active. waiting: nothing runs and nothing is asked, while Harper's turn runs or right after a record
 * (Harper is between steps). submitted / failed / closed: finished.
 */
export type CareerApplicationStatus = "needs_you" | "running" | "waiting" | "submitted" | "failed" | "closed";

export type CareerApplicationProgress = {
  /** The role id, or the opportunity id when there is no role. Stable across polls. */
  id: string;
  /** role: id is a role id, which a chat mention can name; opportunity: an opportunity without a role. */
  kind?: "role" | "opportunity";
  companyName: string | null;
  title: string | null;
  status: CareerApplicationStatus;
  /** Always four, in the order confirm, fill, review, submit. */
  steps: CareerApplicationStep[];
  action?: CareerApplicationAction;
  /**
   * Why it stopped: the posting closed, the run reported it did not submit, the run failed, or the person stopped it
   * (Stop, or closing the login browser it waited on).
   */
  failure?: { reason: "closed" | "not_submitted" | "error" | "stopped" };
  /** The newest record time for this application. ISO 8601. */
  updatedAt: string;
  submittedAt?: string;
  /**
   * The application's browser that is still open (its newest run's, not closed, closing after a Stop, or stopped by
   * the provider). The panel row stands for it, so the composer does not float a second card for the same application.
   */
  browserSessionId?: string;
};

export const CAREER_APPLICATION_STEP_KEYS: readonly CareerApplicationStepKey[] = ["confirm", "fill", "review", "submit"];

/** Whole percent of main steps finished (done or skipped). 100 only when submitted. */
export function careerApplicationPercent(progress: Pick<CareerApplicationProgress, "steps">): number {
  const finished = progress.steps.filter((step) => step.state === "done" || step.state === "skipped").length;
  return Math.round((finished / CAREER_APPLICATION_STEP_KEYS.length) * 100);
}

/** Collapsed-bar counts: submitted, needs the person, still going (running or waiting), stopped (failed or closed). */
export function careerApplicationCounts(list: readonly Pick<CareerApplicationProgress, "status">[]) {
  return {
    total: list.length,
    submitted: list.filter((item) => item.status === "submitted").length,
    needsYou: list.filter((item) => item.status === "needs_you").length,
    inProgress: list.filter((item) => item.status === "running" || item.status === "waiting").length,
    stopped: list.filter((item) => item.status === "failed" || item.status === "closed").length,
  };
}
