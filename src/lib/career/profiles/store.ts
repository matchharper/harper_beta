import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentStructuredProfile } from "@/lib/talentOnboarding/models";
import { fetchTalentStructuredProfile } from "@/lib/talentOnboarding/profileStore";
import { resolveTalentProfilePhoto } from "@/lib/talentOnboarding/profilePhoto";

export type ProfileSnapshot = TalentStructuredProfile & {
  talentUser:
    | (NonNullable<TalentStructuredProfile["talentUser"]> &
        Record<string, unknown>)
    | null;
};
export type StoredProfile = {
  profileId: string;
  revision: number;
  title: string;
  purpose: string | null;
  isDefault: boolean;
  isArchived: boolean;
  snapshot: ProfileSnapshot;
};
type Context = { admin: TalentAdminClient; userId: string };

class ProfileReaderUnavailable extends Error {}

async function readExistingProfile(args: Context) {
  const snapshot = await fetchTalentStructuredProfile(args);
  if (!snapshot.talentUser) throw new Error("Profile not found.");
  return snapshot;
}

export async function readProfileSnapshot(
  args: Context & { profileId?: string; revision?: number }
): Promise<StoredProfile> {
  const { data, error } = await (args.admin.rpc as any)(
    "read_talent_profile_v1",
    {
      p_talent_id: args.userId,
      p_profile_id: args.profileId ?? null,
      p_revision: args.revision ?? null,
    }
  );
  if (error) {
    if (error.code === "PGRST202")
      throw new ProfileReaderUnavailable(error.message);
    throw new Error(error.message);
  }
  if (!data) throw new Error("Profile not found.");
  return data as StoredProfile;
}

export async function listProfiles(
  args: Context & {
    archived?: boolean;
    query?: string;
    cursor?: string;
    limit?: number;
  }
) {
  try {
    await readProfileSnapshot(args);
  } catch (error) {
    if (!(error instanceof ProfileReaderUnavailable)) throw error;
    await readExistingProfile(args);
    return {
      compatibility: "existing_profile" as const,
      profiles: [],
      nextCursor: null,
    };
  }
  let query = (args.admin.from("talent_profiles" as any) as any)
    .select(
      "id,title,purpose,current_revision,is_default,is_archived,created_at,updated_at"
    )
    .eq("talent_id", args.userId)
    .order("id")
    .limit((args.limit ?? 30) + 1);
  if (args.archived !== undefined)
    query = query.eq("is_archived", args.archived);
  if (args.query) query = query.ilike("title", `%${args.query}%`);
  if (args.cursor) query = query.gt("id", args.cursor);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [],
    limit = args.limit ?? 30;
  return {
    profiles: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1].id : null,
  };
}

