import type { NextRequest } from "next/server";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  OFFICIAL_JOBS_ONESCREEN_COOKIE,
  OFFICIAL_JOBS_ONESCREEN_ENTRY_DOMAIN,
  decideOfficialJobsOneScreenScope,
  parseOfficialJobsOneScreenArm,
  parseOfficialJobsOneScreenKind,
} from "@/lib/officialJobs/oneScreen";
import { getOfficialJobPage } from "@/lib/officialJobs/server";
import { sanitizeMultilineDbText } from "@/lib/textSanitization";

export const OFFICIAL_JOBS_ONESCREEN_NOTE_MAX_LENGTH = 1_000;

/** Sent by the one screen with POST /api/talent/onboarding/start. */
export type OfficialJobsOneScreenEntryInput = {
  slug?: unknown;
  kind?: unknown;
  note?: unknown;
  consent?: unknown;
};

export type OfficialJobsOneScreenEntry = {
  kind: "role" | "bundle";
  slug: string;
  companyName: string;
  roleTitle: string;
  roleId: string | null;
  note: string | null;
};

type Rejection = { ok: false; status: number; code: string; error: string };

type ScopedPosting = Omit<OfficialJobsOneScreenEntry, "note">;

/**
 * Whether this posting takes the one screen's request now: it is in the one
 * screen's scope as the given kind (an A/B posting only for arm B) and its
 * role is still open.
 */
export async function checkOfficialJobsOneScreenPosting(args: {
  req: Pick<NextRequest, "cookies">;
  slug: unknown;
  kind: unknown;
}): Promise<{ ok: true; posting: ScopedPosting } | Rejection> {
  const slug = typeof args.slug === "string" ? args.slug.trim() : "";
  const kind = parseOfficialJobsOneScreenKind(args.kind);
  if (!slug || (kind !== "role" && kind !== "bundle")) {
    return { ok: false, status: 400, code: "one_screen_invalid", error: "Invalid one-screen entry" };
  }
  const page = await getOfficialJobPage(slug, { includeClosedRole: false });
  const scope = page
    ? decideOfficialJobsOneScreenScope({ roleId: page.job.roleId, linkedRole: page.linkedRole })
    : null;
  const arm = parseOfficialJobsOneScreenArm(
    args.req.cookies.get(OFFICIAL_JOBS_ONESCREEN_COOKIE)?.value
  );
  if (!page || !scope || scope.kind !== kind || (scope.abTest && arm !== "B")) {
    return {
      ok: false,
      status: 409,
      code: "one_screen_unavailable",
      error: "This posting no longer takes this request",
    };
  }
  return {
    ok: true,
    posting: {
      kind,
      slug: page.job.slug,
      companyName: page.job.companyName,
      roleTitle: page.job.roleTitle,
      roleId: page.job.roleId,
    },
  };
}

/** The scope check plus the person's consent for a role and their note. */
export async function prepareOfficialJobsOneScreenEntry(args: {
  req: Pick<NextRequest, "cookies">;
  input: OfficialJobsOneScreenEntryInput;
}): Promise<{ ok: true; entry: OfficialJobsOneScreenEntry } | Rejection> {
  const checked = await checkOfficialJobsOneScreenPosting({
    req: args.req,
    slug: args.input.slug,
    kind: args.input.kind,
  });
  if (!checked.ok) return checked;
  if (checked.posting.kind === "role" && args.input.consent !== true) {
    return { ok: false, status: 400, code: "consent_required", error: "Consent is required" };
  }
  const note =
    sanitizeMultilineDbText(
      typeof args.input.note === "string" ? args.input.note.trim() : "",
      OFFICIAL_JOBS_ONESCREEN_NOTE_MAX_LENGTH
    ) || null;
  return { ok: true, entry: { ...checked.posting, note } };
}

/**
 * The person's own entry message in Career. For a role it is also the consent
 * record the introduction is sent from (agent contact source), so it says what
 * was agreed in their words.
 */
export function buildOfficialJobsOneScreenReceipt(args: {
  entry: OfficialJobsOneScreenEntry;
  materialsReceipt: string;
  /** False when only a LinkedIn address was given: the line then says profile only. */
  hasResume: boolean;
  locale: "ko" | "en";
}) {
  const { entry } = args;
  const sent =
    args.locale === "en"
      ? args.hasResume ? "my profile and CV" : "my profile"
      : args.hasResume ? "제 프로필과 이력서를" : "제 프로필을";
  const target = [entry.companyName, entry.roleTitle].filter(Boolean).join(" · ");
  const lines =
    args.locale === "en"
      ? entry.kind === "role"
        ? [
            `I asked Harper to introduce me for ${target} and agreed to send ${sent} to ${entry.companyName}.`,
            entry.note ? `My note to the company: ${entry.note}` : "",
          ]
        : [
            `I saw "${target}" and asked Harper to introduce me to companies that fit. Please ask me before sending anything to a company.`,
          ]
      : entry.kind === "role"
        ? [
            `${target} 자리에 소개를 요청했어요. ${sent} ${entry.companyName}에 보내는 데 동의했어요.`,
            entry.note ? `회사에 전할 한마디: ${entry.note}` : "",
          ]
        : [
            `"${target}" 공고를 보고 맞는 회사에 소개해 달라고 요청했어요. 회사에 보내기 전에 꼭 물어봐 주세요.`,
          ];
  return [args.materialsReceipt, ...lines].filter(Boolean).join("\n");
}

export type OfficialJobsOneScreenIntroduction =
  | { status: "sent"; recommendationId: string; introductionRootId: string }
  | { status: "failed"; reason: string }
  | { status: "none" };

