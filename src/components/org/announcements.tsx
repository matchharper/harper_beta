import type { Announcement } from "@/components/common/AnnouncementQueue";
import { HarperAnnouncementVisual } from "@/components/common/HarperAnnouncementVisual";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { buildOrgHref } from "@/lib/org/routes";

/**
 * Company-side notices. Keep IDs stable when editing copy; use a new ID for a
 * new notice. publishedAt determines visibility and oldest-first order.
 */
export function useOrgAnnouncements(
  workspaceId: string
): readonly Announcement[] {
  const { c } = useOrgLocale();
  return [
    {
      id: "org-welcome-v1",
      publishedAt: "2026-10-08T00:00:00+09:00",
      title: c("환영합니다.", "Welcome."),
      description: c(
        "Harper는 반대편에서 뛰어난 여러 후보자와 대화하며 그들의 니즈를 듣고 있어요. 적합한 사람을 바로 연결해드릴게요.",
        "Harper is talking with talented candidates to understand what they’re looking for, and will connect you with the right people."
      ),
      media: <HarperAnnouncementVisual />,
      action: {
        label: c("새 포지션 만들기", "Create a position"),
        href: buildOrgHref({ orgId: workspaceId, page: "new-role" }),
      },
    },
  ];
}
