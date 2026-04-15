import { useState } from "react";
import { useRouter } from "next/router";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerLoginGate from "@/components/career/CareerLoginGate";
import CareerSettingsModal from "@/components/career/CareerSettingsModal";
import CareerWorkspaceScreen, {
  CareerLoadingState,
} from "@/components/career/CareerWorkspaceScreen";
import {
  getCareerWorkspaceHref,
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";

const CareerWorkspacePage = ({
  activeTab,
}: {
  activeTab: CareerWorkspaceTab;
}) => {
  const router = useRouter();
  const { user, authLoading, authPending, authError, handleGoogleLogin } =
    useCareerAuth();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const isRouterReady = router.isReady;
  const inviteToken =
    isRouterReady && typeof router.query.invite === "string"
      ? router.query.invite
      : null;
  const mail =
    isRouterReady && typeof router.query.mail === "string"
      ? router.query.mail
      : null;

  if (authLoading || !isRouterReady) {
    return <CareerLoadingState />;
  }

  if (!user) {
    return (
      <CareerWorkspaceScreen>
        <CareerLoginGate
          activeTab={activeTab}
          authPending={authPending}
          authError={authError}
          onGoogleLogin={handleGoogleLogin}
        />
      </CareerWorkspaceScreen>
    );
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
      mail={mail}
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
