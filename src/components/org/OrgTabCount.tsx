import { Badge } from "@/components/ui/badge";

/**
 * The number beside 연결을 기다리는 후보 and 연결을 요청할 후보: people waiting
 * on the team's decision. A filled count badge, like 후보 in the pill; on the
 * selected (dark) tab it turns light (`.org-tab-count`, org-floating-sky.css)
 * so it still reads as a badge. Nothing when there is no one.
 */
export function orgDecisionTabCount(value: number | null | undefined) {
  if (!value) return undefined;
  return (
    <Badge className="org-tab-count" radius="full" size="xs" variant="count">
      {String(value)}
    </Badge>
  );
}
