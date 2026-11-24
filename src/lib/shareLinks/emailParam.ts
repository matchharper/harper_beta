import { z } from "zod";

/**
 * write_email's `profile_link`: the company and the posting this application mail is for (the user checked
 * 'Harper 후보 요약 링크 넣기' when approving it). Only application mails get it, so the posting is required.
 */
export const emailProfileLinkSchema = z.object({
  company_name: z.string().trim().min(1).max(160),
  posting_title: z.string().trim().min(1).max(200),
  posting_url: z.string().trim().max(2_000).nullish(),
}).strict();

export const EMAIL_PROFILE_LINK_PARAMETER = {
  type: "object",
  description: "Only for an application mail to the posting's company when the user's reviewed form checked 'Harper 후보 요약 링크 넣기'. Code appends a P.S. with the candidate summary link under the signature (company addresses only); never write Harper links or a P.S. about Harper yourself.",
  properties: {
    company_name: { type: "string" },
    posting_title: { type: "string", description: "The title of the posting this mail applies to." },
    posting_url: { type: "string", description: "The posting's URL, when known." },
  },
  required: ["company_name", "posting_title"],
  additionalProperties: false,
};
