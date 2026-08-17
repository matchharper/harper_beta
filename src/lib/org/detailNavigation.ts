export type OrgTalentDetailNavigationTarget = {
  recommendationId: string;
  roleId: string;
  talentId: string;
  workspaceId?: string;
};

export type OrgTalentDetailNavigationState<
  T extends OrgTalentDetailNavigationTarget,
> = {
  currentIndex: number;
  next: T | null;
  position: number;
  previous: T | null;
  total: number;
};

export function getOrgTalentDetailNavigationState<
  T extends OrgTalentDetailNavigationTarget,
>(
  items: readonly T[],
  current: {
    recommendationId?: string | null;
    roleId?: string | null;
    talentId?: string | null;
  }
): OrgTalentDetailNavigationState<T> | null {
  if (items.length === 0) return null;

  const recommendationId = current.recommendationId?.trim();
  const roleId = current.roleId?.trim();
  const talentId = current.talentId?.trim();
  const currentIndex = items.findIndex((item) => {
    if (recommendationId) {
      return item.recommendationId === recommendationId;
    }
    return Boolean(
      talentId &&
      item.talentId === talentId &&
      (!roleId || item.roleId === roleId)
    );
  });

  if (currentIndex < 0) return null;

  return {
    currentIndex,
    next: items[currentIndex + 1] ?? null,
    position: currentIndex + 1,
    previous: items[currentIndex - 1] ?? null,
    total: items.length,
  };
}
