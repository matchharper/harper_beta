import "server-only";
import type { OrgLocale } from "@/i18n/org/locale";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { setOrgCandidateStageWithIntroBooking } from "@/lib/org/introBooking.server";
import {
  passOrgCompanyIntro,
  requestOrgCompanyIntro,
  type OrgCompanyIntroMutationResponse,
} from "@/lib/org/server";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { enqueueOrgAgentWebActionTurn } from "@/lib/org/agent/webActionTurn";
import { loadSlackCandidateCards } from "@/lib/org/slackCandidateWorkObject.server";
import { getOrgWorkspaceLocale } from "@/lib/org/workspaceLocale.server";
import { authorizeCompanyEmail } from "./company";
import { normalizeEmailAddress } from "./parse";
import { hashReplyToken } from "./security";
import {
  acceptedConnectionStatusFromTags,
  classifyCompanyEmailActionError,
  companyEmailActionLocale,
  isCompanyEmailActionKind,
  parseCompanyEmailActionInput,
} from "./companyEmailAction";
import {
  companyEmailActionNeedsIntroEmail,
  type CompanyEmailActionKind,
  type CompanyEmailActionResult,
  type CompanyEmailActionView,
  type CompanyEmailCandidateStatus,
} from "./companyEmailActionCopy";

type Admin = ReturnType<typeof getSupabaseAdmin>;
type ActionLink = {
  id: string;
  email_outbox_id: string;
  company_workspace_id: string;
  company_user_id: string;
  intro_candidate_id: string;
  action: CompanyEmailActionKind;
  expires_at: string;
  used_at: string | null;
  result: CompanyEmailActionResult | null;
};
type IntroRow = {
  id: string;
  role_id: string;
  talent_id: string;
  status: string;
  recommendation_id: string | null;
  candidate_sent_at: string | null;
  presentation: { name?: string; headline?: string } | null;
};
type Response = { status: number; view: CompanyEmailActionView };

const clean = (value: unknown) => String(value ?? "").trim();
const table = (admin: Admin, name: string) => admin.from(name as any) as any;

async function findLink(admin: Admin, tokenValue: string) {
  const token = clean(tokenValue).slice(0, 200);
  if (!token) return null;
  const { data, error } = await table(admin, "company_email_action_links")
    .select("id, email_outbox_id, company_workspace_id, company_user_id, intro_candidate_id, action, expires_at, used_at, result")
    .eq("token_hash", hashReplyToken(token))
    .maybeSingle();
  if (error) throw error;
  return data && isCompanyEmailActionKind(data.action) ? (data as ActionLink) : null;
}

async function readIntro(admin: Admin, link: ActionLink) {
  const { data, error } = await table(admin, "company_intro_candidates")
    .select("id, role_id, talent_id, status, recommendation_id, candidate_sent_at, presentation")
    .eq("id", link.intro_candidate_id)
    .eq("company_workspace_id", link.company_workspace_id)
    .maybeSingle();
  if (error) throw error;
  return data as IntroRow | null;
}

/** Same facts as the Slack card: candidate name, one-line summary, latest
 * experience and Role. The page shows them without any outbound link. */
