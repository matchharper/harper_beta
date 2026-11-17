import { ChevronDown } from "lucide-react";
import { BareButton } from "@/components/ui/button";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import { useOptionalCareerChatPanelContext } from "../CareerChatPanelContext";
import {
  getCareerOpportunityManagementStatusLabel,
  getCareerOpportunityManagementStatusOptions,
  type CareerOpportunityManagementStatus,
} from "./savedOpportunityStatus";

export const opportunityStatusColor = (
  status: CareerOpportunityManagementStatus
) =>
  status === "applied" || status === "offer"
    ? "text-positive"
    : status === "connected"
      ? "text-action"
      : "text-neutral-muted";

export default function OpportunityStatusDropdown({
  status,
  disabled,
  prominent = false,
  includeArchive = false,
  onChange,
}: {
  status: CareerOpportunityManagementStatus;
  disabled?: boolean;
  prominent?: boolean;
  includeArchive?: boolean;
  onChange?: (status: CareerOpportunityManagementStatus) => void;
}) {
  const t = useCareerT();
  const chat = useOptionalCareerChatPanelContext();
  const closedLabel = t("career.common.career_history_panel.1hsndwk", "진행 종료");
  const label =
    includeArchive && status === "hidden"
      ? t("career.profile.versions.archived", "보관됨")
      : includeArchive && status === "closed"
        ? closedLabel
        : getCareerOpportunityManagementStatusLabel(status, t);
  const className = cn(
    "inline-flex shrink-0 items-center gap-1 text-[15px] font-normal leading-6",
    opportunityStatusColor(status)
  );
  if (!onChange) return <span className={className}>{label}</span>;
  return (
    <div
      data-career-card-action="true"
      className="shrink-0"
      onClick={(event) => event.stopPropagation()}
    >
      <ActionDropdown
        align="end"
        contentClassName="min-w-[160px]"
        trigger={
          <BareButton
            aria-label={t(
              "career.history.opportunity_list_card.status_menu",
              "{status} 상태 변경",
              { values: { status: label } }
            )}
            disabled={disabled}
            className={cn(
              className,
              includeArchive && "min-h-9 px-2",
              prominent &&
                "rounded-control border border-action/25 bg-action-faded px-3 py-2 font-medium text-action-strong hover:bg-action/15",
              "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 disabled:opacity-50 text-sm"
            )}
          >
            {label}
            <ChevronDown aria-hidden className="size-3.5" />
          </BareButton>
        }
      >
        {getCareerOpportunityManagementStatusOptions(t).map((option) => (
          <ActionDropdownItem
            key={option.id}
            selected={
              option.id === status ||
              (!includeArchive && option.id === "closed" && status === "hidden")
            }
            disabled={
              disabled ||
              (option.id === "offer" &&
                Boolean(
                  !chat?.user ||
                  !chat.conversationId ||
                  chat.chatPending ||
                  chat.assistantTyping ||
                  chat.sessionPending ||
                  chat.profilePending ||
                  chat.opportunityFeedbackFollowUpPending
                ))
            }
            onSelect={() => onChange(option.id)}
          >
            {includeArchive && option.id === "closed"
              ? closedLabel
              : option.label}
          </ActionDropdownItem>
        ))}
        {includeArchive && (
          <ActionDropdownItem
            selected={status === "hidden"}
            onSelect={() => onChange("hidden")}
          >
            {t(
              "career.history.saved_opportunity_status.hide_action",
              "보관하기"
            )}
          </ActionDropdownItem>
        )}
      </ActionDropdown>
    </div>
  );
}
