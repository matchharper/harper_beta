export const ORG_ROLE_QUICK_ACTIONS = [
  {
    id: "pipeline_summary",
    label: "Pipeline summary",
    message: "현재 연결된 후보자 파이프라인을 요약해서 설명해줘",
  },
  {
    id: "pending_intros",
    label: "Pending intros",
    message: "지금 결정이 필요한 연결 대기 목록을 알려줘",
  },
] as const;

export type OrgRoleQuickActionId =
  (typeof ORG_ROLE_QUICK_ACTIONS)[number]["id"];

export const HARPER_ROLE_QUICK_ACTION_PREFIX = "harper_role_quick_action:";
export const HARPER_ROLE_QUICK_ACTION_BLOCK_ID = "harper_role_quick_actions";

export function getOrgRoleQuickAction(value: unknown) {
  const id = String(value ?? "").trim();
  return ORG_ROLE_QUICK_ACTIONS.find((action) => action.id === id) ?? null;
}

export const ORG_ROLE_QUICK_ACTION_IDLE_MS = 60 * 60 * 1_000;

export function shouldShowOrgRoleQuickActions(args: {
  isStreaming: boolean;
  latestUserMessageAt?: string | null;
  now?: number;
}) {
  if (args.isStreaming) return false;
  const latestUserMessageAt = String(args.latestUserMessageAt ?? "").trim();
  if (!latestUserMessageAt) return true;
  const sentAt = new Date(latestUserMessageAt).getTime();
  if (!Number.isFinite(sentAt)) return true;
  return (args.now ?? Date.now()) - sentAt >= ORG_ROLE_QUICK_ACTION_IDLE_MS;
}