async function loadContext(admin: Admin, link: ActionLink) {
  const [locale, cards, intro, profile, mail] = await Promise.all([
    getOrgWorkspaceLocale(link.company_workspace_id, admin),
    loadSlackCandidateCards({ candidateIds: [link.intro_candidate_id], workspaceId: link.company_workspace_id }),
    readIntro(admin, link),
    table(admin, "company_users").select("name, email").eq("user_id", link.company_user_id).maybeSingle(),
    table(admin, "company_email_outbox").select("delivery").eq("id", link.email_outbox_id).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (mail.error) throw mail.error;
  const card = cards[0];
  const email = normalizeEmailAddress(mail.data?.delivery?.to) ?? normalizeEmailAddress(profile.data?.email) ?? "";
  let webUrl = "";
  if (card) {
    const url = new URL(card.profileUrl);
    url.searchParams.set("source", "email");
    webUrl = url.toString();
  }
  return {
    locale: locale as OrgLocale,
    intro,
    email,
    base: {
      locale: locale as OrgLocale,
      action: link.action,
      candidate: {
        name: card?.name ?? (clean(intro?.presentation?.name) || "Candidate"),
        headline: card?.headline ?? (clean(intro?.presentation?.headline) || null),
        latestExperience: card?.latestExperience ?? null,
        roleName: card?.roleName ?? "",
      },
      recipient: { name: clean(profile.data?.name) || email, email },
      webUrl,
    },
  };
}

/** Whether this button's decision is still open, read the way the RPCs decide. */
async function currentStatus(admin: Admin, link: ActionLink): Promise<{ actionable: boolean; current: CompanyEmailCandidateStatus }> {
  const intro = await readIntro(admin, link);
  if (!intro) return { actionable: false, current: { status: "unavailable" } };
  if (link.action === "request_intro" || link.action === "pass")
    return {
      actionable: intro.status === "ready",
      current: { status: intro.status, candidateSentAt: intro.candidate_sent_at },
    };
  const { data, error } = await table(admin, "talent_opportunity_tag")
    .select("tag").eq("talent_id", intro.talent_id).eq("opportunity_id", intro.role_id);
  if (error) throw error;
  const state = acceptedConnectionStatusFromTags((data ?? []).map((row: { tag: string }) => row.tag));
  return { actionable: state.actionable, current: { status: state.status } };
}

export async function getCompanyEmailActionView(token: string, acceptLanguage: string | null): Promise<Response> {
  const admin = getSupabaseAdmin();
  const link = await findLink(admin, token);
  if (!link) return { status: 404, view: { state: "not_found", locale: companyEmailActionLocale(acceptLanguage) } };
  const context = await loadContext(admin, link);
  // Opening the link records nothing.
  if (link.used_at && link.result) return { status: 200, view: { ...context.base, state: "used", result: link.result } };
  if (Date.parse(link.expires_at) <= Date.now()) return { status: 200, view: { ...context.base, state: "expired" } };
  const status = await currentStatus(admin, link);
  if (!status.actionable) return { status: 200, view: { ...context.base, state: "handled", current: status.current } };
  return { status: 200, view: { ...context.base, state: "confirm" } };
}

async function execute(args: {
  link: ActionLink;
  intro: IntroRow;
  appeal: string;
  locale: OrgLocale;
  notifyCandidate: boolean;
  user: Parameters<typeof requestOrgCompanyIntro>[0]["user"];
  email: string;
}): Promise<string> {
  const { link, intro, user } = args;
  const workspaceId = link.company_workspace_id;
  if (link.action === "request_intro" || link.action === "pass") {
    const common = { introCandidateId: link.intro_candidate_id, user, workspaceId };
    const result: OrgCompanyIntroMutationResponse = link.action === "request_intro"
      ? await requestOrgCompanyIntro({ ...common, companyAppeal: args.appeal, introRecipientEmails: [args.email] })
      : await passOrgCompanyIntro(common);
    try {
      await enqueueOrgAgentWebActionTurn({
        actionName: "company_intro_decision",
        actionContext: {
          decision: link.action,
          introCandidateId: link.intro_candidate_id,
          status: result.status,
          newIntroCreated: result.newIntroCreated,
          candidateAcceptedAt: result.candidateAcceptedAt,
          currentStageTag: result.stageTag,
        },
        roleId: intro.role_id,
        user,
        workspaceId,
        idempotencyKey: `email-candidate:${link.intro_candidate_id}:${link.action}`,
      });
    } catch (error) {
      console.error("[company-email-action:agent-wake]", error);
    }
    return result.status;
  }
  if (!intro.recommendation_id) throw new Error("Accepted connection has no recommendation");
  // Same path as the web and Slack decision: Accept Intro sends the intro
  // email, with the interview booking link when Calendar and open times are set.
  const stage = link.action === "accept_connection" ? "connected" : "process_stopped";
  await setOrgCandidateStageWithIntroBooking({
    baseUrl: getConfiguredPublicSiteUrl(),
    booking: "if_ready",
    locale: args.locale,
    stage: {
      acceptReason: null,
      contactDirectly: false,
      expectedPreviousStage: "pending_connection",
      introEmails: link.action === "accept_connection" ? [args.email] : null,
      notifyCandidateOnClosure:
        link.action === "reject_connection" ? args.notifyCandidate : undefined,
      recommendationId: intro.recommendation_id,
      roleId: intro.role_id,
      stage,
      stopNote: null,
      talentId: intro.talent_id,
      user,
      workspaceId,
    },
  });
  return stage;
}

export async function submitCompanyEmailAction(token: string, body: unknown, acceptLanguage: string | null): Promise<Response> {
  const admin = getSupabaseAdmin();
  const link = await findLink(admin, token);
  if (!link) return { status: 404, view: { state: "not_found", locale: companyEmailActionLocale(acceptLanguage) } };
  const context = await loadContext(admin, link);
  const { base, locale } = context;
  if (link.used_at && link.result) return { status: 200, view: { ...base, state: "used", result: link.result } };
  if (Date.parse(link.expires_at) <= Date.now()) return { status: 410, view: { ...base, state: "expired" } };
  const input = parseCompanyEmailActionInput(link.action, body, locale);
  if ("fieldError" in input) return { status: 400, view: { ...base, state: "confirm", fieldError: input.fieldError } };

  let result: CompanyEmailActionResult;
  try {
    // The recipient is re-authorized exactly like a company mail reply.
    const actor = await authorizeCompanyEmail(admin, link.company_user_id, link.company_workspace_id, base.recipient.email);
    if (!context.intro) throw new Error("Company intro candidate is missing");
    const status = await execute({
      link,
      intro: context.intro,
      appeal: input.appeal,
      locale,
      notifyCandidate: input.notifyCandidate,
      user: actor.user,
      email: actor.email,
    });
    result = {
      outcome: "done",
      action: link.action,
      status,
      introEmail: companyEmailActionNeedsIntroEmail(link.action) ? actor.email : null,
    };
  } catch (error) {
    const after = await currentStatus(admin, link).catch(() => null);
    const failure = classifyCompanyEmailActionError(error, {
      action: link.action,
      locale,
      stillActionable: after?.actionable ?? true,
    });
    if (failure.kind !== "handled_elsewhere") {
      console.warn("[company-email-action]", error);
      return failure.kind === "field_error"
        ? { status: 400, view: { ...base, state: "confirm", fieldError: failure.message } }
        : { status: 200, view: { ...base, state: "error", message: failure.message } };
    }
    result = { outcome: "handled_elsewhere", action: link.action, current: after!.current };
  }
  // A second submission returns the first stored result unchanged.
  const { data: stored, error } = await (admin.rpc as any)("finish_company_email_action_v1", {
    p_link_id: link.id,
    p_result: result,
  });
  if (error) throw error;
  return { status: 200, view: { ...base, state: "used", result: (stored?.result ?? result) as CompanyEmailActionResult } };
}
