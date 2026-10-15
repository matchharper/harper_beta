import { AnnouncementQueue } from "@/components/common/AnnouncementQueue";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgAnnouncements } from "./announcements";

/** Mounted only by the authenticated, ready /org/home workspace. */
export function OrgAnnouncement({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const announcements = useOrgAnnouncements(workspaceId);
  return <AnnouncementQueue userId={userId} announcements={announcements} />;
}