export async function writeProfileSnapshot(
  args: Context & {
    action:
      | "create"
      | "copy"
      | "update"
      | "set_default"
      | "archive"
      | "restore";
    profileId?: string;
    expectedRevision?: number;
    snapshot?: ProfileSnapshot;
    title?: string;
    purpose?: string;
    operationId: string;
    source?: Record<string, unknown>;
  }
): Promise<StoredProfile> {
  if (
    args.action === "create" ||
    args.action === "update" ||
    (args.action === "copy" && args.snapshot !== undefined)
  ) {
    const snapshot = args.snapshot;
    if (
      !snapshot?.talentUser ||
      !Array.isArray(snapshot.talentExperiences) ||
      !Array.isArray(snapshot.talentEducations) ||
      !Array.isArray(snapshot.talentExtras)
    )
      throw new Error("A complete profile snapshot is required.");
  }
  let snapshot = args.snapshot;
  let expectedRevision = args.expectedRevision;
  if (["set_default", "restore", "archive"].includes(args.action) || (!snapshot && args.action === "copy")) {
    const source = await readProfileSnapshot({ ...args, revision: args.expectedRevision });
    snapshot = source.snapshot;
  }
  if (snapshot?.talentUser) {
    const picture = await resolveTalentProfilePhoto({
      admin: args.admin, userId: args.userId, url: snapshot.talentUser.profile_picture,
    });
    if (picture !== (snapshot.talentUser.profile_picture ?? null)) {
      snapshot = { ...snapshot, talentUser: { ...snapshot.talentUser, profile_picture: picture } };
      // These metadata actions reuse the stored snapshot in SQL. Normalize the
      // selected revision first, retaining its concurrency and idempotency contract.
      if (["set_default", "restore", "archive"].includes(args.action)) {
        const normalized = await writeProfileSnapshot({ ...args, action: "update", snapshot,
          operationId: `${args.operationId}:photo-storage` });
        expectedRevision = normalized.revision;
      }
    }
  }
  const { data, error } = await (args.admin.rpc as any)(
    "write_talent_profile_v1",
    {
      p_talent_id: args.userId,
      p_action: args.action,
      p_profile_id: args.profileId ?? null,
      p_expected_revision: expectedRevision ?? null,
      p_snapshot: snapshot ?? null,
      p_title: args.title ?? null,
      p_purpose: args.purpose ?? null,
      p_operation_id: args.operationId,
      p_source: args.source ?? {},
    }
  );
  if (error) throw new Error(error.message);
  return data as StoredProfile;
}

/** Revision navigation is scoped to the profile already authorized above. */
export async function readProfile(
  args: Context & {
    profileId?: string;
    revision?: number;
    compareRevision?: number;
    historyCursor?: number;
    sections?: string[];
  }
) {
  let profile: StoredProfile;
  try {
    profile = await readProfileSnapshot(args);
  } catch (error) {
    if (!(error instanceof ProfileReaderUnavailable)) throw error;
    if (
      args.profileId !== undefined ||
      args.revision !== undefined ||
      args.compareRevision !== undefined ||
      args.historyCursor !== undefined
    )
      throw new Error(
        "Profile versions are unavailable. The current profile can be read without a profileId, revision, comparison or history cursor."
      );
    return {
      compatibility: "existing_profile" as const,
      snapshot: await readExistingProfile(args),
      sections: args.sections,
    };
  }
  let query = (args.admin.from("talent_profile_revisions" as any) as any)
    .select("revision,created_at,source")
    .eq("profile_id", profile.profileId)
    .order("revision", { ascending: false })
    .limit(21);
  if (args.historyCursor !== undefined)
    query = query.lt("revision", args.historyCursor);
  const { data, error } = await query;
  if (error) throw error;
  const history = data ?? [];
  const { data: revisionSource, error: sourceError } = await (args.admin.from("talent_profile_revisions" as any) as any)
    .select("source,created_at").eq("profile_id", profile.profileId).eq("revision", profile.revision).single();
  if (sourceError) throw sourceError;
  let sourceMessage;
  if (revisionSource?.source?.userMessageId) {
    const { data: message, error: messageError } = await args.admin.from("talent_messages")
      .select("id,role,content,message_type,payload,created_at")
      .eq("user_id", args.userId).eq("id", revisionSource.source.userMessageId).maybeSingle();
    if (messageError) throw messageError;
    if (message) {
      const { formatTalentMessageContentForLlmPrompt } = await import("../opportunityFeedbackNote");
      sourceMessage = { id: message.id, role: message.role, createdAt: message.created_at,
        content: formatTalentMessageContentForLlmPrompt(message) };
    }
  }
  const comparison =
    args.compareRevision === undefined
      ? undefined
      : await readProfileSnapshot({
          ...args,
          profileId: profile.profileId,
          revision: args.compareRevision,
        });
  return {
    ...profile,
    revisionSource,
    sourceMessage,
    sections: args.sections,
    comparison,
    history: history.slice(0, 20),
    nextHistoryCursor: history.length > 20 ? history[19].revision : null,
  };
}
