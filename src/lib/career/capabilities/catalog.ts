import { careerPromptText, type CareerPromptExperiment } from "../prompts/promptExperiment";
import type { CAREER_CAPABILITIES } from "./registry";

export const CAREER_CATALOG_HEADER = [
  "## Career capabilities",
  "Explain this catalog directly for capability overviews; load details for concrete tasks or unanswered specifics.",
  "These abilities are available even when their detailed tools are not loaded.",
].join("\n");
export const CAREER_CATALOG_LOADER_GUIDE = "Load needed capabilities, then continue the request. Loading needs no confirmation; tools become callable in the next model response. Available abilities in other instructions include this catalog. Keep loading mechanics internal.";

export function careerCapabilityDescription(
  capability: (typeof CAREER_CAPABILITIES)[number],
  eligibleNames: ReadonlySet<string>,
  experiment?: CareerPromptExperiment,
) {
  const allowed = capability.tools.filter(([name]) => eligibleNames.has(name));
  const description = careerPromptText(experiment, `capability:${capability.id}`, capability.summary);
  if (!allowed.length || !description.trim()) return "";
  if (allowed.length === capability.tools.length) return description;
  // Availability is an execution fact; do not reintroduce registry prose into an experiment.
  return experiment
    ? `${description}\nAvailable tools in this request: ${allowed.map(([name]) => name).join(", ")}.`
    : `Only: ${allowed.map(([, effect]) => effect).join("; ")}. Other actions in this capability are unavailable in this request.`;
}
