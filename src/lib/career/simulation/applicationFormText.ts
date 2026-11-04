import { applicationLimitations, type ApplicationForm } from "./applicationForm";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { applicationFieldId } from "./applicationReview";

/** Document-facing requirements, without browser execution or inspection metadata. */
export function applicationRequirementsText(form?: ApplicationForm) {
  if (!form) return "";
  return [
    ...form.fields.map(field => [
      `### ${field.label} — ${field.required === null ? "requiredness unknown" : field.required ? "required" : "optional"}`,
      field.instructions && `Instructions: ${field.instructions}`,
      field.options.length && `Options: ${field.options.join("; ")}`,
      field.fileTypes.length && `Accepted files: ${field.fileTypes.join(", ")}`,
      field.maxLength != null && `Maximum characters: ${field.maxLength}`,
    ].filter(Boolean).join("\n")),
    form.text && `Application page source text:\n${form.text}`,
  ].filter(Boolean).join("\n\n");
}

/** Observed form evidence for preparation; never infer requirements from missing DOM facts. */
export function applicationFormText(form?: ApplicationForm) {
  if (!form) return "Application form: not inspected; requirements and submission access are unknown.";
  return [
    `Application form: ${form.status}; checkedAt: ${formatLlmDateTime(form.checkedAt)} (Asia/Seoul)`,
    `Application URL: ${form.url}`,
    `Assisted submission access: ${form.submission?.status ?? "unknown"}.`,
    ...applicationLimitations(form).map(text => `Inspection limitation: ${text}`),
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
