import React, { useEffect, useState } from "react";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerSettingsModal from "@/components/career/CareerSettingsModal";
import CareerWorkspaceScreen, {
  CareerLoadingState,
} from "@/components/career/CareerWorkspaceScreen";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/router";

const Career = () => {
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

  return (
    <CareerFlowProvider
      inviteToken={inviteToken}
      onOpenSettings={() => setIsSettingsModalOpen(true)}
    >
      <CareerWorkspaceScreen
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />
      <CareerSettingsModal
        open={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </CareerFlowProvider>
  );
};

export default Career;
