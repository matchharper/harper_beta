import { useMessages } from "@/i18n/useMessage";
import { formatCareerMeetingDateTimeRange } from "@/lib/career/meetingDisplay";
import AppointmentCreateButton from "../AppointmentCreateButton";
import type { CareerHistoryOpportunity } from "../types";
import OpportunityCard from "./OpportunityCard";
import OpportunityStatusDropdown from "./OpportunityStatusDropdown";
import type { CareerOpportunityManagementStatus } from "./savedOpportunityStatus";

export default function ProgressOpportunityRow({
  item,
  status,
  pending,
  onStatusChange,
  onOpenDetail,
  showAppointmentCreate = false,
}: {
  item: CareerHistoryOpportunity;
  status: CareerOpportunityManagementStatus;
  pending: boolean;
  onStatusChange?: (status: CareerOpportunityManagementStatus) => void;
  onOpenDetail?: (item: CareerHistoryOpportunity) => void;
  showAppointmentCreate?: boolean;
}) {
  const meeting = item.upcomingMeeting;
  return (
    <OpportunityCard
      item={item}
      expanded={false}
      showUnreadIndicator={false}
      onOpenDetail={onOpenDetail ? () => onOpenDetail(item) : undefined}
      collapsedActions={
        <OpportunityStatusDropdown
          status={status}
          disabled={pending}
          onChange={onStatusChange}
        />
      }
      collapsedFooter={
        meeting || showAppointmentCreate ? (
          <OpportunityAppointmentSummary
            item={item}
            showAppointmentCreate={showAppointmentCreate}
          />
        ) : undefined
      }
    />
  );
}

export function OpportunityAppointmentSummary({
  item,
  showAppointmentCreate = false,
}: {
  item: CareerHistoryOpportunity;
  showAppointmentCreate?: boolean;
}) {
  const { locale } = useMessages();
  const meeting = item.upcomingMeeting;
  if (!meeting && !showAppointmentCreate) return null;
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
      {meeting && (
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[11px] font-normal leading-4">
          <span className="text-action">
            {formatCareerMeetingDateTimeRange({ ...meeting, locale })}
          </span>
          {meeting.title && (
            <span className="truncate text-neutral-muted">{meeting.title}</span>
          )}
        </div>
      )}
      {showAppointmentCreate && (
        <AppointmentCreateButton
          roleId={item.roleId}
          positionTitle={item.title}
          companyName={item.companyName}
          subtle
        />
      )}
    </div>
  );
}
