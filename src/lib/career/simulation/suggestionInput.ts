import { formatPromptText } from "@/lib/llm/promptText";
import type { TalentStructuredProfile } from "@/lib/talentOnboarding/models";
import { renderTalentContextPrompt, type TalentContextPromptSnapshot } from "@/lib/talentOnboarding/talentContexts";
import { applicationRequirementsText } from "./applicationFormText";
import type { ApplicationForm } from "./applicationForm";
import { buildSimulationRoleInput, type readSimulationJdSource } from "./jdSource";
import { simulationProfileSnapshot } from "./profileSnapshot";

export type ApplicationSuggestionInput = {
  candidate: string;
  resume: string;
  role: string;
  language: string;
  application?: string;
};

type PublicCompanySource = {
  title: string;
  url: string;
  publishedDate?: string;
  highlights: string[];
};

/** The production review and Ops debugger share this exact model-facing projection. */
export async function buildApplicationSuggestionInput(args: {
  profile: TalentStructuredProfile;
  contact: { name?: string | null; email?: string | null; phone_number?: string | null; resume_links?: string[] | null } | null;
  context: TalentContextPromptSnapshot;
  resume: string;
  roleName: string;
  savedRole: Record<string, unknown>;
  language: string;
  jdSource?: Awaited<ReturnType<typeof readSimulationJdSource>>;
  companySources?: PublicCompanySource[];
  includeCurrentPosting?: boolean;
  applicationForm?: ApplicationForm;
}): Promise<ApplicationSuggestionInput> {
  const candidate = [
    simulationProfileSnapshot(args.profile),
    formatPromptText({
      name: args.contact?.name,
      email: args.contact?.email,
      phone: args.contact?.phone_number,
      links: args.contact?.resume_links,
    }),
    renderTalentContextPrompt(args.context),
  ].join("\n\n");
  let role = await buildSimulationRoleInput(
    args.roleName,
    args.jdSource ?? { status: "unavailable", reason: "No live page supplied." },
    async () => args.savedRole,
  );
  if (args.companySources?.length) {
    role += "\n\n## Public company sources\n\n" + args.companySources.map(source =>
      formatPromptText({
        title: source.title,
        source: source.url,
        ...(source.publishedDate ? { publishedDate: source.publishedDate } : {}),
        highlights: source.highlights,
      })
    ).join("\n\n");
  }
  if (args.includeCurrentPosting && args.jdSource?.status === "read" && "url" in args.jdSource && "markdown" in args.jdSource
    && typeof args.savedRole.description === "string" && args.savedRole.description.trim()) {
    role += `\n\n## Current posting\nSource: ${args.jdSource.url}\n\n${args.jdSource.markdown}`;
  }
  const application = applicationRequirementsText(args.applicationForm);
  return {
    candidate,
    resume: args.resume,
    role,
    language: args.language,
    ...(application ? { application } : {}),
  };
}
