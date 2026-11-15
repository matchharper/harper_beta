import "server-only";

import type { User } from "@supabase/supabase-js";
import type { GtmJd } from "@/lib/gtmPlays/shared";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { shareLinkMailHtml, shareLinkMailText } from "./mailBlock";
import { createShareLink, ShareLinkUnavailableError } from "./server";
import type { ShareLinkPosting } from "./shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Harper member by account id or account email. */
async function findTalent(value: string): Promise<string | null> {
  const text = value.trim();
  const admin = getSupabaseAdmin();
  const query = admin.from("talent_users").select("user_id").is("deleted_at", null);
  const { data, error } = await (UUID.test(text) ? query.eq("user_id", text) : query.ilike("email", text)).limit(2);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ user_id: string }>;
  return rows.length === 1 ? rows[0].user_id : null;
}

export function postingFromJd(jd: GtmJd | null): ShareLinkPosting | null {
  if (!jd?.title.trim()) return null;
  return {
    title: jd.title.trim().slice(0, 200),
    companyName: jd.companyName.trim() || null,
    url: jd.url,
    location: jd.location,
    description: jd.description.slice(0, 16_000),
  };
}

const REASONS: Record<ShareLinkUnavailableError["reason"], string> = {
  candidate_unavailable: "이 후보는 지금 링크를 만들 수 없어요(탈퇴했거나 프로필이 없어요).",
  company_blocked: "후보가 이 회사를 차단해 두어서 링크를 만들지 않았어요.",
  personal_recipient: "받는 사람이 개인 메일 주소예요. 회사 주소로 보낼 때만 링크를 넣어요.",
};

/**
 * Ops #1 '링크 만들기': Harper staff make the link for one candidate, company and posting (before Career puts
 * it in the candidate's mails), and get the box to paste into a mail.
 */
export async function createOpsShareLink(args: {
  user: User;
  talent: string;
  companyName: string;
  recipientEmail: string | null;
  companyDomain: string | null;
  jd: GtmJd | null;
}) {
  const talentId = await findTalent(args.talent);
  if (!talentId) throw new Error("그 이메일이나 id의 하퍼 회원을 찾지 못했어요.");
  try {
    const { link, url, created } = await createShareLink({
      talentId,
      companyName: args.companyName,
      companyDomain: args.companyDomain,
      recipientEmails: args.recipientEmail ? [args.recipientEmail] : [],
      posting: postingFromJd(args.jd),
      source: "ops_manual",
      createdBy: args.user.id,
    });
    const box = { snapshot: link.snapshot, url, language: link.language };
    return { url, created, snapshot: link.snapshot, language: link.language, mailText: shareLinkMailText(box), mailHtml: shareLinkMailHtml(box) };
  } catch (error) {
    if (error instanceof ShareLinkUnavailableError) throw new Error(REASONS[error.reason]);
    throw error;
  }
}
