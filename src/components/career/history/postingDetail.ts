/** A posting opened on its own page before it is one of this person's opportunities. */
export const postingDetailQueryKey = (
  userId: string | null | undefined,
  roleId: string,
  locale: string
) => ["career-posting-detail", userId ?? null, roleId, locale] as const;
