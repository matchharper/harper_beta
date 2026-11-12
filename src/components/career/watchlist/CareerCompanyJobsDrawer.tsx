import { useEffect } from "react";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import { useCareerCompanyFollowContext } from "../CareerSidebarContext";
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
  useEffect(() => () => setItem(null), [setItem, user?.id]);
  return (
    <CareerCompanyDetailDrawer
      companyDbId={item?.companyDbId ?? null}
      roleId={item?.roleId}
      open={Boolean(user && item)}
      onClose={() => setItem(null)}
      onOpenChat={() => {
        setItem(null);
        onOpenChat?.();
      }}
      opportunity={item}
      source="same_company_jobs"
    />
  );
}
