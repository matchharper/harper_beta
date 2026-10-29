import type { ApplicationForm } from "./applicationForm";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { applicationFieldId } from "./applicationReview";

/** Observed form evidence for preparation; never infer requirements from missing DOM facts. */
export function applicationFormText(form?: ApplicationForm) {
  if (!form) return "Application form: not inspected; requirements and submission access are unknown.";
  return [
    `Application form: ${form.status}; checkedAt: ${formatLlmDateTime(form.checkedAt)} (Asia/Seoul)`,
    `Application URL: ${form.url}`,
    `Assisted submission access: ${form.submission?.status ?? "unknown"}. ${form.submission?.reason ?? "No access conclusion recorded."}`,
    ...form.limitations.map(text => `Inspection limitation: ${text}`),
    ...form.fields.map((field, index) => [
      `Field ${applicationFieldId(index)}: ${field.label} | type: ${field.type} | ${field.required === null ? "requiredness unknown" : field.required ? "required" : "optional"}`,
      field.instructions && `Instructions: ${field.instructions}`,
      field.name && `Input name: ${field.name}`,
      field.optionValue && `Option value: ${field.optionValue}`,
      field.multiple != null && `Multiple values/files: ${field.multiple ? "yes" : "no"}`,
      field.options.length && `Options: ${field.options.join("; ")}`,
      field.fileTypes.length && `Accepted files: ${field.fileTypes.join(", ")}`,
      field.maxLength != null && `Maximum characters: ${field.maxLength}`,
    ].filter(Boolean).join("\n")),
    form.text && `Application page text (source evidence):\n${form.text}`,
  ].filter(Boolean).join("\n\n");
}
