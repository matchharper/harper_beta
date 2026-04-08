import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerSettingsModal from "@/components/career/CareerSettingsModal";
import CareerWorkspaceScreen, {
  CareerLoadingState,
} from "@/components/career/CareerWorkspaceScreen";
import {
  getCareerWorkspaceHref,
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { useAuthStore } from "@/store/useAuthStore";

const CareerWorkspacePage = ({
  activeTab,
}: {
  activeTab: CareerWorkspaceTab;
}) => {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const inviteToken =
    typeof router.query.invite === "string" ? router.query.invite : null;

  useEffect(() => {
    if (authLoading || user) return;

    const nextUrl = inviteToken
      ? `/career_login?invite=${encodeURIComponent(inviteToken)}`
      : "/career_login";
    void router.replace(nextUrl);
  }, [authLoading, inviteToken, router, user]);

  if (authLoading || !user) {
    return <CareerLoadingState />;
  }

  const handleChangeTab = (nextTab: CareerWorkspaceTab) => {
    const nextHref = getCareerWorkspaceHref(nextTab);
    const nextQuery =
      inviteToken && nextHref.startsWith("/career")
        ? { invite: inviteToken }
        : undefined;

    void router.push({
      pathname: nextHref,
      query: nextQuery,
    });
  };

  return (
    <CareerFlowProvider
      inviteToken={inviteToken}
      onOpenSettings={() => setIsSettingsModalOpen(true)}
    >
      <CareerWorkspaceScreen
        activeTab={activeTab}
        onChangeTab={handleChangeTab}
      />
      <CareerSettingsModal
        open={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </CareerFlowProvider>
  );
};

export default CareerWorkspacePage;
