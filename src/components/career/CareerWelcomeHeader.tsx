import { Text } from "@/components/ui/text";
import { useCareerT } from "@/i18n/useCareerT";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "./CareerSidebarContext";
import { cn } from "@/lib/cn";

export const useCareerWelcomeContent = () => {
  const t = useCareerT();
  const { user } = useCareerSidebarContext();
  const { talentProfile } = useCareerProfileContext();

  const displayName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");

  const activeOpportunityLabel = t(
    "career.home.career_home_panel.0rlf0ya",
    "지금도 새 기회를 살펴보고 있어요."
  );
  const greeting = t("career.home.welcome", "{name}님, 반가워요", {
    values: { name: displayName },
  });

  return { displayName, greeting, activeOpportunityLabel };
};

export default function CareerWelcomeHeader({
  align = "center",
}: {
  align?: "center" | "left";
}) {
  const { greeting, activeOpportunityLabel } = useCareerWelcomeContent();

  return (
    <div className={cn("mb-8 space-y-2", align === "left" && "text-left")}>
      <Text
        as="h3"
        type="head2"
        className={cn("font-hedvig", align === "left" && "text-left")}
      >
        {greeting}
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
