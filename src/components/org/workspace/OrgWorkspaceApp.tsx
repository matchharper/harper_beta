import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { OrgEditDialog } from "@/components/org/OrgEditDialog";
import { OrgLoginScreen } from "@/components/org/OrgLoginScreen";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { OrgAgentPanel } from "@/components/org/agent/OrgAgentPanel";
import { OrgWorkspaceSidebar } from "@/components/org/workspace/OrgWorkspaceSidebar";
import { OrgWorkspaceShellSkeleton } from "@/components/org/workspace/OrgWorkspaceSidebar";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgHelpPage } from "@/components/org/workspace/pages/OrgHelpPage";
import { OrgHomePage } from "@/components/org/workspace/pages/OrgHomePage";
import { OrgJobsPage } from "@/components/org/workspace/pages/OrgJobsPage";
import { OrgSettingsPage } from "@/components/org/workspace/pages/OrgSettingsPage";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";
import {
  useOrgBoard,
  useOrgBootstrap,
  useOrgTalentDetail,
  useSetOrgCandidateStage,
  useUpdateOrgRole,
} from "@/hooks/org/useOrg";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { getOrgPermissions } from "@/lib/org/permissions";
import { buildOrgHref, type OrgWorkspacePageId } from "@/lib/org/routes";
import type {
  OrgBoardItem,
  OrgRole,
  OrgStageChangeOptions,
} from "@/lib/org/server";
import { useAuthStore } from "@/store/useAuthStore";
import { useToastStore } from "@/store/useToastStore";

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function OrgWorkspaceApp({
  legacyEntry = false,
  page,
}: {
  legacyEntry?: boolean;
  page: OrgWorkspacePageId;
}) {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const addToast = useToastStore((state) => state.add);
  const orgId = router.isReady ? getQueryText(router.query.orgId) : "";
  const urlRoleId = router.isReady ? getQueryText(router.query.roleId) : "";
  const detailTalentId = router.isReady
    ? getQueryText(router.query.talentId)
    : "";
  const detailRecommendationId = router.isReady
    ? getQueryText(router.query.recommendationId)
    : "";
  const detailRoleId = router.isReady
    ? getQueryText(router.query.detailRoleId)
    : "";
  const [signOutPending, setSignOutPending] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [recommendedFromDate, setRecommendedFromDate] = useState("");
  const [recommendedToDate, setRecommendedToDate] = useState("");
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const bootstrapQuery = useOrgBootstrap({
    enabled: router.isReady && Boolean(user),
    orgId,
  });
  const workspace = bootstrapQuery.data?.workspace ?? null;
  const currentUser = bootstrapQuery.data?.currentUser ?? null;
  const permissions = getOrgPermissions(currentUser?.role);
  const internalOpsAccess = isInternalDomainEmail(user?.email);
  const canSwitchWorkspace = internalOpsAccess;
  const roles = useMemo(
    () => bootstrapQuery.data?.roles ?? [],
    [bootstrapQuery.data?.roles]
  );
  const requestedRoleId = page === "jobs" ? urlRoleId || "all" : "all";
  const activeRoleId =
    requestedRoleId === "all" ||
    roles.some((role) => role.roleId === requestedRoleId)
      ? requestedRoleId
      : "all";
  const selectedRoleId =
    page === "jobs" && activeRoleId !== "all" ? activeRoleId : null;
  const shouldLoadBoard = page === "home" || page === "jobs";
  const boardQuery = useOrgBoard({
    enabled: Boolean(workspace && shouldLoadBoard),
    query: page === "jobs" && selectedRoleId ? nameQuery : "",
    recommendedFromDate:
      page === "jobs" && selectedRoleId ? recommendedFromDate : "",
    recommendedToDate:
      page === "jobs" && selectedRoleId ? recommendedToDate : "",
    roleId: selectedRoleId,
    workspaceId: workspace?.workspaceId ?? null,
  });
  const visibleSelectedItem = useMemo(() => {
    if (!detailTalentId && !detailRecommendationId) return null;
    return (
      (boardQuery.data?.items ?? []).find((item) => {
        if (
          detailRecommendationId &&
          item.recommendationId !== detailRecommendationId
        ) {
          return false;
        }
        if (detailTalentId && item.talentId !== detailTalentId) return false;
        if (detailRoleId && item.roleId !== detailRoleId) return false;
        return true;
      }) ?? null
    );
  }, [
    boardQuery.data?.items,
    detailRecommendationId,
    detailRoleId,
    detailTalentId,
  ]);
  const activeDetailTalentId =
    visibleSelectedItem?.talentId || detailTalentId || "";
  const activeDetailRecommendationId =
    visibleSelectedItem?.recommendationId || detailRecommendationId || "";
  const activeDetailRoleId = visibleSelectedItem?.roleId || detailRoleId || "";
  const detailOpen = page === "jobs" && Boolean(activeDetailTalentId);
  const detailQuery = useOrgTalentDetail({
    enabled: Boolean(workspace && detailOpen),
    recommendationId: activeDetailRecommendationId || null,
    roleId: activeDetailRoleId || null,
    talentId: activeDetailTalentId || null,
    workspaceId: workspace?.workspaceId ?? null,
  });
  const setStage = useSetOrgCandidateStage();
  const updateRole = useUpdateOrgRole();
  const activeRole = useMemo(
    () => roles.find((role) => role.roleId === activeRoleId) ?? null,
    [activeRoleId, roles]
  );
  const editingRole = useMemo(
    () =>
      editingRoleId
        ? (roles.find((role) => role.roleId === editingRoleId) ?? null)
        : null,
    [editingRoleId, roles]
  );

  useEffect(() => {
    if (!router.isReady || !user || !workspace) return;
    const roleIsCanonical =
      page !== "jobs" ||
      urlRoleId === activeRoleId ||
      (!urlRoleId && activeRoleId === "all");
    if (
      !legacyEntry &&
      orgId === workspace.workspaceId &&
      roleIsCanonical
    ) {
      return;
    }
    void router.replace(
      buildOrgHref({
        orgId: workspace.workspaceId,
        page: legacyEntry ? "home" : page,
        roleId: page === "jobs" ? activeRoleId : null,
      }),
      undefined,
      { shallow: !legacyEntry }
    );
  }, [
    activeRoleId,
    legacyEntry,
    orgId,
    page,
    router,
    router.isReady,
    urlRoleId,
    user,
    workspace,
  ]);

  const handleSignOut = async () => {
    setSignOutPending(true);
    try {
      await signOut();
      await router.replace("/org");
    } finally {
      setSignOutPending(false);
    }
  };

  const handleWorkspaceSelect = (workspaceId: string) => {
    if (!workspaceId || workspaceId === workspace?.workspaceId) return;
    setNameQuery("");
    setRecommendedFromDate("");
    setRecommendedToDate("");
    setEditingRoleId(null);
    void router.push(
      buildOrgHref({
        orgId: workspaceId,
        page,
        roleId: page === "jobs" ? "all" : null,
      })
    );
  };

  const handleRoleChange = (roleId: string) => {
    if (!workspace) return;
    setEditingRoleId(null);
    setNameQuery("");
    setRecommendedFromDate("");
    setRecommendedToDate("");
    void router.push(
      buildOrgHref({
        orgId: workspace.workspaceId,
        page: "jobs",
        roleId: roleId || "all",
      })
    );
  };

  const handleTalentSelect = (item: OrgBoardItem) => {
    if (!workspace) return;
    setEditingRoleId(null);
    void router.push(
      buildOrgHref({
        detail: {
          recommendationId: item.recommendationId,
          roleId: item.roleId,
          talentId: item.talentId,
        },
        orgId: workspace.workspaceId,
        page: "jobs",
        roleId: page === "jobs" ? activeRoleId : item.roleId,
      })
    );
  };

  const handleTalentDetailClose = () => {
    if (!workspace) return;
    void router.replace(
      buildOrgHref({
        orgId: workspace.workspaceId,
        page: "jobs",
        roleId: activeRoleId,
      }),
      undefined,
      { shallow: true }
    );
  };

  const handleStageChange = async (
    item: OrgBoardItem,
    stage: OrgBoardItem["stage"],
    options?: OrgStageChangeOptions
  ) => {
    if (!workspace || !permissions.canManageCandidates) return;
    try {
      await setStage.mutateAsync({
        acceptReason: options?.acceptReason ?? null,
        contactDirectly: options?.contactDirectly ?? false,
        introEmails: options?.introEmails ?? null,
        recommendationId: item.recommendationId,
        roleId: item.roleId,
        stage,
        stopNote: options?.stopNote ?? null,
        stopReason: options?.stopReason ?? null,
        talentId: item.talentId,
        workspaceId: workspace.workspaceId,
      });
      addToast({
        message: "후보자 상태를 변경했습니다.",
        variant: "success",
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "후보자 상태를 변경하지 못했습니다.",
        variant: "error",
      });
      throw error;
    }
  };

  const updateRoleLifecycle = async (
    role: OrgRole,
    args: { isExpired?: boolean; status: string }
  ) => {
    if (!workspace || !permissions.canManageCandidates) return;
    try {
      await updateRole.mutateAsync({
        isExpired: args.isExpired,
        roleId: role.roleId,
        status: args.status,
        workspaceId: workspace.workspaceId,
      });
      addToast({
        message:
          args.status === "deleted"
            ? "역할을 삭제했습니다."
            : args.status === "paused"
              ? "역할을 일시 중지했습니다."
              : "역할을 다시 시작했습니다.",
        variant: "success",
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "역할 상태를 변경하지 못했습니다.",
        variant: "error",
      });
    }
  };

  const deleteRole = (role: OrgRole) => {
    void updateRoleLifecycle(role, {
      isExpired: true,
      status: "deleted",
    });
  };

  const handleDeleteRole = (role: OrgRole) => {
    deleteRole(role);
  };

  if (authLoading || !router.isReady) {
    return <OrgWorkspaceShellSkeleton />;
  }
  if (!user) {
    return <OrgLoginScreen orgId={orgId} />;
  }
  if (bootstrapQuery.isLoading) {
    return <OrgWorkspaceShellSkeleton />;
  }
  if (bootstrapQuery.error) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-bg-default px-4 font-sans text-neutral-primary">
        <OrgErrorState
          className="w-full max-w-md"
          message={
            bootstrapQuery.error instanceof Error
              ? bootstrapQuery.error.message
              : "Organization을 불러오지 못했습니다."
          }
          onRetry={() => void bootstrapQuery.refetch()}
        />
      </main>
    );
  }
  if (!workspace) {
    return <OrgLoginScreen authenticatedEmail={user.email} />;
  }

  const selectedAcceptStageId =
    detailOpen && boardQuery.data?.stages
      ? (boardQuery.data.stages.find((stage) => stage.id === "connected")?.id ??
        null)
      : null;
  const pendingRecommendationId = setStage.isPending
    ? (setStage.variables?.recommendationId ?? null)
    : null;
  const currentUserEmail = currentUser?.email ?? user.email ?? null;
  const pageTitle = `${workspace.companyName} · ${page[0].toUpperCase()}${page.slice(1)}`;
  const contentWidth = page === "jobs" ? "max-w-[1680px]" : "max-w-[1240px]";

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <main className="min-h-svh bg-bg-default font-sans text-neutral-primary">
        <OrgWorkspaceSidebar
          activePage={page}
          canSwitchWorkspace={canSwitchWorkspace}
          currentUser={currentUser}
          onSignOut={() => void handleSignOut()}
          onWorkspaceSelect={handleWorkspaceSelect}
          signOutPending={signOutPending}
          workspace={workspace}
          workspaces={bootstrapQuery.data?.workspaces ?? []}
        />
        <div className="lg:pl-[232px]">
          <div
            className={`mx-auto ${contentWidth} px-4 py-6 sm:px-7 sm:py-9 lg:px-10 lg:py-10`}
          >
            {page === "home" ? (
              <OrgHomePage
                board={boardQuery.data}
                currentUserEmail={currentUserEmail}
                error={
                  boardQuery.error instanceof Error ? boardQuery.error : null
                }
                isLoading={boardQuery.isLoading}
                onCandidateSelect={handleTalentSelect}
                onJobsOpen={() => handleRoleChange("all")}
                onRetry={() => void boardQuery.refetch()}
                onRoleSelect={handleRoleChange}
                roles={roles}
                workspaceId={workspace.workspaceId}
              />
            ) : null}
            {page === "jobs" ? (
              <OrgJobsPage
                activeRole={activeRole}
                activeRoleId={activeRoleId}
                board={boardQuery.data}
                canManageCandidates={permissions.canManageCandidates}
                currentUserEmail={currentUserEmail}
                error={
                  boardQuery.error instanceof Error ? boardQuery.error : null
                }
                isLoading={boardQuery.isLoading}
                members={bootstrapQuery.data?.members ?? []}
                nameQuery={nameQuery}
                onDeleteRole={handleDeleteRole}
                onEditRole={setEditingRoleId}
                onNameQueryChange={setNameQuery}
                onPauseRole={(role) =>
                  void updateRoleLifecycle(role, { status: "paused" })
                }
                onRecommendedDateChange={(from, to) => {
                  setRecommendedFromDate(from);
                  setRecommendedToDate(to);
                }}
                onResumeRole={(role) =>
                  void updateRoleLifecycle(role, { status: "active" })
                }
                onRetry={() => void boardQuery.refetch()}
                onRoleChange={handleRoleChange}
                onSelect={handleTalentSelect}
                onStageChange={handleStageChange}
                pendingRecommendationId={pendingRecommendationId}
                recommendedFromDate={recommendedFromDate}
                recommendedToDate={recommendedToDate}
                roleActionPending={updateRole.isPending}
                roles={roles}
                workspaceId={workspace.workspaceId}
              />
            ) : null}
            {page === "team" ? (
              <OrgTeamPage
                key={workspace.workspaceId}
                currentUser={currentUser}
                invitations={bootstrapQuery.data?.invitations ?? []}
                members={bootstrapQuery.data?.members ?? []}
                permissions={permissions}
                workspace={workspace}
              />
            ) : null}
            {page === "settings" ? (
              <OrgSettingsPage
                permissions={permissions}
                workspace={workspace}
              />
            ) : null}
            {page === "help" ? <OrgHelpPage /> : null}
          </div>
        </div>
        {page === "jobs" && permissions.canManageCandidates ? (
          <OrgAgentPanel
            activeRole={activeRole}
            currentUserEmail={currentUserEmail}
            onRoleSelect={handleRoleChange}
            roles={roles}
            workspaceId={workspace.workspaceId}
          />
        ) : null}
      </main>

      <TalentDetailSimpleView
        key={`${workspace.workspaceId}:${activeDetailRecommendationId}:${activeDetailTalentId}`}
        acceptStageId={selectedAcceptStageId}
        canManageCandidates={permissions.canManageCandidates}
        companyName={workspace.companyName}
        currentUserEmail={currentUserEmail}
        currentUserId={currentUser?.userId ?? user.id}
        decisionPending={Boolean(
          activeDetailRecommendationId &&
          pendingRecommendationId === activeDetailRecommendationId
        )}
        detail={detailQuery.data}
        error={detailQuery.error instanceof Error ? detailQuery.error : null}
        internalOpsAccess={internalOpsAccess}
        isLoading={detailQuery.isLoading}
        members={bootstrapQuery.data?.members ?? []}
        onAcceptCandidate={
          permissions.canManageCandidates
            ? async ({ acceptReason, contactDirectly, introEmails, stage }) => {
                const roleId =
                  detailQuery.data?.role.roleId ?? activeDetailRoleId;
                const recommendationId =
                  detailQuery.data?.recommendation.recommendationId ??
                  activeDetailRecommendationId;
                const talentId =
                  detailQuery.data?.talent.userId ?? activeDetailTalentId;
                if (!roleId || !recommendationId || !talentId) return;
                await setStage.mutateAsync({
                  acceptReason,
                  contactDirectly,
                  introEmails,
                  recommendationId,
                  roleId,
                  stage,
                  stopNote: null,
                  stopReason: null,
                  talentId,
                  workspaceId: workspace.workspaceId,
                });
                addToast({
                  message: "후보자 연결을 수락했습니다.",
                  variant: "success",
                });
              }
            : undefined
        }
        onClose={handleTalentDetailClose}
        onRejectCandidate={
          permissions.canManageCandidates
            ? async (options) => {
                const roleId =
                  detailQuery.data?.role.roleId ?? activeDetailRoleId;
                const recommendationId =
                  detailQuery.data?.recommendation.recommendationId ??
                  activeDetailRecommendationId;
                const talentId =
                  detailQuery.data?.talent.userId ?? activeDetailTalentId;
                if (!roleId || !recommendationId || !talentId) return;
                await setStage.mutateAsync({
                  acceptReason: null,
                  introEmails: null,
                  recommendationId,
                  roleId,
                  stage: "process_stopped",
                  stopNote: options.stopNote ?? null,
                  stopReason: options.stopReason ?? null,
                  talentId,
                  workspaceId: workspace.workspaceId,
                });
                addToast({
                  message: "후보자 프로세스를 종료했습니다.",
                  variant: "success",
                });
              }
            : undefined
        }
        onRetry={() => void detailQuery.refetch()}
        open={detailOpen}
        talentId={activeDetailTalentId || null}
        workspaceId={workspace.workspaceId}
      />

      <OrgEditDialog
        key={[
          editingRole?.roleId ?? "closed",
          editingRole?.updatedAt ?? "",
        ].join(":")}
        mode="role"
        onClose={() => setEditingRoleId(null)}
        onSubmit={(value) => {
          if (!editingRole || !permissions.canManageCandidates) return;
          updateRole.mutate(
            {
              description: value.description ?? null,
              employmentTypes: value.employmentTypes ?? [],
              externalJdUrl: value.externalJdUrl ?? null,
              isExpired: undefined,
              locationText: value.locationText ?? null,
              name: value.name ?? null,
              request: value.request ?? null,
              roleId: editingRole.roleId,
              status: value.status ?? null,
              workMode: value.workMode ?? null,
              workspaceId: workspace.workspaceId,
            },
            {
              onError: (error) =>
                addToast({
                  message:
                    error instanceof Error
                      ? error.message
                      : "역할을 수정하지 못했습니다.",
                  variant: "error",
                }),
              onSuccess: () => {
                setEditingRoleId(null);
                addToast({
                  message: "역할 정보를 저장했습니다.",
                  variant: "success",
                });
              },
            }
          );
        }}
        open={Boolean(editingRole)}
        pending={updateRole.isPending}
        value={
          editingRole
            ? {
                description: editingRole.description,
                employmentTypes: editingRole.employmentTypes,
                externalJdUrl: editingRole.externalJdUrl,
                locationText: editingRole.locationText,
                name: editingRole.name,
                request: editingRole.request,
                status: editingRole.status,
                workMode: editingRole.workMode,
              }
            : {}
        }
      />
    </>
  );
}
