import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { CareerAgentReplyJob } from "../agentReplyQueue";
import { parseCareerForm, type CareerForm } from "../forms/schema";
import type { CareerBackgroundRun } from "./types";
import { CAREER_REPLY_UNSEEN_TRIGGER } from "./unseenReply";

export const CAREER_FORM_UNANSWERED_TRIGGER = "career_form_unanswered";
/** How long the forms have waited since the candidate's chat last displayed them before the email is considered. */
export const CAREER_FORM_UNANSWERED_GRACE_SECONDS = 30 * 60;
/** Only forms from the last day; an older open form is left to the opportunity page and re-engagement. */
const CAREER_FORM_UNANSWERED_WINDOW_SECONDS = 24 * 60 * 60;

type UnansweredForm = { formId: number; revision: number; createdAt?: string; form: CareerForm };

/** An email notice about one unseen reply or about forms left unanswered: not a discovery run, so it takes no pending
 * discovery events and runs on the scheduled model. */
export function isCareerEmailNoticeRun(run: { trigger: string }) {
  return run.trigger === CAREER_REPLY_UNSEEN_TRIGGER || run.trigger === CAREER_FORM_UNANSWERED_TRIGGER;
}

/** The exact form revisions the scan listed, as they were shown; run start and send re-check that they are unchanged. */
export function readUnansweredForms(run: { trigger_payload?: unknown }): UnansweredForm[] {
  const value = (run.trigger_payload as { unansweredForms?: unknown } | null)?.unansweredForms;
  return (Array.isArray(value) ? value : []).flatMap((item: Record<string, unknown> | null) => {
    const formId = Number(item?.formId), revision = Number(item?.revision);
    const form = parseCareerForm(item?.form);
    if (!form || form.formId !== formId || form.revision !== revision) return [];
    return [{ formId, revision, form, ...(typeof item?.createdAt === "string" ? { createdAt: item.createdAt } : {}) }];
  });
}

/** Wakes the Career agent once for a conversation whose application forms the candidate saw and left unanswered
 * after closing every Harper page. A form revision is listed once, and a conversation gets at most one a day. */
export async function admitUnansweredCareerForms(
  admin: TalentAdminClient,
  publish: (job: CareerAgentReplyJob) => Promise<unknown> = async job => (await import("../agentReplyQueue")).enqueueCareerAgentReply(job),
) {
  const { data, error } = await (admin.rpc as any)("admit_career_unanswered_forms_v1", {
    p_grace_seconds: CAREER_FORM_UNANSWERED_GRACE_SECONDS,
    p_window_seconds: CAREER_FORM_UNANSWERED_WINDOW_SECONDS,
    p_limit: 20,
  });
  if (error) throw error;
  const runs = (data ?? []) as CareerBackgroundRun[];
  // The run is durable; background recovery republishes a failed handoff.
  const results = await Promise.allSettled(runs.map(run => publish({
    userId: run.talent_id, conversationId: run.conversation_id!, backgroundRunId: run.id,
    replyId: run.trigger_payload.agentInvocation.replyId,
  })));
  return { admitted: runs.length, deferred: results.filter(result => result.status === "rejected").length };
}
