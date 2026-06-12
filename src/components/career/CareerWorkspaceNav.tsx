import { CircleHelp, Settings2 } from "lucide-react";
import { useState } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerProfileMenu from "./CareerProfileMenu";
import CareerSupportInquiryModal from "./CareerSupportInquiryModal";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import React from "react";
import { BareButton } from "@/components/ui/button";

export type CareerWorkspaceTab = "home" | "profile" | "history" | "watchlist";

export const isCareerWorkspaceTab = (
  value: string | null | undefined
): value is CareerWorkspaceTab =>
  value === "home" ||
  value === "profile" ||
  value === "history" ||
  value === "watchlist";

export const getCareerWorkspaceHref = (tab: CareerWorkspaceTab) =>
  tab === "home" ? "/career" : `/career/${tab}`;

export const getCareerWorkspaceTabFromPath = (path: string) => {
  const pathname = path.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/career";
  const queryString = path.split("?")[1]?.split("#")[0] ?? "";
  const searchParams = new URLSearchParams(queryString);

  if (pathname === "/career") {
    return searchParams.has("historyTab") ||
      searchParams.has("savedStage") ||
      searchParams.has("id")
      ? "history"
      : "home";
  }

  const [, root, tab] = pathname.split("/");
  if (root !== "career") return "home";
  return isCareerWorkspaceTab(tab) ? tab : "home";
};

const CareerWorkspaceNav = () => {
  const logCareerEvent = useCareerLogEvent();
  const { user, onLogout, onOpenSettings, talentProfile } =
    useCareerSidebarContext();

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");
  const profileName = talentProfile.talentUser?.name ?? displayName;
  const profileEmail = user?.email ?? "";
  const profileImageUrl =
    talentProfile.talentUser?.profile_picture ??
    user?.user_metadata?.avatar_url ??
    null;

  const [inquiryOpen, setInquiryOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-neutral-1000-a05 bg-bg-default text-neutral-primary backdrop-blur-xl">
        <div className="flex flex-row items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="font-hedvig text-[1.1rem] text-neutral-primary">
            Harper
          </div>
          <div className="flex items-center gap-2">
            <BareButton
              type="button"
              onClick={() => {
                logCareerEvent("click_open_support");
                setInquiryOpen(true);
              }}
              aria-label="개선사항 및 문의사항"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating text-neutral-primary hover:border-neutral-1000-a10 hover:bg-bg-weak"
            >
              <CircleHelp className="h-4 w-4" />
            </BareButton>
            <BareButton
              type="button"
              onClick={onOpenSettings}
              aria-label="설정"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating text-neutral-primary hover:border-neutral-1000-a10 hover:bg-bg-weak"
            >
              <Settings2 className="h-4 w-4" />
            </BareButton>
            <CareerProfileMenu
              variant="desktop"
              profileImageUrl={profileImageUrl}
              profileName={String(profileName ?? "Candidate")}
              profileEmail={profileEmail}
              onLogout={onLogout}
              onSuggestUpdate={() => setInquiryOpen(true)}
            />
          </div>
        </div>
      </header>
      {inquiryOpen && (
        <CareerSupportInquiryModal
          onClose={() => setInquiryOpen(false)}
          defaultEmail={profileEmail}
        />
      )}
    </>
  );
};

export default React.memo(CareerWorkspaceNav);
