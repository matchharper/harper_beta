import "server-only";

import type { z } from "zod";
import { careerExecutionEnvironment } from "@/lib/career/executionEnvironment";
import { readJdFromUrl } from "@/lib/gtmPlays/jd.server";
import { GTM_HARPER_ORIGIN, gtmMailLinkOrigin } from "@/lib/gtmPlays/shared";
import type { browserProfileLinkSchema } from "./browserParam";
import { createShareLink, ShareLinkUnavailableError } from "./server";
import type { ShareLinkPosting } from "./shared";
import { siteProfileLinkInstruction } from "./siteInstruction";

/**
 * For an approved web application (use_browser execute) whose form checked 'Harper 후보 요약 링크 넣기': the
 * candidate's link for this company and posting (a retried run reuses it) and the placement rules for the browser.
 * When the link cannot be made the application goes ahead without it (instruction null).
 * Only the production server makes one: another server's link has the production address but its token in that
 * server's own database, so the company could not open it (11/26 local test). A local server whose
 * GTM_MAIL_LINK_ORIGIN points links back to itself still makes one, for testing.
 */
export async function prepareSiteProfileLink(args: {
  talentId: string;
  operationId: string;
  profileLink: z.infer<typeof browserProfileLinkSchema>;
}): Promise<{ instruction: string | null; note: string }> {
  if (careerExecutionEnvironment() !== "production" && gtmMailLinkOrigin() === GTM_HARPER_ORIGIN)
    return { instruction: null, note: "Candidate summary link not added: this is not the production server, so a company could not open a link made here." };
  const url = args.profileLink.posting_url?.trim() || null;
  const posting: ShareLinkPosting = {
    title: args.profileLink.posting_title.trim(), companyName: args.profileLink.company_name, url, location: null, description: "",
  };
  try {
    const { url: linkUrl } = await createShareLink({
      talentId: args.talentId,
      companyName: args.profileLink.company_name,
      posting,
      // The posting text is read only when a new link is made (its Role is made from it if the company signs up).
      loadPosting: url ? async () => {
        const jd = await readJdFromUrl(url).catch(() => null);
        return jd ? { ...posting, location: jd.location, description: jd.description.slice(0, 16_000) } : posting;
      } : undefined,
      source: "site_application",
      operationId: args.operationId,
      consentedAt: new Date().toISOString(),
    });
    return { instruction: siteProfileLinkInstruction(linkUrl), note: "Candidate summary link given to the browser with its placement rules." };
  } catch (error) {
    if (error instanceof ShareLinkUnavailableError) return { instruction: null, note: `Candidate summary link not added: ${error.reason}.` };
    console.error("[share-link] site profile link", error);
    return { instruction: null, note: "Candidate summary link not added: it could not be prepared." };
  }
}
