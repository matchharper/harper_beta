import "server-only";

import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import { returnClosedConnectionHolds } from "@/lib/org/agent/externalInvite.server";
import { ASHLEY_CANDIDATE_KEY, ASHLEY_INTRO_TAKEN } from "@/lib/org/agent/externalSourcing";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { syncGtmCompanyInviteAsClaimer } from "../companyInvite.server";
import type { GtmCompanyInviteState } from "../companyInvite";
import { gtmRead, gtmWrite } from "../db.server";
import { JOINED_CLAIM_STALE_MS, type AshleyIO, type MemberIntro } from "./ashleyAgent";
import { MEMBER_INTRO_DONE, MEMBER_INTRO_GAVE_UP, MEMBER_INTRO_TRIES_KEY, memberIntroFinish, memberIntroStep } from "./ashleyMember";
import { ashleyCandidateNow } from "./companyMail.server";

/**
 * #5 One of Ashley's candidates is (now) a Harper member, and the company that wanted them is on Harper (Shaun 11/22
 * 16:08, 16:10): no person in between. Built from Harper's own paths only:
 * - the member comes into the company's Role ("연결을 요청할 후보") through the company mail's own sync, in the name of
 *   the person who claimed the mail (companyInvite.server.ts syncGtmCompanyInviteAsClaimer: evaluated, then published);
 * - a connection request the company made on Ashley's 외부 후보 card goes on as Harper's connection request for a member
 *   (org/server.ts requestOrgCompanyIntro: the requester's name, appeal and recipients; the member gets it inside
 *   Harper). The external request is closed first (not_sendable, ashley_member_request) and its credit given back
 *   through the sweep every closed request takes (externalInvite.server.ts returnClosedConnectionHolds), so the
 *   member request's own credit is the only one taken. It is marked done (result.memberIntroDone) once Harper's request
 *   is there; one a tick left unmarked is tried again (unfinishedAshleyMemberIntros), then handed to a person.
 * A company's answer reaches a member by mail like anyone's (Ashley's relay), and is copied into their Harper chat with
 * the rest of the mails (AshleyIO.copyToHarper).
 */

type Admin = OrgAgentAdminClient;
const admin = () => getSupabaseAdmin() as unknown as Admin;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

type MemberCard = { id: string; status: string };

async function cardOf(roleId: string, talentId: string): Promise<MemberCard | null> {
  const [row] = await gtmRead((sql) => sql<MemberCard[]>`
    select id::text as id, status from public.company_intro_candidates
    where role_id = ${roleId}::uuid and talent_id = ${talentId}::uuid
    order by created_at desc limit 1
  `);
  return row ?? null;
}

