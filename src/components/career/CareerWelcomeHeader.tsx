import { Text } from "@/components/ui/text";
import { formatCareerMessage } from "@/i18n/careerMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "./CareerSidebarContext";
import { cn } from "@/lib/cn";

const countFormatter = new Intl.NumberFormat("ko-KR");

export const useCareerWelcomeContent = () => {
  const t = useCareerT();
  const { m } = useMessages();
  const { activeCompanyRoleCount, user } = useCareerSidebarContext();
  const { talentProfile } = useCareerProfileContext();

  const displayName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");

  const activeOpportunityLabel =
    activeCompanyRoleCount > 0
      ? formatCareerMessage(
          m,
          t(
            "career.home.career_home_panel.1jcg4hg",
            "현재 Harper 네트워크에서 {count}개의 기회를 스캔하고 있습니다. 매일매일 더 많은 기회를 발견합니다."
          ),
          { count: countFormatter.format(activeCompanyRoleCount * 2) }
        )
      : formatCareerMessage(
          m,
          t(
            "career.home.career_home_panel.0rlf0ya",
            "현재 Harper는 새로운 기회를 계속 탐색하고 있습니다."
          )
        );

  return { displayName, activeOpportunityLabel };
};

export default function CareerWelcomeHeader({
  align = "center",
}: {
  align?: "center" | "left";
}) {
  const { displayName, activeOpportunityLabel } = useCareerWelcomeContent();

  return (
    <div className={cn("mb-8 space-y-2", align === "left" && "text-left")}>
      <Text
        as="h3"
        type="head2"
        className={cn("font-hedvig", align === "left" && "text-left")}
      >
        Welcome, <span className="text-primary">{displayName}</span>!
      </Text>
      <Text
        type="desc"
        className={cn("text-center", align === "left" && "text-left")}
      >
        {activeOpportunityLabel}
      </Text>
    </div>
  );
}
