import type { Announcement } from "@/components/common/AnnouncementQueue";
import { HarperAnnouncementVisual } from "@/components/common/HarperAnnouncementVisual";
import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { buildOrgHref } from "@/lib/org/routes";

/**
 * Company-side notices. Keep IDs stable when editing copy; use a new ID for a
 * new notice. publishedAt determines visibility and oldest-first order.
 */
export function useOrgAnnouncements(workspaceId: string): readonly Announcement[] {
  const t = useOrgT();
  return [
    {
      id: "org-welcome-v1",
      publishedAt: "2026-10-08T00:00:00+09:00",
      title: t("announcement.welcome.title", "환영합니다."),
      description: t(
        "announcement.welcome.description",
        "Harper는 반대편에서 뛰어난 여러 후보자와 대화하며 그들의 니즈를 듣고 있어요. 적합한 사람을 바로 연결해드릴게요."
      ),
      media: <HarperAnnouncementVisual />,
      action: {
        label: t("announcement.welcome.action", "새 포지션 만들기"),
        href: buildOrgHref({ orgId: workspaceId, page: "new-role" }),
      },
    },
  ];
}
