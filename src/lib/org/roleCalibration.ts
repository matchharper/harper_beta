import type {
  TalentEducationItem,
  TalentExperienceItem,
  TalentExtraItem,
} from "@/components/profile/TalentExperienceSection";

export const COMPANY_ROLE_CALIBRATION_PROFILE_IDS = [
  "A",
  "B",
  "C",
  "D",
  "E",
] as const;

export type CompanyRoleCalibrationProfileId =
  (typeof COMPANY_ROLE_CALIBRATION_PROFILE_IDS)[number];
export type CompanyRoleCalibrationReviewStatus = "unreviewed" | "good" | "bad";
export type CompanyRoleCalibrationStatus =
  | "queued"
  | "running"
  | "ready"
  | "sent"
  | "completed"
  | "failed"
  | "canceled";

export type CompanyRoleCalibrationDisplayProfile = {
  bio: string | null;
  educations: TalentEducationItem[];
  experiences: TalentExperienceItem[];
  extras: TalentExtraItem[];
  headline: string | null;
  location: string | null;
  name: string;
  profilePicture: string | null;
  profileMarkdown: string | null;
};

export type CompanyRoleCalibrationPublicProfile = {
  display: CompanyRoleCalibrationDisplayProfile;
  profileId: CompanyRoleCalibrationProfileId;
  review: {
    reason: string | null;
    reviewedAt: string | null;
    status: CompanyRoleCalibrationReviewStatus;
  };
  selection: {
    hypothesis: string | null;
    reason: string;
  };
};

export type CompanyRoleCalibrationResponse = {
  calibration: {
    calibrationId: string;
    profiles: CompanyRoleCalibrationPublicProfile[];
    roleId: string;
    status: CompanyRoleCalibrationStatus;
    updatedAt: string;
  } | null;
  ok: true;
  state: "none" | "preparing" | "ready" | "unavailable";
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "")
    .replaceAll("\u0000", "")
    .trim();
  return normalized.slice(0, maxLength);
}

function nullableText(value: unknown, maxLength: number) {
  return boundedText(value, maxLength) || null;
}

function profileId(value: unknown): CompanyRoleCalibrationProfileId | null {
  const normalized = boundedText(value, 1);
  return COMPANY_ROLE_CALIBRATION_PROFILE_IDS.includes(
    normalized as CompanyRoleCalibrationProfileId
  )
    ? (normalized as CompanyRoleCalibrationProfileId)
    : null;
}

function reviewStatus(value: unknown): CompanyRoleCalibrationReviewStatus {
  return value === "good" || value === "bad" ? value : "unreviewed";
}

function localProfilePicture(value: unknown) {
  const src = nullableText(value, 500);
  return src?.startsWith("/") && !src.startsWith("//") ? src : null;
}

function safeExperience(value: unknown): TalentExperienceItem {
  const source = object(value);
  return {
    companyLocation: nullableText(source.companyLocation, 300),
    companyLogo: nullableText(source.companyLogo, 1_000),
    companyName: nullableText(source.companyName, 300),
    description: nullableText(source.description, 6_000),
    employmentType: nullableText(source.employmentType, 120),
    endDate: nullableText(source.endDate, 80),
    role: nullableText(source.role, 300),
    startDate: nullableText(source.startDate, 80),
  };
}

function safeEducation(value: unknown): TalentEducationItem {
  const source = object(value);
  return {
    degree: nullableText(source.degree, 300),
    description: nullableText(source.description, 4_000),
    endDate: nullableText(source.endDate, 80),
    field: nullableText(source.field, 300),
    school: nullableText(source.school, 300),
    startDate: nullableText(source.startDate, 80),
  };
}

function safeExtra(value: unknown): TalentExtraItem {
  const source = object(value);
  return {
    date: nullableText(source.date, 80),
    description: nullableText(source.description, 4_000),
    title: nullableText(source.title, 300),
  };
}

export function sanitizeCompanyRoleCalibrationProfile(
  value: unknown
): CompanyRoleCalibrationPublicProfile | null {
  const source = object(value);
  const id = profileId(source.profileId);
  if (!id) return null;
  const display = object(source.display);
  const selection = object(source.selection);
  const review = object(source.review);
  const name = boundedText(display.name, 200);
  if (!name) return null;

  return {
    display: {
      bio: nullableText(display.bio, 6_000),
      educations: (Array.isArray(display.educations) ? display.educations : [])
        .slice(0, 12)
        .map(safeEducation),
      experiences: (Array.isArray(display.experiences)
        ? display.experiences
        : []
      )
        .slice(0, 25)
        .map(safeExperience),
      extras: (Array.isArray(display.extras) ? display.extras : [])
        .slice(0, 20)
        .map(safeExtra),
      headline: nullableText(display.headline, 300),
      location: nullableText(display.location, 300),
      name,
      profileMarkdown: nullableText(display.profileMarkdown, 8_000),
      profilePicture: localProfilePicture(display.profilePicture),
    },
    profileId: id,
    review: {
      reason: nullableText(review.reason, 1_000),
      reviewedAt: nullableText(review.reviewedAt, 80),
      status: reviewStatus(review.status),
    },
    selection: {
      hypothesis: nullableText(selection.hypothesis, 1_000),
      reason:
        boundedText(selection.reason, 1_200) ||
        "이 역할에서 연결 가능성을 확인할 가치가 있는 예시예요.",
    },
  };
}

export function calibrationPublicState(
  status: CompanyRoleCalibrationStatus | null
): CompanyRoleCalibrationResponse["state"] {
  if (status === "queued" || status === "running") return "preparing";
  if (status === "ready" || status === "sent" || status === "completed") {
    return "ready";
  }
  if (status === "failed" || status === "canceled") return "unavailable";
  return "none";
}

export function isCompanyRoleCalibrationStatus(
  value: unknown
): value is CompanyRoleCalibrationStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "ready" ||
    value === "sent" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  );
}
