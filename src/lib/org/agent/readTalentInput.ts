import { OrgAgentToolInputError } from "@/lib/org/agent/toolAvailability";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function has(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export function parseReadTalentProfileView(input: Record<string, unknown>) {
  if (input.profileView === undefined) return undefined;
  if (input.profileView !== "outline" && input.profileView !== "full") {
    throw new OrgAgentToolInputError("profileView must be outline or full");
  }
  if (input.includeProfile === false) {
    throw new OrgAgentToolInputError("profileView includes a profile; omit includeProfile=false");
  }
  return input.profileView;
}

const PROFILE_SECTIONS = ["bio", "experience", "education", "extras"] as const;
type ProfileSection = typeof PROFILE_SECTIONS[number];

export function parseReadTalentProfileSections(input: Record<string, unknown>): ProfileSection[] | undefined {
  if (input.profileSections === undefined) return undefined;
  if (input.includeProfile === false || !Array.isArray(input.profileSections)
      || input.profileSections.some(value => !PROFILE_SECTIONS.includes(value))) {
    throw new OrgAgentToolInputError("profileSections must contain profile section names and cannot accompany includeProfile=false");
  }
  return [...new Set(input.profileSections)] as ProfileSection[];
}

/** Project only already-authorized profile data; original prose stays available. */
export function projectReadTalentProfile<T extends { profile?: unknown }>(item: T, view: "outline" | "full" | undefined, sections?: ProfileSection[]): T {
  if ((view !== "outline" && sections === undefined) || !item.profile || typeof item.profile !== "object" || Array.isArray(item.profile)) return item;
  const profile = item.profile as Record<string, unknown>;
  const metadata = (rows: unknown) => Array.isArray(rows) ? rows.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const { description: _description, ...fields } = row;
    return fields;
  }) : [];
  const projected = { ...profile };
  if (view === "outline") {
    delete projected.bio;
    for (const key of ["experiences", "education", "extras"]) projected[key] = metadata(profile[key]);
  }
  if (sections !== undefined) {
    for (const section of PROFILE_SECTIONS) {
      if (!sections.includes(section)) delete projected[section === "experience" ? "experiences" : section];
    }
  }
  return { ...item, ...(view ? { profileView: view } : {}),
    ...(sections !== undefined ? { profileSections: sections } : {}), profile: projected };
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
  const talentIds = input.talentIds.map((item, index) =>
    requiredTalentId(item, `talentIds[${index}]`)
  );
  if (new Set(talentIds).size !== talentIds.length) {
    throw new OrgAgentToolInputError("talentIds must not contain duplicates");
  }
  return talentIds;
}
