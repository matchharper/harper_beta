import { profileExtraEntries } from "./talentOnboarding/profileStore";

export type DebugProfileRow = {
  user_id: string;
  talent_experiences: { count: number }[];
  talent_educations: { count: number }[];
  talent_extras: { content: unknown } | null;
};
export type DebugResumeUpload = {
  user_id: string;
  created_at: string;
  storage_path: string | null;
  origin_type: string | null;
};
export type DebugProfileRevision = {
  profile_id: string;
  revision: number;
  created_at: string;
  resume_links: string[] | null;
  source_kind: string | null;
  profile: { talent_id: string };
};
export type DebugProfileSubmission = {
  user_id: string;
  resume: boolean;
  linkedin: boolean;
};
export type DebugProfileStats = {
  registeredUsers: number;
  emptyUserIds: string[];
  resumeUsers: number;
  linkedinUsers: number;
};

function linkedinProfiles(links: string[] | null) {
  return new Set(
    (links ?? []).flatMap((link) => {
      try {
        const url = new URL(link.includes("://") ? link : `https://${link}`);
        const segments = url.pathname.split("/").filter(Boolean);
        return (url.hostname === "linkedin.com" ||
          url.hostname.endsWith(".linkedin.com")) &&
          segments[0] === "in" &&
          Boolean(segments[1])
          ? [segments[1].toLowerCase()]
          : [];
      } catch {
        return [];
      }
    })
  );
}

// Use immutable upload/revision times. A login or unrelated profile edit must
// not turn an old resume/LinkedIn registration into today's submission.
export function buildDebugProfileSubmissions(args: {
  uploads: DebugResumeUpload[];
  revisions: DebugProfileRevision[];
  previousRevisions: DebugProfileRevision[];
  startIso: string;
  endIso: string;
}): DebugProfileSubmission[] {
  const inWindow = (at: string) =>
    Date.parse(at) >= Date.parse(args.startIso) &&
    Date.parse(at) < Date.parse(args.endIso);
  const users = new Map<string, DebugProfileSubmission>();
  const add = (userId: string, kind: "resume" | "linkedin") => {
    const user = users.get(userId) ?? {
      user_id: userId,
      resume: false,
      linkedin: false,
    };
    user[kind] = true;
    users.set(userId, user);
  };
  for (const upload of args.uploads) {
    if (
      inWindow(upload.created_at) &&
      upload.storage_path?.trim() &&
      upload.origin_type !== "harper_generated_resume"
    )
      add(upload.user_id, "resume");
  }
  const revisions = new Map(
    [...args.previousRevisions, ...args.revisions].map((r) => [
      `${r.profile_id}:${r.revision}`,
      r,
    ])
  );
  for (const revision of args.revisions) {
    if (
      !inWindow(revision.created_at) ||
      revision.source_kind === "existing_profile"
    )
      continue;
    const previous = revisions.get(
      `${revision.profile_id}:${revision.revision - 1}`
    );
    if (revision.revision > 1 && !previous)
      throw new Error("LinkedIn 등록 시각 확인에 필요한 이전 프로필 이력 누락");
    const oldLinks = linkedinProfiles(previous?.resume_links ?? []);
    if (
      [...linkedinProfiles(revision.resume_links)].some(
        (link) => !oldLinks.has(link)
      )
    )
      add(revision.profile.talent_id, "linkedin");
  }
  return [...users.values()];
}

export function buildDebugProfileStats(
  rows: DebugProfileRow[],
  submissions: DebugProfileSubmission[]
): DebugProfileStats {
  const stats: DebugProfileStats = {
    registeredUsers: 0,
    emptyUserIds: [],
    resumeUsers: 0,
    linkedinUsers: 0,
  };
  const byUser = new Map(rows.map((row) => [row.user_id, row]));
  for (const { user_id, resume, linkedin } of submissions) {
    const row = byUser.get(user_id);
    if (!row) throw new Error("등록자의 프로필 조회 결과 누락");
    stats.registeredUsers++;
    if (resume) stats.resumeUsers++;
    if (linkedin) stats.linkedinUsers++;
    if (
      !row.talent_experiences.some((r) => r.count > 0) &&
      !row.talent_educations.some((r) => r.count > 0) &&
      profileExtraEntries(row.talent_extras?.content).rows.length === 0
    )
      stats.emptyUserIds.push(row.user_id);
  }
  return stats;
}
