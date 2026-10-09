import { AnnouncementQueue } from "@/components/common/AnnouncementQueue";
import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { useOrgAnnouncements } from "./announcements";

/** Mounted only by the authenticated, ready /org/home workspace. */
export function OrgAnnouncement({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}) {
  const t = useOrgT();
  const announcements = useOrgAnnouncements(workspaceId);
  return (
    <AnnouncementQueue
      userId={userId}
      announcements={announcements}
      closeLabel={t("announcement.close", "안내 닫기")}
    />
  );
}
