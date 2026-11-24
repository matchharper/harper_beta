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
  description: "Only with mode=execute for a web application to a posting. Omit it: code follows the reviewed form's 'Harper 후보 요약 링크 넣기' box for the role (checked, or left as it was when the user approved in chat → the link is added), on every run of that application including retries. Pass false only when the user said in chat to leave the link out, or the object when they asked for it although the box is unchecked. Code makes the link and adds the placement rules to the task; never write Harper links into the task yourself.",
  anyOf: [
    {
      type: "object",
      properties: {
        company_name: { type: "string" },
        posting_title: { type: "string", description: "The title of the posting this application is for." },
        posting_url: { type: "string", description: "The posting's URL, when known." },
      },
      required: ["company_name", "posting_title"],
      additionalProperties: false,
    },
    { type: "boolean", description: "false: leave the link out (the user said so in chat). true is the same as omitting it." },
  ],
};
