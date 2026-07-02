type AuthenticatedUserWithMetadata = {
  user_metadata?: Record<string, unknown> | null;
};

const normalizeImageUrl = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const isLinkedinMediaImageUrl = (value: string) =>
  value.toLowerCase().includes("media.licdn.com");

export function getAuthenticatedUserProfileImageUrl(
  user: AuthenticatedUserWithMetadata | null | undefined
) {
  const metadata = user?.user_metadata;
  return (
    normalizeImageUrl(metadata?.avatar_url) ??
    normalizeImageUrl(metadata?.picture) ??
    normalizeImageUrl(metadata?.photo_url) ??
    null
  );
}

export function getCareerMenuProfileImageUrl({
  authenticatedUserImageUrl,
  talentProfileImageUrl,
}: {
  authenticatedUserImageUrl?: string | null;
  talentProfileImageUrl?: string | null;
}) {
  const talentImageUrl = normalizeImageUrl(talentProfileImageUrl);
  if (talentImageUrl && !isLinkedinMediaImageUrl(talentImageUrl)) {
    return talentImageUrl;
  }

  return normalizeImageUrl(authenticatedUserImageUrl);
}
