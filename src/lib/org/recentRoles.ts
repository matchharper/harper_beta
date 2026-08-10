import type { OrgRole } from "@/lib/org/server";

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortOrgRolesByRecentConversation(roles: OrgRole[]) {
  return [...roles].sort((left, right) => {
    const leftConversationAt = timestamp(left.lastConversationAt);
    const rightConversationAt = timestamp(right.lastConversationAt);
    if (leftConversationAt && rightConversationAt) {
      return rightConversationAt - leftConversationAt;
    }
    if (leftConversationAt) return -1;
    if (rightConversationAt) return 1;
    return timestamp(right.createdAt) - timestamp(left.createdAt);
  });
}