/**
 * After the entry is admitted and before Harper's first turn runs: a role
 * entry saves the role and sends the introduction through the same path as a
 * chat introduction (apply_to_internal_role + contact_company), then records
 * the entry for Harper with what actually happened.
 */
export async function completeOfficialJobsOneScreenEntry(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  userMessageId: number;
  entry: OfficialJobsOneScreenEntry;
  /** False when only a LinkedIn address was given: nothing says a resume was shared. */
  hasResume: boolean;
}): Promise<OfficialJobsOneScreenIntroduction> {
  const { entry } = args;
  const shared = args.hasResume ? "profile and resume" : "profile (LinkedIn; no resume was given)";
  let introduction: OfficialJobsOneScreenIntroduction = { status: "none" };
  if (entry.kind === "role" && entry.roleId) {
    introduction = await sendOneScreenIntroduction({ ...args, roleId: entry.roleId });
  }
  const target = [entry.companyName, entry.roleTitle].filter(Boolean).join(" / ");
  const summary =
    entry.kind === "bundle"
      ? `Entry from the job page's sign-up card on the multi-company posting ${target}. The candidate asked Harper to introduce them to companies that fit and to be asked before anything is sent to a company. Nothing has been sent.`
      : introduction.status === "sent"
        ? `Entry from the job page's sign-up card: ${target}. On that card the candidate consented to send their ${shared} to this company, and Harper sent the introduction right after sign-up${entry.note ? " with their note" : ""}. read_agent_messages has its delivery facts.`
        : `Entry from the job page's sign-up card: ${target}. On that card the candidate consented to send their ${shared} to this company, but the introduction could not be sent (${introduction.status === "failed" ? introduction.reason : "role unavailable"}). Nothing was sent to the company.`;
  await recordOneScreenEntry({ ...args, summary });
  return introduction;
}

/**
 * finalize_career_entry wrote the entry record ("interest, not consent") in the
 * entry's transaction; it now gets what the card agreed and sent. One row per
 * entry, so reports that count entry records count it once.
 */
async function recordOneScreenEntry(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  entry: OfficialJobsOneScreenEntry;
  summary: string;
}) {
  const record = {
    changed_domains: ["official_job_intent", "onboarding", OFFICIAL_JOBS_ONESCREEN_ENTRY_DOMAIN],
    summary: args.summary,
  };
  const source = `official_jobs_onboarding:${args.entry.slug}`;
  const { data: updated, error: updateError } = await args.admin
    .from("talent_activity_events")
    .update(record)
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .eq("event_type", "official_jobs_signup_intent")
    .eq("source", source)
    .select("id");
  if (!updateError && (updated?.length ?? 0) > 0) return;
  if (updateError) {
    console.error("[official-jobs-onescreen] entry record update failed", updateError.message);
  }
  const { error } = await args.admin.from("talent_activity_events").insert({
    talent_id: args.userId,
    conversation_id: args.conversationId,
    event_type: "official_jobs_signup_intent",
    impact_level: "high",
    source,
    ...record,
  });
  if (error) {
    console.error("[official-jobs-onescreen] entry record failed", error.message);
  }
}

async function sendOneScreenIntroduction(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  userMessageId: number;
  entry: OfficialJobsOneScreenEntry;
  hasResume: boolean;
  roleId: string;
}): Promise<OfficialJobsOneScreenIntroduction> {
  try {
    const { data: opportunity, error } = await (args.admin.rpc as any)(
      "ensure_requested_internal_role_v1",
      {
        p_talent: args.userId,
        p_role: args.roleId,
        p_operation: `official_jobs_onescreen:${args.userMessageId}`,
        p_source: {
          conversationId: args.conversationId,
          userMessageId: args.userMessageId,
          officialJobSlug: args.entry.slug,
          via: "official_jobs_onescreen",
        },
      }
    );
    if (error) throw new Error(error.message);
    const recommendationId = String(opportunity?.recommendationId ?? "");
    if (!recommendationId) throw new Error("opportunity_unavailable");
    const { sendAgentContact } = await import("@/lib/agentContacts/store");
    const sent = await sendAgentContact({
      source: {
        kind: "career",
        talentId: args.userId,
        conversationId: args.conversationId,
        messageId: args.userMessageId,
      },
      operationKey: `career:${args.userMessageId}:contact_company:${recommendationId}`,
      recommendationId,
      acceptIntroduction: true,
      message: [
        `The candidate asked Harper to introduce them for this Role on its public job page and consented there to share their ${
          args.hasResume ? "profile and resume" : "profile (they gave a LinkedIn address, no resume)"
        }.`,
        args.entry.note ? `Candidate's note: ${args.entry.note}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (sent.message.receiver_kind === "company" && sent.message.receiver_job_id) {
      const { dispatchOrgAgentWebActionJob } = await import("@/lib/org/agent/webActionTurn");
      // The message/job transaction has committed; only the receiver's run is asynchronous.
      await dispatchOrgAgentWebActionJob({
        admin: args.admin as any,
        jobId: sent.message.receiver_job_id,
      }).catch((error: unknown) =>
        console.error(
          "[official-jobs-onescreen] dispatch recovery required",
          error instanceof Error ? error.message : "dispatch failed"
        )
      );
    }
    return {
      status: "sent",
      recommendationId,
      introductionRootId: String(sent.message.root_id),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[official-jobs-onescreen] introduction failed", reason);
    return { status: "failed", reason: reason.slice(0, 300) };
  }
}
