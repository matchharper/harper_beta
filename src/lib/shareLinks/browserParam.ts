import { z } from "zod";

/**
 * use_browser's `profile_link`: the company and posting a web application (execute) is for, when the user
 * checked 'Harper 후보 요약 링크 넣기' on the reviewed form. Code makes the link and tells the browser where it may go.
 */
export const browserProfileLinkSchema = z.object({
  company_name: z.string().trim().min(1).max(160),
  posting_title: z.string().trim().min(1).max(200),
  posting_url: z.string().trim().max(2_000).nullish(),
}).strict();

export const BROWSER_PROFILE_LINK_PARAMETER = {
  type: "object",
  description: "Only with mode=execute for a web application to a posting when the user's reviewed form checked 'Harper 후보 요약 링크 넣기'. Pass it again with the same values on every execute run for that application, including one that continues or retries it (after email verification, login or an error); the existing link is reused. Code makes the candidate summary link and adds the placement rules to the task; never write Harper links into the task yourself.",
  properties: {
    company_name: { type: "string" },
    posting_title: { type: "string", description: "The title of the posting this application is for." },
    posting_url: { type: "string", description: "The posting's URL, when known." },
  },
  required: ["company_name", "posting_title"],
  additionalProperties: false,
};
