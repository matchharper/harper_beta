import { Check, GalleryVerticalEnd, House, Settings2, UserRoundCog } from "lucide-react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerNotificationsPopover from "./CareerNotificationsPopover";
import { careerCx } from "./ui/CareerPrimitives";
import ChatbubblesIcon from "@/assets/icons/chatbubbles.svg";

export type CareerWorkspaceTab = "home" | "profile" | "chat" | "history";

export const isCareerWorkspaceTab = (
  value: string | null | undefined
): value is CareerWorkspaceTab =>
  value === "home" ||
  value === "profile" ||
  value === "chat" ||
  value === "history";

export const getCareerWorkspaceHref = (tab: CareerWorkspaceTab) =>
  tab === "home" ? "/career" : `/career/${tab}`;

const NAV_ITEMS: Array<{
  id: CareerWorkspaceTab;
  label: string;
  icon: typeof UserRoundCog;
}> = [
  {
    id: "home",
    label: "Home",
    icon: House,
  },
  {
    id: "chat",
    label: "대화",
    icon: ChatbubblesIcon,
  },
  {
    id: "profile",
    label: "프로필",
    icon: UserRoundCog,
  },
  {
    id: "history",
    label: "History",
    icon: GalleryVerticalEnd,
  },
];

const CareerWorkspaceNav = ({
  activeTab,
  onChange,
}: {
  activeTab: CareerWorkspaceTab;
  onChange: (tab: CareerWorkspaceTab) => void;
}) => {
  const {
    user,
    onOpenSettings,
    talentProfile,
    notifications,
    unreadNotificationCount,
    notificationsMarkingAsRead,
    notificationsError,
    onMarkNotificationsRead,
  } = useCareerSidebarContext();

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");
  const profileName = talentProfile.talentUser?.name ?? displayName;
  const profileEmail = user?.email ?? "";
  const profileImageUrl =
    talentProfile.talentUser?.profile_picture ??
    user?.user_metadata?.avatar_url;
  const normalizedProfileName = String(profileName ?? "Candidate");

  const profileInitial =
    normalizedProfileName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") || "C";

  return (
    <aside className="w-full border-r border-black/5 bg-beige50 text-beige900 lg:sticky lg:top-0 lg:h-screen lg:w-[264px] lg:shrink-0 lg:self-start lg:border-b-0 lg:border-r lg:border-r-black/5">
      <div className="flex h-full flex-col py-5 px-3">
        <button
          type="button"
          onClick={() => onChange("home")}
          className="text-left"
        >
          <div className="font-halant text-3xl leading-none">Harper</div>
        </button>

        <nav className="mt-6 space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeTab;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                className={careerCx(
                  "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all duration-200",
                  active ? "bg-beige200" : "text-hgray200 hover:bg-beige200"
                )}
              >
                <div
                  className={careerCx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-[12px] transition-colors"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className={careerCx("text-[15px] font-medium leading-5")}
                  >
                    {item.label}
                  </div>
                  {/* <div className="text-[13px] leading-5 text-beige900/50 font-normal">
                    {item.description}
                  </div> */}
                </div>

                <div
                  className={careerCx(
                    "flex h-7 w-7 shrink-0 items-center justify-center transition-colors"
                  )}
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="mt-6 flex-1" />

        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex h-11 w-full items-center gap-2 rounded-md px-3 text-sm transition-colors hover:bg-beige200"
          >
            <Settings2 className="h-4 w-4" />
            설정
          </button>
          <CareerNotificationsPopover
            notifications={notifications}
            unreadNotificationCount={unreadNotificationCount}
            notificationsMarkingAsRead={notificationsMarkingAsRead}
            notificationsError={notificationsError}
            onMarkNotificationsRead={onMarkNotificationsRead}
          />
          <button
            type="button"
            onClick={() => onChange("profile")}
            className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] p-3 text-left transition-colors hover:bg-beige200"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-hblack50 text-sm font-medium text-hblack400">
                {profileImageUrl &&
                !profileImageUrl.includes("media.licdn.com") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileImageUrl}
                    alt={profileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  profileInitial
                )}
              </div>

              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {profileName}
                </div>
                <div className="mt-1 truncate text-[13px]">
                  {profileEmail || "Career profile"}
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default CareerWorkspaceNav;
