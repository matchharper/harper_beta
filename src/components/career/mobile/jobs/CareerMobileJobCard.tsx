"use client";

import React from "react";
import OpportunityListCard from "@/components/career/history/OpportunityListCard";

type CareerMobileJobCardProps = Omit<
  React.ComponentProps<typeof OpportunityListCard>,
  "savedStatus" | "onSavedStatusChange" | "onOpenDetail"
> & {
  status: React.ComponentProps<typeof OpportunityListCard>["savedStatus"];
  onStatusChange?: React.ComponentProps<
    typeof OpportunityListCard
  >["onSavedStatusChange"];
  onOpenDetail?: React.ComponentProps<
    typeof OpportunityListCard
  >["onOpenDetail"];
};
const noop = () => {};

export const CareerMobileJobCard = React.memo(function CareerMobileJobCard({
  status,
  onStatusChange,
  onOpenDetail,
  ...props
}: CareerMobileJobCardProps) {
  return (
    <OpportunityListCard
      {...props}
      savedStatus={status}
      onSavedStatusChange={onStatusChange}
      onOpenDetail={onOpenDetail ?? noop}
    />
  );
});
