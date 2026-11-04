import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Typography } from "@/components/ui/typography";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerProfileContext } from "./CareerSidebarContext";
import { getProfileVisibilityLabels } from "./ProfileVisibilityPanel";

export default function CareerProfileSharingSummary() {
  const t = useCareerT();
  const router = useRouter();
  const { profileVisibility, settingsLoading, settingsError } =
    useCareerProfileContext();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Typography as="span" variant="caption">
          {t(
            "career.profile.career_profile_settings_section.1tnqucg",
            "프로필 공유 방식"
          )}
        </Typography>
        {settingsLoading ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <Typography
            as="span"
            variant="description"
            className={settingsError ? "text-critical" : undefined}
          >
            {settingsError || getProfileVisibilityLabels(t)[profileVisibility]}
          </Typography>
        )}
      </div>
      <MuteButton asChild size="sm">
        <Link
          href={
            router.pathname === "/career/preview"
              ? { pathname: router.pathname, query: { tab: "profile" } }
              : "/career/profile"
          }
          shallow
          scroll={false}
        >
          {t("career.common.career_workspace_screen.0b0v9cr", "프로필")}
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </MuteButton>
    </div>
  );
}