/** The mail's sync once more (a failure is logged: the card may be there from an earlier one). */
async function syncedInvite(companyMailId: string): Promise<GtmCompanyInviteState | null> {
  try {
    return await syncGtmCompanyInviteAsClaimer(companyMailId);
  } catch (error) {
    console.warn("[gtm-agent] company mail sync for a member failed", companyMailId, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** The member's card in the company's Role, after one more sync of the mail; why not when there is none. */
async function memberCard(companyMailId: string, personId: string, roleId?: string): Promise<
  { card: MemberCard } | { waiting: true } | { none: string }
> {
  const now = await ashleyCandidateNow(personId);
  if (!now?.talentId) return { none: "후보의 Harper 계정을 찾지 못했어요" };
  if (now.stopped) return { none: "후보가 연락 받지 않기 목록에 있어요" };
  const state = await syncedInvite(companyMailId);
  const role = roleId ?? state?.roleId ?? null;
  if (!role) return { none: "회사가 이 회사 메일로 Harper에 가입하지 않았어요" };
  const card = await cardOf(role, now.talentId);
  if (card) return { card };
  if (state?.stage === "evaluating" || state?.stage === "publishing") return { waiting: true };
  return { none: "회사 역할에 회원 카드가 올라오지 않았어요" };
}

/** AshleyIO.placeMember. */
export const placeAshleyMember: NonNullable<AshleyIO["placeMember"]> = async ({ companyMailId, personId }) => {
  const found = await memberCard(companyMailId, personId);
  return "card" in found ? "placed" : "waiting" in found ? "waiting" : "none";
};

type IntroRequestRow = {
  id: string; status: string; error_code: string | null; role_id: string; company_workspace_id: string; requested_by: string;
  company_appeal: string; intro_recipient_emails: string[] | null; company_decision: string | null; result: Record<string, unknown> | null;
  person_key: string;
};

async function readRequest(id: string): Promise<IntroRequestRow | null> {
  const [row] = await gtmRead((sql) => sql<IntroRequestRow[]>`
    select r.id::text as id, r.status, r.error_code, r.role_id::text as role_id, r.company_workspace_id::text as company_workspace_id,
      r.requested_by::text as requested_by, r.company_appeal, r.intro_recipient_emails, c.company_decision, r.result, c.person_key
    from public.external_intro_requests r join public.external_candidates c on c.id = r.external_candidate_id
    where r.id = ${id}::uuid
  `);
  return row ?? null;
}

/** The statuses a request Ashley handles is in when it goes on as a member request: taken by her tick, or told. */
const OPEN_FOR_MEMBER = [ASHLEY_INTRO_TAKEN, "invited"];

/** Harper's member request on the card, in the requester's name (their appeal and recipients); then marked done. */
async function requestOnCard(db: Admin, request: IntroRequestRow, card: MemberCard): Promise<void> {
  if (memberIntroStep(card.status).step === "request") {
    const user = await requester(db, request.requested_by);
    if (!user) throw new Error("연결을 요청한 회사 사람을 찾지 못했어요");
    // Dynamic: org/server.ts is the whole /org server; Ashley's tick needs one function of it.
    const { requestOrgCompanyIntro } = await import("@/lib/org/server");
    await requestOrgCompanyIntro({
      channel: "web", companyAppeal: request.company_appeal, introCandidateId: card.id,
      introRecipientEmails: request.intro_recipient_emails ?? [], user, workspaceId: request.company_workspace_id,
    });
  }
  await gtmWrite((sql) => sql`
    update public.external_intro_requests set updated_at = now(),
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object(${MEMBER_INTRO_DONE}::text, now())
    where id = ${request.id}::uuid and status = 'not_sendable' and error_code = 'ashley_member_request'
  `);
}

/**
 * AshleyIO.requestMemberIntro. The member's card must be in the request's Role ("waiting" while it is evaluated or
 * written there). A card the company already asked to connect counts as requested. Only a definite "cannot" (no card,
 * the card cannot take one, the company passed, opted out) is unavailable, checked before anything is closed. A failure
 * of Harper's request itself (an error) leaves the external request closed for it, this the first try ("retry"):
 * unfinishedAshleyMemberIntros takes it again after JOINED_CLAIM_STALE_MS, MEMBER_INTRO_TRIES at most, then a person.
 * A tick that dies in between leaves it the same way.
 */
export const requestAshleyMemberIntro: NonNullable<AshleyIO["requestMemberIntro"]> = async ({ introRequestId, companyMailId, personId }) => {
  const request = await readRequest(introRequestId);
  if (!request) return unavailable("회사의 연결 요청을 찾지 못했어요");
  if (request.company_decision === "passed") return unavailable("회사가 이 후보를 넘겼어요");
  if (!OPEN_FOR_MEMBER.includes(request.status)) return unavailable(`연결 요청이 이미 ${request.status} 상태예요`);
  const found = await memberCard(companyMailId, personId, request.role_id);
  if ("waiting" in found) return { state: "waiting" };
  if ("none" in found) return unavailable(found.none);
  const { card } = found;
  const step = memberIntroStep(card.status);
  if (step.step === "none") return unavailable(step.reason);
  const db = admin();
  if (step.step === "request" && !(await requester(db, request.requested_by))) return unavailable("연결을 요청한 회사 사람을 찾지 못했어요");

  const closed = await gtmWrite((sql) => sql`
    update public.external_intro_requests set status = 'not_sendable', error_code = 'ashley_member_request', updated_at = now(),
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object('via', 'ashley', 'memberIntroCandidateId', ${card.id}::text, 'before', ${request.status}::text)
    where id = ${request.id}::uuid and status = any(${OPEN_FOR_MEMBER}::text[])
    returning id
  `);
  if (!closed.length) return unavailable("연결 요청의 상태가 그사이 바뀌었어요");
  await returnClosedConnectionHolds(db).catch((error) => console.warn("[gtm-agent] connection credit not returned yet", request.id, String(error)));
  try {
    await requestOnCard(db, request, card);
    return { state: "requested" };
  } catch (error) {
    const reason = errorText(error);
    // Not written: it is still taken again (no tries counted yet), as after a tick that died.
    await gtmWrite((sql) => sql`
      update public.external_intro_requests set updated_at = now(),
        result = coalesce(result, '{}'::jsonb) || jsonb_build_object(${MEMBER_INTRO_TRIES_KEY}::text, 1, 'memberIntroError', ${reason.slice(0, 300)}::text)
      where id = ${request.id}::uuid and status = 'not_sendable' and error_code = 'ashley_member_request'
        and (result ->> ${MEMBER_INTRO_DONE}::text) is null
    `).catch((writeError) => console.warn("[gtm-agent] member request failure not recorded", request.id, errorText(writeError)));
    return { state: "retry", reason: `Harper 회원 연결 요청이 되지 않았어요 · ${reason.slice(0, 200)}` };
  }
};


const unavailable = (reason: string): MemberIntro => ({ state: "unavailable", reason });

async function requester(db: Admin, userId: string) {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) {
    console.warn("[gtm-agent] connection requester not read", userId, error.message);
    return null;
  }
  return data.user ?? null;
}

/** AshleyIO.unfinishedMemberIntros: closed for a member request, not done, not given up, left for a while. */
export const unfinishedAshleyMemberIntros: NonNullable<AshleyIO["unfinishedMemberIntros"]> = async (limit) => {
  const rows = await gtmRead((sql) => sql<Array<{ id: string; person_key: string; tries: string | null }>>`
    select r.id::text as id, c.person_key, r.result ->> ${MEMBER_INTRO_TRIES_KEY}::text as tries
    from public.external_intro_requests r join public.external_candidates c on c.id = r.external_candidate_id
    where r.status = 'not_sendable' and r.error_code = 'ashley_member_request'
      and (r.result ->> ${MEMBER_INTRO_DONE}::text) is null and (r.result ->> ${MEMBER_INTRO_GAVE_UP}::text) is null
      and r.updated_at < ${new Date(Date.now() - JOINED_CLAIM_STALE_MS)}
    order by r.updated_at limit ${limit}::int
  `);
  return rows.flatMap((row) => row.person_key.startsWith("gtm:")
    ? [{ id: row.id, personId: row.person_key.slice("gtm:".length), tries: Number(row.tries ?? 0) || 0 }] : []);
};

/**
 * AshleyIO.finishMemberIntro: the card, the company's decision and the candidate again (ashleyMember.ts
 * memberIntroFinish): a card past ready is done; the company's pass or the candidate's opt-out stops it before anything
 * is made in the company's name; a ready card gets Harper's request now. Any other failure is a try, counted.
 */
export const finishAshleyMemberIntro: NonNullable<AshleyIO["finishMemberIntro"]> = async (id) => {
  let reason: string;
  try {
    const request = await readRequest(id);
    if (!request) return { done: false, reason: "회사의 연결 요청을 찾지 못했어요", stop: "person" };
    const cardId = typeof request.result?.memberIntroCandidateId === "string" ? request.result.memberIntroCandidateId : null;
    const [card] = cardId
      ? await gtmRead((sql) => sql<MemberCard[]>`select id::text as id, status from public.company_intro_candidates where id = ${cardId}::uuid`)
      : [];
    const candidate = request.person_key.startsWith(ASHLEY_CANDIDATE_KEY)
      ? await ashleyCandidateNow(request.person_key.slice(ASHLEY_CANDIDATE_KEY.length)) : null;
    const next = memberIntroFinish({ cardStatus: card?.status ?? null, companyDecision: request.company_decision, candidate });
    if (next.step === "stop") return { done: false, reason: next.reason, stop: next.quiet ? "quiet" : "person" };
    // done: marked only (requestOnCard makes Harper's request for a ready card alone).
    await requestOnCard(admin(), request, card!);
    return { done: true };
  } catch (error) {
    reason = errorText(error).slice(0, 200);
  }
  await gtmWrite((sql) => sql`
    update public.external_intro_requests set updated_at = now(),
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object(${MEMBER_INTRO_TRIES_KEY}::text,
        coalesce(case when result ->> ${MEMBER_INTRO_TRIES_KEY}::text ~ '^[0-9]+$' then (result ->> ${MEMBER_INTRO_TRIES_KEY}::text)::int end, 0) + 1)
    where id = ${id}::uuid
  `);
  return { done: false, reason };
};

/** AshleyIO.giveUpMemberIntro: not tried again (a person takes it). */
export const giveUpAshleyMemberIntro: NonNullable<AshleyIO["giveUpMemberIntro"]> = async (id, reason) => {
  await gtmWrite((sql) => sql`
    update public.external_intro_requests set updated_at = now(),
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object(${MEMBER_INTRO_GAVE_UP}::text, now(), 'memberIntroError', ${reason.slice(0, 300)}::text)
    where id = ${id}::uuid
  `);
};

/**
 * AshleyIO.closeIntroForJoinedLink: the joined mail goes instead of a member request, so the company's request on
 * Harper ends here (not_sendable, ashley_joined_link) and its credit comes back through the same sweep; the company
 * asks on Harper itself.
 */
export const closeAshleyIntroForJoinedLink: NonNullable<AshleyIO["closeIntroForJoinedLink"]> = async (introRequestId) => {
  const closed = await gtmWrite((sql) => sql`
    update public.external_intro_requests set status = 'not_sendable', error_code = 'ashley_joined_link', updated_at = now(),
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object('via', 'ashley')
    where id = ${introRequestId}::uuid and status = any(${OPEN_FOR_MEMBER}::text[])
    returning id
  `);
  if (closed.length) await returnClosedConnectionHolds(admin());
};
