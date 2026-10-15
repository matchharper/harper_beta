import { z } from "zod";
import type { ApplicationForm } from "./applicationForm";

// Read-only query observed on Ashby's public application page. No account,
// candidate data, or submission operation is sent. Schema drift uses the browser fallback.
const query = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
 jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
  applicationForm { sections { title descriptionHtml isHidden fieldEntries { field isRequired descriptionHtml isHidden } } }
 }
}`;
const field = z
  .object({ title: z.string(), type: z.string(), path: z.string().optional() })
  .passthrough();
const responseSchema = z.object({
  data: z.object({
    jobPosting: z.object({
      applicationForm: z.object({
        sections: z.array(
          z.object({
            title: z.string().nullable(),
            descriptionHtml: z.string().nullable().optional(),
            isHidden: z.boolean().nullable(),
            fieldEntries: z.array(
              z.object({
                field,
                isRequired: z.boolean().nullable(),
                descriptionHtml: z.string().nullable(),
                isHidden: z.boolean().nullable(),
              })
            ),
          })
        ),
      }),
    }),
  }),
});

export async function inspectAshbyForm(
  url: URL,
  signal: AbortSignal,
  request: typeof fetch = fetch
): Promise<ApplicationForm | null> {
  if (url.hostname !== "jobs.ashbyhq.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[2] !== "application") return null;
  try {
    const response = await request(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting",
      {
        method: "POST",
        redirect: "error",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationName: "ApiJobPosting",
          query,
          variables: {
            organizationHostedJobsPageName: decodeURIComponent(parts[0]),
            jobPostingId: decodeURIComponent(parts[1]),
          },
        }),
      }
    );
    if (!response.ok) return null;
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const fields: ApplicationForm["fields"] = [];
    for (const section of parsed.data.data.jobPosting.applicationForm
      .sections) {
      if (section.isHidden) continue;
      for (const entry of section.fieldEntries) {
        const f = entry.field;
        if (entry.isHidden) continue;
        fields.push({
          label: f.title,
          type: f.type,
          required: entry.isRequired,
          options: [],
          instructions: [
            section.title,
            section.descriptionHtml,
            entry.descriptionHtml,
          ]
            .filter(Boolean)
            .join("\n"),
          fileTypes: [],
          maxLength: null,
        });
      }
    }
    return {
      status: "partial",
      submission: { status: "supported", reason: "A public application form is available; conditional fields and submission still require browser verification." },
      url: url.href,
      checkedAt: new Date().toISOString(),
      fields,
      text: fields
        .map((f) => f.label + "\n" + f.instructions)
        .join("\n")
        .slice(0, 40000),
      limitations: [
        "Public application form inventory includes basic fields, documents, links and custom questions. The application analysis decides which items need advance preparation. Hidden or answer-dependent fields and browser-only format/length constraints have not been verified.",
      ],
    };
  } catch {
    return null;
  }
}
