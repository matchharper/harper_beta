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
  onChange,
}: {
  status: CareerOpportunityManagementStatus;
  disabled?: boolean;
  prominent?: boolean;
  onChange?: (status: CareerOpportunityManagementStatus) => void;
}) {
  const t = useCareerT();
  const chat = useOptionalCareerChatPanelContext();
  const label = getCareerOpportunityManagementStatusLabel(status, t);
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
            disabled={disabled}
            className={cn(
              className,
              prominent && "rounded-control border border-action/25 bg-action-faded px-3 py-2 font-medium text-action-strong hover:bg-action/15",
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
              (option.id === "closed" && status === "hidden")
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
            {option.label}
          </ActionDropdownItem>
        ))}
      </ActionDropdown>
    </div>
  );
}
