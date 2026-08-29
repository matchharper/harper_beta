type InternalRoleSafetyRow = {
  information?: unknown;
  name?: unknown;
  source_job_id?: unknown;
  source_provider?: unknown;
  source_type?: unknown;
};

const TEST_ONLY_VALUES = new Set(["1", "on", "true", "yes"]);
const TEST_SOURCE_VALUES = new Set(["codex_e2e", "e2e", "qa_test", "test"]);
const TEST_ROLE_NAME = /^\[(?:e2e|codex\s+e2e|qa\s+test|test)(?:[^a-z0-9]|$)/i;
const TEST_SOURCE_JOB_ID = /^(?:test|e2e|codex[-_]?e2e)(?::|\/|-)/i;

function normalized(value: unknown) {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value).toLowerCase();
  }
  return "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isTestOnlyInternalRole(role: InternalRoleSafetyRow) {
  if (normalized(role.source_type) !== "internal") return false;
  const information = record(role.information);
  if (
    ["testOnly", "test_only", "isTest"].some((key) =>
      TEST_ONLY_VALUES.has(normalized(information?.[key]))
    )
  ) {
    return true;
  }
  return (
    TEST_SOURCE_VALUES.has(normalized(role.source_provider)) ||
    TEST_SOURCE_JOB_ID.test(String(role.source_job_id ?? "").trim()) ||
    TEST_ROLE_NAME.test(String(role.name ?? "").trim())
  );
}
