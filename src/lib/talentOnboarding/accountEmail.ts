import type { SupabaseClient, User } from "@supabase/supabase-js";
import { TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE } from "@/lib/career/accountEmailErrors";
import { ensureTalentUserRecord } from "@/lib/talentOnboarding/server";

type UntypedAdminClient = SupabaseClient<any>;

export type TalentAccountProfile = {
  email: string | null;
  name: string | null;
  user_id: string;
};

export const normalizeTalentAccountEmail = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const isValidTalentAccountEmail = (value: string) =>
  value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const escapeTalentAccountEmailLikePattern = (value: string) =>
  value.replace(/[\\%_]/g, "\\$&");

export async function isTalentAccountEmailAvailable(
  admin: UntypedAdminClient,
  args: {
    email: string;
    userId: string;
  }
) {
  const { data, error } = await admin
    .from("talent_users")
    .select("user_id")
    .ilike("email", escapeTalentAccountEmailLikePattern(args.email))
    .neq("user_id", args.userId)
    .limit(1);

  if (error) {
    throw new Error(
      error.message ?? "Failed to check talent account email availability"
    );
  }

  return (data ?? []).length === 0;
}

export async function syncVerifiedTalentAccountEmail(args: {
  admin: UntypedAdminClient;
  user: User;
}) {
  const { admin, user } = args;
  const email = normalizeTalentAccountEmail(user.email);

  if (!user.email_confirmed_at) {
    const error = new Error("인증되지 않은 이메일은 저장할 수 없습니다.");
    Object.assign(error, { code: "EMAIL_NOT_CONFIRMED", status: 409 });
    throw error;
  }
  if (!isValidTalentAccountEmail(email)) {
    throw new Error("Authenticated user does not have a valid email");
  }

  await ensureTalentUserRecord({ admin, user });

  const { data: currentProfile, error: currentProfileError } = await admin
    .from("talent_users")
    .select("user_id, email, name")
    .eq("user_id", user.id)
    .single();

  if (currentProfileError) {
    throw new Error(
      currentProfileError.message ?? "Failed to read talent account"
    );
  }

  const changed = normalizeTalentAccountEmail(currentProfile?.email) !== email;

  if (changed) {
    const available = await isTalentAccountEmailAvailable(admin, {
      email,
      userId: user.id,
    });
    if (!available) {
      const error = new Error(TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE);
      Object.assign(error, { code: "EMAIL_IN_USE", status: 409 });
      throw error;
    }
  }

  let profile = currentProfile as TalentAccountProfile;
  if (changed) {
    const { data, error } = await admin
      .from("talent_users")
      .update({
        email,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("user_id, email, name")
      .single();

    if (error) {
      throw new Error(error.message ?? "Failed to sync talent account email");
    }
    profile = data as TalentAccountProfile;
  }

  return {
    changed,
    pendingEmail: normalizeTalentAccountEmail(user.new_email) || null,
    profile,
  };
}
