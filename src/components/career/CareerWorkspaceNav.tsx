import {
  Check,
  FolderClock,
  MessageSquareText,
  UserRoundCog,
} from "lucide-react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { CareerProgressBar, careerCx } from "./ui/CareerPrimitives";

export type CareerWorkspaceTab = "profile" | "chat" | "history";

const NAV_ITEMS: Array<{
  id: CareerWorkspaceTab;
  label: string;
  description: string;
  icon: typeof UserRoundCog;
}> = [
  {
    id: "profile",
    label: "프로필",
    description: "답변, 링크, 이력서",
    icon: UserRoundCog,
  },
  {
    id: "chat",
    label: "대화",
    description: "Harper와 진행",
    icon: MessageSquareText,
  },
  {
    id: "history",
    label: "History",
    description: "기록",
    icon: FolderClock,
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
    stage,
    userChatCount,
    progressPercent,
    answeredCount,
    targetQuestions,
    networkApplication,
    talentProfile,
  } = useCareerSidebarContext();

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");

  const navStatus = {
    profile: Boolean(
      networkApplication?.selectedRole ||
      talentProfile.talentUser?.name ||
      talentProfile.talentExperiences.length > 0
    ),
    chat: stage !== "profile" || userChatCount > 0,
    history: false,
  } satisfies Record<CareerWorkspaceTab, boolean>;

  return (
    <aside className="w-full lg:sticky lg:top-[76px] lg:w-[272px] lg:shrink-0 lg:self-start">
      <nav className="mt-4 space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeTab;
          const completed = navStatus[item.id];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={careerCx(
                "flex w-full items-center gap-3 border px-3 py-3 text-left transition-colors",
                active
                  ? "border-beige900/20 bg-white/65"
                  : "border-transparent bg-transparent hover:border-beige900/10 hover:bg-white/45"
              )}
            >
              <div
                className={careerCx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border",
                  active
                    ? "border-beige900/20 bg-white/70 text-beige900"
                    : "border-beige900/10 bg-white/45 text-beige900/60"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium leading-5 text-beige900">
                  {item.label}
                </div>
                <div className="mt-1 text-[13px] leading-5 text-beige900/45">
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default CareerWorkspaceNav;
