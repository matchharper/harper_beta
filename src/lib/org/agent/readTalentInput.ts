import { OrgAgentToolInputError } from "@/lib/org/agent/toolAvailability";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function has(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requiredTalentId(value: unknown, field: string) {
  const normalized = text(value);
  if (!normalized) {
    throw new OrgAgentToolInputError(`${field} is required`);
  }
  if (normalized.length > 100) {
    throw new OrgAgentToolInputError(`${field} exceeds 100 characters`);
  }
  return normalized;
}

export function parseReadTalentIds(input: Record<string, unknown>) {
  const hasTalentId = has(input, "talentId");
  const hasTalentIds = has(input, "talentIds");
  if (hasTalentId && hasTalentIds) {
    throw new OrgAgentToolInputError("Provide talentIds or talentId, not both");
  }
  if (!hasTalentIds) {
    return [requiredTalentId(input.talentId, "talentId")];
  }
  if (!Array.isArray(input.talentIds) || input.talentIds.length === 0) {
    throw new OrgAgentToolInputError("talentIds must be a non-empty array");
  }
  if (input.talentIds.length > 10) {
    throw new OrgAgentToolInputError("talentIds must contain at most 10 items");
  }
  const talentIds = input.talentIds.map((item, index) =>
    requiredTalentId(item, `talentIds[${index}]`)
  );
  if (new Set(talentIds).size !== talentIds.length) {
    throw new OrgAgentToolInputError("talentIds must not contain duplicates");
  }
  return talentIds;
}
