import { useCareerT } from "@/i18n/useCareerT";
import type { CareerInlineUiReference } from "@/lib/career/inlineUi";
import UpcomingAppointments from "../../UpcomingAppointments";
import { CareerAutomationSettingsSection } from "../../CareerAutomationSettingsSection";
import { CareerActionItemsPanel } from "../../CareerActionItemsPanel";
import { useCareerWorkspaceNavigation } from "../../CareerWorkspaceNavigationContext";
import { useOptionalCareerChatPanelContext } from "../../CareerChatPanelContext";

export default function CareerInlineWorkspaceUi({
  reference,
}: {
  reference: CareerInlineUiReference;
}) {
  const t = useCareerT();
  const navigation = useCareerWorkspaceNavigation();
  const chat = useOptionalCareerChatPanelContext();
  return (
    <section
      className="career-glass w-full min-w-0 p-[18px]"
      data-career-inline-workspace={reference.type}
    >
      {reference.type === "meetings" ? (
        <UpcomingAppointments
          showEmpty
          roleId={reference.roleId}
          onOpenRole={chat?.onOpenHistoryOpportunity}
        />
      ) : reference.type === "automations" ? (
        <CareerAutomationSettingsSection section="schedules" />
      ) : reference.type === "actions" && navigation ? (
        <>
          <h2 className="mb-4 text-[16px] font-medium">
            {t("career.tasks.title", "할 일")}
          </h2>
          <CareerActionItemsPanel
            onOpenChatAction={navigation.openChatAction}
          />
        </>
      ) : (
        <p className="text-sm text-neutral-muted">
          {t(
            "career.chat.inline_ui.unavailable",
            "이 내용을 표시할 수 없어요."
          )}
        </p>
      )}
    </section>
  );
}
