import { useEffect } from "react";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import { useCareerCompanyFollowContext } from "../CareerSidebarContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import CareerCompanyDetailDrawer from "./CareerCompanyDetailDrawer";

export default function CareerCompanyJobsDrawer() {
  const item = useCareerWorkspaceUiStore(
    (state) => state.companyJobsOpportunity
  );
  const setItem = useCareerWorkspaceUiStore(
    (state) => state.setCompanyJobsOpportunity
  );
  const { user } = useCareerCompanyFollowContext();
  const onOpenChat = useCareerWorkspaceUiStore(
    (state) => state.companyJobsOnOpenChat
  );
  const mobile = useIsMobile();
  useEffect(() => () => setItem(null), [setItem, user?.id]);
  return (
    <CareerCompanyDetailDrawer
      companyDbId={item?.companyDbId ?? null}
      roleId={item?.roleId}
      open={Boolean(user && item)}
      mobileLayout={mobile}
      onClose={() => setItem(null)}
      showCompanyJobsInitially
      onOpenChat={() => {
        setItem(null);
        onOpenChat?.();
      }}
      opportunity={item}
      source="same_company_jobs"
    />
  );
}
