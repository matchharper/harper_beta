import { z } from "zod";

/** write_email's `profile_link`: the company and posting the mail is about (the user checked the option). */
export const emailProfileLinkSchema = z.object({
  company_name: z.string().trim().min(1).max(160),
  posting_url: z.string().trim().max(2_000).nullish(),
  posting_title: z.string().trim().max(200).nullish(),
}).strict();

export const EMAIL_PROFILE_LINK_PARAMETER = {
  type: "object",
  description: "Only when the user's reviewed form checked the Harper profile link option for this email. Code appends the box with the link (company addresses only); never write Harper links yourself.",
  properties: {
    company_name: { type: "string" },
    posting_url: { type: "string", description: "The posting this email applies to, if any." },
    posting_title: { type: "string" },
  },
  required: ["company_name"],
  additionalProperties: false,
};
