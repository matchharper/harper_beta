import "server-only";

import type { z } from "zod";
import { readJdFromUrl } from "@/lib/gtmPlays/jd.server";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { shareLinkMailPs } from "./mailBlock";
import { createShareLink, ShareLinkUnavailableError } from "./server";
import type { emailProfileLinkSchema } from "./emailParam";
import { isPersonalMailDomain, shareLinkDomain, type ShareLinkPosting } from "./shared";

const SKIPPED = {
  no_company_address: "Candidate summary link not added: no company address among the recipients (personal addresses never get it).",
  candidate_unavailable: "Candidate summary link not added: the profile cannot be shared right now.",
  company_blocked: "Candidate summary link not added: the user has blocked this company.",
  personal_recipient: "Candidate summary link not added: no company address among the recipients (personal addresses never get it).",
  failed: "Candidate summary link not added: it could not be prepared.",
} as const;

/**
 * The approved body with the candidate summary link (후보자 링크) as a P.S. under the signature, for the company the
 * mail goes to. The body keeps its format: a plain mail stays plain text. The same candidate, company and posting
 * reuse one link, so a retried send has the same body. When the link cannot be made the body goes out as approved
 * without it, and `note` says why.
 */
export async function appendEmailProfileLink(args: {
  talentId: string;
  to: string[];
  body: string;
  isHtml: boolean;
  profileLink: z.infer<typeof emailProfileLinkSchema>;
}): Promise<{ body: string; isHtml: boolean; note: string }> {
  const companyRecipients = args.to.filter((email) => {
    const domain = shareLinkDomain(email);
    return domain && !isPersonalMailDomain(domain) && !isInternalDomainEmail(email);
  });
  const unchanged = (note: string) => ({ body: args.body, isHtml: args.isHtml, note });
  if (!companyRecipients.length) return unchanged(SKIPPED.no_company_address);
  const url = args.profileLink.posting_url?.trim() || null;
  const posting: ShareLinkPosting = {
    title: args.profileLink.posting_title.trim(), companyName: args.profileLink.company_name, url, location: null, description: "",
  };
  try {
    const { link, url: linkUrl } = await createShareLink({
      talentId: args.talentId,
      companyName: args.profileLink.company_name,
      recipientEmails: companyRecipients,
      posting,
      // The posting text is read only when a new link is made (its Role is made from it if the company signs up).
      loadPosting: url ? async () => {
        const jd = await readJdFromUrl(url).catch(() => null);
        return jd ? { ...posting, location: jd.location, description: jd.description.slice(0, 16_000) } : posting;
      } : undefined,
      source: "mail_application",
      consentedAt: new Date().toISOString(),
    });
    const ps = shareLinkMailPs({ snapshot: link.snapshot, url: linkUrl, language: link.language });
    return {
      body: args.isHtml ? `${args.body}\n${ps.html}` : `${args.body.trimEnd()}\n\n${ps.text}`,
      isHtml: args.isHtml,
      note: "Candidate summary link added as a P.S. under the signature.",
    };
  } catch (error) {
    if (error instanceof ShareLinkUnavailableError) return unchanged(SKIPPED[error.reason]);
    console.error("[share-link] email profile link", error);
    return unchanged(SKIPPED.failed);
  }
}
