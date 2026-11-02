import { projectLlmDateTimes } from "@/lib/llm/promptDateTime";

/** Authored schedule references only, never a whole schedule/DB row. */
export function formatScheduleTargets(targets: unknown): string[] {
  const lines: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      if (!value.length) lines.push(`Target ${path}: none`);
      else if (value.every(item => item === null || typeof item !== "object"))
        lines.push(`Target ${path}: ${value.map(item => item === null ? "unspecified" : String(item)).join(", ")}`);
      else value.forEach((item, index) => visit(item, `${path}[${index + 1}]`));
    } else if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length && path) lines.push(`Target ${path}: no references supplied`);
      entries.forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key));
    } else if (path) lines.push(`Target ${path}: ${value === null || value === undefined ? "unspecified" : String(value)}`);
  };
  visit(projectLlmDateTimes(targets), "");
  return lines;
}
