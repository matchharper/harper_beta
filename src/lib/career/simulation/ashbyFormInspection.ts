import { z } from "zod";
import type { ApplicationForm } from "./applicationForm";

// Read-only query observed on Ashby's public application page. No account,
// candidate data, or submission operation is sent. Schema drift uses the browser fallback.
const query = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
 jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
  applicationForm { sections { title descriptionHtml isHidden fieldEntries { field isRequired descriptionHtml isHidden } } }
 }
}`;
const field = z.object({ title: z.string(), type: z.string(), path: z.string().optional() }).passthrough();
const responseSchema = z.object({ data: z.object({ jobPosting: z.object({ applicationForm: z.object({
 sections: z.array(z.object({ title: z.string().nullable(), descriptionHtml: z.string().nullable().optional(), isHidden: z.boolean().nullable(),
 fieldEntries: z.array(z.object({ field, isRequired: z.boolean().nullable(), descriptionHtml: z.string().nullable(), isHidden: z.boolean().nullable() })) }))
 }) }) }) });

export async function inspectAshbyForm(url: URL, signal: AbortSignal, request: typeof fetch = fetch): Promise<ApplicationForm | null> {
 if (url.hostname !== "jobs.ashbyhq.com") return null;
 const parts = url.pathname.split("/").filter(Boolean);
 if (parts.length !== 3 || parts[2] !== "application") return null;
 try {
  const response = await request("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
   method: "POST", redirect: "error", signal, headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ operationName: "ApiJobPosting", query, variables: {
    organizationHostedJobsPageName: decodeURIComponent(parts[0]), jobPostingId: decodeURIComponent(parts[1]),
   } }),
  });
  if (!response.ok) return null;
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  const fields: ApplicationForm["fields"] = [];
  for (const section of parsed.data.data.jobPosting.applicationForm.sections) {
   if (section.isHidden) continue;
   for (const entry of section.fieldEntries) {
    const f = entry.field;
    if (entry.isHidden || ["_systemfield_name", "_systemfield_email", "_systemfield_location", "_systemfield_resume"].includes(f.path ?? "")) continue;
    // Structural narrowing only: the existing analysis LLM decides which text,
    // file, and link fields need substantive preparation, rather than keyword rules.
    if (!["String", "LongText", "File", "Url", "URL"].includes(f.type)) continue;
    fields.push({ label: f.title, type: f.type, required: entry.isRequired, options: [],
     instructions: [section.title, section.descriptionHtml, entry.descriptionHtml].filter(Boolean).join("\n"),
     fileTypes: [], maxLength: null });
   }
  }
  return { status: "partial", url: url.href, checkedAt: new Date().toISOString(), fields,
   limitations: ["Preparation-only snapshot from the public application form: evaluate text, file and link fields for substantive written answers, cover letters and portfolios. Basic personal details are deferred to application execution. Hidden or answer-dependent fields and browser-only format/length constraints have not been verified."] };
 } catch { return null; }
}
